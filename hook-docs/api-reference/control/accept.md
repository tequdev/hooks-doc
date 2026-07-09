# accept

**Summary.** Terminate the hook successfully and allow the originating transaction to be
applied, keeping this hook's state changes and emitted transactions.

**Signature.**

```c
int64_t accept(uint32_t read_ptr, uint32_t read_len, int64_t error_code);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `read_ptr` | `uint32_t` | Pointer to an optional reason string in WASM memory. May be `0` for no string. |
| `read_len` | `uint32_t` | Length of the reason string. Capped at 256 bytes (longer is truncated). |
| `error_code` | `int64_t` | An arbitrary application-defined code recorded in metadata as `sfHookReturnCode`. |

**Return value.** Does not return to the caller in the normal sense — it terminates hook
execution. Internally returns the sentinel `RC_ACCEPT` (-20) to the VM. The only error it
can produce is `OUT_OF_BOUNDS` (-1), if `read_ptr`/`read_len` point outside WASM memory
while a reason string is supplied.

<!-- see the HOOK_EXIT macro in include/xrpl/hook/Macro.h -->

**Common failure patterns.**
- Passing a non-zero `read_ptr` with a `read_len` that runs past the end of memory returns
  `OUT_OF_BOUNDS` instead of accepting.
- Expecting code after `accept` to run — it does not.

**Caveats / notes.**
- Terminates execution immediately; treat it like `return`.
- The reason string is stored in `sfHookReturnString`. If the buffer looks like UTF-16LE it
  is transcoded to a UTF-8-ish byte string first (`HOOK_EXIT`).
- `error_code` is yours to define; use it to signal *which* success path was taken.

**Minimal example.**

```c
accept(0, 0, 0);   // accept with no reason string, code 0
```

**Practical example.**

```c
// Write the hook account id into the return string on success.
uint8_t acc[20];
if (hook_account((uint32_t)acc, 20) != 20)
    rollback(SBUF("hook_account failed"), 1);
accept((uint32_t)acc, 20, 0);   // return the accid as the reason string
```

**Related APIs.** [`rollback`](rollback.md), [`hook_account`](hook_account.md).
