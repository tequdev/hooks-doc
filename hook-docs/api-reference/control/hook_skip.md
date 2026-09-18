# hook_skip

**Summary.** Prevent (or restore) execution of another hook in the current account's chain,
using its 32-byte WASM hash.
<!-- evidence: `HookAPI::hook_skip` accepts a 32-byte hash, checks that it exists in the current account's `sfHooks` array, and adds/removes it from `hookSkips` (`src/xrpld/app/hook/detail/HookAPI.cpp:1745-1790`). -->

**Signature.**

```c
int64_t hook_skip(uint32_t read_ptr, uint32_t read_len, uint32_t flags);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `read_ptr` | `uint32_t` | Pointer to the 32-byte WASM hash of the hook to skip. |
| `read_len` | `uint32_t` | Must be exactly 32. |
| `flags` | `uint32_t` | `0` = add the hook to the skip set; `1` = remove it (un-skip). |

**Return value.** Returns `1` on success. Errors: `OUT_OF_BOUNDS` (-1) for a bad pointer;
`INVALID_ARGUMENT` (-7) if `read_len != 32` or `flags` is neither `0` nor `1`;
`INTERNAL_ERROR` (-2) if the account's hook object cannot be read; `DOESNT_EXIST` (-5) if the
hash is not part of this chain (add) or was not currently skipped (remove).

**Common failure patterns.**
- Hash length other than 32, or a `flags` value other than 0/1 → `INVALID_ARGUMENT`.
- Skipping a hash that is not in this account's chain → `DOESNT_EXIST`.
- Un-skipping (flags=1) a hook that was never skipped → `DOESNT_EXIST`.

**Caveats / notes.**
- Only affects hooks in the *same account's* chain; the target hash must match an entry in that account's `sfHooks` array. <!-- evidence: `HookAPI::hook_skip` iterates the current account's `sfHooks` array and returns `DOESNT_EXIST` if the hash is absent (`src/xrpld/app/hook/detail/HookAPI.cpp:1765-1790`). -->
- Re-skipping an already-skipped hash simply returns `1` (idempotent).
- Combine with [`hook_hash`](hook_hash.md) to obtain the target hash and
  [`hook_pos`](hook_pos.md) to reason about ordering.

**Minimal example.**

```c
uint8_t h[32];
hook_hash((uint32_t)h, 32, hook_pos() + 1);
hook_skip((uint32_t)h, 32, 0);   // skip the next hook
```

**Practical example.**

```c
// Conditionally disable a downstream compliance hook for whitelisted senders.
uint8_t compliance[32];
if (hook_hash((uint32_t)compliance, 32, 2) == 32 && sender_is_whitelisted)
    hook_skip((uint32_t)compliance, 32, 0);
accept(SBUF("ok"), 0);
```

**Related APIs.** [`hook_hash`](hook_hash.md), [`hook_pos`](hook_pos.md).
