# otxn_id

**Summary.** Write the 32-byte transaction id (hash) of the originating transaction into hook
memory.

**Signature.**

```c
int64_t otxn_id(uint32_t write_ptr, uint32_t write_len, uint32_t flags);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `write_ptr` | `uint32_t` | Destination buffer in WASM memory. |
| `write_len` | `uint32_t` | Buffer length; must be at least 32. |
| `flags` | `uint32_t` | `0` = during a failed-emit callback, return the emitted txn's stored hash (`sfTransactionHash`); otherwise return the computed transaction id. |

**Return value.** Returns the number of bytes written (32) on success. Errors:
`TOO_SMALL` (-4) if `write_len < 32`; `OUT_OF_BOUNDS` (-1) if the buffer is outside memory.

**Common failure patterns.**
- Buffer shorter than 32 bytes → `TOO_SMALL`.
- Out-of-range pointer or length → `OUT_OF_BOUNDS`.

**Caveats / notes.**
- The `flags` parameter only matters inside a failed-emit callback. There, `flags == 0`
  yields the hash the emitted transaction was stored under (`sfTransactionHash`), while a
  non-zero `flags` recomputes the transaction id from the object
  (`getTransactionID()`). Outside a callback the two are equivalent and you can pass `0`.
- Writes 32 raw bytes; there is no serialization prefix to strip.

**Minimal example.**

```c
uint8_t id[32];
otxn_id((uint32_t)id, 32, 0);   // hash of the originating transaction
```

**Practical example.**

```c
// Persist the originating transaction id as a state key so the hook can
// detect a replay/callback for the same transaction later.
uint8_t id[32];
if (otxn_id((uint32_t)id, 32, 0) != 32)
    rollback(SBUF("could not read otxn id"), __LINE__);

uint8_t one[1] = {1};
state_set(SBUF(one), (uint32_t)id, 32);   // mark this txn as seen
accept(SBUF("recorded"), 0);
```

**Related APIs.** [`otxn_field`](otxn_field.md), [`state_set`](../state/state_set.md),
[`hook_again`](../control/hook_again.md).
