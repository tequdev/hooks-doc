# float_mulratio

**Summary.** Multiply an XFL by a rational number `numerator/denominator` (both plain 32-bit
integers), with a rounding-direction flag. Ideal for percentages and fee splits.

**Signature.**

```c
int64_t float_mulratio(int64_t float1, uint32_t round_up,
                       uint32_t numerator, uint32_t denominator);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `float1` | `int64_t` | The XFL to scale. |
| `round_up` | `uint32_t` | `> 0` rounds the result up; `0` rounds down. |
| `numerator` | `uint32_t` | Ratio numerator. |
| `denominator` | `uint32_t` | Ratio denominator. |

**Return value.** The scaled XFL. `float1 == 0` returns `0`. Errors: `INVALID_FLOAT` (-10024)
if `float1` is invalid; `DIVISION_BY_ZERO` (-25) if `denominator == 0`; `XFL_OVERFLOW` (-30)
if the result overflows.

**Common failure patterns.**
- `denominator == 0` → `DIVISION_BY_ZERO`.
- Scaling a near-maximum XFL up by a large ratio → `XFL_OVERFLOW`.

**Caveats / notes.**
- Compute a percentage with `numerator/denominator`, e.g. 1.5% is `15 / 1000`.
- The `round_up` flag controls only the final rounding of the mantissa; choose it based on
  whether you want to over- or under-collect.

**Minimal example.**

```c
// 2.5% of `amount` (25/1000), rounded down.
int64_t fee = float_mulratio(amount, 0, 25, 1000);
```

**Practical example (adapted from `SetHook_test.cpp`, "Test float_mulratio").**

```c
// multiplying by 0/1 gives zero; by 1/1 is the identity
ASSERT(float_mulratio(float_one(), 0, 0, 1) == 0);
ASSERT(float_mulratio(float_one(), 0, 1, 1) == float_one());
// a zero denominator is division by zero
ASSERT(float_mulratio(float_one(), 0, 1, 0) == DIVISION_BY_ZERO);
```

**Related APIs.** [`float_multiply`](float_multiply.md), [`float_divide`](float_divide.md).
