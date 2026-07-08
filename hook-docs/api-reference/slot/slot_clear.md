# slot_clear

**Summary.** Free a slot, returning it to the pool of allocatable slots.

**Signature.**

```c
int64_t slot_clear(uint32_t slot);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `slot` | `uint32_t` | Slot to free. |

**Return value.** Returns `1` on success. Errors: `DOESNT_EXIST` (-5) if the slot was not set.

**Common failure patterns.**
- Clearing a slot twice → `DOESNT_EXIST` on the second call.

**Caveats / notes.**
- Clearing a parent slot after drilling into it does not invalidate child slots that were
  copied; each slot is an independent handle once populated.
- Slots are all released automatically when the hook finishes, so clearing is only needed to
  make room for more slots within a single execution.

**Minimal example.**

```c
slot_clear(s);
```

**Related APIs.** [`slot_set`](slot_set.md), [`slot`](slot.md).
