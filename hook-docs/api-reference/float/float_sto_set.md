# float_sto_set

**Summary.** Parse a serialized `Amount` (native or IOU, with or without a leading field
header) back into an XFL.

**Signature.**

```c
int64_t float_sto_set(uint32_t read_ptr, uint32_t read_len);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `read_ptr` | `uint32_t` | Pointer to the serialized amount. |
| `read_len` | `uint32_t` | Length of the serialized amount (`8` for a bare number, more with a field header / currency / issuer). |

**Return value.** The XFL value of the amount; a zero amount returns the XFL `0`. Errors:
`OUT_OF_BOUNDS` (-1) for a bad buffer; `NOT_AN_OBJECT` (-23) if `read_len < 8`, or if a
field-header prefix is detected but the buffer is too short to contain the amount.

**Common failure patterns.**
- Passing fewer than 8 bytes → `NOT_AN_OBJECT`.

**Caveats / notes.**
- When `read_len > 8`, the function inspects the leading byte(s) to skip an `sfXxx` field
  header (1, 2, or 3 bytes depending on whether the field/type codes are `< 16`), then reads
  the 8-byte amount — so you can pass either a bare 8-byte number or a headered field.
- The currency/issuer of an IOU amount are ignored: only the numeric value is returned.
- Round-trips with [`float_sto`](float_sto.md).

**Minimal example.**

```c
int64_t xfl = float_sto_set((uint32_t)amount_buf, amount_len);
```

**Practical example (adapted from `SetHook_test.cpp`, "Test float_sto").**

```c
// After float_sto wrote a 49-byte sfAmount into buf, read it straight back:
int64_t xfl = float_sto_set(buf, 49);   // == the original XFL
// A short (8-byte) serialized number round-trips too:
ASSERT(float_sto_set(buf, 9) == 0);     // a serialized zero
```

**Related APIs.** [`float_sto`](float_sto.md),
[`slot_float`](../slot/slot_float.md).
