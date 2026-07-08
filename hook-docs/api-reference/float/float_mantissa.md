# float_mantissa

**Summary.** Return the mantissa (16-digit significand) of an XFL.

**Signature.**

```c
int64_t float_mantissa(int64_t float1);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `float1` | `int64_t` | The XFL to inspect. |

**Return value.** The mantissa (`1000000000000000..9999999999999999`), or `0` if `float1` is
the XFL `0`. Errors: `INVALID_FLOAT` (-10024) if `float1` is not a valid XFL.

**Common failure patterns.**
- Passing a raw negative `int64_t` → `INVALID_FLOAT`.

**Caveats / notes.**
- The mantissa is always positive; the sign is separate — use [`float_sign`](float_sign.md).
- Combined with the exponent (there is no `float_exponent` API; test hooks derive it with a
  local macro), the mantissa reconstructs the exact decimal value.

**Minimal example.**

```c
int64_t m = float_mantissa(float_one());   // 1000000000000000
```

**Related APIs.** [`float_sign`](float_sign.md), [`float_int`](float_int.md).
