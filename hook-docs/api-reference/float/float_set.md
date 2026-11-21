# float_set

**Summary.** Construct an XFL from a separate exponent and mantissa.

**Signature.**

```c
int64_t float_set(int32_t exponent, int64_t mantissa);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `exponent` | `int32_t` | Base-10 exponent. |
| `mantissa` | `int64_t` | Signed mantissa; its sign becomes the XFL's sign. |

**Return value.** The normalized XFL. A `mantissa` of `0` returns the XFL `0` (the `exponent`
is ignored). After normalization, an exponent above the XFL range returns
`EXPONENT_OVERSIZED` (-28), and an exponent below the range returns `EXPONENT_UNDERSIZED`
(-29). Other normalization failures return the corresponding error (`MANTISSA_OVERSIZED` -26,
etc.).
<!-- evidence: in release commit `d20e8ffb561034101d24668adbe9a513f639cb37`, `HookAPI::float_set` maps normalized overflow and underflow to `EXPONENT_OVERSIZED` and `EXPONENT_UNDERSIZED` when `fix20261005` is enabled (`src/xrpld/app/hook/detail/HookAPI.cpp:1039-1060`). -->

**Common failure patterns.**
- An exponent/mantissa combination that normalizes above or below the representable range →
  `EXPONENT_OVERSIZED` or `EXPONENT_UNDERSIZED`, respectively.
<!-- evidence: release tests assert `float_set(-97, 1)` returns the undersized-exponent code and `float_set(+97, 1)` returns the oversized-exponent code (`src/test/app/HookAPI_test.cpp:1959-1978`). -->

**Caveats / notes.**
- The mantissa need not be pre-normalized; `float_set` normalizes it to 16 significant digits
  and adjusts the exponent. `float_set(-2, 1234)` and `float_set(0, 12) `… produce the
  canonical XFL for the same numeric value regardless of input scaling.
- To build a whole number `n`, use `float_set(0, n)`.

**Minimal example.**

```c
int64_t half = float_set(-1, 5);   // 5 * 10^-1 = 0.5
```

**Practical example.** <!-- Adapted from `SetHook_test.cpp`, "Test float_set". -->

```c
// A mantissa of 0 is the canonical zero regardless of exponent.
ASSERT(float_set(0, 0) == 0);
// 1 * 10^0 == float_one()
ASSERT(float_set(0, 1) == float_one());
// negative mantissa yields a negative XFL
int64_t neg = float_set(-5, -9123456789LL);
```

**Related APIs.** [`float_one`](float_one.md), [`float_mantissa`](float_mantissa.md),
[`float_int`](float_int.md).
