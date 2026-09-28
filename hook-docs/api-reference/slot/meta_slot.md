# meta_slot

**Summary.** Load the originating transaction's metadata object into a slot.

**Signature.**

```c
int64_t meta_slot(uint32_t slot_no);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `slot_no` | `uint32_t` | Destination slot, or `0` to allocate a free slot. |

**Return value.** Returns the slot number the metadata was loaded into on success. Errors:
`PREREQUISITE_NOT_MET` (-9) if metadata is not available in the current execution;
`INVALID_ARGUMENT` (-7) if `slot_no` exceeds `max_slots`; `NO_FREE_SLOTS` (-6) if
`slot_no == 0` and none are free.

**Common failure patterns.**
- Calling it when no provisional metadata exists → `PREREQUISITE_NOT_MET`. Transaction
  metadata only becomes available once the transaction has been applied, so this is aimed at
  weak (post-apply) executions; see [`hook_again`](../control/hook_again.md).

**Caveats / notes.**
- The slotted object is the transaction's `TxMeta`; drill into it with
  [`slot_subfield`](slot_subfield.md) / [`slot_subarray`](slot_subarray.md) the same way as any
  other slotted object.
- `meta_slot` is available without an amendment gate in this branch<!-- (hook_api.macro) -->.

**Minimal example.**

```c
int64_t m = meta_slot(0);   // PREREQUISITE_NOT_MET during a strong (pre-apply) execution
```

**Related APIs.** [`hook_again`](../control/hook_again.md), [`slot_subfield`](slot_subfield.md),
[`xpop_slot`](xpop_slot.md).
