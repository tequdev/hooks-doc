# ledger_nonce

**Summary.** Write a unique 32-byte nonce derived from ledger and transaction context.

**Signature.**

```c
int64_t ledger_nonce(uint32_t write_ptr, uint32_t write_len);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `write_ptr` | `uint32_t` | Destination buffer. |
| `write_len` | `uint32_t` | Must be at least 32. |

**Return value.** Returns `32` (bytes written) on success. Errors: `TOO_SMALL` (-4) if
`write_len < 32`; `OUT_OF_BOUNDS` (-1) for a bad buffer; `TOO_MANY_NONCES` (-12) once the
per-execution nonce counter exceeds `max_nonce` (**255**).

**Common failure patterns.**
- Requesting more than 255 nonces in one execution → `TOO_MANY_NONCES`.
- A buffer shorter than 32 bytes → `TOO_SMALL`.

**Caveats / notes.**
- Each call increments an internal counter and hashes ledger sequence, parent close time,
  parent hash, the transaction id, the counter, and the hook account, so successive nonces
  differ and are deterministic across validators.
<!-- hashing implemented in `HookAPI.cpp` -->
- This is the general-purpose nonce; for emitting transactions use
  [`etxn_nonce`](../emit/etxn_nonce.md), which serves the emission machinery.

**Minimal example.**

```c
uint8_t n[32];
ledger_nonce((uint32_t)n, 32);
```

**Related APIs.** [`etxn_nonce`](../emit/etxn_nonce.md),
[`ledger_last_hash`](ledger_last_hash.md).
