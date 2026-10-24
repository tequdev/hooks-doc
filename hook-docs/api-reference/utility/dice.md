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

**Return value.** On success, returns a value from `0` through `sides - 1`.
`INVALID_ARGUMENT` (`-7`) is returned when `sides == 0`.
<!-- evidence: `HookAPI::dice` rejects zero before drawing and returns `word % sides` after rejection sampling (`src/xrpld/app/hook/detail/HookAPI.cpp:1994-2024`, release commit `d20e8ffb561034101d24668adbe9a513f639cb37`). -->

The call can also return:

- `TOO_LITTLE_ENTROPY` (`-46`) when the current ledger has no usable random
  seed, is not sufficiently seeded, or has no qualifying entropy contribution.
- `TOO_MANY_NONCES` (`-12`) after 256 RNG draws in one Hook execution. The
  implementation reuses this existing return code for the RNG draw limit.
<!-- evidence: `rng_next` checks the feature, random object, ledger seed, and the
80%-of-UNLReport contribution threshold; it rejects when `rng_draws >= 256` and
increments the draw counter after a successful draw (`src/xrpld/app/hook/detail/HookAPI.cpp:1935-1991`, `include/xrpl/hook/Enum.h:390-404`, release commit `d20e8ffb561034101d24668adbe9a513f639cb37`). -->

**Minimal example.**

```c
int64_t roll = dice(6);
if (roll < 0)
    rollback(SBUF("random draw unavailable"), 1);
```

**Related API.** [`util_random`](util_random.md) returns random bytes instead of
an integer.
