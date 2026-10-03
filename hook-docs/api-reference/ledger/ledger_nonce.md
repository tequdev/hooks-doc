# ledger_nonce

**Summary.** Write a unique 32-byte nonce derived from ledger and transaction context.

**Signature.**

```c
int64_t ledger_nonce(uint32_t write_ptr, uint32_t write_len);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `write_ptr` | `uint32_t` | Destination buffer. |
| `write_len` | `uint32_t` | Must be at least 32. |

**Return value.** Returns `32` (bytes written) on success. Errors: `TOO_SMALL` (-4) if
`write_len < 32`; `OUT_OF_BOUNDS` (-1) for a bad buffer; `TOO_MANY_NONCES` (-12) on the
257th request in one execution.
<!-- evidence: `max_nonce` is `255`, the counter starts at `0`, and `HookAPI::ledger_nonce` rejects only when the counter is greater than `max_nonce` before incrementing it (`include/xrpl/hook/Enum.h:399`, `src/xrpld/app/hook/detail/HookAPI.cpp:1830-1845`, `src/xrpld/app/hook/detail/applyHook.cpp:2798-2822`). -->

**Common failure patterns.**
- Requesting a 257th nonce in one execution → `TOO_MANY_NONCES` (the first 256 requests
  succeed).
- A buffer shorter than 32 bytes → `TOO_SMALL`.
  <!-- evidence: the release wrapper checks `write_len < 32` before calling `ledger_nonce`; the
  API applies the nonce-counter limit and increments the counter after generating the nonce
  (`src/xrpld/app/hook/detail/applyHook.cpp:2807-2816`, `src/xrpld/app/hook/detail/HookAPI.cpp:1833-1843`). -->

**Caveats / notes.**
- Each call increments an internal counter and hashes ledger sequence, parent close time,
  parent hash, the transaction id, the counter, and the hook account, so successive nonces
  differ and are deterministic across validators.
  <!-- evidence: `HookAPI::ledger_nonce` passes those six context values to `sha512Half` and
  post-increments `ledger_nonce_counter` (`src/xrpld/app/hook/detail/HookAPI.cpp:1830-1845`
  in xahaud `origin/release`). -->
- This is the general-purpose nonce; for emitting transactions use
  [`etxn_nonce`](../emit/etxn_nonce.md), which serves the emission machinery.

**Minimal example.**

```c
uint8_t n[32];
ledger_nonce((uint32_t)n, 32);
```

**Related APIs.** [`etxn_nonce`](../emit/etxn_nonce.md),
[`ledger_last_hash`](ledger_last_hash.md).
