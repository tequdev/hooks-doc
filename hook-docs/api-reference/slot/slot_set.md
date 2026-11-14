# slot_set

**Summary.** Load a ledger object identified by a serialized keylet into a slot.
<!-- evidence: in release commit `d20e8ffb561034101d24668adbe9a513f639cb37`, `HookAPI::slot_set` accepts 34-byte keylets; under `fix20261005`, 32-byte transaction hashes return `INVALID_ARGUMENT` (`src/xrpld/app/hook/detail/HookAPI.cpp:2291-2348`). -->

**Signature.**

```c
int64_t slot_set(uint32_t read_ptr, uint32_t read_len, uint32_t slot);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `read_ptr` | `uint32_t` | Pointer to a 34-byte serialized keylet. |
| `read_len` | `uint32_t` | Must be exactly 34. |
| `slot` | `uint32_t` | Destination slot, or `0` to allocate a free slot. |

**Return value.** Returns the slot number the object was loaded into (non-zero) on success.
Errors: `OUT_OF_BOUNDS` (-1) for a bad read buffer; `INVALID_ARGUMENT` (-7) if `read_len` is
not 34, if `slot` exceeds `max_slots`, or if the 32-byte transaction-hash form is used;
`NO_FREE_SLOTS` (-6) if `slot == 0` and all slots are in use; `DOESNT_EXIST` (-5) if the
keylet does not resolve to a ledger object.
<!-- evidence: the WASM wrapper returns `OUT_OF_BOUNDS` before calling the API for an invalid guest-memory range, while the API validates the 34-byte input length and slot number (`src/xrpld/app/hook/detail/applyHook.cpp:2024-2042`; `src/xrpld/app/hook/detail/HookAPI.cpp:2291-2298` in release commit `d20e8ffb561034101d24668adbe9a513f639cb37`). -->

**Common failure patterns.**
- A `read_len` other than 34 → `INVALID_ARGUMENT` (including a 32-byte transaction hash).
- Slotting a keylet whose object is not in the current view → `DOESNT_EXIST`.
- Filling all 255 slots and then requesting another with `slot == 0` → `NO_FREE_SLOTS`.

**Caveats / notes.**
- 34 bytes = a serialized keylet (2-byte type + 32-byte key), as produced by
  [`util_keylet`](../utility/util_keylet.md). The former 32-byte transaction-id input is no
  longer accepted when `fix20261005` is enabled.
<!-- evidence: `HookAPI::slot_set` rejects non-34-byte input under `fix20261005` before attempting transaction lookup (`src/xrpld/app/hook/detail/HookAPI.cpp:2293-2328` in release commit `d20e8ffb561034101d24668adbe9a513f639cb37`). -->
- Passing a specific `slot` overwrites its previous contents; passing `0` returns the newly
  allocated slot number.
- A keylet with a zero key returns `DOESNT_EXIST`.
<!-- evidence: slot `0` is replaced with a free slot before the object is stored; a non-zero slot is assigned directly, and a zero key is rejected (`src/xrpld/app/hook/detail/HookAPI.cpp:2309-2310,2353-2364` in release commit `d20e8ffb561034101d24668adbe9a513f639cb37`). -->

**Minimal example.**

```c
uint8_t kl[34];
util_keylet((uint32_t)kl, 34, KEYLET_ACCOUNT, (uint32_t)accid, 20, 0,0,0,0);
int64_t s = slot_set((uint32_t)kl, 34, 0);   // s = allocated slot number
```

**Practical example.**
<!-- adapted from `SetHook_test.cpp`, "Test slot_set" -->

```c
int64_t hook(uint32_t reserved)
{
    _g(1, 1);

    // a serialized keylet (here: the ledger "skip" object, type 0x0068)
    uint8_t kl_sk[34] = { 0x00U, 0x68U, /* ... 32-byte key ... */ };

    ASSERT(slot_set(1, 1000000, 0) == OUT_OF_BOUNDS);          // bad read buffer
    ASSERT(slot_set((uint32_t)kl_sk, 33, 0) == INVALID_ARGUMENT); // wrong length

    int64_t s = slot_set((uint32_t)kl_sk, 34, 0);              // load into a free slot
    ASSERT(s > 0);
    ASSERT(slot_size(s) > 0);

    accept(0, 0, 0);
}
```

**Related APIs.** [`slot`](slot.md), [`slot_subfield`](slot_subfield.md),
[`util_keylet`](../utility/util_keylet.md), [`otxn_slot`](../transaction/otxn_slot.md).
