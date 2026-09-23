# hook_param_set

**Summary.** Store an override (or deletion) for a parameter, keyed by the target hook's
WASM hash. A hook with that hash consumes the override when it runs later in the chain.

<!-- evidence: `HookAPI::hook_param_set` stores overrides by supplied hash in `src/xrpld/app/hook/detail/HookAPI.cpp:1713-1742`; `hook_param` reads the entry keyed by the currently executing hook hash in `src/xrpld/app/hook/detail/HookAPI.cpp:1683-1709`, and `Transactor::executeHookChain` carries overrides to later chain iterations in `src/xrpld/app/tx/detail/Transactor.cpp:1459-1468`. -->

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
- The target is selected by the supplied hash, not by chain position. In normal use, name a
  later hook so it can consume the override; setting one for the current or an already-run
  hook does not change that earlier execution.
<!-- evidence: `HookAPI::hook_param_set` accepts and stores the supplied hash without a
position check in `src/xrpld/app/hook/detail/HookAPI.cpp:1713-1742`; `hook_param` matches
the current hook hash in `src/xrpld/app/hook/detail/HookAPI.cpp:1683-1696`. -->
- A `read_len` of `0` sets an empty override, which causes the target hook's
  [`hook_param`](hook_param.md) lookup for that key to return `DOESNT_EXIST` (an effective
  "delete").
- At most 16 overrides may be set across the hook (`max_params`).

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
