# float_sign

**Summary.** Return whether an XFL is negative.

**Signature.**

```c
int64_t float_sign(int64_t float1);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `float1` | `int64_t` | The XFL to inspect. |

**Return value.** `1` if `float1` is negative, `0` if it is positive or the XFL `0`. Errors:
`INVALID_FLOAT` (-10024) if `float1` is not a valid XFL.

**Common failure patterns.**
- A raw negative `int64_t` argument → `INVALID_FLOAT` (do not confuse the sign of the
  *encoding* with the sign of the *number*).

**Caveats / notes.**
- Zero has sign `0`.

**Minimal example.**

```c
int64_t neg = float_sign(float_negate(float_one()));   // 1
```

**Related APIs.** [`float_negate`](float_negate.md), [`float_mantissa`](float_mantissa.md).
