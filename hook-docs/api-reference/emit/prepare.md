# prepare

**Summary.** Take a partially-specified transaction template and fill in the fixed fields an
emitted transaction requires — account, sequence, signing key, fee, ledger-sequence window,
and `sfEmitDetails` — returning a completed blob ready for [`emit`](emit.md). Requires the
`HooksUpdate2` amendment.

**Signature.**

```c
int64_t prepare(uint32_t write_ptr, uint32_t write_len,
                uint32_t read_ptr, uint32_t read_len);
```

**Amendment gate.** Registered in `hook_api.macro` with `featureHooksUpdate2`; on a network
where that amendment is not enabled, the import is unavailable.

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `write_ptr` | `uint32_t` | Destination buffer for the completed transaction. |
| `write_len` | `uint32_t` | Destination buffer length. |
| `read_ptr` | `uint32_t` | Pointer to the template transaction (serialized). |
| `read_len` | `uint32_t` | Length of the template. |

**Return value.** Returns the length of the completed transaction written to `write_ptr` on
success. Errors: `OUT_OF_BOUNDS` (-1) for a bad buffer; `PREREQUISITE_NOT_MET` (-9) if
`etxn_reserve` was not called; `INVALID_ARGUMENT` (-7) if the template cannot be parsed or the
completed transaction fails to serialize / price; `INTERNAL_ERROR` (-2) if the emit-details
object cannot be built.

**Fields filled (verified in `HookAPI::prepare`).**

- `sfFee` — computed via [`etxn_fee_base`](etxn_fee_base.md) and written last.
- `sfSigningPubKey` — forced to all-zero.
- `sfSequence` — forced to `0`.
- `sfAccount` — set to the hook account.
- `sfFirstLedgerSequence` — set to `current seq + 1` if absent.
- `sfLastLedgerSequence` — set to `current seq + 5` if absent.
- `sfEmitDetails` — inserted via [`etxn_details`](etxn_details.md) if absent.

**Common failure patterns.**
- Calling it before `etxn_reserve` → `PREREQUISITE_NOT_MET`.
- A template that is not a valid serialized transaction → `INVALID_ARGUMENT`.

**Caveats / notes.**
- `prepare` replaces the manual "build the fixed fields by hand" work the `ENCODE_*` macros do
  in the older test hooks; you still supply the transaction-specific fields (type, amount,
  destination, etc.) in the template.
- Fields you *do* provide in the template (for example an explicit `sfLastLedgerSequence`) are
  respected — `prepare` only fills the ledger-sequence and emit-details fields when they are
  absent, but always overrides `sfAccount`, `sfSequence`, `sfSigningPubKey`, and `sfFee`.

**Minimal example.**

```c
uint8_t out[PREPARE_PAYMENT_SIMPLE_SIZE];
int64_t n = prepare((uint32_t)out, sizeof(out), (uint32_t)template, template_len);
if (n < 0)
    rollback(SBUF("prepare failed"), n);
```

**Practical example (adapted from `SetHook_test.cpp`, "Test prepare").**

```c
int64_t hook(uint32_t r)
{
    _g(1, 1);
    etxn_reserve(1);

    // prepare validates its buffers just like emit
    ASSERT(prepare(1000000, 32, 0, 32) == OUT_OF_BOUNDS);

    // fill fixed fields on the template, then emit the completed transaction
    uint8_t out[PREPARE_PAYMENT_SIMPLE_SIZE];
    int64_t n = prepare((uint32_t)out, sizeof(out), (uint32_t)tmpl, tmpl_len);
    if (n < 0)
        rollback(SBUF("prepare failed"), n);

    uint8_t hash[32];
    if (emit((uint32_t)hash, 32, (uint32_t)out, n) != 32)
        rollback(SBUF("emit failed"), 1);

    accept(SBUF("emitted via prepare"), 0);
}
```

**Related APIs.** [`emit`](emit.md), [`etxn_details`](etxn_details.md),
[`etxn_fee_base`](etxn_fee_base.md), [`etxn_reserve`](etxn_reserve.md).
