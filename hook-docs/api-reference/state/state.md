# state

**Summary.** Read a state value stored under the hook account's current namespace, addressed
by key.

**Signature.**

```c
int64_t state(uint32_t write_ptr, uint32_t write_len,
              uint32_t kread_ptr, uint32_t kread_len);
```

`state` is a thin wrapper that calls `state_foreign` with a zero-length namespace and account
so it reads the hook account under the current namespace.
<!-- Wrapper implementation: `applyHook.cpp`. -->

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `write_ptr` | `uint32_t` | Destination buffer for the value. May be `0` to return the value as an `int64_t` (see notes). |
| `write_len` | `uint32_t` | Destination buffer length. |
| `kread_ptr` | `uint32_t` | Pointer to the key. |
| `kread_len` | `uint32_t` | Key length; 1..32 bytes. |

**Return value.** Returns the number of bytes written (the value length) on success. Errors:
`OUT_OF_BOUNDS` (-1) for bad pointers; `TOO_SMALL` (-4) if `kread_len < 1`, or if
`write_len < 1` while `write_ptr != 0`; `TOO_BIG` (-3) if `kread_len > 32`;
`INVALID_ARGUMENT` (-7) if the key cannot be formed; `DOESNT_EXIST` (-5) if no entry with that
key exists in this namespace. If `write_ptr == 0` the value is returned encoded as a
big-endian `int64_t`, and a value longer than 8 bytes then returns `TOO_BIG` (-3).

**Common failure patterns.**
- Reading a key that was never written → `DOESNT_EXIST`.
- Key length 0 → `TOO_SMALL`; key length > 32 → `TOO_BIG`.
- A write buffer smaller than the stored value → `TOO_SMALL` (the value is not truncated).

**Caveats / notes.**
- Short keys are zero-padded on the left to 32 bytes, so `"x"` and a 32-byte key ending in
  `x` with leading zeros collide. Design keys to avoid accidental overlap.
- `write_ptr == 0` gives you the value as an `int64_t`; this is convenient for reading a
  counter or small integer written with `UINT64_TO_BUF`, but only for values ≤ 8 bytes.
- Reads are served from a per-execution cache, so a value you wrote earlier in the same
  execution with [`state_set`](state_set.md) reads back immediately.

**Minimal example.**

```c
uint8_t buf[32];
int64_t n = state((uint32_t)buf, sizeof(buf), SBUF("key"));  // n = value length or error
```

**Practical example.**
<!-- Adapted from `SetHook_test.cpp`, "Test state". -->

```c
int64_t hook(uint32_t reserved)
{
    _g(1, 1);

    // write two entries first
    state_set(SBUF("content"),  SBUF("key"));
    state_set(SBUF("content2"), SBUF("key2"));

    // bounds and size checks return the documented error codes
    ASSERT(state(1000000, 32, 0, 32) == OUT_OF_BOUNDS);
    ASSERT(state(0, 32, 0, 1000000) == TOO_BIG);       // key too long
    ASSERT(state(0, 0, 0, 0)        == TOO_SMALL);     // key length 0

    // read one back
    uint8_t buf[32];
    int64_t len = state((uint32_t)buf, sizeof(buf), SBUF("key"));
    ASSERT(len == sizeof("content"));

    accept(0, 0, 0);
}
```

**Related APIs.** [`state_set`](state_set.md), [`state_foreign`](state_foreign.md),
[`hook_account`](../control/hook_account.md).
