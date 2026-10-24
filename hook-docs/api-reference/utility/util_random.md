# util_random

**Summary.** Write cryptographically derived random bytes to the Hook's own
linear WASM memory. This API is provided by the `featureRNG` amendment.
<!-- evidence: the release wrapper validates the destination region, calls
`HookAPI::util_random`, and writes the requested number of bytes
(`src/xrpld/app/hook/detail/applyHook.cpp:2900-2924`, release commit
`d20e8ffb561034101d24668adbe9a513f639cb37`). -->

**Signature.**

```c
int64_t util_random(uint32_t write_ptr, uint32_t write_len);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `write_ptr` | `uint32_t` | Destination offset in the Hook's linear WASM memory. |
| `write_len` | `uint32_t` | Number of bytes to write; must be from `1` through `512`. |

**Return value.** Returns `write_len` on success. The requested bytes are
written beginning at `write_ptr`.

Errors:

- `OUT_OF_BOUNDS` (`-1`) if the destination region is outside WASM memory.
- `TOO_SMALL` (`-4`) if `write_len == 0`.
- `TOO_BIG` (`-3`) if `write_len > 512`.
- `TOO_LITTLE_ENTROPY` (`-46`) when the current ledger has no usable random
  seed, is not sufficiently seeded, or has no qualifying entropy contribution.
- `TOO_MANY_NONCES` (`-12`) after 256 RNG draws in one Hook execution. The
  implementation reuses this existing return code for the RNG draw limit.
<!-- evidence: the wrapper checks WASM bounds before the API call; `HookAPI::util_random`
rejects zero and lengths over 512, while `rng_next` supplies the entropy and
per-execution draw limit (`src/xrpld/app/hook/detail/applyHook.cpp:2900-2924`,
`src/xrpld/app/hook/detail/HookAPI.cpp:1935-1968,2027-2051`,
`include/xrpl/hook/Enum.h:390-404`, release commit
`d20e8ffb561034101d24668adbe9a513f639cb37`). -->

**Minimal example.**

```c
uint8_t bytes[32];
int64_t written = util_random((uint32_t)bytes, sizeof(bytes));
if (written < 0)
    rollback(SBUF("random bytes unavailable"), 1);
```

Each successful call consumes one RNG draw, regardless of `write_len`.
<!-- evidence: both APIs obtain their result through `rng_next`, which increments
`hookCtx.rng_draws` once per successful block (`src/xrpld/app/hook/detail/HookAPI.cpp:1994-2051`, release commit `d20e8ffb561034101d24668adbe9a513f639cb37`). -->

**Related API.** [`dice`](dice.md) returns a uniformly distributed integer.
