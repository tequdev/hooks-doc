# float_divide

**Summary.** Divide one XFL by another.

**Signature.**

```c
int64_t float_divide(int64_t float1, int64_t float2);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `float1` | `int64_t` | Dividend XFL. |
| `float2` | `int64_t` | Divisor XFL. |

**Return value.** The XFL quotient `float1 / float2`. Errors: `INVALID_FLOAT` (-10024) if
either argument is invalid; `DIVISION_BY_ZERO` (-25) if `float2` is the XFL `0`;
`XFL_OVERFLOW` (-30) on overflow.

**Common failure patterns.**
- Dividing by the XFL `0` → `DIVISION_BY_ZERO`.

**Caveats / notes.**
- `float_invert(x)` is `float_divide(float_one(), x)` — use [`float_invert`](float_invert.md)
  when you specifically want the reciprocal.

**Minimal example.**

```c
int64_t ratio = float_divide(a, b);
```

**Related APIs.** [`float_invert`](float_invert.md), [`float_mulratio`](float_mulratio.md).
