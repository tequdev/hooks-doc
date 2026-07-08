# ledger_last_time

**Summary.** Return the close time of the last closed ledger.

**Signature.**

```c
int64_t ledger_last_time();
```

**Parameters.** None.

**Return value.** The parent ledger's close time as seconds since the Ripple epoch
(`view().info().parentCloseTime`). Does not return an error.

**Common failure patterns.** None — a pure accessor.

**Caveats / notes.**
- The value is in the Ripple epoch (seconds since 2000-01-01 UTC), not the Unix epoch. Use it
  for on-ledger time comparisons (e.g. escrow/deadline logic), not as a wall-clock timestamp.
- It is the *parent* (last closed) ledger's time — the in-progress ledger has not closed yet.

**Minimal example.**

```c
int64_t t = ledger_last_time();
```

**Related APIs.** [`ledger_seq`](ledger_seq.md), [`ledger_last_hash`](ledger_last_hash.md).
