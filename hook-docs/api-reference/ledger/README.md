# Ledger APIs

These six APIs read ledger-level data — the current ledger's sequence and base fee, the
last-closed ledger's time and hash, a general-purpose nonce, and keylet range enumeration.
They were originally documented together with the [slot family](../slot/README.md) on a
single "Ledger and Slot APIs" page; that page has been split in two, and this page covers
the ledger-info half.

All signatures are copied verbatim from `hook/extern.h`. Return codes reference the shared
error table in [../../glossary.md](../../glossary.md); values come from `include/xrpl/hook/Enum.h`
and `hook/error.h`. Implementations live in `src/xrpld/app/hook/detail/HookAPI.cpp` (core
logic) and `src/xrpld/app/hook/detail/applyHook.cpp` (WASM-facing wrappers).

---

## Index

| Function | Purpose |
|---|---|
| [`fee_base`](fee_base.md) | Base fee (drops) of the current ledger. |
| [`ledger_seq`](ledger_seq.md) | Current ledger sequence number. |
| [`ledger_last_time`](ledger_last_time.md) | Close time of the last closed ledger. |
| [`ledger_last_hash`](ledger_last_hash.md) | Hash of the last closed ledger. |
| [`ledger_nonce`](ledger_nonce.md) | A unique per-call nonce. |
| [`ledger_keylet`](ledger_keylet.md) | Enumerate the next keylet in a lo..hi range. |

## Related documents

- [../../README.md](../../README.md) — documentation index.
- [../../overview.md](../../overview.md) — hook execution model and lifecycle.
- [../../glossary.md](../../glossary.md) — full error-code and term reference.
- [../../macros.md](../../macros/README.md) — `SBUF`, `GUARD`, and buffer helpers.
- [../../best-practices.md](../../best-practices.md) — slot budgets and iterating ledger objects.
- [Slot APIs](../slot/README.md) — `slot_set`, `slot_subfield`, `meta_slot`, `xpop_slot`, and the rest of the slot family.
- [control.md](../control/README.md) — `hook_again` and the strong/weak execution model.
- [transaction.md](../transaction/README.md) — `otxn_slot`, `otxn_field`, and originating-txn access.
- [emit-and-etxn.md](../emit/README.md) — `etxn_fee_base`, `etxn_nonce`, and emission.
- [utility.md](../utility/README.md) — `util_keylet` for building the keylets `slot_set`/`ledger_keylet` consume.
