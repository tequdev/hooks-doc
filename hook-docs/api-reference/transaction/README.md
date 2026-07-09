---
sidebarTitle: "Transaction APIs"
---

# Transaction APIs

This page documents the seven **transaction** Hook APIs: the `otxn_*` family, which reads
the *originating transaction* — the transaction that caused the hook to run — along with its
lineage (burden and generation) and its carried parameters.

All signatures are copied verbatim from `hook/extern.h`. Return codes reference the shared
error table in [../../glossary](../../glossary.md); the values quoted below come from
<!-- include/xrpl/hook/Enum.h and --> `hook/error.h`.

<!--
Implementations: src/xrpld/app/hook/detail/HookAPI.cpp (the HookAPI::otxn_* methods) and
their WASM wrappers in src/xrpld/app/hook/detail/applyHook.cpp.
-->

---

## The originating transaction

Every hook execution has exactly one **originating transaction** (often abbreviated *otxn*).
For a *strong* or *weak* execution it is the transaction currently being processed against
the ledger — the transaction whose account, or a party to it (a TSH), has a hook installed.
The `otxn_*` functions are the hook's window onto that transaction: its type, its id, its
individual fields, and any `HookParameters` it carries.

The originating transaction is **not** the same as the hook account. The hook account (see
[`hook_account`](../control/hook_account.md)) is the account the hook is installed on; the
originating transaction's sender is `otxn_field(sfAccount)`. In a payment hook installed on
the receiver, for example, `hook_account` is the receiver and `otxn_field(sfAccount)` is the
sender.

**During a callback (`cbak`), the originating transaction can shift.** When a hook emits a
transaction and that emitted transaction later *fails*, the hook's `cbak` entry point is
invoked with the low bit of its `reserved` argument set. In that case the server populates an
internal `emitFailure` object with the *emitted* transaction (read back from the emitted-txn
ledger directory), and the `otxn_*` functions read from **that** transaction instead of the
incoming one. Concretely:

<!-- verified in applyHook.cpp: emitFailure is set to the emitted STObject when
isCallback && (wasmParam & 1). -->

- `otxn_type` returns the *emitted* transaction's `sfTransactionType`.
- `otxn_field` reads fields from the *emitted* transaction.
- `otxn_id` with `flags == 0` returns the emitted transaction's stored hash
  (`sfTransactionHash`); with a non-zero `flags` it returns the computed transaction id.

When `cbak` is invoked for a *successful* emitted transaction (low bit clear), `emitFailure`
is not set and the `otxn_*` functions behave as in a normal execution. See
[`hook_again`](../control/hook_again.md) and [../../overview](../../overview.md) for the
strong/weak/callback execution model.

---

## Index

| Function | Purpose |
|---|---|
| [`otxn_type`](otxn_type.md) | Transaction type of the originating transaction. |
| [`otxn_id`](otxn_id.md) | Write the originating transaction's hash/ID. |
| [`otxn_field`](otxn_field.md) | Write (or return) a field of the originating transaction. |
| [`otxn_param`](otxn_param.md) | Read a HookParameter carried on the originating transaction by key. |
| [`otxn_slot`](otxn_slot.md) | Load the whole originating transaction into a slot. |
| [`otxn_burden`](otxn_burden.md) | Burden value of the originating transaction. |
| [`otxn_generation`](otxn_generation.md) | Emit-generation counter of the originating transaction. |

## Related documents

- [../../README](../../README.md) — documentation index.
- [../../overview](../../overview.md) — hook execution model (strong / weak / callback).
- [../../glossary](../../glossary.md) — full error-code and term reference.
- [../../macros](../../macros/README.md) — `SBUF`, `ASSERT`, `AMOUNT_TO_DROPS`, and other helpers.
- [../../best-practices](../../best-practices.md) — validating inputs and guarding loops.
- [control](../control/README.md) — `accept`, `rollback`, `hook_account`, and the guard system.
- [state](../state/README.md) — persistent state read/write.
- [ledger-and-slot](../slot/README.md) — `otxn_slot`, `slot_subfield`, `slot_float`, `meta_slot`.
- [emit-and-etxn](../emit/README.md) — emitting transactions; `etxn_burden`, `etxn_generation`.
- [float-and-amount](../float/README.md) — XFL and amount handling.
- [utility](../utility/README.md) — `util_raddr`, STO helpers for parsing serialized fields.
- Examples: [payment-filter](../../examples/payment-filter.md),
  [state-counter](../../examples/state-counter.md),
  [emitted-transaction](../../examples/emitted-transaction.md),
  [foreign-state](../../examples/foreign-state.md),
  [memo-routing](../../examples/memo-routing.md).
