# float_negate

**Summary.** Return an XFL with its sign flipped.

**Signature.**

```c
int64_t float_negate(int64_t float1);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `float1` | `int64_t` | The XFL to negate. |

**Return value.** The negated XFL; the XFL `0` negates to `0`. Errors: `INVALID_FLOAT`
(-10024) if `float1` is not a valid XFL.

**Common failure patterns.**
- A raw negative `int64_t` argument → `INVALID_FLOAT`.

**Caveats / notes.**
- `float_negate(float_negate(x)) == x` for any valid XFL `x`.

**Minimal example.**

```c
int64_t minus_one = float_negate(float_one());
```

**Related APIs.** [`float_sign`](float_sign.md), [`float_sum`](float_sum.md).
