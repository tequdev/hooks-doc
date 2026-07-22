# hook_pos

**Summary.** Return the zero-based position of the currently executing hook within its
account's hook chain. <!-- evidence: `Transactor::doHook` passes `hook_no - 1` into `applyHook`, which stores it in `hookCtx.result.hookChainPosition`; `HookAPI::hook_pos()` returns that field (`src/xrpld/app/tx/detail/Transactor.cpp:1412-1428`, `src/xrpld/app/hook/detail/applyHook.cpp:1041-1075`, `src/xrpld/app/hook/detail/HookAPI.cpp:1794-1797`). -->

**Signature.**

```c
int64_t hook_pos();
```

**Parameters.** None.

**Return value.** The chain position as a small non-negative integer
(`hookCtx.result.hookChainPosition`). Does not return an error.

**Common failure patterns.** None — it is a pure accessor.

**Caveats / notes.**
- A single account may install up to 10 hooks (the max hook chain length). `hook_pos`
  reports the running hook's zero-based slot so shared code can branch on position.
<!-- evidence: `hook::maxHookChainLength()` returns 10, and `SetHook` rejects more than that many `sfHooks` entries (`include/xrpl/hook/Enum.h:100-104`, `src/xrpld/app/tx/detail/SetHook.cpp:770-776`). -->
- This is a proxy-only call: it performs no memory access and no setup/teardown. <!-- evidence: `DEFINE_HOOK_FUNCTION(int64_t, hook_pos)` returns `hookCtx.api().hook_pos()` directly with no `HOOK_SETUP()`/`HOOK_TEARDOWN()` in its wrapper, and `HookAPI::hook_pos()` itself just returns `hookCtx.result.hookChainPosition` (`src/xrpld/app/hook/detail/applyHook.cpp:3898-3900`, `src/xrpld/app/hook/detail/HookAPI.cpp:1794-1797`). -->

**Minimal example.**

```c
int64_t pos = hook_pos();
```

**Practical example.**

```c
// Only the first hook in the chain performs initialisation.
if (hook_pos() == 0)
{
    // ... one-time setup ...
}
accept(SBUF("ok"), 0);
```

**Related APIs.** [`hook_hash`](hook_hash.md), [`hook_skip`](hook_skip.md).
