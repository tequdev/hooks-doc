# hook_param_set

**Summary.** Override (or delete) a parameter value under a target hook's WASM hash.

<!-- evidence: `HookAPI::hook_param_set` stores overrides under the target hash without a chain-order check, and `HookAPI::hook_param` reads overrides for the currently executing hook hash (`src/xrpld/app/hook/detail/HookAPI.cpp:1682-1694, 1732-1739`). -->

**Signature.**

```c
int64_t hook_param_set(uint32_t read_ptr, uint32_t read_len,
                       uint32_t kread_ptr, uint32_t kread_len,
                       uint32_t hread_ptr, uint32_t hread_len);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `read_ptr` | `uint32_t` | Pointer to the parameter *value* to set. |
| `read_len` | `uint32_t` | Value length; up to 256 bytes. `0` deletes/hides the parameter. |
| `kread_ptr` | `uint32_t` | Pointer to the parameter *key* (name). |
| `kread_len` | `uint32_t` | Key length; 1..32 bytes. |
| `hread_ptr` | `uint32_t` | Pointer to the 32-byte WASM hash of the target hook. |
| `hread_len` | `uint32_t` | Must be exactly 32. |

**Return value.** Returns the value length written on success. Errors: `OUT_OF_BOUNDS` (-1)
for bad pointers; `TOO_SMALL` (-4) if the key length is 0; `TOO_BIG` (-3) if the key exceeds
32 or the value exceeds 256; `INVALID_ARGUMENT` (-7) if `hread_len != 32`;
`TOO_MANY_PARAMS` (-36) if more than 16 overrides have been set (`max_params`).

**Common failure patterns.**
- Hash length other than 32 → `INVALID_ARGUMENT`.
- Exceeding the 16-override budget → `TOO_MANY_PARAMS`.

**Caveats / notes.**
- `hook_param_set` is keyed by the target hook hash, not by chain position. <!-- evidence: `HookAPI::hook_param_set` stores overrides under the supplied hash without any chain-order check (`src/xrpld/app/hook/detail/HookAPI.cpp:1712-1741`). -->
- A `read_len` of `0` sets an empty override, which causes the target hook's
  [`hook_param`](hook_param.md) lookup for that key to return `DOESNT_EXIST` (an effective
  "delete"). <!-- evidence: `HookAPI::hook_param` returns `DOESNT_EXIST` for empty overrides, and `HookAPI::hook_param_set` stores the empty `paramValue` as-is (`src/xrpld/app/hook/detail/HookAPI.cpp:1682-1709, 1712-1741`). -->
- At most 16 overrides may be set across the hook (`max_params`). <!-- evidence: `HookAPI::hook_param_set` rejects when `hookCtx.result.overrideCount >= hook_api::max_params` (`src/xrpld/app/hook/detail/HookAPI.cpp:1727-1730`). -->

**Minimal example.**

```c
uint8_t next_hash[32];
hook_hash((uint32_t)next_hash, 32, hook_pos() + 1);
hook_param_set(SBUF("newval"), SBUF("param0"), (uint32_t)next_hash, 32);
```

**Practical example.**

```c
// Pass a computed budget to the next hook in the chain.
uint8_t next[32];
if (hook_hash((uint32_t)next, 32, hook_pos() + 1) == 32)
{
    uint8_t budget[8];
    UINT64_TO_BUF(budget, 1000000ULL);
    hook_param_set((uint32_t)budget, 8, SBUF("BUDGET"), (uint32_t)next, 32);
}
accept(SBUF("configured next hook"), 0);
```

**Related APIs.** [`hook_param`](hook_param.md), [`hook_hash`](hook_hash.md), [`hook_pos`](hook_pos.md).
