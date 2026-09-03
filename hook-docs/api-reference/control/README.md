# Control APIs

This page documents the ten **control** Hook APIs: the functions that terminate hook
execution, guard loops, and inspect or influence the hook's position and parameters within
the hook chain.

All signatures are copied verbatim from `hook/extern.h`. Return codes reference the shared
error table in [../../glossary.md](../../glossary.md); the values quoted below come from
`include/xrpl/hook/Enum.h` and `hook/error.h`.

---

## Execution-termination model

A hook is a WebAssembly function that returns control to the ledger in exactly one of two
ways:

- **`accept`** — the originating transaction is applied. Any state changes the hook wrote
  and any transactions it emitted are kept.
- **`rollback`** — the originating transaction is rejected. State changes and emitted
  transactions from *this* hook are discarded.

Both functions **terminate the hook immediately**: internally they set the hook's exit type
and return the special sentinel codes `RC_ACCEPT` (-20) or `RC_ROLLBACK` (-19) to the VM,
which stops execution. Code after an `accept`/`rollback` call in the same path never runs.

If a hook function returns normally (falls off the end of `hook()`) without calling either,
the default exit type is `ROLLBACK` (see `applyHook.cpp`, where the result is initialised
with `exitType = ROLLBACK` "unless the hook calls accept()"). Under the `fixXahauV3`
amendment the default becomes `WASM_ERROR` instead; either way, not calling `accept`
rejects the transaction. **Always call `accept` explicitly on the success path.**

Each hook execution records a metadata entry (`sfHookExecution`) that captures the outcome
(verified in `applyHook.cpp`):

- `sfHookResult` — the exit type as a `uint8_t` (`ExitType`: `WASM_ERROR=1`, `ROLLBACK=2`,
  `ACCEPT=3`; `UNSET=0`).
- `sfHookReturnCode` — the `error_code` you passed to `accept`/`rollback`, stored as
  `uint64_t`. Negative values are encoded by setting the most-significant bit
  (`0x8000000000000000 + (-code)`), so a returned `-16` appears as a large unsigned number.
- `sfHookReturnString` — the reason string you passed (see the per-function notes).
- `sfHookInstructionCount`, `sfHookEmitCount`, `sfHookStateChangeCount`, `sfHookHash`, etc.

This metadata is how off-ledger tooling learns *why* a hook accepted or rejected, so the
`error_code` and reason string you pass are your primary debugging channel.

---

## The guard system

WebAssembly on Xahau is metered by a **guard** mechanism rather than an open-ended gas
counter (Guard-type hooks; `HookApiVersion` 0). Every loop must call `_g` at its very top,
declaring the maximum number of iterations it will run. This makes worst-case execution
cost statically computable, so the network can price a `SetHook` up front and guarantee that
hooks halt.

Two enforcement points exist:

1. **Install time (static validation).** When a hook is set, the server runs the guard
   validator in `include/xrpl/hook/Guard.h` (`check_guard`) over the WASM. It walks the code
   section and, for every `loop` opcode (`0x03`), requires the *immediately following*
   instructions to be exactly `i32.const <guard_id>`, `i32.const <maxiter>`, `call _g`. A
   loop that is missing this prologue, that specifies `maxiter == 0`, or that calls a
   function other than `_g` there is **rejected** and the `SetHook` fails (log codes such as
   `GUARD_MISSING`). There is a hard limit of 1024 guard calls per hook.

2. **Run time (dynamic enforcement).** During execution `_g` counts calls per `guard_id`. If
   a guarded loop exceeds its declared `maxiter`, `_g` sets the exit type to `ROLLBACK` with
   exit code `GUARD_VIOLATION` (`-16`) and terminates the hook. `GUARD_VIOLATION` in the
   metadata therefore means "a loop ran more times than it promised."

The developer-facing `GUARD(maxiter)` / `GUARDM(maxiter, n)` macros (in `hook/macro.h`)
build the `guard_id` from the source line number so each loop gets a distinct id; see
[../macros.md](../../macros/guards.md). You rarely call `_g` by hand except for the mandatory
`_g(1,1)` at the top of `hook()`.

---

## Index

| Function | Purpose |
|---|---|
| [`accept`](accept.md) | Terminate the hook and let the originating transaction proceed. |
| [`rollback`](rollback.md) | Terminate the hook and reject the originating transaction. |
| [`_g`](_g.md) | Loop/branch guard; required at the top of every loop. |
| [`hook_account`](hook_account.md) | Write the AccountID the hook is installed on. |
| [`hook_hash`](hook_hash.md) | Write the WASM hash of a hook in the chain. |
| [`hook_pos`](hook_pos.md) | Return this hook's position within the hook chain. <!-- evidence: `HookAPI::hook_pos()` returns `hookCtx.result.hookChainPosition`, and the generated `hook_pos` wrapper in `applyHook.cpp` returns it directly without `HOOK_SETUP()` or `HOOK_TEARDOWN()` (`src/xrpld/app/hook/detail/HookAPI.cpp:1794-1798`, `src/xrpld/app/hook/detail/applyHook.cpp:3898-3901`). --> |
| [`hook_param`](hook_param.md) | Read this hook's install-time parameter value by key. <!-- evidence: `HookAPI::hook_param` checks `hookParamOverrides[hookHash]` before `hookParams`, and returns `DOESNT_EXIST` for empty override values (`src/xrpld/app/hook/detail/HookAPI.cpp:1674-1709`). --> |
| [`hook_param_set`](hook_param_set.md) | Override a parameter for a hook in the chain, identified by hash. <!-- evidence: `HookAPI::hook_param_set` stores overrides under the target hash, and `HookAPI::hook_param` checks the current hook's hash-specific override before falling back to its own parameters (`src/xrpld/app/hook/detail/HookAPI.cpp:1682-1741`). --> |
| [`hook_again`](hook_again.md) | Request a weak (post-apply) re-execution of the hook. |
| [`hook_skip`](hook_skip.md) | Skip (or un-skip) a named hook in the chain. |

## Related documents

- [../../README.md](../../README.md) — documentation index.
- [../../overview.md](../../overview.md) — hook execution model and lifecycle.
- [../../glossary.md](../../glossary.md) — full error-code and term reference.
- [../../macros.md](../../macros/README.md) — `GUARD`, `ASSERT`, `NOPE`, `SBUF`, and other helpers.
- [../../best-practices.md](../../best-practices.md) — guarding loops and structuring accept/rollback.
- [transaction.md](../transaction/README.md) — the `otxn_*` originating-transaction APIs.
- [state.md](../state/README.md) — persistent state read/write.
- [emit-and-etxn.md](../emit/README.md) — emitting transactions from a hook.
- [utility.md](../utility/README.md) — `util_raddr`, `util_keylet`, STO helpers.
