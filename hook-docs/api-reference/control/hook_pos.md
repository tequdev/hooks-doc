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

**Common failure patterns.** None — it is a pure accessor.

**Caveats / notes.**
- A single account may install up to 10 hooks (the max hook chain length). They execute in
  order; `hook_pos` tells the running hook where it sits so shared code can branch on
  position.
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
