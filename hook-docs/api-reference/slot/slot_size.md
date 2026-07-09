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
if the slot is missing; `INTERNAL_ERROR` (-2) if the slot entry pointer is null.
<!-- evidence: `HookAPI::slot_size` checks for a missing slot via `hookCtx.slot.find(slot_no) == hookCtx.slot.end()` and a null entry via `hookCtx.slot[slot_no].entry == 0`, then serializes the entry and returns `Serializer::getDataLength()` (`src/xrpld/app/hook/detail/HookAPI.cpp:2146-2155`). -->

**Common failure patterns.**
- Measuring a cleared or never-set slot → `DOESNT_EXIST`.

**Caveats / notes.**
<!-- evidence: the implementation literally serializes the slot entry on every call and carries an `RH TODO` to cache the size (xahaud `src/xrpld/app/hook/detail/HookAPI.cpp:2152-2155`). -->
- Size is computed by re-serializing the object each call (see the `RH TODO` note in
  `HookAPI.cpp` about caching); prefer calling it once and reusing the result.
- Use it to size a buffer before calling [`slot`](slot.md).

**Minimal example.**

```c
int64_t n = slot_size(s);
```

**Related APIs.** [`slot`](slot.md), [`slot_set`](slot_set.md).
