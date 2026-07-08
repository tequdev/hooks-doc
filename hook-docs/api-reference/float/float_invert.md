# float_invert

**Summary.** Return the reciprocal `1/x` of an XFL.

**Signature.**

```c
int64_t float_invert(int64_t float1);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `float1` | `int64_t` | The XFL to invert. |

**Return value.** The XFL `1/float1`; `float_one()` inverts to itself. Errors:
`INVALID_FLOAT` (-10024) if `float1` is invalid; `DIVISION_BY_ZERO` (-25) if `float1` is the
XFL `0`.

**Common failure patterns.**
- Inverting the XFL `0` → `DIVISION_BY_ZERO`.

**Caveats / notes.**
- Equivalent to `float_divide(float_one(), float1)`.

**Minimal example.**

```c
int64_t half = float_invert(float_set(0, 2));   // 1/2 = 0.5
```

**Related APIs.** [`float_divide`](float_divide.md), [`float_one`](float_one.md).
