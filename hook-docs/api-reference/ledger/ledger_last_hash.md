# ledger_last_hash

**Summary.** Write the 32-byte hash of the last closed ledger into hook memory.

**Signature.**

```c
int64_t ledger_last_hash(uint32_t write_ptr, uint32_t write_len);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `write_ptr` | `uint32_t` | Destination buffer. |
| `write_len` | `uint32_t` | Must be at least 32. |

**Return value.** Returns `32` (bytes written) on success. Errors: `OUT_OF_BOUNDS` (-1) for a
bad buffer; `TOO_SMALL` (-4) if `write_len < 32`.

**Common failure patterns.**
- A buffer shorter than 32 bytes → `TOO_SMALL`.

**Caveats / notes.**
- This is `view().info().parentHash` — the hash of the most recently closed ledger.

**Minimal example.**

```c
uint8_t h[32];
ledger_last_hash((uint32_t)h, 32);
```

**Related APIs.** [`ledger_seq`](ledger_seq.md), [`ledger_nonce`](ledger_nonce.md).
