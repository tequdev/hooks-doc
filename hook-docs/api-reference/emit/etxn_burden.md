# etxn_burden

**Summary.** Return the burden value that a transaction emitted now would carry. Burden grows
with emission depth and fan-out and underpins loop protection.

**Signature.**

```c
int64_t etxn_burden();
```

**Parameters.** None.

**Return value.** `otxn_burden() * expected_etxn_count` on success. Errors:
`PREREQUISITE_NOT_MET` (-9) if `etxn_reserve` was not called; `FEE_TOO_LARGE` (-10) if the
multiplication overflows.

**Common failure patterns.**
- Calling it before `etxn_reserve` → `PREREQUISITE_NOT_MET`.
- A very deep / wide emission tree overflowing the burden → `FEE_TOO_LARGE`.

**Caveats / notes.**
- Because burden multiplies the originating burden by the number of transactions reserved,
  reserving a large count inflates every child's burden — reserve only what you will emit.
- `emit` checks that the `sfEmitBurden` you wrote equals this computed value, so it cannot be
  understated.
- [`etxn_details`](etxn_details.md) writes this value into `sfEmitBurden` for you.

**Minimal example.**

```c
int64_t burden = etxn_burden();
```

**Practical example.**
<!-- adapted from `SetHook_test.cpp`, "Test emit" `cbak` -->

```c
// Before reserving, burden is unavailable.
ASSERT(etxn_burden() == PREREQUISITE_NOT_MET);
ASSERT(etxn_reserve(2) == 2);
// After reserving 2, burden is the originating burden times 2.
ASSERT(otxn_burden() > 0);
ASSERT(etxn_burden() == otxn_burden() * 2);
```

**Related APIs.** [`otxn_burden`](../transaction/otxn_burden.md),
[`etxn_generation`](etxn_generation.md), [`etxn_reserve`](etxn_reserve.md).
