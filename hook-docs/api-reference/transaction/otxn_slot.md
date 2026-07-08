# otxn_slot

**Summary.** Load the entire originating transaction into a slot, so its subfields and arrays
can be navigated with the slot APIs.

**Signature.**

```c
int64_t otxn_slot(uint32_t slot_no);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `slot_no` | `uint32_t` | Target slot number (`1`..`255`), or `0` to auto-allocate a free slot. |

**Return value.** Returns the slot number the transaction was loaded into (the same value you
passed, or the auto-allocated one when you passed `0`). Errors: `INVALID_ARGUMENT` (-7) if
`slot_no` is greater than `max_slots` (255); `NO_FREE_SLOTS` (-6) if `slot_no == 0` and no
slot is free.

**Common failure patterns.**
- Passing a `slot_no` above 255 → `INVALID_ARGUMENT`.
- Requesting auto-allocation (`0`) when all 255 slots are in use → `NO_FREE_SLOTS`.

**Caveats / notes.**
- Loading into an occupied `slot_no` overwrites it. Pass `0` and use the returned number to
  avoid clobbering an existing slot.
- Once slotted, use [`slot_subfield`](../slot/slot_subfield.md) /
  [`slot_subarray`](../slot/slot_subarray.md) to reach nested fields (e.g. an amount
  or a memo), [`slot_float`](../slot/slot_float.md) to read an amount as XFL, and
  [`slot`](../slot/slot.md) to copy raw bytes out. This is the preferred route for
  structured or nested access, versus the flat serialization from
  [`otxn_field`](otxn_field.md).
- During a failed-emit callback the slotted object is the emitted transaction (same
  `emitFailure` rule as the rest of the family).

**Minimal example.**

```c
int64_t slot_no = otxn_slot(0);   // auto-allocate a slot for the whole txn
```

**Practical example.**

```c
// Load the originating transaction, expand its sfAmount subfield, and read
// it as an XFL floating value.
#define sfAmount ((6U << 16U) + 1U)
int64_t txn = otxn_slot(0);
if (txn < 0)
    rollback(SBUF("could not slot otxn"), __LINE__);

if (slot_subfield(txn, sfAmount, 1) != 1)
    rollback(SBUF("no Amount field"), __LINE__);

int64_t amt = slot_float(1);      // XFL value of the amount
accept(SBUF("read amount"), 0);
```

**Related APIs.** [`slot_subfield`](../slot/slot_subfield.md),
[`slot_float`](../slot/slot_float.md), [`slot`](../slot/slot.md),
[`meta_slot`](../slot/meta_slot.md), [`otxn_field`](otxn_field.md).
