# float_compare

**Summary.** Compare two XFLs under a mode flag and return a boolean result.

**Signature.**

```c
int64_t float_compare(int64_t float1, int64_t float2, uint32_t mode);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `float1` | `int64_t` | Left-hand XFL. |
| `float2` | `int64_t` | Right-hand XFL. |
| `mode` | `uint32_t` | A bitmask of the compare-mode flags below. |

**Comparison flags** (`hook/hookapi.h`, mirrored by `hook_api::compare_mode` in `Enum.h`):

| Constant | Value | Meaning |
|---|---|---|
| `COMPARE_EQUAL` | `1` | `float1 == float2` |
| `COMPARE_LESS` | `2` | `float1 < float2` |
| `COMPARE_GREATER` | `4` | `float1 > float2` |

Flags may be OR-ed to form `<=` (`COMPARE_LESS \| COMPARE_EQUAL` = 3), `>=`
(`COMPARE_GREATER \| COMPARE_EQUAL` = 5), and `!=` (`COMPARE_LESS \| COMPARE_GREATER` = 6).

**Return value.** `1` if the relationship selected by `mode` holds, `0` if it does not.
Errors: `INVALID_FLOAT` (-10024) if either argument is invalid; `INVALID_ARGUMENT` (-7) if
`mode` is `0`, has all three of EQUAL/LESS/GREATER set (`7`), or sets any bit outside the low
three; `XFL_OVERFLOW` (-30) if the comparison overflows internally.

**Common failure patterns.**
- `mode == 0`, `mode == 7`, or a stray high bit (e.g. `8`) → `INVALID_ARGUMENT`.
- Treating the return as `-1/0/1`: it is strictly `1` (true) or `0` (false).

**Caveats / notes.**
- Comparisons respect sign and magnitude across the whole XFL range, including mixed-sign and
  very large/small values.

**Minimal example.**

```c
if (float_compare(amount, threshold, COMPARE_LESS) == 1)
    rollback(SBUF("below threshold"), 1);
```

**Practical example (adapted from `SetHook_test.cpp`, "Test float_compare").**

```c
#define GT   0b100U   // COMPARE_GREATER
#define LTE  0b011U   // COMPARE_LESS | COMPARE_EQUAL

// invalid XFL arguments are rejected
ASSERT(float_compare(-1, -2, COMPARE_EQUAL) == INVALID_FLOAT);
// invalid modes are rejected
ASSERT(float_compare(0, 0, 0)       == INVALID_ARGUMENT);
ASSERT(float_compare(0, 0, 0b111U)  == INVALID_ARGUMENT);
// logic: 0 < 1, and 0 <= 1
ASSERT(float_compare(0, float_one(), LTE) == 1);
ASSERT(float_compare(0, float_one(), GT)  == 0);
```

**Related APIs.** [`float_one`](float_one.md), [`float_sum`](float_sum.md).
