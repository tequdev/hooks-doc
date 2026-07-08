# util_verify

**Summary.** Verify a cryptographic signature over a payload using a supplied public
key. Both secp256k1 and ed25519 signatures are supported; the key type is inferred
from the public key using the standard XRPLD convention (an ed25519 public key is 33
bytes prefixed with `0xED`; a secp256k1 public key is a 33-byte compressed point).

**Signature.**

```c
int64_t util_verify(
    uint32_t dread_ptr, uint32_t dread_len,   // signed data (the payload)
    uint32_t sread_ptr, uint32_t sread_len,   // signature
    uint32_t kread_ptr, uint32_t kread_len);  // public key (33 bytes)
```

**Parameters.**

| Name | Meaning |
|---|---|
| `dread_ptr`, `dread_len` | The message that was signed. Must be non-empty. |
| `sread_ptr`, `sread_len` | The signature bytes. Must be at least 30 bytes. |
| `kread_ptr`, `kread_len` | The public key. Must be exactly 33 bytes and a recognized public-key type. |

**Return value.**

| Result | Value | Meaning |
|---|---|---|
| valid | 1 | Signature verifies against the key and data. |
| invalid | 0 | Signature does not verify. |
| `OUT_OF_BOUNDS` | -1 | A region is out of bounds. |
| `INVALID_KEY` | -41 | `kread_len != 33`, or the key is not a valid secp256k1/ed25519 public key. |
| `TOO_SMALL` | -4 | `dread_len == 0`, or `sread_len < 30`. |

**Common failure patterns.**
- Passing an uncompressed (65-byte) secp256k1 key → `INVALID_KEY`; use the 33-byte
  compressed form.
- Passing an AccountID (20 bytes) as the key → `INVALID_KEY`. `util_verify` needs the
  public key, not the account.
- Confusing "invalid signature" (returns `0`, not an error) with an error code: check
  `== 1` for a positive result, and treat negative values as call failures.

**Caveats.** Signature canonicalization is not enforced by this call (it verifies with
`mustBeFullyCanonical = false`). The function does not hash the data for you — pass the
exact bytes that were signed (many XRPL signing schemes sign a prefixed/serialized
blob; reproduce that blob before verifying).

**Minimal example.**

```c
// data, sig, key filled from otxn_param or state
int64_t ok = util_verify(SBUF(data), SBUF(sig), SBUF(pubkey));
if (ok == 1)
    accept(SBUF("signature ok"), 0);
rollback(SBUF("signature invalid"), 1);
```

**Related APIs.** [`util_sha512h`](util_sha512h.md) (to hash a payload before
verifying, if your scheme requires it), [`otxn_param`](../transaction/otxn_param.md).
