# state_foreign

**Summary.** Read a state value from an explicitly named account and namespace.

**Signature.**

```c
int64_t state_foreign(uint32_t write_ptr, uint32_t write_len,
                      uint32_t kread_ptr, uint32_t kread_len,
                      uint32_t nread_ptr, uint32_t nread_len,
                      uint32_t aread_ptr, uint32_t aread_len);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `write_ptr` | `uint32_t` | Destination buffer for the value. May be `0` to return the value as an `int64_t`. |
| `write_len` | `uint32_t` | Destination buffer length. |
| `kread_ptr` | `uint32_t` | Pointer to the key. |
| `kread_len` | `uint32_t` | Key length; 1..32 bytes. |
| `nread_ptr` | `uint32_t` | Pointer to a 32-byte namespace. |
| `nread_len` | `uint32_t` | Namespace length. For a local read may be `0` (use current namespace); otherwise must be 32. |
| `aread_ptr` | `uint32_t` | Pointer to a 20-byte AccountID. `0` means the hook account (local read). |
| `aread_len` | `uint32_t` | Account length. `0` for local, or exactly 20 for a foreign read. |

**Return value.** Returns the value length on success. Errors: `OUT_OF_BOUNDS` (-1);
`TOO_SMALL` (-4) if `kread_len < 1`; `TOO_BIG` (-3) if `kread_len > 32`;
`INVALID_ARGUMENT` (-7) if `aread_len` is neither 0 nor 20, if `nread_len` is neither 0
(local only) nor 32, or if the key cannot be formed; `DOESNT_EXIST` (-5) if the entry does not
exist. `write_ptr == 0` returns the value as an `int64_t` (`TOO_BIG` if > 8 bytes).

**Common failure patterns.**
- Passing a non-32-byte namespace for a foreign read → `INVALID_ARGUMENT` (a foreign read
  cannot use the "zero namespace = current namespace" shortcut; that is a local-only
  convenience).
- An account buffer that is not exactly 20 bytes → `INVALID_ARGUMENT`.
- Reading an entry that another account never set → `DOESNT_EXIST`.

**Caveats / notes.**
- Reading foreign state requires **no** grant — any hook can read any account's state if it
  knows the account, namespace, and key. Grants only gate *writes* (see
  [`state_foreign_set`](state_foreign_set.md)).
- For a local read (`aread_ptr == 0`), a zero-length namespace selects the hook's current
  namespace, matching [`state`](state.md).
- Results are cached per execution, keyed by (account, namespace, key).

**Minimal example.**

```c
uint8_t buf[256];
int64_t n = state_foreign((uint32_t)buf, sizeof(buf),
                          SBUF(key),           // 32-byte key
                          SBUF(ns),            // 32-byte namespace
                          SBUF(foreign_accid)); // 20-byte AccountID
```

**Practical example.**

```c
// Read a config value published by a known "registry" account in a fixed namespace.
extern uint8_t REGISTRY[20];   // 20-byte AccountID
uint8_t ns[32];                // 32-byte namespace agreed with the registry
uint8_t key[32];               // 32-byte key
uint8_t val[64];

int64_t n = state_foreign((uint32_t)val, sizeof(val),
                          (uint32_t)key, 32,
                          (uint32_t)ns, 32,
                          (uint32_t)REGISTRY, 20);
if (n == DOESNT_EXIST)
    rollback(SBUF("registry entry missing"), __LINE__);
accept(SBUF("ok"), 0);
```

**Related APIs.** [`state`](state.md), [`state_foreign_set`](state_foreign_set.md); see the
[foreign state example](../../examples/foreign-state.md).
