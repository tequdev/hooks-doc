# Hook Fees

Hooks introduce several cost mechanisms beyond an ordinary Xahau transaction's
base fee: a byte-priced surcharge for deploying WASM bytecode, owner reserves
for the ledger objects a hook occupies, a precomputed execution charge folded
into the triggering transaction's required fee, and a self-priced fee on
every transaction a hook emits. Each is documented in full on its own page;
this page draws the complete cost model together — what you pay, when, and
who pays it — and links out for the mechanics of each field or API.

## Deployment costs (SetHook)

**Creating new bytecode costs 500 drops per byte of `sfCreateCode`.** A
`SetHook` entry that infers `hsoCREATE` (a non-empty `sfCreateCode` blob) is
charged `byteCount * 500` drops as a surcharge on top of the transaction's
ordinary base fee, capped rather than wrapped on overflow.
<!-- src/xrpld/app/hook/detail/applyHook.cpp:705-713 — hook::computeCreationFee(byteCount) returns byteCount*500ULL, verified directly -->
This is a **transaction fee**, not an owner reserve — it is burned, not
refundable. See [sethook-fields/createcode](sethook-fields/createcode.md)
for the full field reference, including a stale in-source code comment that
(incorrectly) claims 5000 drops/byte — the executed arithmetic is 500.

An empty `sfCreateCode` blob infers `hsoDELETE` instead of `hsoCREATE`, and
the creation fee for zero bytes is zero, so deletion carries no creation
surcharge.
<!-- hook::computeCreationFee(0) returns 0 — same function cited above, src/xrpld/app/hook/detail/applyHook.cpp:705-713 -->
`hsoINSTALL` (install-by-hash) and `hsoUPDATE` never carry `sfCreateCode` at
all — the byte-priced fee applies to `hsoCREATE` only. See
[sethook-fields/operations-field-matrix](sethook-fields/operations-field-matrix.md)
for which of the six operations a `SetHook` entry can infer to.

**The `sfHookParameters` array nested inside a `SetHook` entry costs 1 drop
per byte of name+value, on `hsoCREATE`/`hsoINSTALL`/`hsoUPDATE` alike,
whenever the array is present in the submission** — charged once at
submission regardless of whether the apply-time three-way merge later
discards some entries as matching an existing default.
<!-- src/xrpld/app/tx/detail/SetHook.cpp:657-683 — SetHook::calculateBaseFee sums entryBytes across sfHookParameters, "one drop per byte"; verified this path carries no amendment gate -->
This fee is unconditional (no amendment gate), unlike a separate,
transaction-level `sfHookParameters` fee described under
[Runtime execution costs](#runtime-execution-costs) below. See
[sethook-fields/hookparameters](sethook-fields/hookparameters.md) for the
field's merge semantics and the owner-reserve cost of parameters that end up
stored on the account's entry.

A `SetHook` transaction's total required fee is the sum of these surcharges
across every entry in `sfHooks`, plus the transaction's ordinary base fee
(which itself already includes any strong-TSH chain fees, see below) — the
`SetHook` transactor folds the per-entry creation and parameter surcharges
on top of the generic fee calculation every transaction gets.
<!-- src/xrpld/app/tx/detail/SetHook.cpp:643-702 — SetHook::calculateBaseFee loops sfHooks, accumulates createFee+paramFee per entry, then adds Transactor::calculateBaseFee(view, tx) -->
The creation surcharge is computed purely from the *submitted*
`sfCreateCode` field, before the apply-time hash lookup that can fall an
`hsoCREATE` through to `hsoINSTALL` behavior when the bytecode already
matches an existing `ltHOOK_DEFINITION` (see [Common surprises](#common-surprises)
below).
<!-- SetHook::calculateBaseFee (SetHook.cpp:643-702) is a static computation over submitted fields; the hash-dedup fallthrough happens later in SetHook::setHook() apply logic (SetHook.cpp:1907), independently of fee calculation -->

The `65,535`-byte size cap on `sfCreateCode` (checked before operation
inference, for any `sfHook` entry that carries the field) bounds the maximum
possible creation surcharge to `65535 * 500` = 32,767,500 drops per entry.
<!-- include/xrpl/hook/Enum.h — maxHookWasmSize() = 0xFFFFU; check at src/xrpld/app/tx/detail/SetHook.cpp:795-804, unconditional on operation -->
The hook chain slot itself, and any `sfHookGrants`/`sfHookParameters`
entries stored on the account, are billed separately — as owner reserve,
not a transaction fee — covered next.

## Ledger reserves vs fees

Everything above is a **fee**: drops paid to submit the transaction, burned
regardless of outcome. Reserves are different — XAH locked against an owner
count, refunded when the underlying ledger object is removed.

**Installing a hook consumes one owner-reserve unit per chain slot, plus one
more per stored `sfHookGrants` or `sfHookParameters` entry on that account's
`sfHook` object**, refunded if the entry is later removed or the hook is
deleted from the slot. The reserve charge per occupied slot is 1 + (stored
grants) + (stored parameters), 0 for a blank slot, and the delta between old
and new totals across all ten slots is applied to the account's owner count
when a `SetHook` transaction commits.
<!-- src/xrpld/app/tx/detail/SetHook.cpp:1264-1279 (SetHook::computeHookReserve returns 1 + grants.size() + parameters.size() for an occupied slot, 0 for a blank one), 2083-2086 (newHookReserve/oldHookReserve delta applied per slot) -->

**Hook State entries and namespaces carry their own, separate owner reserve**
with a `256 * sfHookStateScale` byte-size ceiling per entry (default scale
1, max scale 16) and a 256-namespace-per-account cap — see
[api-reference/state/README](api-reference/state/README.md) for the exact
reserve-affordability formula and namespace accounting; this page does not
duplicate it.

Neither reserve is a fee: an account can hold hooks, parameters, grants, and
state indefinitely at no ongoing cost beyond the XAH locked against its
reserve requirement.

## Runtime execution costs

**Every hook definition carries a precomputed, flat execution fee, not a
per-run meter.** At `hsoCREATE` time, guard validation returns the
guard-declared worst-case instruction count for `hook()` (and separately
`cbak()`, if present); that count, at 1 drop/instruction, is stored as the
new `ltHOOK_DEFINITION`'s `sfFee`/`sfHookCallbackFee` and reused on every
subsequent firing — instruction usage below the worst case is never
refunded, and the fee is never recomputed per execution.
<!-- src/xrpld/app/hook/detail/applyHook.cpp:695-703 — hook::computeExecutionFee(instructionCount) returns instructionCount cast to int64_t, 1:1 drops/instruction; feeds SetHook.cpp:1819-1881 storage of sfFee/sfHookCallbackFee at create time -->

**A transaction's required base fee sums the stored `sfFee` of every hook
that will fire in its own chain, plus every *strong* TSH's chain fee, and
this is charged to the originating account up front.**
The network's base-fee calculation walks the originator's own hook chain
and every nominated TSH, adding each strong TSH's chain fee into the same
total as the originator's own — the originator pays for a strong TSH's hook
execution on an account it doesn't control, not just its own.
<!-- src/xrpld/app/tx/detail/Transactor.cpp:328-407 (Transactor::calculateBaseFee: iterates the TSH set from getTransactionalStakeHolders, adds calculateHookChainFee(..., true /*canRollback*/) for each strong account into hookExecutionFee), 250-326 (calculateHookChainFee sums each firing hook's stored sfFee) -->
This is confirmed again at TSH-execution time: a strong TSH's
`tshFeeDrops` is explicitly forced to `0` before deduction, with the
in-source comment noting the originator already paid it via the base fee.
<!-- src/xrpld/app/tx/detail/Transactor.cpp:1745-1750 — "this is not a collect call so we will force the tsh's fee to 0 the otxn paid the fee for this tsh chain execution already" -->

**A weak TSH (collect call) instead pays its own hook chain's fee out of its
own balance, deducted at the moment its collect call runs — never folded
into the originating transaction's required fee.** The deduction only
happens if the account has opted in with `lsfTshCollect` and can afford the
fee plus its current owner reserve out of its own balance; otherwise the
chain is silently skipped, with no fee charged and no hooks run.
<!-- src/xrpld/app/tx/detail/Transactor.cpp:1751-1763 (lsfTshCollect gate), 1765-1776 (reserve-affordability check), 1778-1793 (balance deduction via ctx_.destroyXRP(tshFeeDrops)) -->
See [tsh](tsh.md#conditions-for-weak-tsh-execution) for the full
`asfTshCollect`/`hsfCOLLECT` opt-in mechanics this gates on.

**A separate, transaction-level `sfHookParameters` field — distinct from
the `SetHook`-nested one above — costs 1 drop per byte on *any* transaction
type, once the `fixXahauV1` amendment is enabled.** Any transaction can
carry a top-level `HookParameters` array read at hook runtime via
[`otxn_param`](api-reference/transaction/otxn_param.md), separate from a
hook's own install-time defaults read via `hook_param`; this array's byte
cost is billed the same way, but through the generic per-transaction fee
path rather than the `SetHook`-specific one.
<!-- src/xrpld/app/tx/detail/Transactor.cpp:410-424 — Transactor::calculateBaseFee: accumulator += paramBytes, gated on view.rules().enabled(fixXahauV1) && tx.isFieldPresent(sfHookParameters), distinct from SetHook::calculateBaseFee's SetHook-nested sfHookParameters handling above; confirmed sfHookParameters is a *common* transaction field (src/libxrpl/protocol/TxFormats.cpp:50, in commonFields shared by every TxFormats entry), not SetHook-specific -->

**[`fee_base()`](api-reference/ledger/fee_base.md) returns only the current
ledger's plain base fee** — it does not include hook-chain surcharges and is
not the right function for pricing an emitted transaction; use
`etxn_fee_base` for that (next section).

## Emitted-transaction fees

An emitted transaction pays its own `sfFee`, deducted from its own
`sfAccount`'s balance at normal apply time — and that `sfAccount` must be
the emitting hook's own account, never the original transaction's sender.
<!-- src/xrpld/app/hook/detail/HookAPI.cpp:553 — "rule 0: account must match the hook account", enforced in etxn_details validation -->
`etxn_fee_base()` computes the minimum `sfFee` the emitting hook must write
into the transaction before calling `emit()`: it re-parses the serialized
candidate transaction and runs it through the same fee calculation the
network itself uses to price a transaction (routed through a dedicated
invoke path once `fixHookAPI20251128` is enabled).
<!-- src/xrpld/app/hook/detail/HookAPI.cpp:826-851 — HookAPI::etxn_fee_base parses txBlob and calls Transactor::calculateBaseFee / invoke_calculateBaseFee against it -->
Because the candidate already carries `sfEmitDetails` (written by
`etxn_details` in the step before), the fee calculation prices it as an
emitted transaction: it adds the emitting hook's `sfHookCallbackFee` (its
`cbak`'s precomputed execution fee, if it has one) and **multiplies the
whole accumulator by `sfEmitBurden` before adding that callback fee** — the
same `baseFee * burden + hookExecutionFee` order used for every transaction.
<!-- src/xrpld/app/tx/detail/Transactor.cpp:382-406 (isFieldPresent(sfEmitDetails) branch reads sfHookCallbackFee and sfEmitBurden), 457-476 (do-while: accumulator *= burden; then += hookExecutionFee) -->
An emitted transaction can also nominate its own strong TSHs, exactly as any
other transaction can, so an emitting hook can end up paying strong-TSH
chain fees on the emitted transaction's counterparties too.

**Burden multiplies the base fee at every emission hop, geometrically
pricing deep or fanned-out emission chains.**
`etxn_burden()` returns `otxn_burden() * expected_etxn_count` — the
reserved emission count set by `etxn_reserve()` — with an overflow check
that fails as `FEE_TOO_LARGE` rather than wrapping.
<!-- src/xrpld/app/hook/detail/HookAPI.cpp:811-822 — HookAPI::etxn_burden: last_burden * expected_etxn_count, overflow -> FEE_TOO_LARGE -->
See [api-reference/emit/etxn_fee_base](api-reference/emit/etxn_fee_base.md)
and [api-reference/emit/README](api-reference/emit/README.md) for the
full emission lifecycle (`etxn_reserve` → `etxn_details` →
`etxn_fee_base` → `emit`) and the generation counter (capped at 10) that
caps emission depth independently of burden.
<!-- generation cap independently verified: src/xrpld/app/hook/detail/HookAPI.cpp:643 (sfEmitGeneration >= 10 rejected), 952 (etxn_generation() = otxn_generation() + 1) -->

## Summary table

| Cost | Trigger | Payer | Documented at |
|---|---|---|---|
| Creation surcharge, 500 drops/byte | `SetHook` entry infers `hsoCREATE` (non-empty `sfCreateCode`) | `SetHook` sender | [sethook-fields/createcode](sethook-fields/createcode.md) |
| `SetHook`-nested `HookParameters`, 1 drop/byte | `sfHooks[].sfHookParameters` present on create/install/update | `SetHook` sender | [sethook-fields/hookparameters](sethook-fields/hookparameters.md) |
| Hook-slot/grant/parameter owner reserve | Occupied chain slot, stored grant, or stored parameter | The hook's own account (refundable) | This page, [Ledger reserves vs fees](#ledger-reserves-vs-fees) |
| Hook State/namespace owner reserve | Stored state entry / new namespace | The state-owning account (refundable) | [api-reference/state/README](api-reference/state/README.md) |
| Own-chain execution fee (`sfFee`, precomputed) | Originator's hooks fire | Originating account | [tsh](tsh.md) |
| Strong-TSH execution fee | A strong TSH's hooks fire | Originating account (folded into base fee) | [tsh](tsh.md) |
| Weak/collect-call execution fee | A weak TSH's hooks fire (opted in) | The TSH account itself | [tsh](tsh.md) |
| Transaction-level `HookParameters`, 1 drop/byte | Any tx carries top-level `sfHookParameters` (`fixXahauV1`) | Transaction sender | This page, [Runtime execution costs](#runtime-execution-costs) |
| Emitted-transaction fee, burden-multiplied | `emit()` queues a transaction | The emitting hook's own account | [api-reference/emit/etxn_fee_base](api-reference/emit/etxn_fee_base.md) |

## Common surprises

- **A Payment's required fee can be higher than the sender expects** if the
  destination (or another nominated account) is a strong TSH with an
  expensive hook chain — the sender pays for hook execution on an account
  they don't control, folded silently into the transaction's minimum fee.
  See [Runtime execution costs](#runtime-execution-costs) above.
- **`SetHook` creation cost scales linearly with binary size**, not with
  logical complexity: a larger but simpler WASM module can cost more to
  deploy than a smaller, more instruction-dense one, since the 500
  drops/byte surcharge is independent of the separate, guard-derived
  execution fee.
- **Resubmitting bytecode that already exists on the ledger via `hsoCREATE`
  still costs the full creation surcharge**, even though it dedups to
  `hsoINSTALL` behavior at apply time — install-by-hash (`sfHookHash`)
  avoids this entirely. See [Deployment costs](#deployment-costs-sethook)
  above.
- **A weak TSH's hooks can silently not run for lack of funds**, with no
  error surfaced to the originating transaction — if the account can't
  cover its own chain fee plus reserve at collect-call time, the chain is
  skipped rather than the transaction failing.

## Related documents

- [sethook-fields/createcode](sethook-fields/createcode.md)
- [sethook-fields/hookparameters](sethook-fields/hookparameters.md)
- [tsh](tsh.md)
- [api-reference/emit/etxn_fee_base](api-reference/emit/etxn_fee_base.md)
- [api-reference/emit/README](api-reference/emit/README.md)
- [api-reference/state/README](api-reference/state/README.md)
- [api-reference/ledger/fee_base](api-reference/ledger/fee_base.md)
