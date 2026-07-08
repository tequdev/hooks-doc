# etxn_fee_base

**Summary.** Compute the minimum fee (in drops) that a to-be-emitted transaction must pay,
given its fully-serialized form.

**Signature.**

```c
int64_t etxn_fee_base(uint32_t read_ptr, uint32_t read_len);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `read_ptr` | `uint32_t` | Pointer to the serialized transaction. |
| `read_len` | `uint32_t` | Length of the serialized transaction. |

**Return value.** Returns the required fee in drops on success. Errors: `OUT_OF_BOUNDS` (-1)
for a bad buffer; `PREREQUISITE_NOT_MET` (-9) if `etxn_reserve` was not called;
`INVALID_TXN` (-37) if the buffer cannot be parsed as a transaction.

**Common failure patterns.**
- Calling it before `etxn_reserve` → `PREREQUISITE_NOT_MET`.
- Passing a malformed or incomplete transaction blob → `INVALID_TXN`.

**Caveats / notes.**
- Internally this runs the transaction through the same base-fee calculation the network
  uses (`calculateBaseFee` / `invoke_calculateBaseFee` under `fixHookAPI20251128`), so it
  doubles as a sanity check that the blob is a valid transaction.
- Compute the fee *after* the transaction is otherwise complete (including `sfEmitDetails`),
  then write the returned value into `sfFee`. `emit` rejects a transaction whose `sfFee` is
  below this minimum with `EMISSION_FAILURE`.

**Minimal example.**

```c
int64_t fee = etxn_fee_base((uint32_t)tx, tx_len);
```

**Practical example (from the `PREPARE_PAYMENT_SIMPLE` idiom in `SetHook_test.cpp`).**

```c
// After building the transaction, compute the fee and patch it into sfFee.
int64_t fee = etxn_fee_base((uint32_t)tx, PREPARE_PAYMENT_SIMPLE_SIZE);
if (fee < 0)
    rollback(SBUF("fee calc failed"), fee);
// fee_ptr points at the sfFee amount field placed earlier in the buffer:
ENCODE_DROPS_FEE(fee_ptr, fee);
```

**Related APIs.** [`emit`](emit.md), [`fee_base`](../ledger/fee_base.md),
[`prepare`](prepare.md).
