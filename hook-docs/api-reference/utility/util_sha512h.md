# util_sha512h

**Summary.** Compute the SHA-512Half of a buffer — the first 32 bytes of the SHA-512
digest. This is the hashing primitive XRPL uses throughout (ledger hashes, transaction
IDs, and, when combined with a namespace prefix, keylet indices).

**Signature.**

```c
int64_t util_sha512h(
    uint32_t write_ptr,   // 32-byte output buffer
    uint32_t write_len,   // must be >= 32
    uint32_t read_ptr,    // input data
    uint32_t read_len);   // input length
```

**Parameters.**

| Name | Meaning |
|---|---|
| `write_ptr`, `write_len` | Output buffer. `write_len` must be at least 32; exactly 32 bytes are written. |
| `read_ptr`, `read_len` | Input data of any length within memory bounds. |

**Return value.** On success, 32 (bytes written). Errors:

| Code | Value | Cause |
|---|---|---|
| `TOO_SMALL` | -4 | `write_len < 32`. |
| `OUT_OF_BOUNDS` | -1 | A region is out of bounds. |

**Common failure patterns.**
- Sizing the output buffer at 64 bytes and assuming a full SHA-512 — only the first
  32 bytes (SHA-512Half) are produced.

**Caveats.** SHA-512Half ≠ SHA-256. Do not use this where a counterpart expects a
plain SHA-256 or full SHA-512 digest.

**Minimal example.**

```c
uint8_t hash[32];
int64_t r = util_sha512h(SBUF(hash), SBUF("hello world"));
if (r != 32)
    rollback(SBUF("hash failed"), r);
```

**Related APIs.** [`util_verify`](util_verify.md), [`util_keylet`](util_keylet.md),
[`ledger_nonce`](../ledger/ledger_nonce.md).
