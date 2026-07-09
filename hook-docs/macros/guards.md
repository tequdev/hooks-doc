# Guards

Every loop in a hook must call [`_g`](../api-reference/control/_g.md) at the top of its
body so the guard-checker can bound total iterations. These macros generate the
`guard_id` for you from `__LINE__`. See [best-practices.md](../best-practices.md) — for why guarding is
mandatory and how the checker rejects unguarded loops at `SetHook` time.

## GUARD

```c
#define GUARD(maxiter) _g((1ULL << 31U) + __LINE__, (maxiter)+1)
```

Guard for a loop that appears **once** on its source line. `maxiter` is the maximum
number of iterations you promise the loop will run; the macro passes `maxiter+1` to
`_g` to account for the final bound check. The guard id is derived from the line number
(with a high bit set to avoid colliding with function-call guard ids). Expression —
place it as the first thing evaluated in the loop's condition, using the comma
operator:

```c
for (int i = 0; GUARD(32), i < 32; ++i)   // promises <=32 iterations
{
    // ...
}
```

The `GUARD(...), condition` idiom runs the guard every iteration, then evaluates the
real condition. This is the canonical pattern seen throughout the xahaud test suite.
<!-- SetHook_test.cpp -->

## GUARDM

```c
#define GUARDM(maxiter, n) _g(( (1ULL << 31U) + (__LINE__ << 16) + n), (maxiter)+1)
```

Guard variant for when **multiple loops share one source line**, or a macro that
contains several loops expands onto a single line. The extra `n` disambiguates them so
each gets a distinct guard id (line number is shifted left 16 bits and `n` is added).
Give each loop on the line a different `n` (1, 2, 3, ...). This is exactly how the
`RBUF`/`RBUF2` and `BUFFER_EQUAL_GUARD` macros below guard their internal loops.

```c
// two loops that the preprocessor may collapse onto one line:
for (int i = 0; GUARDM(10,1), i < 10; ++i) { /* ... */ }
for (int j = 0; GUARDM(10,2), j < 10; ++j) { /* ... */ }
```

**Caveat:** the guard budget is per source line, and `maxiter` must be a value the
static checker can verify. A loop whose bound the checker cannot prove will be rejected
at install time regardless of these macros — see [best-practices.md](../best-practices.md).
