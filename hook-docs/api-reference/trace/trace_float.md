# trace_float

**Summary.** Write a debug line consisting of a message label and an XFL float,
formatted as `mantissa*10^(exponent)`.

**Signature.**

```c
int64_t trace_float(uint32_t read_ptr, uint32_t read_len, int64_t float1);
```

**Parameters.**

| Name | Meaning |
|---|---|
| `read_ptr`, `read_len` | Label string, truncated to 128 bytes, trailing NUL stripped. May be empty. |
| `float1` | The XFL-encoded value to log (see [Float and Amount APIs](../float/README.md)). |

**Return value.** `0` on success; `OUT_OF_BOUNDS` (-1) if the label is out of bounds.
The value `0` (XFL zero) logs as `<ZERO>`; an invalid XFL logs as `<INVALID>` — neither
is an error return. No-op (returns `0`) below trace level.

**Minimal example.**

```c
int64_t x = float_set(-2, 12345);  // 123.45
trace_float(SBUF("price"), x);     // logs: price: Float 12345*10^(-2)
```

**Related APIs.** [`trace`](trace.md), [`trace_num`](trace_num.md),
[float APIs](../float/README.md), [`TRACEXFL`](../../macros/tracing.md).
