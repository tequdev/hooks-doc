# hook_again

**Summary.** Request that this (strong) hook be executed a second time as a **weak**
execution after the transaction is applied, allowing it to observe the applied state.

**Signature.**

```c
int64_t hook_again();
```

**Parameters.** None.

**Return value.** Returns `1` on success (a weak re-execution is now scheduled). Errors:
`ALREADY_SET` (-8) if a weak re-execution was already requested for this hook execution;
`PREREQUISITE_NOT_MET` (-9) if the current execution is not strong and no weak pass has been
scheduled yet.
<!-- evidence: `HookAPI::hook_again` checks `executeAgainAsWeak` first, so repeat calls return `ALREADY_SET` even in the weak pass; only a non-strong call with no prior request reaches `PREREQUISITE_NOT_MET` (`src/xrpld/app/hook/detail/HookAPI.cpp:1658-1670`). -->

**Common failure patterns.**
- Calling `hook_again` twice after one request has already been scheduled → `ALREADY_SET`.
- Calling it from a non-strong execution before any weak pass has been requested → `PREREQUISITE_NOT_MET`.

**Caveats / notes.**
- Strong execution runs *before* the transaction is applied and can `rollback`; the weak
  re-execution runs *after* apply and is observational (its rollback cannot undo the applied
  transaction). Use the `reserved` argument of `hook()` to tell which pass you are in.
- Only meaningful from a strong execution on the first request; once `executeAgainAsWeak` is
  already set, repeat calls keep returning `ALREADY_SET`.

**Minimal example.**

```c
hook_again();   // schedule a post-apply weak re-execution
```

**Practical example.**

<!-- adapted from SetHook_test.cpp, "Test hook_again" -->

```c
int64_t hook(uint32_t r)
{
    _g(1, 1);

    if (r > 0)   // weak (second) execution
    {
        // cannot request again from a weak pass
        if (hook_again() != PREREQUISITE_NOT_MET)
            return rollback(0, 0, 253);
        return accept(0, 0, 1);
    }

    // strong (first) execution
    if (hook_again() != 1)          return rollback(0, 0, 254);
    if (hook_again() != ALREADY_SET) return rollback(0, 0, 255);   // second call fails
    return accept(0, 0, 0);
}
```

**Related APIs.** [`accept`](accept.md), [`rollback`](rollback.md); see the execution-model
discussion in [../overview](../../overview.md).
