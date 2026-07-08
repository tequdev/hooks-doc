# slot_size

**Summary.** Return the byte size of the serialized data currently held in a slot.

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
- Size is computed by re-serializing the object each call (see the `RH TODO` note in
  `HookAPI.cpp` about caching); prefer calling it once and reusing the result.
- Use it to size a buffer before calling [`slot`](slot.md).

**Minimal example.**

```c
int64_t n = slot_size(s);
```

**Related APIs.** [`slot`](slot.md), [`slot_set`](slot_set.md).
