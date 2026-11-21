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
| `read_ptr` | `uint32_t` | Pointer to an optional reason string in WASM memory. If `0`, no reason string is read. |
| `read_len` | `uint32_t` | Length of the reason string. Capped at 256 bytes (longer input is truncated). |
| `error_code` | `int64_t` | Application-defined code recorded as `sfHookReturnCode`. |

<!-- evidence: `HOOK_EXIT` in `include/xrpl/hook/Macro.h:235-275` caps `read_len` at 256, skips the memory read when `read_ptr` is zero, validates a non-zero pointer after truncation, and normally returns `RC_ROLLBACK`. With `fix20260929` enabled, an out-of-bounds reason also sets `ExitType::ROLLBACK`, records `OUT_OF_BOUNDS`, and returns `RC_ROLLBACK`; the release marks this fix supported and DefaultYes (`include/xrpl/protocol/detail/features.macro:41` from xahaud commit `d20e8ffb561034101d24668adbe9a513f639cb37`, release `2026.10.13-release+4119`). -->

**Return value.** Terminates execution and normally returns `RC_ROLLBACK` (-19) to the VM.
If a supplied reason string is out of bounds, the active `fix20260929` behavior still
terminates as a rollback, but records `OUT_OF_BOUNDS` (-1) as the hook execution exit code.
Before that fix, the API returned `OUT_OF_BOUNDS` directly.

**Common failure patterns.**
- An out-of-bounds reason string is a visible rollback under `fix20260929`, with
  `OUT_OF_BOUNDS` recorded as the exit code.
- Assuming rollback only aborts "your" logic — it rejects the whole originating transaction.

**Caveats / notes.**
- Terminates execution immediately.
- A hook that returns without calling `accept` behaves like an implicit rollback (see the
  termination model above), but you should call `rollback` explicitly with a meaningful
  reason string and code so the failure is diagnosable in metadata.
- The common `ASSERT(x)` / `NOPE(x)` macros are thin wrappers around `rollback` (see
  [Control flow: accept / rollback / assert](../../macros/control-flow.md)).

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
