# dice

**Summary.** Return a uniformly distributed integer in the half-open range `[0,
sides)`. This API is provided by the `featureRNG` amendment.
<!-- evidence: the release wrapper describes `dice` as a uniform integer in `[0, sides)` and delegates to `HookAPI::dice` (`src/xrpld/app/hook/detail/applyHook.cpp:2886-2895`, release commit `d20e8ffb561034101d24668adbe9a513f639cb37`). -->

**Signature.**

```c
int64_t dice(uint32_t sides);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `sides` | `uint32_t` | Number of outcomes. Must be non-zero. |

**Return value.** On success, returns a value from `0` through `sides - 1`. Errors:

| Code | Value | Cause |
|---|---|---|
| `INVALID_ARGUMENT` | -7 | `sides == 0`. |
| `TOO_LITTLE_ENTROPY` | -46 | The current ledger has no usable random seed, or fewer than 80% of the UNLReport contributed entropy (at least one validator must contribute when there is no UNLReport). |
| `TOO_MANY_NONCES` | -12 | More than 256 RNG draws in one Hook execution. |

<!-- evidence: `HookAPI::dice` rejects zero before drawing and returns `word % sides` after rejection sampling (`src/xrpld/app/hook/detail/HookAPI.cpp:1994-2024`); `rng_next` checks the feature, random object, ledger seed, and the 80%-of-UNLReport contribution threshold, rejects when `rng_draws >= 256`, and increments the draw counter after a successful draw (`src/xrpld/app/hook/detail/HookAPI.cpp:1935-1991`, `include/xrpl/hook/Enum.h:390-404`; release commit `d20e8ffb561034101d24668adbe9a513f639cb37`). -->

**Common failure patterns.**
- Passing `sides == 0` → `INVALID_ARGUMENT`.
- Drawing in a ledger that has no usable entropy, or has fewer than 80% of the
  UNLReport contributing entropy → `TOO_LITTLE_ENTROPY`; treat a
  negative return as "no randomness available" rather than as a value.
- Drawing more than 256 times in one execution → `TOO_MANY_NONCES`.

**Caveats / notes.**
- Requires the `featureRNG` amendment; without it the function is not available.
- Every successful call consumes one of the 256 RNG draws shared with
  [`util_random`](util_random.md).
- The draw limit reuses the existing `TOO_MANY_NONCES` return code.

**Minimal example.**

```c
int64_t roll = dice(6);
if (roll < 0)
    rollback(SBUF("random draw unavailable"), 1);
```

**Related APIs.** [`util_random`](util_random.md) returns random bytes instead of
an integer.
