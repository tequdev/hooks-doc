# slot_count

**Summary.** Return the number of elements in a slotted array (`STI_ARRAY`).

**Signature.**

```c
int64_t slot_count(uint32_t slot);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `slot` | `uint32_t` | Slot holding an array. |

**Return value.** Returns the element count on success. Errors: `DOESNT_EXIST` (-5) if the
slot is empty; `INTERNAL_ERROR` (-2) if corrupt; `NOT_AN_ARRAY` (-22) if the slotted object is
not an `STI_ARRAY`.

**Common failure patterns.**
- Calling it on a non-array slot (e.g. a plain object or leaf field) → `NOT_AN_ARRAY`.

**Caveats / notes.**
- Pair with [`slot_subarray`](slot_subarray.md) to iterate: `slot_count` gives the loop bound,
  `slot_subarray(parent, i, new)` extracts element `i`.

**Minimal example.**

```c
int64_t n = slot_count(arr_slot);
```

**Practical example.**

```c
// Iterate a slotted array (e.g. Memos or a signer list).
int64_t n = slot_count(arr_slot);
for (int i = 0; GUARD(256), i < n; ++i)
{
    uint32_t elem = slot_subarray(arr_slot, i, 0);
    // ... inspect elem ...
}
```

**Related APIs.** [`slot_subarray`](slot_subarray.md), [`slot_count`](slot_count.md).
