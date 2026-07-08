# otxn_burden

**Summary.** Return the **burden** of the originating transaction — a measure of how far down
an emit chain it sits, used to bound cascading emissions.

**Signature.**

```c
int64_t otxn_burden();
```

**Parameters.** None.

**Return value.** The burden as a positive integer. For an ordinary user-submitted
transaction this is `1`. For a transaction that was itself emitted by an earlier hook it is
the `sfEmitBurden` recorded in the transaction's `sfEmitDetails` (with the sign bit masked
off). Does not return an error; if `sfEmitDetails` is present but malformed it defensively
returns `1`.

**Common failure patterns.**
- None. Treat an unexpected `1` as "this is a top-level (non-emitted) transaction."

**Caveats / notes.**
- Burden roughly **doubles** with each level of emission (each emitted transaction inherits
  and increases its parent's burden). It exists to make runaway emit cascades economically
  and structurally bounded — hooks and the network use it to cap chain depth. Compare with
  [`etxn_burden`](../emit/etxn_burden.md), which is the burden a *new* transaction
  emitted from this hook would carry.
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
