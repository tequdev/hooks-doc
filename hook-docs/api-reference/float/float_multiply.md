# float_multiply

**Summary.** Multiply two XFLs.

**Signature.**

```c
int64_t float_multiply(int64_t float1, int64_t float2);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `float1` | `int64_t` | First XFL. |
| `float2` | `int64_t` | Second XFL. |

**Return value.** The XFL product; if either operand is `0` the result is `0`. Errors:
`INVALID_FLOAT` (-10024) if either argument is invalid; `XFL_OVERFLOW` (-30) if the product
overflows.

**Common failure patterns.**
- Multiplying two very large values → `XFL_OVERFLOW`.

**Caveats / notes.**
- To scale by an *integer* ratio without first converting the ratio to an XFL, prefer
  [`float_mulratio`](float_mulratio.md) — it takes `uint32_t` numerator/denominator directly.

**Minimal example.**

```c
int64_t product = float_multiply(a, b);
```

**Related APIs.** [`float_mulratio`](float_mulratio.md), [`float_divide`](float_divide.md).
