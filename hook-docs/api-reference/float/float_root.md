# float_root

**Summary.** Return the n-th root of an XFL.

**Signature.**

```c
int64_t float_root(int64_t float1, uint32_t n);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `float1` | `int64_t` | The XFL radicand. |
| `n` | `uint32_t` | The root degree; must be `>= 2`. |

**Return value.** The XFL n-th root of `float1`; `float1 == 0` returns `0`. Errors:
`INVALID_FLOAT` (-10024) if `float1` is invalid; `INVALID_ARGUMENT` (-7) if `n < 2`;
`COMPLEX_NOT_SUPPORTED` (-39) if `float1` is negative.

**Common failure patterns.**
- `n < 2` → `INVALID_ARGUMENT` (there is no 1st or 0th root).
- Root of a negative value → `COMPLEX_NOT_SUPPORTED`.

**Caveats / notes.**
- Like `float_log`, computed via `double`, so the result is approximate.

**Minimal example.**

```c
int64_t r = float_root(float_set(0, 144), 2);   // sqrt(144) ~= 12
```

**Related APIs.** [`float_log`](float_log.md), [`float_multiply`](float_multiply.md).
