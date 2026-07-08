# etxn_nonce

**Summary.** Generate a unique 32-byte nonce for an emitted transaction. Each call returns a
distinct value; every emitted transaction's `sfEmitNonce` must be one produced here.

**Signature.**

```c
int64_t etxn_nonce(uint32_t write_ptr, uint32_t write_len);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `write_ptr` | `uint32_t` | Destination buffer for the 32-byte nonce. |
| `write_len` | `uint32_t` | Buffer length; must be at least 32. |

**Return value.** Returns `32` (bytes written) on success. Errors: `OUT_OF_BOUNDS` (-1) for a
bad buffer; `TOO_MANY_NONCES` (-12) once more than `255` (`max_nonce`) nonces have been
requested this execution; `TOO_SMALL` (-4) if `write_len < 32`.

**Common failure patterns.**
- Requesting a 256th nonce in one execution → `TOO_MANY_NONCES` (checked *before* the size
  check for backwards compatibility).
- A buffer smaller than 32 bytes → `TOO_SMALL`.

**Caveats / notes.**
- The nonce is `SHA-512Half(emitTxnNonce prefix, originating-txn-id, counter, hook account,
  hook hash, flags)`, where the counter increments on every call — so two calls never collide,
  and the value is deterministic across all validators.
- `emit` requires the emitted transaction's `sfEmitNonce` to be one this API generated
  (tracked in `hookCtx.nonce_used`); a forged nonce yields `EMISSION_FAILURE`.
- You rarely call this directly: [`etxn_details`](etxn_details.md) calls it internally and
  writes the nonce into the `sfEmitDetails` object for you. Emitting two transactions
  therefore requires two `etxn_details` calls so each gets a fresh nonce.

**Minimal example.**

```c
uint8_t nonce[32];
etxn_nonce((uint32_t)nonce, 32);
```

**Practical example.**

```c
// Two emitted transactions must carry different nonces.
uint8_t n1[32], n2[32];
if (etxn_nonce((uint32_t)n1, 32) != 32) rollback(SBUF("nonce1"), 1);
if (etxn_nonce((uint32_t)n2, 32) != 32) rollback(SBUF("nonce2"), 2);
// n1 != n2 is guaranteed by the incrementing internal counter.
```

**Related APIs.** [`etxn_details`](etxn_details.md), [`emit`](emit.md),
[`ledger_nonce`](../ledger/ledger_nonce.md).
