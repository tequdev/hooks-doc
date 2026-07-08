# etxn_details

**Summary.** Write the `sfEmitDetails` object — the block of fields every emitted transaction
must contain — into a buffer, ready to splice into the transaction you are building.

**Signature.**

```c
int64_t etxn_details(uint32_t write_ptr, uint32_t write_len);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `write_ptr` | `uint32_t` | Destination buffer for the serialized `sfEmitDetails` object. |
| `write_len` | `uint32_t` | Buffer length; must be at least the object size (see below). |

**Return value.** Returns the number of bytes written: `138` if the hook has a `cbak`
callback, or `116` (`138 - 22`) if it does not. Errors: `OUT_OF_BOUNDS` (-1) for a bad
buffer; `TOO_SMALL` (-4) if `write_len` is below the required size;
`PREREQUISITE_NOT_MET` (-9) if `etxn_reserve` was not called; `FEE_TOO_LARGE` (-10) if the
burden overflows; `INTERNAL_ERROR` (-2) if the nonce cannot be generated.

**Fields written (verified in `HookAPI::etxn_details`).** In serialized order:

| Field | Type | Value |
|---|---|---|
| `sfEmitGeneration` | UINT32 | `etxn_generation()` (originating generation + 1). |
| `sfEmitBurden` | UINT64 | `etxn_burden()` (originating burden × reserved count). |
| `sfEmitParentTxnID` | UINT256 | The originating transaction's hash. |
| `sfEmitNonce` | UINT256 | A fresh nonce from [`etxn_nonce`](etxn_nonce.md). |
| `sfEmitHookHash` | UINT256 | The currently executing hook's WASM hash. |
| `sfEmitCallback` | ACCOUNT | The hook account — **present only if the hook has a `cbak`** (adds 22 bytes). |

**Common failure patterns.**
- Passing a buffer of exactly `116` when the hook has a callback → `TOO_SMALL` (it needs
  `138`). If unsure, size the buffer at `138`.
- Calling it before `etxn_reserve` → `PREREQUISITE_NOT_MET`.

**Caveats / notes.**
- Each call also consumes a nonce, so call it once per emitted transaction. The test hooks
  call `etxn_details(tx + offset, 138)` again before emitting a *second* transaction, to
  refresh both the nonce and generation/burden in that transaction's copy of the object.
- `emit` re-validates every field this object contains, so writing it by hand is
  error-prone; prefer this API (or [`prepare`](prepare.md)).

**Minimal example.**

```c
uint8_t details[138];
int64_t n = etxn_details((uint32_t)details, sizeof(details));  // 138 or 116
```

**Practical example (adapted from `SetHook_test.cpp`, "Test etxn_details").**

```c
// Splice sfEmitDetails into a transaction being assembled at `buf_out`,
// then advance the write cursor by the number of bytes written.
int64_t edlen = etxn_details((uint32_t)buf_out, PREPARE_PAYMENT_SIMPLE_SIZE);
if (edlen < 0)
    rollback(SBUF("etxn_details failed"), edlen);
buf_out += edlen;
```

**Related APIs.** [`etxn_nonce`](etxn_nonce.md), [`etxn_generation`](etxn_generation.md),
[`etxn_burden`](etxn_burden.md), [`emit`](emit.md), [`prepare`](prepare.md).
