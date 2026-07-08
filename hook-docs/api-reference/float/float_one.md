# float_one

**Summary.** Return the XFL representation of `1.0`.

**Signature.**

```c
int64_t float_one();
```

**Parameters.** None.

**Return value.** The XFL constant `1.0`. Does not return an error (proxy-only call).

**Common failure patterns.** None.

**Caveats / notes.**
- Handy as a neutral element and as a well-known value to compare against, e.g.
  `float_compare(x, float_one(), COMPARE_LESS)` tests `x < 1`.

**Minimal example.**

```c
int64_t one = float_one();
```

**Related APIs.** [`float_set`](float_set.md), [`float_compare`](float_compare.md).
