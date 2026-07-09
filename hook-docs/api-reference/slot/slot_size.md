# slot_size

**Summary.** Return the byte size of the serialized data currently held in a slot.
<!-- evidence: `HookAPI::slot_size` checks for a missing slot, rejects a null entry, then serializes the stored `STBase` and returns `Serializer::getDataLength()` (xahaud `src/xrpld/app/hook/detail/HookAPI.cpp:2143-2155`). -->

**Signature.**

```c
int64_t slot_size(uint32_t slot);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `slot` | `uint32_t` | Slot to measure. |

**Return value.** Returns the serialized data length on success. Errors: `DOESNT_EXIST` (-5)
if the slot is empty; `INTERNAL_ERROR` (-2) if the slot entry is corrupt.

**Common failure patterns.**
- Measuring a cleared or never-set slot → `DOESNT_EXIST`.

**Caveats / notes.**
<!-- evidence: the implementation literally serializes the slot entry on every call and carries an `RH TODO` to cache the size (xahaud `src/xrpld/app/hook/detail/HookAPI.cpp:2152-2155`). -->
- Size is computed by re-serializing the object each call (there's a noted `RH TODO` to cache
  it internally); prefer calling it once and reusing the result.
<!-- RH TODO note is in `HookAPI.cpp` -->
- Use it to size a buffer before calling [`slot`](slot.md).

**Minimal example.**

```c
int64_t n = slot_size(s);
```

**Related APIs.** [`slot`](slot.md), [`slot_set`](slot_set.md).
