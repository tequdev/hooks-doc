# hook_param

**Summary.** Read the value of one of this hook's install-time parameters (`sfHookParameters`
set on the hook object) by key.

**Signature.**

```c
int64_t hook_param(uint32_t write_ptr, uint32_t write_len,
                   uint32_t read_ptr, uint32_t read_len);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `write_ptr` | `uint32_t` | Destination buffer for the parameter value. |
| `write_len` | `uint32_t` | Destination buffer length. |
| `read_ptr` | `uint32_t` | Pointer to the parameter *key* (name). |
| `read_len` | `uint32_t` | Key length; 1..32 bytes. |

**Return value.** Returns the number of bytes written (the value length) on success. Errors:
`OUT_OF_BOUNDS` (-1) for bad pointers; `TOO_SMALL` (-4) if the key length is 0;
`TOO_BIG` (-3) if the key length exceeds 32; `DOESNT_EXIST` (-5) if no parameter with that
key exists (or it was "deleted" via an override with an empty value).

**Common failure patterns.**
- Key length 0 → `TOO_SMALL`; key length > 32 → `TOO_BIG`.
- Asking for a key that was never set → `DOESNT_EXIST`.

**Caveats / notes.**
- These are the hook's own configuration parameters, distinct from parameters carried on the
  *transaction* — for those, use [`otxn_param`](../transaction/otxn_param.md).
- Lookups first consult overrides keyed to this hook's WASM hash via
  [`hook_param_set`](hook_param_set.md); an override with an empty value hides the parameter
  and yields `DOESNT_EXIST`. <!-- evidence: `HookAPI::hook_param` checks `hookParamOverrides[hookCtx.result.hookHash]` before `hookParams`, and empty overrides return `DOESNT_EXIST` (`src/xrpld/app/hook/detail/HookAPI.cpp:1674-1709`). -->

**Minimal example.**

```c
uint8_t val[256];
int64_t n = hook_param((uint32_t)val, sizeof(val), SBUF("param0"));
```

**Practical example.**

<!-- adapted from SetHook_test.cpp, "Test hook_param" -->

```c
uint8_t* names[]  = { "param0", "param1", /* ... */ };
uint8_t* values[] = { "value0", "value1", /* ... */ };

ASSERT(hook_param(0, 1000000, 0, 32) == OUT_OF_BOUNDS);   // bad write buffer
uint8_t buf[32];
// each configured parameter reads back its value
int64_t len = hook_param((uint32_t)buf, sizeof(buf), SBUF(names[0]));
ASSERT(len > 0);
```

**Related APIs.** [`hook_param_set`](hook_param_set.md), [`otxn_param`](../transaction/otxn_param.md).
