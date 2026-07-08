# slot_subarray

**Summary.** Extract an array element of a slotted array into a (new or specified) slot.

**Signature.**

```c
int64_t slot_subarray(uint32_t parent_slot, uint32_t array_id, uint32_t new_slot);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `parent_slot` | `uint32_t` | Slot holding an `STI_ARRAY`. |
| `array_id` | `uint32_t` | Zero-based index of the element to extract. |
| `new_slot` | `uint32_t` | Destination slot, or `0` to allocate a free slot. |

**Return value.** Returns the destination slot number on success. Errors: `DOESNT_EXIST` (-5)
if the parent is empty or `array_id` is out of range; `INTERNAL_ERROR` (-2) if corrupt;
`NOT_AN_ARRAY` (-22) if the parent is not an array; `INVALID_ARGUMENT` (-7) if `new_slot`
exceeds `max_slots`; `NO_FREE_SLOTS` (-6) if `new_slot == 0` and none are free.

**Common failure patterns.**
- An `array_id` beyond the element count → `DOESNT_EXIST`.
- Calling it on a non-array slot → `NOT_AN_ARRAY`.

**Caveats / notes.**
- Use [`slot_count`](slot_count.md) to get the valid index range first.
- Extracted elements are objects; drill further with [`slot_subfield`](slot_subfield.md).

**Minimal example.**

```c
uint32_t elem = slot_subarray(memos_slot, 0, 0);
```

**Practical example.**

```c
// Read the first Memo's MemoData from the originating transaction.
int64_t txn = otxn_slot(0);
int64_t memos = slot_subfield(txn, sfMemos, 0);
if (memos > 0 && slot_count(memos) > 0)
{
    uint32_t memo0 = slot_subarray(memos, 0, 0);
    uint32_t memo  = slot_subfield(memo0, sfMemo, 0);
    uint32_t data  = slot_subfield(memo, sfMemoData, 0);
    uint8_t buf[256];
    int64_t n = slot((uint32_t)buf, sizeof(buf), data);
    // ... use buf[0..n) ...
}
accept(SBUF("ok"), 0);
```

**Related APIs.** [`slot_count`](slot_count.md), [`slot_subfield`](slot_subfield.md).
