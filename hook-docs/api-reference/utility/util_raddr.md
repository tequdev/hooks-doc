# util_raddr

**Summary.** Convert a 20-byte AccountID into its base58-check encoded r-address
string (e.g. `rB6v18pQ765Z9DH5RQsTFevoQPFmRtBqhT`). This is the inverse of
[`util_accid`](util_accid.md).

**Signature.**

```c
int64_t util_raddr(
    uint32_t write_ptr,   // where to write the r-address string
    uint32_t write_len,   // capacity of the write buffer
    uint32_t read_ptr,    // 20-byte AccountID to encode
    uint32_t read_len);   // must be 20
```

**Parameters.**

| Name | Meaning |
|---|---|
| `write_ptr`, `write_len` | Output buffer for the ASCII r-address. Encoded r-addresses are up to 35 characters; a 50-byte buffer is a safe upper bound. Not NUL-terminated by the API — the return value is the byte count. |
| `read_ptr`, `read_len` | The AccountID to encode. `read_len` must be exactly 20. |

**Return value.** On success, the number of bytes written (the r-address length).
Errors:

| Code | Value | Cause |
|---|---|---|
| `OUT_OF_BOUNDS` | -1 | `write` or `read` region is out of WASM memory bounds. |
| `TOO_SMALL` | -4 | `write_len` is smaller than the encoded r-address. |
| `INVALID_ARGUMENT` | -7 | `read_len` was not exactly 20. |

**Common failure patterns.**
- Passing a raw public key (33 bytes) or a keylet (34 bytes) instead of a 20-byte
  AccountID → `INVALID_ARGUMENT`.
- Sizing the output buffer to 20 bytes (AccountID length) instead of ~35 → `TOO_SMALL`.

**Caveats.** The output is *not* NUL-terminated. Use the return value as the length;
if you need a C string, write a `\0` yourself at `write_ptr + returnvalue`.

**Minimal example.**

```c
uint8_t accid[20]; // filled elsewhere, e.g. via hook_account
hook_account(SBUF(accid));

uint8_t r[50];
int64_t len = util_raddr(SBUF(r), SBUF(accid));
if (len < 0)
    rollback(SBUF("util_raddr failed"), len);
// r[0..len) now holds the ASCII r-address
```

**Practical example.** Building a human-readable trace line for the account a hook
is installed on:

```c
uint8_t accid[20];
hook_account(SBUF(accid));
uint8_t r[50];
int64_t len = util_raddr(SBUF(r), SBUF(accid));
if (len > 0)
    trace(SBUF("hook account"), r, len, 0); // logs the r-address as text
```

**Related APIs.** [`util_accid`](util_accid.md), [`hook_account`](../control/hook_account.md),
[`otxn_field`](../transaction/otxn_field.md) (to obtain an AccountID field).
