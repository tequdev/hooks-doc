# util_accid

**Summary.** Convert a base58-check encoded r-address string into a 20-byte
AccountID. Inverse of [`util_raddr`](util_raddr.md).

**Signature.**

```c
int64_t util_accid(
    uint32_t write_ptr,   // where to write the 20-byte AccountID
    uint32_t write_len,   // must be >= 20
    uint32_t read_ptr,    // r-address string
    uint32_t read_len);   // string length (<= 49)
```

**Parameters.**

| Name | Meaning |
|---|---|
| `write_ptr`, `write_len` | Output buffer for the AccountID. `write_len` must be at least 20; exactly 20 bytes are written. |
| `read_ptr`, `read_len` | The r-address string. `read_len` must be at most 49. The string does not need to be NUL-terminated in memory (the API copies `read_len` bytes and NUL-terminates internally). |

**Return value.** On success, the number of bytes written (`write_len` is passed
through; 20 bytes of AccountID are written). Errors:

| Code | Value | Cause |
|---|---|---|
| `OUT_OF_BOUNDS` | -1 | `write` or `read` region out of bounds. |
| `TOO_SMALL` | -4 | `write_len < 20`. |
| `TOO_BIG` | -3 | `read_len > 49`. |
| `INVALID_ARGUMENT` | -7 | The string is not a valid AccountID r-address (base58/checksum failure). |

**Common failure patterns.**
- Feeding an X-address or a currency/family-seed base58 string → `INVALID_ARGUMENT`
  (only `TokenType::AccountID` decodes).
- A trailing NUL counted in `read_len` can shift decoding; pass the exact character
  count, not `sizeof(buffer)`.

**Caveats.** Only classic r-addresses are accepted. There is no validation that the
resulting account exists on-ledger — this is a pure string decode.

**Minimal example.**

```c
uint8_t accid[20];
int64_t r = util_accid(SBUF(accid), SBUF("rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh"));
if (r < 0)
    rollback(SBUF("bad r-address"), r);
```

**Practical example.** Decode an r-address supplied as a hook parameter, then use it
to look up a trustline keylet:

```c
uint8_t raddr[64];
int64_t rlen = otxn_param(SBUF(raddr), SBUF("DST"));
if (rlen > 0)
{
    uint8_t dst[20];
    if (util_accid(SBUF(dst), raddr, rlen) == 20)
    {
        // dst now usable with util_keylet(..., KEYLET_LINE, ...)
    }
}
```

**Related APIs.** [`util_raddr`](util_raddr.md),
[`otxn_param`](../transaction/otxn_param.md), [`util_keylet`](util_keylet.md).
