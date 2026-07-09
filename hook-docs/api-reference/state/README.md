---
sidebarTitle: "State APIs"
---

# State APIs

This page documents the four **state** Hook APIs: the functions that read and write a
hook's persistent key/value storage, both on the hook's own account and — with an explicit
grant — on other accounts.

All function signatures on this page match the Hook API.
<!-- Signatures are copied verbatim from `hook/extern.h`. -->
Return codes reference the shared error table in
[../../glossary.md](../../glossary.md), and the values quoted below match the Hook API's
error definitions.
<!-- The values come from `include/xrpl/hook/Enum.h` and `hook/error.h`. -->
The implementation uses WASM-facing wrappers and a state cache.
<!-- Implementations are in `src/xrpld/app/hook/detail/applyHook.cpp` (the WASM-facing wrappers) and `src/xrpld/app/hook/detail/HookAPI.cpp` (`state_foreign`, `state_foreign_set`, and the state cache). -->

---

## What Hook State is

Hook State is a persistent key/value store attached to an account. Each stored entry is
addressed by a triple:

- **Account** — whose ledger the entry lives on. For `state`/`state_set` this is always the
  account the hook is installed on ([`hook_account`](../control/hook_account.md)). For the
  `_foreign` variants you name the account explicitly.
- **Namespace** — a 32-byte (`uint256`) tag that partitions an account's state. Each hook
  runs with a *current namespace* (`sfHookNamespace`). <!-- It is exposed internally as
  `hookCtx.result.hookNamespace`. --> `state`/`state_set` and the `_foreign` variants with
  a zero-length namespace use that current namespace; otherwise you pass a 32-byte namespace.
- **Key** — a 32-byte key. Keys shorter than 32 bytes are accepted and **zero-padded on the
  left** to 32 bytes: the key `"key"` is stored as 29 zero bytes followed by the three ASCII
  bytes. <!-- Padding is performed by `make_state_key` (`applyHook.cpp`). --> A key must be
  1..32 bytes; 0 bytes returns `TOO_SMALL` and more than 32 returns `TOO_BIG`.

Each entry is a `HookState` ledger object (`ltHOOK_STATE`) identified by its account, key,
and namespace. <!-- It is keyed by `keylet::hookState(account, key, namespace)`. -->

### Value size

A state value may be up to the scaled state-data limit.
<!-- The implementation obtains this from `maxHookStateDataSize(scale)`; see `Enum.h`. -->

- The base limit is **256 bytes**.
- An account may raise it with `sfHookStateScale` (1..**16**); the limit is `256 * scale`,
  i.e. up to **4096 bytes** at scale 16. Accounts without `sfHookStateScale` use scale 1
  (256 bytes). <!-- The maximum scale is returned by `maxHookStateScale()`. -->

Writing more than the limit returns `TOO_BIG`. The scale is read from the account object at
write time. <!-- This occurs in the implementation of `state_foreign_set`. -->

### State entries cost reserve

Creating a *new* state entry consumes owner reserve. The first time an account is touched in
a hook execution, the implementation computes how many reserve increments the account can
still afford: <!-- This is computed by `set_state_cache` (`HookAPI.cpp`). -->

```
availableForReserves = (balance - accountReserve(ownerCount)) / feeIncrement
```

Each new entry consumes `scale` reserve positions. If the account cannot afford the next
entry the write fails with `RESERVE_INSUFFICIENT` (-38). Overwriting an existing entry does
**not** consume additional reserve. Deleting an entry (see `state_set` below) frees it.

### Namespaces

An account may hold at most **256** namespaces.
<!-- This is `maxNamespaces()` in `Enum.h`. -->
Creating a state entry in a brand-new namespace counts against this limit and returns
`TOO_MANY_NAMESPACES` (-45) if exceeded. The new-namespace accounting is gated behind the
`fixXahauV1` amendment. <!-- The check is performed in `set_state_cache`. -->

### Two distinct "too many modifications" limits

There are **two** separate limits on how much state a single transaction may change, and
they are enforced at different points:

1. **Per-execution cache limit — 256.**
   <!-- This is the `uint16_t` `max_state_modifications` constant in `Enum.h`. -->
   A write is rejected with
   `TOO_MANY_STATE_MODIFICATIONS` (-44) once 256 entries have been modified *within the
   current hook's state cache*. <!-- `set_state_cache` checks
   `stateMap.modified_entry_count`. -->
2. **Combined-chain write limit.** When state is finally flushed to the ledger,
   modified entries are counted across the combined hook chains, and the transaction returns
   `tecHOOK_REJECTED` if the count exceeds the 256-entry limit.
   <!-- This is enforced by `finalizeHookState` (`applyHook.cpp`) against `max_state_modifications`. -->
   The `TOO_MANY_STATE_MODIFICATIONS` (`-44`) error is raised by this same 256-entry limit.
   Treat 256 as the operative figure for both mechanisms above.
   <!-- include/xrpl/hook/Enum.h:397 (`const uint16_t max_state_modifications = 256;`, the constant actually read at both enforcement sites). Editor note: Enum.h:385-386 carries a stale source comment on the -44 enum value reading "more than 5000 modified state entries in the combined hook chains" — that figure does not correspond to any enforced constant; do not "correct" the 256 figure above back to 5000 based on that comment. -->

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
