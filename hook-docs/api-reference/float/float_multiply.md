# float_multiply

**Summary.** Multiply two XFLs.

**Signature.**

```c
int64_t float_multiply(int64_t float1, int64_t float2);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `float1` | `int64_t` | First XFL. |
| `float2` | `int64_t` | Second XFL. |

**Return value.** The XFL product; if either operand is `0` the result is `0`. Errors:
`INVALID_FLOAT` (-10024) if either argument is invalid; `XFL_OVERFLOW` (-30) if the product
overflows.
<!-- evidence: release commit `d20e8ffb561034101d24668adbe9a513f639cb37` validates both XFL arguments in the generated wrapper before calling `HookAPI::float_multiply`, and the API returns the internal multiplication result (`src/xrpld/app/hook/detail/applyHook.cpp:3586-3597`, `src/xrpld/app/hook/detail/HookAPI.cpp:1061-1074`). -->

**Common failure patterns.**
- Multiplying two very large values → `XFL_OVERFLOW`.
<!-- evidence: release tests exercise `1e+95 * 1e+95`, `1e+95 * 10`, and `-1e+95 * 10` and expect `XFL_OVERFLOW` (`src/test/app/HookAPI_test.cpp:1746-1767`, release commit `d20e8ffb561034101d24668adbe9a513f639cb37`). -->

**Caveats / notes.**
- To scale by an *integer* ratio without first converting the ratio to an XFL, prefer
  [`float_mulratio`](float_mulratio.md) — it takes `uint32_t` numerator/denominator directly.

**Minimal example.**

```c
int64_t product = float_multiply(a, b);
```

**Related APIs.** [`float_mulratio`](float_mulratio.md), [`float_divide`](float_divide.md).
