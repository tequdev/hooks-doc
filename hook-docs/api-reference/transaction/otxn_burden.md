# otxn_burden

**Summary.** Return the **burden** of the originating transaction — a measure of how far down
an emit chain it sits, used to bound cascading emissions.

**Signature.**

```c
int64_t otxn_burden();
```

**Parameters.** None.

**Return value.** The burden as a non-negative integer. For an ordinary user-submitted
transaction this is `1`. For a transaction that was itself emitted by an earlier hook it is
the `sfEmitBurden` recorded in the transaction's `sfEmitDetails` (with the high bit masked
off). Does not return an error; if `sfEmitDetails` is present but lacks `sfEmitBurden`, it
defensively returns `1`.
<!-- evidence: `HookAPI::otxn_burden` returns `1` without `sfEmitDetails`, returns `1` when `sfEmitBurden` is absent, and masks the high bit before caching and returning the field (`src/xrpld/app/hook/detail/HookAPI.cpp:1520-1547` in Xahau/xahaud `release`). -->

**Common failure patterns.**
- None. Treat an unexpected `1` as "this is a top-level (non-emitted) transaction."

**Caveats / notes.**
- For a new emitted transaction, the burden is the originating burden multiplied by the
  number reserved with `etxn_reserve`; reserving `2` therefore doubles it. Compare with
  [`etxn_burden`](../emit/etxn_burden.md), which computes the burden a *new* transaction
  emitted from this hook would carry.
  <!-- evidence: `HookAPI::etxn_burden` multiplies `otxn_burden()` by `expected_etxn_count` and returns `FEE_TOO_LARGE` on overflow (`src/xrpld/app/hook/detail/HookAPI.cpp:852-862` in Xahau/xahaud `release`). -->
- The value is cached per execution (`hookCtx.burden`).

**Minimal example.**

```c
int64_t b = otxn_burden();   // 1 for a user-submitted txn
```

**Practical example.**

```c
// Refuse to act on deeply-nested emitted transactions.
if (otxn_burden() > 4)
    rollback(SBUF("emit chain too deep"), __LINE__);
accept(SBUF("ok"), 0);
```

**Related APIs.** [`otxn_generation`](otxn_generation.md),
[`etxn_burden`](../emit/etxn_burden.md), [`emit`](../emit/emit.md).
