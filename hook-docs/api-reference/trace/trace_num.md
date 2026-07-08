# trace_num

**Summary.** Write a debug line consisting of a message label and a signed 64-bit
integer.

**Signature.**

```c
int64_t trace_num(uint32_t read_ptr, uint32_t read_len, int64_t number);
```

**Parameters.**

| Name | Meaning |
|---|---|
| `read_ptr`, `read_len` | Label string, truncated to 128 bytes, trailing NUL stripped. May be empty. |
| `number` | The signed value to log. |

**Return value.** `0` on success; `OUT_OF_BOUNDS` (-1) if the label is out of bounds.
No-op (returns `0`) when the server is below trace level.

**Minimal example.**

```c
trace_num(SBUF("balance drops"), balance);
```

**Related APIs.** [`trace`](trace.md), [`trace_float`](trace_float.md),
[`TRACEVAR`](../../macros/tracing.md).
