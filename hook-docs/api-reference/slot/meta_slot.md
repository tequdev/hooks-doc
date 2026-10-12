# meta_slot

**Summary.** Load the originating transaction's provisional metadata object into a slot.
<!-- evidence: `HookAPI::meta_slot` requires `hookCtx.result.provisionalMeta`, stores that object in the requested slot, and returns the slot number (`src/xrpld/app/hook/detail/HookAPI.cpp:2375-2401` in xahaud `release`). -->

**Signature.**

```c
int64_t meta_slot(uint32_t slot_no);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `slot_no` | `uint32_t` | Destination slot, or `0` to allocate a free slot. |

**Return value.** Returns the slot number the metadata was loaded into on success. Errors:
`PREREQUISITE_NOT_MET` (-9) if provisional metadata is not available in the current execution;
`INVALID_ARGUMENT` (-7) if `slot_no` exceeds `max_slots`; `NO_FREE_SLOTS` (-6) if
`slot_no == 0` and none are free.
<!-- evidence: the release implementation checks for `provisionalMeta` first, then validates the slot number and free-slot condition (`src/xrpld/app/hook/detail/HookAPI.cpp:2378-2394`). -->

**Common failure patterns.**
- Calling it when no provisional metadata exists → `PREREQUISITE_NOT_MET`. In the release test,
  the strong execution calls `hook_again()` and gets this error, while the subsequent weak
  execution loads metadata successfully; see [`hook_again`](../control/hook_again.md).
<!-- evidence: `SetHook_test.cpp` expects `meta_slot(1) == PREREQUISITE_NOT_MET` before `hook_again()` and loads the metadata slot on the later execution (`src/test/app/SetHook_test.cpp:8123-8143` in xahaud `release`). -->

**Caveats / notes.**
- The slotted object is the transaction's `TxMeta`; drill into it with
  [`slot_subfield`](slot_subfield.md) / [`slot_subarray`](slot_subarray.md) the same way as any
  other slotted object.
- Passing a non-zero slot replaces that slot's entry; passing `0` allocates a free slot.
<!-- evidence: `meta_slot` selects a free slot only when `slot_into == 0`, then assigns the provisional metadata entry to that slot (`src/xrpld/app/hook/detail/HookAPI.cpp:2385-2400`). -->

**Minimal example.**

```c
int64_t m = meta_slot(0);   // PREREQUISITE_NOT_MET during a strong (pre-apply) execution
```

**Related APIs.** [`hook_again`](../control/hook_again.md), [`slot_subfield`](slot_subfield.md),
[`xpop_slot`](xpop_slot.md).
