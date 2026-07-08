# otxn_param

**Summary.** Read the value of a `HookParameter` carried on the *originating transaction* (the
transaction's `sfHookParameters` array), by key.

**Signature.**

```c
int64_t otxn_param(uint32_t write_ptr, uint32_t write_len,
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
`OUT_OF_BOUNDS` (-1) for bad pointers; `TOO_SMALL` (-4) if the key length is 0 **or** the
destination buffer is smaller than the value; `TOO_BIG` (-3) if the key length exceeds 32;
`DOESNT_EXIST` (-5) if the transaction carries no `sfHookParameters`, if no parameter with
that key is present, or if the matching parameter has an empty/absent value.

**Common failure patterns.**
- Key length 0 → `TOO_SMALL`; key length > 32 → `TOO_BIG`.
- Asking for a key the transaction didn't include → `DOESNT_EXIST`.
- A destination buffer smaller than the stored value → `TOO_SMALL`.

**Caveats / notes.**
- These are parameters attached to the *transaction* (set by the sender), distinct from the
  hook's own install-time parameters read with [`hook_param`](../control/hook_param.md). A hook
  frequently reads instructions from `otxn_param` and configuration from `hook_param`.
- A parameter present but with an empty value reads as `DOESNT_EXIST` (matching the
  `hook_param` "deleted" convention).

**Minimal example.**

```c
uint8_t val[256];
int64_t n = otxn_param((uint32_t)val, sizeof(val), SBUF("MODE"));
```

**Practical example.**

```c
// Branch on a one-byte "action" parameter supplied by the sender.
uint8_t action[1];
int64_t n = otxn_param((uint32_t)action, sizeof(action), SBUF("action"));
if (n == DOESNT_EXIST)
    rollback(SBUF("missing 'action' parameter"), __LINE__);
if (n != 1)
    rollback(SBUF("'action' must be one byte"), __LINE__);

if (action[0] == 'D')       // deposit
    accept(SBUF("deposit"), 0);
rollback(SBUF("unknown action"), __LINE__);
```

**Related APIs.** [`hook_param`](../control/hook_param.md), [`otxn_field`](otxn_field.md).
