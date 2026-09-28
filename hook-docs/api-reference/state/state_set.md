# state_set

**Summary.** Create, update, or delete a state entry under the hook account's current
namespace.

**Signature.**

```c
int64_t state_set(uint32_t read_ptr, uint32_t read_len,
                  uint32_t kread_ptr, uint32_t kread_len);
```

`state_set` is a wrapper that calls `state_foreign_set` with a zero-length namespace and
account, targeting the hook account under the current namespace.
<!-- Wrapper implementation: `applyHook.cpp`. -->

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `read_ptr` | `uint32_t` | Pointer to the value to store. `read_ptr == 0` **and** `read_len == 0` deletes the entry. |
| `read_len` | `uint32_t` | Value length; up to `256 * scale` bytes (256 by default, 4096 max). |
| `kread_ptr` | `uint32_t` | Pointer to the key. |
| `kread_len` | `uint32_t` | Key length; 1..32 bytes. |

**Return value.** Returns the number of bytes written (`read_len`) on success. Errors:
`OUT_OF_BOUNDS` (-1) for a bad value/key pointer; `TOO_BIG` (-3) if `kread_len > 32` or
`read_len` exceeds the state-size limit; `TOO_SMALL` (-4) if `kread_len < 1`;
`RESERVE_INSUFFICIENT` (-38) if a new entry would exceed the account reserve;
`TOO_MANY_STATE_MODIFICATIONS` (-44) once 256 entries have been modified this execution;
`TOO_MANY_NAMESPACES` (-45) if a new namespace would exceed 256;
`INTERNAL_ERROR` (-2) if the account object cannot be read.

**Common failure patterns.**
- Trying to create many new entries on an under-funded account → `RESERVE_INSUFFICIENT`.
- A value larger than the (scaled) size limit → `TOO_BIG`.
- Assuming the change is on the ledger immediately — it is staged in the cache and only
  written when the hook `accept`s; a `rollback` discards it.

**Caveats / notes.**
- **Deletion:** passing a zero-length value (`state_set(0, 0, key_ptr, key_len)`) deletes the
  entry.
  <!-- `applyHook.cpp` notes: "passing 0 size causes a delete operation which is as-intended". -->
- Overwriting an existing key does not consume additional reserve; only new keys do.
- Writes are cached during execution and flushed on `accept`.
  <!-- The internal function that flushes them is `finalizeHookState`. -->
  A `rollback` (or falling off the end of `hook()`) discards all staged writes.
- The current namespace is the hook's `sfHookNamespace`; use [`state_foreign_set`](state_foreign_set.md)
  to write into a different namespace or account.

**Minimal example.**

```c
state_set(SBUF("content"), SBUF("key"));   // create/update
state_set(0, 0, SBUF("key"));              // delete
```

**Practical example (state counter).**
<!-- Adapted from `SetHook_test.cpp`, "Test state". -->

```c
// increment an 8-byte big-endian counter stored under "ctr"
uint8_t ctr[8];
int64_t n = state((uint32_t)ctr, sizeof(ctr), SBUF("ctr"));   // may be DOESNT_EXIST
uint64_t v = (n == 8) ? UINT64_FROM_BUF(ctr) : 0;
v += 1;
UINT64_TO_BUF(ctr, v);
if (state_set((uint32_t)ctr, 8, SBUF("ctr")) != 8)
    rollback(SBUF("could not persist counter"), __LINE__);
accept(SBUF("counted"), 0);
```

**Related APIs.** [`state`](state.md), [`state_foreign_set`](state_foreign_set.md); see the
[state counter example](../../examples/state-counter.md).
