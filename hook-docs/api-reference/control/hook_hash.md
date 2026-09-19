# hook_hash

**Summary.** Write the 32-byte WASM hash of a hook in the current account's hook chain,
identifying which code is (or will be) executed at a given position.

<!-- evidence: the `hook_hash` wrapper writes the 32-byte result returned by `HookAPI::hook_hash`; `HookAPI` returns the current execution hash for `hook_no == -1` and otherwise reads `sfHooks` (`src/xrpld/app/hook/detail/applyHook.cpp:2713-2736`, `src/xrpld/app/hook/detail/HookAPI.cpp:1636-1655`). -->

**Signature.**

```c
int64_t hook_hash(uint32_t write_ptr, uint32_t write_len, int32_t hook_no);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `write_ptr` | `uint32_t` | Destination buffer. |
| `write_len` | `uint32_t` | Buffer length; must be at least 32. |
| `hook_no` | `int32_t` | Chain position to query, or `-1` for the currently executing hook. |

**Return value.** Returns the number of bytes written (32) on success. Errors:
`TOO_SMALL` (-4) if `write_len < 32`; `OUT_OF_BOUNDS` (-1) for a bad buffer;
`INTERNAL_ERROR` (-2) if the account's hook object cannot be read; `DOESNT_EXIST` (-5) if
`hook_no` is beyond the chain or that slot has no `sfHookHash`.

<!-- evidence: the wrapper checks the 32-byte minimum and WASM-memory bounds before calling the API; the API returns `INTERNAL_ERROR` for a missing/non-`sfHooks` object and `DOESNT_EXIST` for an out-of-range or hashless slot (`src/xrpld/app/hook/detail/applyHook.cpp:2721-2733`, `src/xrpld/app/hook/detail/HookAPI.cpp:1642-1655`). -->

**Common failure patterns.**
- Querying a `hook_no` that isn't installed → `DOESNT_EXIST`.
- Buffer shorter than 32 bytes → `TOO_SMALL`.

**Caveats / notes.**
- `hook_no == -1` returns the hash of the hook that is currently running (from
  `hookCtx.result.hookHash`); other values read the on-ledger `sfHooks` array.
- The hash identifies the `HookDefinition` (WASM bytecode), useful for detecting which hook
  in a multi-hook chain you are, or for feeding [`hook_skip`](hook_skip.md).

<!-- evidence: `hook_no == -1` returns `hookCtx.result.hookHash`; non-negative positions index the on-ledger `sfHooks` array (`src/xrpld/app/hook/detail/HookAPI.cpp:1637-1655`). -->

**Minimal example.**

```c
uint8_t h[32];
hook_hash((uint32_t)h, 32, -1);   // hash of the current hook
```

**Practical example.**

```c
// Skip the next hook in the chain if it matches a known hash.
uint8_t other[32];
if (hook_hash((uint32_t)other, 32, hook_pos() + 1) == 32)
    hook_skip((uint32_t)other, 32, 0);
accept(SBUF("done"), 0);
```

**Related APIs.** [`hook_pos`](hook_pos.md), [`hook_skip`](hook_skip.md).
