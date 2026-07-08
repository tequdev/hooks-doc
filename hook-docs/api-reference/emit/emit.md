# emit

**Summary.** Validate a fully-formed, serialized transaction, queue it for emission, and write
its 32-byte hash. This is the call that actually emits.

**Signature.**

```c
int64_t emit(uint32_t write_ptr, uint32_t write_len,
             uint32_t read_ptr, uint32_t read_len);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `write_ptr` | `uint32_t` | Destination buffer for the emitted transaction's 32-byte hash. |
| `write_len` | `uint32_t` | Buffer length; must be at least 32. |
| `read_ptr` | `uint32_t` | Pointer to the serialized transaction to emit. |
| `read_len` | `uint32_t` | Length of the serialized transaction. |

**Return value.** Returns `32` (the hash length written) on success. Errors:
`OUT_OF_BOUNDS` (-1) for a bad buffer; `TOO_SMALL` (-4) if `write_len < 32`;
`PREREQUISITE_NOT_MET` (-9) if `etxn_reserve` was not called;
`TOO_MANY_EMITTED_TXN` (-13) if more transactions are emitted than were reserved;
`EMISSION_FAILURE` (-11) if the transaction violates any emission rule.

**Emission rules (verified in `HookAPI::emit`).** A transaction is rejected with
`EMISSION_FAILURE` unless all hold:

- It is not a pseudo-transaction, and its type is permitted by the hook's `HookCanEmit` set.
- `sfAccount` is present and equals the hook account.
- `sfSequence` is present and `0`.
- `sfSigningPubKey` is present and all-zero (size 33 or 0); no `sfSigners`,
  `sfTicketSequence`, `sfAccountTxnID`, or `sfTxnSignature`.
- `sfEmitDetails` is present and contains `sfEmitGeneration`, `sfEmitBurden`,
  `sfEmitParentTxnID`, `sfEmitNonce`, and `sfEmitHookHash`; generation `< 10`; generation and
  burden match [`etxn_generation`](etxn_generation.md)/[`etxn_burden`](etxn_burden.md); parent
  txn id matches the originating transaction; nonce was produced by
  [`etxn_nonce`](etxn_nonce.md); `sfEmitCallback` (if present) equals the hook account; hook
  hash equals the running hook.
- `sfLastLedgerSequence` is present and within `[current+1, current+5]`;
  `sfFirstLedgerSequence` is present and `<= sfLastLedgerSequence`.
- `sfFee` is present and at least [`etxn_fee_base`](etxn_fee_base.md) for the blob.
- The transaction passes `preflight` under the emit flag.

**Common failure patterns.**
- Any of the rules above → `EMISSION_FAILURE` (enable trace logging to see which rule fired).
- Emitting more than the reserved count → `TOO_MANY_EMITTED_TXN`.
- A hash buffer smaller than 32 bytes → `TOO_SMALL`.

**Caveats / notes.**
- The queued transaction is only kept if the hook goes on to `accept`; a `rollback` discards
  this hook's emitted transactions (see [control.md](../control/README.md)).
- Build the transaction with [`etxn_details`](etxn_details.md) + [`etxn_fee_base`](etxn_fee_base.md)
  (or [`prepare`](prepare.md)) so the rule checks pass; emitting a hand-built blob without these
  almost always fails.

**Minimal example.**

```c
uint8_t hash[32];
if (emit((uint32_t)hash, 32, (uint32_t)tx, tx_len) != 32)
    rollback(SBUF("emit failed"), 1);
```

**Practical example — a complete single emission (adapted from `SetHook_test.cpp`,
"Test emit").**

```c
int64_t hook(uint32_t r)
{
    _g(1, 1);

    // 1. reserve the single transaction we are about to emit
    if (etxn_reserve(1) != 1)
        rollback(SBUF("reserve failed"), 1);

    // read the destination account from a hook/txn parameter
    uint8_t bob[20];
    if (otxn_param((uint32_t)bob, 20, (uint32_t)"bob", 3) != 20)
        rollback(SBUF("no destination"), 2);

    // 2. build the raw Payment transaction; the PREPARE_PAYMENT_SIMPLE macro
    //    lays out the fields, then internally calls:
    //      3. etxn_details(...)   -> inserts sfEmitDetails
    //      4. etxn_fee_base(...)  -> computes and patches sfFee
    uint8_t tx[PREPARE_PAYMENT_SIMPLE_SIZE];
    PREPARE_PAYMENT_SIMPLE(tx, 1000, bob, 0, 0);   // 1000 drops to bob

    // 5. emit and capture the resulting transaction hash
    uint8_t hash[32];
    if (emit((uint32_t)hash, 32, (uint32_t)tx, sizeof(tx)) != 32)
        rollback(SBUF("emit failed"), 3);

    accept(SBUF("emitted"), 0);
}
```

See [../examples/emitted-transaction.md](../../examples/emitted-transaction.md) for a fuller
walkthrough, including the `ENCODE_*` field macros the `PREPARE_PAYMENT_SIMPLE` macro expands
to.

**Related APIs.** [`etxn_reserve`](etxn_reserve.md), [`etxn_details`](etxn_details.md),
[`etxn_fee_base`](etxn_fee_base.md), [`prepare`](prepare.md), [`accept`](../control/accept.md).
