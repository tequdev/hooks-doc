# state_foreign_set

**Summary.** Write a state entry on another account's namespace. Writing to the hook's own
account is always allowed; writing to a *different* account requires that account to have
granted permission.

**Signature.**

```c
int64_t state_foreign_set(uint32_t read_ptr, uint32_t read_len,
                          uint32_t kread_ptr, uint32_t kread_len,
                          uint32_t nread_ptr, uint32_t nread_len,
                          uint32_t aread_ptr, uint32_t aread_len);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `read_ptr` | `uint32_t` | Pointer to the value. `read_ptr == 0` **and** `read_len == 0` deletes the entry. |
| `read_len` | `uint32_t` | Value length; up to `256 * scale` bytes. |
| `kread_ptr` | `uint32_t` | Pointer to the key. |
| `kread_len` | `uint32_t` | Key length; 1..32 bytes. |
| `nread_ptr` | `uint32_t` | Pointer to a 32-byte namespace. |
| `nread_len` | `uint32_t` | Namespace length. `0` (local only) or exactly 32. |
| `aread_ptr` | `uint32_t` | Pointer to a 20-byte AccountID. `0` for the hook account. |
| `aread_len` | `uint32_t` | Account length. `0` for local, or exactly 20 for foreign. |

**Return value.** Returns the value length on success. Errors: `OUT_OF_BOUNDS` (-1);
`TOO_BIG` (-3) if `kread_len > 32` or `read_len` exceeds the size limit; `TOO_SMALL` (-4) if
`kread_len < 1`; `INVALID_ARGUMENT` (-7) if `nread_len`/`aread_len` are invalid, or if a
namespace is omitted while an account is supplied; `NOT_AUTHORIZED` (-34) if a foreign write
is not covered by a grant; `PREVIOUS_FAILURE_PREVENTS_RETRY` (-35) if a foreign write to this
account already failed authorization once this execution; `RESERVE_INSUFFICIENT` (-38);
`TOO_MANY_STATE_MODIFICATIONS` (-44); `TOO_MANY_NAMESPACES` (-45);
`INTERNAL_ERROR` (-2).

**How the grant check works (from `HookAPI.cpp`).**
When the target account differs from the hook account, `state_foreign_set` looks up the
foreign account's hook object (`keylet::hook(account)`) and scans each installed hook for
`sfHookGrants`. A grant authorizes the write if:

- the granting hook's namespace matches the namespace you are writing to (the grant applies to
  the granter's `sfHookNamespace`, taken from the hook object or its `HookDefinition`), and
- a grant entry's `sfHookHash` equals the currently executing hook's hash, and
- the grant either has no `sfAuthorize` field, or its `sfAuthorize` account equals the hook
  account.

If no matching grant is found the write returns `NOT_AUTHORIZED` and, importantly, the hook
is given **only one attempt**: `foreignStateSetDisabled` is set, so subsequent foreign writes
in the same execution return `PREVIOUS_FAILURE_PREVENTS_RETRY`. A successful grant is cached
per (account, namespace) so later writes skip the expensive scan.

**Common failure patterns.**
- Attempting a foreign write with no grant → `NOT_AUTHORIZED`, and every later foreign write
  that execution → `PREVIOUS_FAILURE_PREVENTS_RETRY`.
- Supplying an account but a zero-length namespace → `INVALID_ARGUMENT` (a foreign write must
  name a 32-byte namespace).
- Under-funded foreign account for a new entry → `RESERVE_INSUFFICIENT` (reserve is charged
  against the *target* account).

**Caveats / notes.**
- Writing to your own account (`aread_ptr == 0` or the account equals
  [`hook_account`](../control/hook_account.md)) never needs a grant and never touches the grant
  logic.
- Because the grant scan is expensive and single-shot, validate authorization assumptions
  before attempting foreign writes; a single unauthorized attempt blocks the rest.
- Reserve for new foreign entries is charged to the foreign (target) account, not the hook
  account.
- Deletion (zero-length value) works the same as for [`state_set`](state_set.md).

**Minimal example.**

```c
// write into a foreign account's namespace (requires a grant on that account)
state_foreign_set((uint32_t)val, val_len,
                  (uint32_t)key, 32,
                  (uint32_t)ns, 32,
                  (uint32_t)foreign_accid, 20);
```

**Practical example.**

```c
// A "collector" hook records the sender into a shared registry account's state.
// The registry account must grant this hook's hash write access to `ns`.
uint8_t ns[32];        // registry namespace
uint8_t key[32];       // e.g. the sender's AccountID left-padded into 32 bytes
uint8_t sender[20];
otxn_field((uint32_t)sender, 20, sfAccount);

int64_t r = state_foreign_set(SBUF("seen"),
                              (uint32_t)key, 32,
                              (uint32_t)ns, 32,
                              (uint32_t)REGISTRY, 20);
if (r == NOT_AUTHORIZED)
    rollback(SBUF("registry has not granted this hook"), __LINE__);
accept(SBUF("recorded"), 0);
```

**Related APIs.** [`state_set`](state_set.md), [`state_foreign`](state_foreign.md); see the
[foreign state example](../../examples/foreign-state.md).
