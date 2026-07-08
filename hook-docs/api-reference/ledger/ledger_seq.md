# ledger_seq

**Summary.** Return the sequence number of the ledger currently being built.

**Signature.**

```c
int64_t ledger_seq();
```

**Parameters.** None.

**Return value.** The current ledger sequence (`view().info().seq`). Does not return an error.

**Common failure patterns.** None — a pure accessor.

**Caveats / notes.**
- This is the *in-progress* ledger's sequence. The last *closed* ledger's hash and time are
  available via [`ledger_last_hash`](ledger_last_hash.md) and
  [`ledger_last_time`](ledger_last_time.md).

**Minimal example.**

```c
int64_t seq = ledger_seq();
```

**Related APIs.** [`ledger_last_time`](ledger_last_time.md), [`ledger_last_hash`](ledger_last_hash.md).
