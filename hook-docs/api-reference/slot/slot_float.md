# slot_float

**Summary.** Interpret a slotted `STI_AMOUNT` as an XFL floating-point value.

**Signature.**

```c
int64_t slot_float(uint32_t slot_no);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `slot_no` | `uint32_t` | Slot holding an amount. |

**Return value.** Returns the amount encoded as an XFL (`int64_t`) on success. A zero (or
underflowing) amount returns `0`. Errors: `DOESNT_EXIST` (-5) if the slot is empty;
`INTERNAL_ERROR` (-2) if corrupt; `NOT_AN_AMOUNT` (-32) if the slot does not hold an amount.

**Common failure patterns.**
- Calling it on a non-amount slot → `NOT_AN_AMOUNT`.

**Caveats / notes.**
- Native XRP amounts are normalized to XFL with exponent `-6` (drops); IOU amounts use their
  own mantissa/exponent. Either way you get an XFL you can feed to the
  [`float_*`](../float/README.md) functions.
- Combine with [`slot_subfield`](slot_subfield.md) to reach the amount field first (e.g.
  `sfAmount`).

**Minimal example.**

```c
int64_t xfl = slot_float(amt_slot);
```

**Practical example.**

```c
// Extract the Payment Amount as an XFL and compare it to a threshold.
int64_t txn = otxn_slot(0);
int64_t amt = slot_subfield(txn, sfAmount, 0);
int64_t xfl = slot_float(amt);
if (float_compare(xfl, float_set(0, 1000000), COMPARE_LESS) == 1)
    rollback(SBUF("amount below minimum"), __LINE__);
accept(SBUF("ok"), 0);
```

**Related APIs.** [`slot_type`](slot_type.md), [`slot_subfield`](slot_subfield.md),
[`float_compare`](../float/float_compare.md).
