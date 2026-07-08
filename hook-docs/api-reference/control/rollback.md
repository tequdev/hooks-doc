# rollback

**Summary.** Terminate the hook and reject the originating transaction, discarding this
hook's state changes and emitted transactions.

**Signature.**

```c
int64_t rollback(uint32_t read_ptr, uint32_t read_len, int64_t error_code);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `read_ptr` | `uint32_t` | Pointer to an optional reason string. May be `0`. |
| `read_len` | `uint32_t` | Length of the reason string. Capped at 256 bytes. |
| `error_code` | `int64_t` | Application-defined code recorded as `sfHookReturnCode`. |

**Return value.** Terminates execution; internally returns `RC_ROLLBACK` (-19) to the VM.
Can return `OUT_OF_BOUNDS` (-1) if a supplied reason string is out of bounds.

**Common failure patterns.**
- Same as `accept`: an out-of-bounds reason string yields `OUT_OF_BOUNDS`.
- Assuming rollback only aborts "your" logic — it rejects the whole originating transaction.

**Caveats / notes.**
- Terminates execution immediately.
- A hook that returns without calling `accept` behaves like an implicit rollback (see the
  termination model above), but you should call `rollback` explicitly with a meaningful
  reason string and code so the failure is diagnosable in metadata.
- The common `ASSERT(x)` / `NOPE(x)` macros are thin wrappers around `rollback` (see
  [../macros.md](../../macros/control-flow.md)).

**Minimal example.**

```c
rollback(0, 0, 1);   // reject, no reason string, code 1
```

**Practical example.**

```c
// Reject any transaction that is not a Payment.
#define ttPAYMENT 0
if (otxn_type() != ttPAYMENT)
    rollback(SBUF("only payments accepted"), __LINE__);
accept(SBUF("ok"), 0);
```

**Related APIs.** [`accept`](accept.md), [`otxn_type`](../transaction/otxn_type.md).
