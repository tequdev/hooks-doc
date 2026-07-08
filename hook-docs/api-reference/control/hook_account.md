# hook_account

**Summary.** Write the 20-byte AccountID of the account the running hook is installed on
into hook memory.

**Signature.**

```c
int64_t hook_account(uint32_t write_ptr, uint32_t write_len);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `write_ptr` | `uint32_t` | Destination buffer in WASM memory. |
| `write_len` | `uint32_t` | Buffer length; must be at least 20. |

**Return value.** Returns `20` (the number of bytes written) on success. Errors:
`OUT_OF_BOUNDS` (-1) if the buffer is outside memory; `TOO_SMALL` (-4) if `write_len < 20`.

**Common failure patterns.**
- Passing a buffer smaller than 20 bytes → `TOO_SMALL`.
- An out-of-range pointer or length → `OUT_OF_BOUNDS`.

**Caveats / notes.**
- Writes exactly 20 raw bytes (an AccountID), not an r-address. Use
  [`util_raddr`](../utility/util_raddr.md) to convert to the human-readable form.
- The "hook account" is the account whose hook is executing — not necessarily the sender of
  the originating transaction. Compare with [`otxn_field(sfAccount)`](../transaction/otxn_field.md).

**Minimal example.**

```c
uint8_t acc[20];
hook_account((uint32_t)acc, 20);
```

**Practical example (adapted from `SetHook_test.cpp`, "Test hook_account").**

```c
int64_t hook(uint32_t reserved)
{
    _g(1, 1);
    uint8_t acc[20];

    // bounds and size checks return the documented error codes
    ASSERT(hook_account(1000000, 20) == OUT_OF_BOUNDS);
    ASSERT(hook_account((uint32_t)acc, 19) == TOO_SMALL);
    ASSERT(hook_account((uint32_t)acc, 20) == 20);

    accept((uint32_t)acc, 20, 0);   // return the accid
}
```

**Related APIs.** [`otxn_field`](../transaction/otxn_field.md), [`util_raddr`](../utility/util_raddr.md).
