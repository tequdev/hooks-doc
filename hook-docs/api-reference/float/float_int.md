# float_int

**Summary.** Convert an XFL to a plain integer, scaled by a number of decimal places.

**Signature.**

```c
int64_t float_int(int64_t float1, uint32_t decimal_places, uint32_t abs);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `float1` | `int64_t` | The XFL to convert. |
| `decimal_places` | `uint32_t` | Number of fractional digits to keep (i.e. scale by `10^decimal_places`); `0..15`. |
| `abs` | `uint32_t` | `> 0` allows negative inputs by returning their absolute value; `0` rejects negatives. |

**Return value.** The integer value of `float1 * 10^decimal_places`, truncated. `float1 == 0`
returns `0`. A value too small to show at the requested scale returns `0`. Errors:
`INVALID_FLOAT` (-10024) if `float1` is invalid; `INVALID_ARGUMENT` (-7) if
`decimal_places > 15`; `CANT_RETURN_NEGATIVE` (-33) if `float1` is negative and `abs == 0`;
`TOO_BIG` (-3) if the scaled value would overflow an integer.

**Common failure patterns.**
- Asking for more precision than a value has → `0` (not an error) for values too small; but
  scaling a large value up so it overflows → `TOO_BIG`.
- A negative XFL with `abs == 0` → `CANT_RETURN_NEGATIVE`.
- `decimal_places > 15` → `INVALID_ARGUMENT`.

**Caveats / notes.**
- Use `decimal_places == 6` to turn an XFL number of XAH into drops (1 XAH = 1,000,000 drops).
- Truncates toward zero; it does not round.

**Minimal example.**

```c
int64_t drops = float_int(amount_xah, 6, 0);   // XAH -> drops
```

**Practical example.** <!-- Adapted from `SetHook_test.cpp`, "Test float_int". -->

```c
ASSERT(float_int(-1, 0, 0)            == INVALID_FLOAT);        // not a valid XFL
ASSERT(float_int(float_one(), 0, 0)   == 1LL);                  // 1.0 -> 1
ASSERT(float_int(float_one(), 15, 0)  == 1000000000000000LL);   // scaled by 10^15
ASSERT(float_int(float_one(), 16, 0)  == INVALID_ARGUMENT);     // decimal_places > 15
```

**Related APIs.** [`float_mantissa`](float_mantissa.md), [`float_set`](float_set.md),
[`AMOUNT_TO_DROPS`](../../macros/amount-and-sto.md).
