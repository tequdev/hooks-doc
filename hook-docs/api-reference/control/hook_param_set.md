# hook_param_set

**Summary.** Override (or delete) a parameter value for a specific hook hash; the override is
read when that hook later executes.
<!-- evidence: `HookAPI::hook_param_set` stores overrides under the target hash, and `HookAPI::hook_param` checks the current hook's hash-specific override before falling back to its own parameters (`src/xrpld/app/hook/detail/HookAPI.cpp:1682-1741`). -->

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
- Affects only hooks that execute *after* the current one in the chain, and only the hook
  whose hash you name — this is how one hook parameterises the next.
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
