# slot_subfield

**Summary.** Extract a named subfield of a slotted object into a (new or specified) slot.

**Signature.**

```c
int64_t slot_subfield(uint32_t parent_slot, uint32_t field_id, uint32_t new_slot);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `parent_slot` | `uint32_t` | Slot holding the parent object. |
| `field_id` | `uint32_t` | Serialized field code of the subfield (e.g. `sfAmount`). |
| `new_slot` | `uint32_t` | Destination slot, or `0` to allocate a free slot. |

**Return value.** Returns the destination slot number on success. Errors: `DOESNT_EXIST` (-5)
if the parent slot is empty or the field is not present; `INVALID_FIELD` (-17) if `field_id`
is `sfInvalid`; `INVALID_ARGUMENT` (-7) if `new_slot` exceeds `max_slots`;
`NO_FREE_SLOTS` (-6) if `new_slot == 0` and none are free; `INTERNAL_ERROR` (-2) if the parent
entry is corrupt; `NOT_AN_OBJECT` (-23) if the parent is not an object.

**Common failure patterns.**
- Requesting a field the object does not carry → `DOESNT_EXIST`.
- Passing a field code of 0 / `sfInvalid` → `INVALID_FIELD`.
- Drilling into a leaf (non-object) slot → `NOT_AN_OBJECT`.

**Caveats / notes.**
- Field codes are `(type << 16) | index`; the same codes used by
  [`otxn_field`](../transaction/otxn_field.md) and defined in `hook/sfcodes.h`.
- If `new_slot` equals `parent_slot`, the child replaces the parent in place; otherwise the
  parent slot is left intact.
- When `new_slot == 0`, free-slot allocation is checked before the parent slot or field is
  validated. If the slot pool is full, `slot_subfield` returns `NO_FREE_SLOTS` even when the
  parent slot is missing or the field code is invalid.
<!-- evidence: `HookAPI::slot_subfield` checks `new_slot == 0 && no_free_slots()` before `hookCtx.slot.find(parent_slot)`, `SField::getField(field_id)`, and the parent-entry/null checks (`src/xrpld/app/hook/detail/HookAPI.cpp:2225-2240`). -->

**Minimal example.**

```c
uint32_t amt = slot_subfield(txn_slot, sfAmount, 0);
```

**Practical example (adapted from `SetHook_test.cpp`, "Test slot_subfield").**

```c
// Load the originating transaction, then drill to its Amount field.
int64_t txn_slot = otxn_slot(0);
ASSERT(txn_slot > 0);

int64_t amt = slot_subfield(txn_slot, sfAmount, 0);
ASSERT(amt > 0);
ASSERT(slot_size(amt) > 0);
```

**Related APIs.** [`slot_subarray`](slot_subarray.md), [`slot`](slot.md),
[`slot_float`](slot_float.md).
