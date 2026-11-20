# hook_again

**Summary.** Request that this (strong) hook be executed a second time as a **weak**
execution after the transaction is applied, allowing it to observe the applied state.

**Signature.**

```c
int64_t hook_again();
```

**Parameters.** None.

**Return value.** Returns `1` on success (a weak re-execution is now scheduled). Errors:
`ALREADY_SET` (-8) if a weak re-execution was already requested during this execution;
`PREREQUISITE_NOT_MET` (-9) if the current execution is not a strong one (you cannot request
another weak pass from within a weak pass).
<!-- evidence: `HookAPI::hook_again` rejects an already-set request, sets `executeAgainAsWeak` only for strong execution, and otherwise returns `PREREQUISITE_NOT_MET` (`src/xrpld/app/hook/detail/HookAPI.cpp:1723-1735`, release commit `d20e8ffb561034101d24668adbe9a513f639cb37`). -->

**Common failure patterns.**
- Calling `hook_again` twice in the same execution → `ALREADY_SET`.
- Calling it during the weak re-execution itself → `PREREQUISITE_NOT_MET`.

**Caveats / notes.**
- Strong execution runs *before* the transaction is applied and can `rollback`; the weak
  re-execution runs *after* apply and cannot rollback the originating transaction. It can still
  perform hook operations such as writing hook state. Use the `reserved` argument of `hook()`
  to tell which pass you are in.
  <!-- evidence: post-application weak hooks are explicitly documented as unable to roll back, and the release test verifies that state written by the weak pass remains after the strong pass causes `tecHOOK_REJECTED` (`src/xrpld/app/tx/detail/Transactor.cpp:2480-2502`, `src/test/app/SetHook_test.cpp:12497-12516`, release commit `d20e8ffb561034101d24668adbe9a513f639cb37`). -->
  <!-- evidence: `doAgainAsWeak` is invoked in the post-application phase after the transaction result is available, and weak results are finalized without changing that result (`src/xrpld/app/tx/detail/Transactor.cpp:2483-2534`, release commit `d20e8ffb561034101d24668adbe9a513f639cb37`). -->
- Only meaningful from a strong execution; hence `PREREQUISITE_NOT_MET` when `isStrong` is
  false.

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
discussion in [Overview](../../overview.md).
