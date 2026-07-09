# etxn_generation

**Summary.** Return the emit-generation counter that a transaction emitted now would carry.

**Signature.**

```c
int64_t etxn_generation();
```

**Parameters.** None.

**Return value.** The generation an emitted transaction will have, equal to
`otxn_generation() + 1`. It does not return an error (implemented as a proxy-only call).

**Common failure patterns.** None — it is a pure accessor.

**Caveats / notes.**
- A user-submitted transaction is generation `0`, so the first emission is generation `1`.
- `emit` rejects any emitted transaction whose generation is `10` or greater; this is the
  hard depth limit that stops runaway emission chains.
- [`etxn_details`](etxn_details.md) writes this value into `sfEmitGeneration` for you.

**Minimal example.**

```c
int64_t gen = etxn_generation();   // e.g. 1 for a top-level hook's emission
```

**Practical example.**
<!-- adapted from `SetHook_test.cpp`, "Test emit" -->

```c
// The generation an emission will carry is always one more than the
// originating transaction's generation.
ASSERT(otxn_generation() + 1 == etxn_generation());
```

**Related APIs.** [`otxn_generation`](../transaction/otxn_generation.md),
[`etxn_burden`](etxn_burden.md), [`etxn_details`](etxn_details.md).
