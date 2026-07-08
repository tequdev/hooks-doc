# float_sum

**Summary.** Add two XFLs.

**Signature.**

```c
int64_t float_sum(int64_t float1, int64_t float2);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `float1` | `int64_t` | First XFL. |
| `float2` | `int64_t` | Second XFL. |

**Return value.** The XFL sum. If either operand is `0` the other is returned unchanged. A
result that underflows to nothing returns the XFL `0`. Errors: `INVALID_FLOAT` (-10024) if
either argument is invalid; `XFL_OVERFLOW` (-30) if the sum overflows the XFL range.

**Common failure patterns.**
- Adding two large same-sign values → `XFL_OVERFLOW`.

**Caveats / notes.**
- Subtraction is `float_sum(a, float_negate(b))`. Subtracting a value from itself yields the
  canonical `0` (the underflow-to-zero case), not an error.

**Minimal example.**

```c
int64_t two = float_sum(float_one(), float_one());
```

**Related APIs.** [`float_negate`](float_negate.md), [`float_multiply`](float_multiply.md).
