# Execution Order and Hook Chains

A single Xahau transaction can trigger hooks on more than one account, in more
than one pass, spread across strong (pre-apply), weak (post-apply), and
callback executions. This page is the map of that whole sequence: what a
*hook chain* is, in what order the engine walks chains across accounts for
one transaction, what the `reserved`/`what` argument tells a running hook
about which pass it is in, and which chain-control APIs let a hook reach
into that order. It draws together material that is otherwise scattered
across [tsh.md](tsh.md) and the individual `api-reference/control/` pages;
those pages remain the source of truth for per-function detail.

## The hook chain

An account's hooks are stored as the `sfHooks` array on its `SetHook`-managed
ledger object — up to **10** entries, called *positions* 0 through 9.
<!-- include/xrpl/hook/Enum.h:100-103 — maxHookChainLength() = 10 -->
A position can be empty (no `sfHookHash` set on that array slot); the engine
walks the array in order and simply skips blank slots, so a chain with hooks
only in positions 0 and 3 still runs them in that order — 0 before 3 — with
nothing in between.
<!-- src/xrpld/app/tx/detail/Transactor.cpp:1326-1333 — executeHookChain increments hook_no for every array element (so position == array index) then "skip blanks" continues past any slot without sfHookHash -->

Within one pass (strong, weak, or again-as-weak), a chain **succeeds only if
every hook it actually executes returns `ACCEPT`**. The moment any executed
hook in the chain exits with anything other than `ACCEPT` — a `rollback()`,
a WASM trap, or an unhandled exception — the engine stops the chain
immediately and the chain's result is `tecHOOK_REJECTED`; no later position
in that chain runs.
<!-- src/xrpld/app/tx/detail/Transactor.cpp:1436-1451 (executeHookChain: non-ACCEPT exitType or UNSET -> return tecHOOK_REJECTED), 1469-1477 (exception -> return tecHOOK_REJECTED) -->
For a **strong** chain — the originating account's own, or a strong TSH's —
that failure is not merely local: it propagates back up as the result of the
whole transaction-apply attempt, so the originating transaction never
applies to the ledger at all. A weak chain's failure is local to that
account's collect call and does not affect the already-applied transaction
or any other account's chain; see
[What weak executions can and cannot do](#what-weak-executions-can-and-cannot-do)
below.

Two APIs let a running hook read its own position in this array:
`hook_pos()` returns the zero-based index of the currently executing hook,
and `hook_hash()` returns the WASM hash installed at any position (or of the
currently running hook, with `hook_no = -1`). See
[Chain-control APIs](#chain-control-apis) below.

## Execution timeline for one transaction

Applying one transaction walks through the following passes, always in this
order. Steps 1–3 happen before the transaction is applied to the ledger;
steps 4–6 happen after.

1. **The originating account's own chain runs first**, strong, with
   `isOutgoing = true` (so each hook is filtered against
   `sfHookOnOutgoing`, not `sfHookOnIncoming`). This always runs before any
   TSH's chain, and it does not run at all if the transaction is itself an
   emitted transaction.
   <!-- src/xrpld/app/tx/detail/Transactor.cpp:1994-2001 — executeHookChain(hooksOriginator, ..., accountID, /*strong*/true, /*isOutgoing*/true, {}), gated on !ctx_.isEmittedTxn() -->

2. **Strong TSH chains run next**, still before apply, each with
   `isOutgoing = false` (filtered by `sfHookOnIncoming`). The order across
   accounts is the order [tsh.md](tsh.md) describes for that specific
   transaction type — for example, for a `Payment` this is simply
   `sfDestination` (there is only one strong TSH slot for that type), but
   for transaction types that nominate several accounts the order is the
   fixed per-transaction-type nomination order, **not** AccountID order:
   each account takes the position at which the engine first nominates it,
   and any repeat nomination for that same account only strengthens its
   existing entry (weak escalating to strong) rather than changing its
   position.
   <!-- src/xrpld/app/hook/detail/applyHook.cpp:46-55 — ADD_TSH lambda: tshEntries.emplace(acc_r, std::make_pair(upto++, rb)) on first nomination, OR-combines strength on repeat nominations -->
   <!-- src/xrpld/app/tx/detail/Transactor.cpp:1681 — "we use a vector above for order preservation"; loop at 1687 walks `for (auto& [tshAccountID, canRollback] : tsh)` in that vector's order -->
   <!-- src/xrpld/app/tx/detail/Transactor.cpp:2012 — result = doTSH(true, tsh, stateMap, hookResults, {}) -->

3. **The transaction applies.** If every chain executed in steps 1–2
   returned `ACCEPT` (or nominated no hooks at all), the transaction's normal
   effects — balance changes, ledger object creation/deletion, and so on —
   are applied to the ledger.
   <!-- src/xrpld/app/tx/detail/Transactor.cpp:2039 — result = apply(), reached only if isTesSuccess(result) after the strong-pass block -->

4. **If this transaction is itself an emitted transaction, its emitting
   hook's `cbak` runs first**, before any weak-TSH or again-as-weak pass —
   and before the transaction's emission-tracking entry is removed from the
   emitting account's bookkeeping.
   <!-- src/xrpld/app/tx/detail/Transactor.cpp:2350-2368 — post-apply block: doHookCallback(proMeta) at 2365 (gated on ctx_.tx.isFieldPresent(sfEmitDetails)) runs before hook::removeEmissionEntry(ctx_) at 2368, both before the weak-TSH block that follows -->
   This `cbak` is scoped to the one hook that emitted this specific
   transaction; it is a different mechanism from — and runs earlier than —
   the weak-TSH and again-as-weak passes below. See
   [api-reference/emit/README.md](api-reference/emit/README.md) for how
   `cbak` is wired up and what it can observe.

5. **Weak-TSH (collect-call) chains run next**, in the same
   transaction-type-defined insertion order as step 2 — not AccountID order.
   (When `featureIOUIssuerWeakTSH` is not enabled, the TSH list is
   re-derived from ledger state after apply rather than reusing the
   pre-apply list, so that TSH rules depending on post-application state
   resolve correctly; see [tsh.md](tsh.md#a-separate-amendment-gated-source-of-weak-tshs).)
   Each hook in each chain still needs `hsfCOLLECT` set and its account's
   `lsfTshCollect` flag set, exactly as [tsh.md](tsh.md#conditions-for-weak-tsh-execution)
   describes — this pass does not relax those gates.
   <!-- src/xrpld/app/tx/detail/Transactor.cpp:2382-2390 — tsh re-derived if !featureIOUIssuerWeakTSH, then doTSH(false, tsh, stateMap, weakResults, proMeta) -->

6. **The again-as-weak pass runs last**, strictly after the weak-TSH pass in
   step 5 has fully completed — the two are sequential, never interleaved.
   Its order is unrelated to hook chain position: hooks that called
   `hook_again()` during their strong execution are collected into an
   ordered map keyed by AccountID, each entry holding an ordered set of
   hook hashes, so the pass walks **AccountID in ascending order**, and
   **within an account, hook hash in ascending order** — not the position
   that hook occupied in its chain.
   <!-- src/xrpld/app/tx/detail/Transactor.cpp:1973 — std::map<AccountID, std::set<uint256>> aawMap; ordered container, not insertion order -->
   <!-- src/xrpld/app/tx/detail/Transactor.cpp:2029-2032 — aawMap[hookResult.account].emplace(hookResult.hookHash) populates it as hookResults are finalized after the strong pass -->
   <!-- src/xrpld/app/tx/detail/Transactor.cpp:2393-2394 — for (auto const& [accID, hookHashes] : aawMap) doAgainAsWeak(accID, hookHashes, ...), run after doTSH(false, ...) at 2390 -->

If any pass nominates no hooks to run (an empty chain, everything filtered
out by `HookOn`, or no TSHs at all for that transaction type), that step is
simply skipped and the timeline proceeds to the next one; only a genuine
non-`ACCEPT` exit from a **strong** chain (steps 1–2) stops the transaction
from applying.

## The `reserved`/`what` parameters

Both `hook` and `cbak` take one `uint32_t` argument, and the engine passes a
different literal value depending on which pass in the timeline above is
calling in. The value is not cosmetic bookkeeping — the engine passes it
directly as the WASM call argument.
<!-- src/xrpld/app/hook/applyHook.h:439 — WasmEdge_Value params[1] = {WasmEdge_ValueGenI32((int64_t)wasmParam)}; the reserved value, wasmParam, is the literal argument passed to WasmEdge_VMRunWasmFromBuffer -->

For `hook(uint32_t reserved)`:

| Value | Meaning | Pass |
|---|---|---|
| `0` | Strong execution | Steps 1–2 |
| `1` | Weak execution (as a nominated weak/collect-call TSH) | Step 5 |
| `2` | Weak execution requested by this same hook via `hook_again()` | Step 6 |

<!-- src/xrpld/app/tx/detail/Transactor.cpp:1421 — (strong ? 0 : 1UL), // 0 = strong, 1 = weak -->
<!-- src/xrpld/app/tx/detail/Transactor.cpp:1891 — 2UL, // param 2 = aaw, passed in doAgainAsWeak -->

For `cbak(uint32_t what)`:

| Value | Meaning |
|---|---|
| `0` | The emitted transaction this hook is being called back about was accepted (applied). |
| `1` | The emitted transaction failed (an `EMIT_FAILURE` pseudo-transaction). |

<!-- src/xrpld/app/tx/detail/Transactor.cpp:1584 — ctx_.tx.getTxnType() == ttEMIT_FAILURE ? 1UL : 0UL -->
<!-- src/xrpld/app/hook/detail/applyHook.cpp:1076 — .emitFailure = isCallback && wasmParam & 1, confirms bit 0 is the only bit the engine guarantees -->

A single `if (reserved > 0)` (or checking `reserved` against 0/1/2
explicitly) is enough for a hook to know which of the three `hook()` passes
it is in without any other API call — see the worked example in
[api-reference/control/hook_again.md](api-reference/control/hook_again.md),
which checks exactly this to refuse a second `hook_again()` request from
within a weak pass.

## Chain-control APIs

Five APIs let a hook reason about, and act on, its position in the chain
described above. Full parameter/error tables live on each function's own
page — this section is about how they combine.

- **[`hook_pos()`](api-reference/control/hook_pos.md)** returns the calling
  hook's own zero-based position in its account's chain. It is the
  cheapest way for one piece of installed bytecode, deployed at several
  positions, to branch on "am I first" or "am I last."
- **[`hook_hash(write_ptr, write_len, hook_no)`](api-reference/control/hook_hash.md)**
  returns the WASM hash installed at a given position (`hook_no = -1` for
  the currently running hook). It is how a hook identifies *which* hook is
  at a neighboring position, since position numbers alone don't say what
  code runs there.
- **[`hook_skip(read_ptr, read_len, flags)`](api-reference/control/hook_skip.md)**
  removes (or, with `flags = 1`, restores) a hook — named by hash — from
  this transaction's remaining chain execution on this account. It only
  affects hooks in the *same* chain that have not run yet; a hook cannot
  skip itself or anything already executed.
- **[`hook_param_set(...)`](api-reference/control/hook_param_set.md)**
  overrides (or, with a zero-length value, deletes) a parameter that a
  later hook in the same chain will see when it calls `hook_param`. This is
  how one hook passes computed data forward to a specific downstream hook,
  named by hash, without touching shared state.
- **[`hook_again()`](api-reference/control/hook_again.md)** is different in
  kind from the other four: instead of acting on *other* positions in the
  chain, it schedules one additional weak (`reserved = 2`) re-execution of
  *this same hook* in step 6 of the timeline above. It is only callable
  from a strong execution (`PREREQUISITE_NOT_MET` otherwise), and only once
  per execution (`ALREADY_SET` on a second call).

A realistic combination: the first hook in a chain inspects the next
hook's hash, hands it a computed parameter, and then decides whether that
next hook should run at all this transaction:

```c
#include "hookapi.h"

int64_t hook(uint32_t reserved)
{
    _g(1, 1);

    // Only the first-position hook in this chain makes the routing
    // decision; hooks installed later never see hook_pos() == 0.
    if (hook_pos() != 0)
        accept(SBUF("not first, nothing to route"), 0);

    uint8_t next[32];
    if (hook_hash((uint32_t)next, 32, hook_pos() + 1) != 32)
        accept(SBUF("no hook installed at the next position"), 0);

    // Pass the next hook a parameter it can read via hook_param().
    uint8_t budget[8];
    UINT64_TO_BUF(budget, 1000000ULL);
    if (hook_param_set((uint32_t)budget, 8, SBUF("BUDGET"),
                        (uint32_t)next, 32) < 0)
        rollback(SBUF("could not configure next hook"), 1);

    // Sender-specific accounts don't need the downstream compliance hook.
    if (otxn_field(0, 0, sfSourceTag) == 12345)
        hook_skip((uint32_t)next, 32, 0);

    accept(SBUF("configured (and possibly skipped) next hook"), 0);
    return 0;
}
```

## What weak executions can and cannot do

A weak execution — whether a nominated collect call (step 5) or an
again-as-weak re-run (step 6) — always runs after the transaction has
already applied to the ledger. This has one consequence that overrides
everything else about what a weak hook can do: **calling `rollback()` from
a weak execution cannot undo the already-applied transaction.** Whatever
the transaction did — balances moved, objects created or destroyed — stands
regardless of what the weak hook returns.
<!-- src/xrpld/app/tx/detail/Transactor.cpp:2353 (post-application weak call result is unchecked against the outer transaction result), contrast with the strong-pass early return at 1451 that does abort application -->

Within that constraint, a weak execution is otherwise a normal hook
execution: it can read the applied `TxMeta` (a provisional metadata object
built specifically for this pass), read and write its own hook state, and
emit new transactions exactly as a strong execution can — none of that is
restricted by strength, only the ability to affect the *originating*
transaction's outcome is gone. This matches
[tsh.md](tsh.md#strong-tsh-vs-weak-tsh)'s description exactly: a weak TSH
"observes the transaction but cannot change its outcome."

## Where to observe order

Every hook execution — strong, weak, or again-as-weak, across every account
touched by a transaction — is recorded as one `sfHookExecution` object in
the transaction metadata's `sfHookExecutions` array, in the order the engine
actually ran them: originator, then strong TSHs, then (post-apply) `cbak`
if applicable, then weak TSHs, then again-as-weak. See
[overview.md](overview.md#execution-results-in-transaction-metadata) for the
full field list on each `sfHookExecution` entry.

## Related documents

- [tsh.md](tsh.md)
- [overview.md](overview.md)
- [api-reference/control/hook_pos.md](api-reference/control/hook_pos.md)
- [api-reference/control/hook_skip.md](api-reference/control/hook_skip.md)
- [api-reference/control/hook_again.md](api-reference/control/hook_again.md)
- [api-reference/control/hook_param_set.md](api-reference/control/hook_param_set.md)
- [api-reference/emit/README.md](api-reference/emit/README.md)
