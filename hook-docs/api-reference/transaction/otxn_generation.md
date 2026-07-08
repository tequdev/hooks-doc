# otxn_generation

**Summary.** Return the **generation** of the originating transaction — the number of emit
"hops" between the original user transaction and this one.

**Signature.**

```c
int64_t otxn_generation();
```

**Parameters.** None.

**Return value.** The generation as an integer. For an ordinary user-submitted transaction
this is `0`. For an emitted transaction it is the `sfEmitGeneration` recorded in
`sfEmitDetails`. Does not return an error; if `sfEmitDetails` is present but missing the
field it defensively returns `0`.

**Common failure patterns.**
- None. A `0` means the originating transaction was directly submitted, not emitted.

**Caveats / notes.**
- Generation increments by one at each emission level, whereas [`burden`](otxn_burden.md) grows
  multiplicatively; the two together describe an emitted transaction's place in its lineage.
- Compare with [`etxn_generation`](../emit/etxn_generation.md), the generation a
  transaction emitted from this hook would have.
- The value is cached per execution (`hookCtx.generation`).

**Minimal example.**

```c
int64_t g = otxn_generation();   // 0 for a user-submitted txn
```

**Practical example.**

```c
// Only the original (user-submitted) transaction triggers a notification;
// emitted follow-ups do not, to avoid loops.
if (otxn_generation() == 0)
{
    // ... prepare and emit a notification transaction ...
}
accept(SBUF("ok"), 0);
```

**Related APIs.** [`otxn_burden`](otxn_burden.md),
[`etxn_generation`](../emit/etxn_generation.md), [`emit`](../emit/emit.md).
