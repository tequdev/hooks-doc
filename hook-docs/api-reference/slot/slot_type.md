# slot_type

**Summary.** Return the field type of a slotted object, or (with a flag) whether a slotted
amount is native XAH.

**Signature.**

```c
int64_t slot_type(uint32_t slot_no, uint32_t flags);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `slot_no` | `uint32_t` | Slot to inspect. |
| `flags` | `uint32_t` | `0` = return the field code; `1` = amount-native check (see below). |

**Return value.** Behaviour depends on `flags` (from `applyHook.cpp`/`HookAPI.cpp`):

- **`flags == 0`** — returns the slot's field code, `(type << 16) | index` (the `fieldCode` of
  the field's `SField`).
- **`flags == 1`** — the slot must hold an `STI_AMOUNT`; returns `1` if the amount is native
  (XAH) and `0` if it is an IOU. If the slot is not an amount, returns `NOT_AN_AMOUNT` (-32).

Errors for both modes: `DOESNT_EXIST` (-5) if the slot is empty; `INTERNAL_ERROR` (-2) if
corrupt; `INVALID_ARGUMENT` (-7) if `flags` is neither 0 nor 1.

**Common failure patterns.**
- Using `flags == 1` on a non-amount slot → `NOT_AN_AMOUNT`.
- Passing a `flags` value other than 0 or 1 → `INVALID_ARGUMENT`.

**Caveats / notes.**
- The `flags == 0` return is a field code, so you can compare it against `sf*` constants to
  learn what a slotted field is before reading it.
- Use `flags == 1` to branch between XAH and IOU handling before calling
  [`slot_float`](slot_float.md).

**Minimal example.**

```c
int64_t is_xrp = slot_type(amt_slot, 1);   // 1 = XAH, 0 = IOU
```

**Related APIs.** [`slot_float`](slot_float.md), [`slot_subfield`](slot_subfield.md).
