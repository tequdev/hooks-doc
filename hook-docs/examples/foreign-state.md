# Example: Foreign State

A hook can read another account's hook state, and — with a matching grant — write
to it. This is how one hook reads configuration published by another account, and
how cooperating hooks share a data store. This example reads a foreign
configuration value, then covers foreign writes and the grant they require.

## Purpose

- Read a value from another account's namespace with `state_foreign`.
- Understand what a foreign *write* requires (a grant on the target account) and
  how it fails without one.

## APIs used

| API | Purpose | Reference |
|---|---|---|
| `state_foreign` | Read state from a specified account + namespace. | [state.md](../api-reference/state/state_foreign.md) |
| `state_foreign_set` | Write state to another account's namespace (needs a grant). | [state.md](../api-reference/state/state_foreign_set.md) |
| `state` / `state_set` | Read/write the hook's own state. | [state.md](../api-reference/state/README.md) |
| `hook_account` | The account the hook is installed on. | [control.md](../api-reference/control/hook_account.md) |
| `util_accid` | Convert an r-address to a 20-byte AccountID (if configuring by address). | [utility.md](../api-reference/utility/util_accid.md) |
| `accept` / `rollback` | Terminate the hook. | [control.md](../api-reference/control/README.md) |

Helper macros used: `SBUF` — see [macros.md](../macros/buffer-helpers.md).

## Processing flow (read)

1. Guard the entry with `_g(1,1)`.
2. Assemble the three inputs a foreign read needs: the **key** (up to 32 bytes),
   the **namespace** (32 bytes), and the target **account** (20 bytes).
3. `state_foreign(SBUF(out), SBUF(key), SBUF(ns), SBUF(acc))`. On success it
   returns the number of bytes read; if the entry does not exist it returns
   `DOESNT_EXIST (-5)`.
4. Use the value (here as a config flag), then `accept` / `rollback`.

## Complete code example

This hook reads a one-byte "enabled" flag from a configuration account's state
and rejects the transaction unless the flag is set. The config account and
namespace are compile-time constants here; in practice they would come from
install parameters.

```c
#include "hookapi.h"

// The account that publishes configuration (20-byte raw AccountID).
uint8_t const CONFIG_ACC[20] = {
    0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0  // placeholder
};

// The namespace the config lives in (32 bytes). Zero-namespace is valid.
uint8_t const CONFIG_NS[32] = {
    0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
    0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
};

int64_t
hook(uint32_t reserved)
{
    _g(1, 1);

    // Read the "enabled" flag from the config account's foreign state.
    uint8_t flag[1];
    int64_t read = state_foreign(
        SBUF(flag),          // where to write the value
        SBUF("enabled"),     // key
        SBUF(CONFIG_NS),     // namespace (32 bytes)
        SBUF(CONFIG_ACC));   // account (20 bytes)

    if (read == DOESNT_EXIST)
        rollback(SBUF("foreign-state: config not set"), 1);

    if (read < 0)
        rollback(SBUF("foreign-state: read error"), 2);

    if (read != 1 || flag[0] == 0)
        rollback(SBUF("foreign-state: disabled by config"), 3);

    accept(SBUF("foreign-state: enabled"), 0);
    return 0;
}
```

The read is bounds-checked, the not-found case is distinguished from other
errors, and the value is validated before use.

## Foreign writes and grants

Reading foreign state is unrestricted. Writing it is not: `state_foreign_set` can
only modify another account's namespace if that account has published a **grant**
authorizing your hook.

- A grant lives on the *target* (granting) account, in its hook's `sfHookGrants`
  array. Each grant entry names an `sfHookHash` — the WASM hash of the hook that
  is permitted to write — and may optionally name an `sfAuthorize` account to
  further restrict who may invoke that hook.
- When your hook calls `state_foreign_set` on an account other than its own, the
  engine looks for a grant on the target whose `sfHookHash` matches your hook's
  hash (and whose `sfAuthorize`, if present, matches). If none matches, the call
  returns `NOT_AUTHORIZED (-34)`.
- Writing to the hook's *own* account (`account == hook_account`) is always
  allowed and never needs a grant — that is just `state_set` by another name.

```c
// Writing to another account's namespace; only succeeds if that account granted
// this hook's hash. acc must NOT be this hook's own account for the grant path.
int64_t w = state_foreign_set(
    SBUF("content"),   // value
    SBUF("key"),       // key
    SBUF(ns),          // namespace (32 bytes)
    SBUF(acc));        // target account (20 bytes)

if (w == NOT_AUTHORIZED)
    rollback(SBUF("foreign-state: no grant"), 1);
if (w < 0)
    rollback(SBUF("foreign-state: write failed"), 2);
// success: w == number of bytes written
```

Setting up the grant itself is a `SetHook` operation performed by the granting
account (populating `sfHookGrants`); the precise `SetHook` JSON is outside the C
API and is not shown here.

## Variations

**Configuring the target by r-address.** If your install parameter is an
r-address string rather than a raw AccountID, convert it first with
`util_accid(SBUF(acc20), SBUF(raddr))`, then pass `acc20` to `state_foreign`.

**Reading your own state via the foreign API.** `state_foreign` with the hook's
own account and namespace behaves like `state`; the dedicated `state` call is
shorter when you do not need to name a namespace.

**Multiple config keys.** Read several keys from the same foreign account by
calling `state_foreign` once per key; the account and namespace stay constant.

## Caveats

- The namespace argument is exactly 32 bytes and the account is exactly 20 bytes;
  wrong lengths return `OUT_OF_BOUNDS (-1)` or `TOO_BIG (-3)` depending on which
  buffer is malformed (see the bounds checks in the `state_foreign` test hook).
- A rejected foreign write can latch: once a foreign `state_foreign_set` fails in
  a way that disables further foreign writes for the execution, subsequent calls
  return `PREVIOUS_FAILURE_PREVENTS_RETRY (-35)`.
- Foreign *reads* never require a grant, so an account cannot hide its published
  state from other hooks; only writes are gated.
- Foreign state you write still counts against the *target* account's reserve and
  the combined per-chain state-modification limits.

## Common mistakes

- **Expecting a foreign write to succeed without a grant.** Without a matching
  `sfHookGrants` entry on the target, `state_foreign_set` returns
  `NOT_AUTHORIZED (-34)`. Set up the grant on the granting account first.
- **Passing a namespace shorter than 32 bytes.** The namespace is a fixed 32-byte
  value; a truncated buffer is rejected. Zero-fill unused bytes.
- **Confusing "own account" with "foreign".** `state_foreign_set` to the hook's
  own account skips the grant check; to another account it does not. Getting the
  account argument wrong silently changes which store you write to.
- **Treating `DOESNT_EXIST` as an error.** A missing config key returns `-5`;
  decide whether that means "use a default" or "reject", and branch explicitly
  rather than lumping it with real errors.

## Related documents

- [overview.md](../overview.md)
- [glossary.md](../glossary.md)
- [macros.md](../macros/README.md)
- [best-practices.md](../best-practices.md)
- [api-reference/state.md](../api-reference/state/README.md)
- [api-reference/control.md](../api-reference/control/README.md)
- [api-reference/utility.md](../api-reference/utility/README.md)
- [examples/state-counter.md](state-counter.md)
- [examples/payment-filter.md](payment-filter.md)
