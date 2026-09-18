# hook_pos

**Summary.** Return the zero-based position of the currently executing hook within its
account's hook chain.

**Signature.**

```c
int64_t hook_pos();
```

**Parameters.** None.

**Return value.** The chain position as a small non-negative integer
(`hookCtx.result.hookChainPosition`). Does not return an error.
<!-- evidence: `HookAPI::hook_pos()` returns `hookCtx.result.hookChainPosition`, and the generated `hook_pos` wrapper in `applyHook.cpp` returns it directly without `HOOK_SETUP()` or `HOOK_TEARDOWN()` (`src/xrpld/app/hook/detail/HookAPI.cpp:1794-1798`, `src/xrpld/app/hook/detail/applyHook.cpp:3898-3901`). -->

**Common failure patterns.** None — it is a pure accessor.

**Caveats / notes.**
- A single account may install up to 10 hooks (the max hook chain length). `hook_pos` reports
  the running hook's chain position, which lets shared code branch on position.
<!-- evidence: `hook::maxHookChainLength()` returns 10 and `SetHook` rejects `sfHooks` arrays larger than that (`include/xrpl/hook/Enum.h:100-104`, `src/xrpld/app/tx/detail/SetHook.cpp:770-776`). -->
- This is a proxy-only call: it performs no memory access and no setup/teardown.

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
