# float_log

**Summary.** Return the base-10 logarithm of an XFL.

**Signature.**

```c
int64_t float_log(int64_t float1);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `float1` | `int64_t` | The XFL to take the logarithm of. |

**Return value.** `log10(float1)` as an XFL. Errors: `INVALID_FLOAT` (-10024) if `float1` is
invalid; `INVALID_ARGUMENT` (-7) if `float1` is the XFL `0`; `COMPLEX_NOT_SUPPORTED` (-39) if
`float1` is negative.

**Common failure patterns.**
- `log` of `0` → `INVALID_ARGUMENT`; of a negative → `COMPLEX_NOT_SUPPORTED`.

**Caveats / notes.**
- This is the **base-10** logarithm: the implementation computes `log10(mantissa) + exponent`.
  (Some older references describe it as a natural log; the code uses base 10.)
- The result is computed with a `double` internally, so it carries floating-point rounding —
  do not rely on it for exact financial equality.

**Minimal example.**

```c
int64_t l = float_log(float_set(0, 1000));   // log10(1000) ~= 3
```

**Related APIs.** [`float_root`](float_root.md), [`float_multiply`](float_multiply.md).
