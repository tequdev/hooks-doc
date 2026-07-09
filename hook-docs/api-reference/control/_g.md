# _g

**Summary.** The loop guard. Counts iterations of a guarded loop and terminates the hook if
the declared maximum is exceeded. Required at the top of every loop.

**Signature.**

```c
int32_t _g(uint32_t guard_id, uint32_t maxiter);
```

Declared with `__attribute__((noduplicate))` in `hook/extern.h` so the compiler cannot
duplicate the call and break the static guard analysis.

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `guard_id` | `uint32_t` | A unique id for this guard site. Conventionally derived from the source line (see the `GUARD` macro). |
| `maxiter` | `uint32_t` | Maximum number of iterations permitted for the associated loop. Must be non-zero. |

**Return value.** Returns `1` while the loop is within budget. When the per-`guard_id`
iteration count exceeds `maxiter`, it sets the hook's exit type to `ROLLBACK`, exit code
`GUARD_VIOLATION` (-16), and returns `RC_ROLLBACK` (-19), terminating the hook.

**Common failure patterns.**
- **Install-time rejection:** a loop whose first instructions are not
  `i32.const, i32.const, call _g`, or that passes `maxiter == 0`, fails the guard validator
  and the `SetHook` transaction is rejected.
- **Run-time `GUARD_VIOLATION`:** a loop iterating more than `maxiter` times.
- Reusing the same `guard_id` for two different loops merges their counts and can trip the
  guard early; use distinct ids (the `GUARD`/`GUARDM` macros handle this via `__LINE__`).

**Caveats / notes.**
- `_g` must be the very first call inside each loop body — this is enforced statically at
  install time, not merely a convention.

  <!-- enforced by check_guard in include/xrpl/hook/Guard.h -->
- Every hook should also call `_g(1,1)` once at the top of `hook()`.
- Prefer the `GUARD(maxiter)` / `GUARDM(maxiter, n)` macros over raw `_g` calls; they
  generate a unique `guard_id` from `__LINE__`. Use `GUARDM` when two loops share a line.
- The guard system replaces gas metering for `HookApiVersion` 0 hooks.

**Minimal example.**

```c
_g(1, 1);   // mandatory guard at the top of hook()
```

**Practical example.**

```c
// Compare two 20-byte account buffers; the loop runs at most 20 times.
#define GUARD(maxiter) _g((1ULL << 31U) + __LINE__, (maxiter) + 1)
for (int i = 0; GUARD(20), i < 20; ++i)
    if (acc[i] != acc2[i])
        rollback(SBUF("mismatch"), __LINE__);
```

**Related APIs.** `GUARD`, `GUARDM` macros ([../macros.md](../../macros/guards.md)); [best
practices on guards](../../best-practices.md).
