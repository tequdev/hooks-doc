# ledger_keylet

**Summary.** Given a lo and a hi keylet of the same type, return the first existing keylet strictly
after `lo` and no later than `hi` — a way to walk ledger objects.
<!-- evidence: `HookAPI::ledger_keylet` calls `Ledger::succ`, whose `upper_bound(key)` search is strictly greater than the low key and whose `last` check excludes keys at or above `hi.next()` (`src/xrpld/app/hook/detail/HookAPI.cpp:1849-1863`, `src/xrpld/app/ledger/Ledger.cpp:471-478`). -->

**Signature.**

```c
int64_t ledger_keylet(uint32_t write_ptr, uint32_t write_len,
                      uint32_t lread_ptr, uint32_t lread_len,
                      uint32_t hread_ptr, uint32_t hread_len);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `write_ptr` | `uint32_t` | Destination buffer for the resulting 34-byte serialized keylet. |
| `write_len` | `uint32_t` | Must be exactly 34. |
| `lread_ptr` | `uint32_t` | Pointer to the low (start) 34-byte serialized keylet. |
| `lread_len` | `uint32_t` | Must be exactly 34. |
| `hread_ptr` | `uint32_t` | Pointer to the high (end) 34-byte serialized keylet. |
| `hread_len` | `uint32_t` | Must be exactly 34. |

**Return value.** Returns the number of bytes written (34) on success. Errors:
`OUT_OF_BOUNDS` (-1) for bad buffers; `TOO_SMALL` (-4) if any length is < 34;
`TOO_BIG` (-3) if any length is > 34; `INVALID_ARGUMENT` (-7) if either input is not a valid
serialized keylet; `DOES_NOT_MATCH` (-40) if the lo and hi keylets are of different types;
`DOESNT_EXIST` (-5) if no keylet exists in the range.

**Common failure patterns.**
- Passing lo and hi keylets of different types → `DOES_NOT_MATCH`.
- A range that contains no ledger object → `DOESNT_EXIST`.
- Any keylet buffer not exactly 34 bytes → `TOO_SMALL`/`TOO_BIG`.

**Caveats / notes.**
- Both bounds must be the same keylet type; the search is `view().succ(lo, hi.next())`, which returns the
  first key strictly greater than `lo` and less than `hi.next()` (therefore `<= hi`).
  <!-- evidence: `HookAPI::ledger_keylet` rejects different keylet types, then passes `klLo.key` and
  `klHi.key.next()` to `succ`; `Ledger::succ` uses `upper_bound(key)` and rejects keys `>= last`
  (`src/xrpld/app/hook/detail/HookAPI.cpp:1851-1863`, `src/xrpld/app/ledger/Ledger.cpp:471-478`). -->
- To enumerate a whole range, feed the returned keylet back in as the new
  low bound and loop until `DOESNT_EXIST`.
  <!-- evidence: `Ledger::succ` searches strictly above its low-key argument, so the returned keylet
  itself can be reused as the next low bound (`src/xrpld/app/ledger/Ledger.cpp:471-478`). -->
- Build the input keylets with [`util_keylet`](../utility/util_keylet.md).

**Minimal example.**

```c
uint8_t lo[34], hi[34], out[34];
// ... fill lo/hi with same-type keylets via util_keylet ...
int64_t n = ledger_keylet((uint32_t)out, 34, (uint32_t)lo, 34, (uint32_t)hi, 34);
```

**Practical example.**
<!-- adapted from `SetHook_test.cpp`, "Test ledger_keylet" -->

```c
// Walk forward from `lo` to `hi`, slotting each object found.
uint8_t out[34];
int64_t n = ledger_keylet((uint32_t)out, 34, (uint32_t)lo, 34, (uint32_t)hi, 34);
if (n == 34)
{
    int64_t s = slot_set((uint32_t)out, 34, 0);   // load the found object
    // ... inspect s, then advance `lo` past `out` and repeat ...
}
accept(SBUF("done"), 0);
```

**Related APIs.** [`util_keylet`](../utility/util_keylet.md), [`slot_set`](../slot/slot_set.md).
