# State APIs

This page documents the four **state** Hook APIs: the functions that read and write a
hook's persistent key/value storage, both on the hook's own account and — with an explicit
grant — on other accounts.

All signatures are copied verbatim from `hook/extern.h`. Return codes reference the shared
error table in [../../glossary.md](../../glossary.md); the values quoted below come from
`include/xrpl/hook/Enum.h` and `hook/error.h`. Implementations are in
`src/xrpld/app/hook/detail/applyHook.cpp` (the WASM-facing wrappers) and
`src/xrpld/app/hook/detail/HookAPI.cpp` (`state_foreign`, `state_foreign_set`, and the
state cache).

---

## What Hook State is

Hook State is a persistent key/value store attached to an account. Each stored entry is
addressed by a triple:

- **Account** — whose ledger the entry lives on. For `state`/`state_set` this is always the
  account the hook is installed on ([`hook_account`](../control/hook_account.md)). For the
  `_foreign` variants you name the account explicitly.
- **Namespace** — a 32-byte (`uint256`) tag that partitions an account's state. Each hook
  runs with a *current namespace* (`sfHookNamespace`, exposed internally as
  `hookCtx.result.hookNamespace`). `state`/`state_set` and the `_foreign` variants with a
  zero-length namespace use that current namespace; otherwise you pass a 32-byte namespace.
- **Key** — a 32-byte key. Keys shorter than 32 bytes are accepted and **zero-padded on the
  left** to 32 bytes by `make_state_key` (`applyHook.cpp`): the key `"key"` is stored as
  29 zero bytes followed by the three ASCII bytes. A key must be 1..32 bytes; 0 bytes returns
  `TOO_SMALL` and more than 32 returns `TOO_BIG`.

Each entry is a `HookState` ledger object (`ltHOOK_STATE`), keyed by
`keylet::hookState(account, key, namespace)`.

### Value size

A state value may be up to `maxHookStateDataSize(scale)` bytes. From `Enum.h`:

- The base limit is **256 bytes**.
- An account may raise it with `sfHookStateScale` (1..`maxHookStateScale()` = **16**); the
  limit is `256 * scale`, i.e. up to **4096 bytes** at scale 16. Accounts without
  `sfHookStateScale` use scale 1 (256 bytes).

Writing more than the limit returns `TOO_BIG`. The scale is read from the account object at
write time in `state_foreign_set`.

### State entries cost reserve

Creating a *new* state entry consumes owner reserve. `set_state_cache` (`HookAPI.cpp`)
computes, the first time an account is touched in a hook execution, how many reserve
increments the account can still afford:

```
availableForReserves = (balance - accountReserve(ownerCount)) / feeIncrement
```

Each new entry consumes `scale` reserve positions. If the account cannot afford the next
entry the write fails with `RESERVE_INSUFFICIENT` (-38). Overwriting an existing entry does
**not** consume additional reserve. Deleting an entry (see `state_set` below) frees it.

### Namespaces

An account may hold at most `maxNamespaces()` = **256** namespaces (`Enum.h`). Creating a
state entry in a brand-new namespace counts against this limit and returns
`TOO_MANY_NAMESPACES` (-45) if exceeded (checked in `set_state_cache`; the new-namespace
accounting is gated behind the `fixXahauV1` amendment).

### Two distinct "too many modifications" limits

There are **two** separate limits on how much state a single transaction may change, and
they are enforced at different points:

1. **Per-execution cache limit — `max_state_modifications` = 256** (`Enum.h`, a `uint16_t`).
   `set_state_cache` rejects a write with `TOO_MANY_STATE_MODIFICATIONS` (-44) once
   `stateMap.modified_entry_count` reaches 256 *within the current hook's state cache*.
2. **Combined-chain write limit.** When state is finally flushed to the ledger,
   `finalizeHookState` (`applyHook.cpp`) counts modified entries across the combined hook
   chains and returns `tecHOOK_REJECTED` if the count exceeds `max_state_modifications`. The
   `error.h` comment on `TOO_MANY_STATE_MODIFICATIONS` describes this as ">5000 modified
   state entries in the combined hook chains"; the enforced constant in this branch is
   `max_state_modifications` (256). Treat 256 as the operative per-hook figure and be aware
   the two mechanisms exist. **The ">5000" wording in `error.h` does not match the
   `max_state_modifications` constant in this branch — Unverified — needs confirmation.**

---

## Index

| Function | Purpose |
|---|---|
| [`state`](state.md) | Read state under the hook account's current namespace. |
| [`state_set`](state_set.md) | Write (or delete) state under the hook account's current namespace. |
| [`state_foreign`](state_foreign.md) | Read state from a specified account and namespace. |
| [`state_foreign_set`](state_foreign_set.md) | Write state on another account's namespace (requires a grant). |

## Related documents

- [../../README.md](../../README.md) — documentation index.
- [../../overview.md](../../overview.md) — hook execution model and lifecycle.
- [../../glossary.md](../../glossary.md) — full error-code and term reference.
- [../../macros.md](../../macros/README.md) — `SBUF`, `SVAR`, `UINT64_TO_BUF`, and other helpers.
- [../../best-practices.md](../../best-practices.md) — structuring state access and reserve budgets.
- [control.md](../control/README.md) — `hook_account`, `accept`/`rollback`, and namespaces context.
- [transaction.md](../transaction/README.md) — reading fields off the originating transaction.
- [ledger-and-slot.md](../slot/README.md) — slots and ledger info.
- [utility.md](../utility/README.md) — `util_keylet`, `util_accid`, STO helpers.
- [../../examples/state-counter.md](../../examples/state-counter.md) — a persistent counter hook.
- [../../examples/foreign-state.md](../../examples/foreign-state.md) — cross-account state with grants.
