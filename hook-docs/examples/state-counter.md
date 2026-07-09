---
sidebarTitle: "State Counter"
---

# Example: State Counter

Hook state is a persistent key/value store scoped to the hook account and its
current namespace. This example builds a counter, then extends it to a
per-account counter (usage limit) keyed by the sender's AccountID, and finishes
with simple multi-key layouts.

## Purpose

- Read a counter from state, increment it, and write it back.
- Track usage per sender by using the sender's AccountID as the state key.
- Handle the first-read case, where the key does not yet exist.

## APIs used

| API | Purpose | Reference |
|---|---|---|
| `state` | Read a value from the hook account's current namespace. | [state.md](../api-reference/state/state.md) |
| `state_set` | Write (or delete) a value under a key. | [state.md](../api-reference/state/state_set.md) |
| `otxn_field` | Read `sfAccount` (the sender) to key per-account state. | [transaction.md](../api-reference/transaction/otxn_field.md) |
| `accept` / `rollback` | Terminate the hook. | [control.md](../api-reference/control/README.md) |

Helper macros used: `SBUF`, `UINT64_TO_BUF`, `UINT64_FROM_BUF` — see
[macros.md](../macros/README.md).

## Processing flow

1. Guard the entry with `_g(1,1)`.
2. Build the state key. For a global counter this is a fixed string; for a
   per-account counter it is the 20-byte sender AccountID from `otxn_field(sfAccount)`.
3. `state(SBUF(buf), SBUF(key))` to read the current value. On the very first
   invocation the key does not exist and `state` returns `DOESNT_EXIST (-5)` —
   treat that as a starting value of `0`.
4. Increment the value.
5. `state_set(SBUF(buf), SBUF(key))` to persist it. A successful write returns
   the number of bytes written.
6. `accept` (or `rollback` if a limit is exceeded).

## Complete code example

A per-account counter that also enforces a cap of 3 uses per sender.

```c
#include "hookapi.h"

#define MAX_USES 3

int64_t
hook(uint32_t reserved)
{
    _g(1, 1);  // guard: hook body runs at most once

    // 1. Key the counter by the sender's AccountID (raw 20 bytes).
    uint8_t key[20];
    if (otxn_field(SBUF(key), sfAccount) != 20)
        rollback(SBUF("state-counter: no sender"), 1);

    // 2. Read the current count. It is stored as an 8-byte big-endian integer.
    uint8_t buf[8];
    int64_t count = 0;
    int64_t read = state(SBUF(buf), SBUF(key));

    if (read == 8)
    {
        count = (int64_t)UINT64_FROM_BUF(buf);   // existing value
    }
    else if (read == DOESNT_EXIST)
    {
        count = 0;                               // first time for this sender
    }
    else
    {
        // Any other negative return is an unexpected error.
        rollback(SBUF("state-counter: state read failed"), 2);
    }

    // 3. Enforce the per-account cap BEFORE incrementing.
    if (count >= MAX_USES)
        rollback(SBUF("state-counter: usage limit reached"), 3);

    // 4. Increment and write back.
    count += 1;
    UINT64_TO_BUF(buf, (uint64_t)count);

    if (state_set(SBUF(buf), SBUF(key)) != 8)
        rollback(SBUF("state-counter: state write failed"), 4);

    accept(SBUF("state-counter: ok"), 0);
    return 0;
}
```

`state` reads into a fixed 8-byte buffer, `state_set` writes exactly those 8
bytes, and the `DOESNT_EXIST` branch makes the first invocation behave as a zero
start. Every return value is checked and every path terminates.

## Variations

**Global counter (single fixed key).** Drop the `otxn_field` call and use a
literal key:

```c
uint8_t buf[8];
int64_t count = 0;
if (state(SBUF(buf), SBUF("counter")) == 8)
    count = (int64_t)UINT64_FROM_BUF(buf);
count += 1;
UINT64_TO_BUF(buf, (uint64_t)count);
if (state_set(SBUF(buf), SBUF("counter")) != 8)
    rollback(SBUF("write failed"), 1);
```

Note that string keys include their terminating NUL via `sizeof`; `SBUF("counter")`
passes 8 bytes. That is fine as long as reads and writes use the same key.

**Deleting a counter.** `state_set(0, 0, SBUF(key))` — a zero-length value —
deletes the entry, freeing the reserve it consumed.

**Multi-field records under one key.** Pack several values into one buffer and
address them by offset. For example a `(count, last_ledger)` record:

```c
uint8_t rec[16];
UINT64_TO_BUF(rec,     (uint64_t)count);        // bytes 0..7
UINT64_TO_BUF(rec + 8, (uint64_t)ledger_seq()); // bytes 8..15
state_set(SBUF(rec), SBUF(key));
```

**Prefixed keys for multiple maps.** To keep two logical maps in one namespace
(say per-account counts and per-account balances), reserve the first key byte as
a discriminator, e.g. key byte `0x01` + AccountID for counts, `0x02` + AccountID
for balances. Keys are up to 32 bytes, so a 1-byte prefix plus a 20-byte
AccountID fits comfortably.

## Caveats

- State keys are up to 32 bytes; shorter keys (like a 20-byte AccountID) are
  accepted directly.
- Each new state entry consumes owner reserve on the hook account. If the account
  cannot cover the reserve, `state_set` returns `RESERVE_INSUFFICIENT (-38)`.
- State values are up to 256 bytes by default (up to `256 * scale`, max 4096 with
  the maximum scale). A write larger than the limit returns `TOO_BIG (-3)`.
- State written by a hook that later `rollback`s is discarded along with the
  transaction — state changes only persist if the hook `accept`s (and the
  transaction applies).

## Common mistakes

- **Not handling `DOESNT_EXIST` on the first read.** Treating the `-5` return as
  a real count corrupts the counter. Branch on it explicitly and start at `0`.
- **Mismatched key length between read and write.** `SBUF("key")` (4 bytes,
  including NUL) and a manually-built 3-byte `"key"` are different keys; the read
  will miss the value the write stored. Use the same expression for both.
- **Storing an integer as ASCII.** Writing `"1"` and expecting to add `1` to it
  numerically fails. Use `UINT64_TO_BUF` / `UINT64_FROM_BUF` for a fixed-width
  big-endian integer.
- **Assuming state survives a rollback.** It does not; a hook that writes state
  and then rejects the transaction leaves state unchanged.
- **Ignoring the reserve.** On a fresh account with minimal balance, the first
  `state_set` can fail with `RESERVE_INSUFFICIENT`; check the return value rather
  than assuming success.

## Related documents

- [overview.md](../overview.md)
- [glossary.md](../glossary.md)
- [macros.md](../macros/README.md)
- [best-practices.md](../best-practices.md)
- [api-reference/state.md](../api-reference/state/README.md)
- [api-reference/transaction.md](../api-reference/transaction/README.md)
- [api-reference/control.md](../api-reference/control/README.md)
- [examples/foreign-state.md](foreign-state.md)
- [examples/payment-filter.md](payment-filter.md)
