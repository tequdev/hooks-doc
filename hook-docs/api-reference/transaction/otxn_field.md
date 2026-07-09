# otxn_field

**Summary.** Serialize one field of the originating transaction into hook memory (or, when
the field is small, return its value directly as an `int64_t`).

**Signature.**

```c
int64_t otxn_field(uint32_t write_ptr, uint32_t write_len, uint32_t field_id);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `write_ptr` | `uint32_t` | Destination buffer, **or** `0` to request the value be returned as an `int64_t`. |
| `write_len` | `uint32_t` | Buffer length. Must be `0` when `write_ptr` is `0`. |
| `field_id` | `uint32_t` | The SField code of the field to read (see `hook/sfcodes.h`). |

**Return value.** With a real buffer: the number of bytes written (the serialized field
length). With `write_ptr == 0` and `write_len == 0`: the field value packed into an
`int64_t` (via `data_as_int64`), useful for small numeric fields. Errors:
`INVALID_ARGUMENT` (-7) if `write_ptr == 0` but `write_len != 0`;
`OUT_OF_BOUNDS` (-1) for a bad buffer; `INVALID_FIELD` (-17) if `field_id` resolves to
`sfInvalid`; `DOESNT_EXIST` (-5) if the field is not present on the transaction;
`TOO_SMALL` (-4) if the buffer is too small for the field; `TOO_BIG` (-3) if you request the
int64 form for a field larger than 8 bytes, or if the encoded value would set the sign bit;
`INTERNAL_ERROR` (-2) on a serialization inconsistency.

<!--
Evidence:
- xahaud: src/xrpld/app/hook/detail/applyHook.cpp
- xahaud: src/xrpld/app/hook/detail/HookAPI.cpp
- commit: bb244ef7729503a0317bcff0f8fdaa93ca5cb7d2
- notes: otxn_field serializes the requested field, returns DOESNT_EXIST for absent fields and INVALID_FIELD for unknown codes, and the int64 conversion rejects values longer than 8 bytes or with bit 63 set.
-->

**Common failure patterns.**
- Passing `write_ptr == 0` with a non-zero `write_len` → `INVALID_ARGUMENT`.
- Asking for the int64 form (`0, 0, field`) of a field bigger than 8 bytes, or whose
  serialized integer would set the sign bit (for example, some 8-byte values) → `TOO_BIG`.
- A buffer smaller than the serialized field → `TOO_SMALL`.
- An unrecognised or invalid `field_id` → `INVALID_FIELD`; a valid but absent field →
  `DOESNT_EXIST`.

**Caveats / notes.**
- **The bytes written are the field's *serialized* form**, which for most types includes no
  tag but does depend on the type. For account fields (`STI_ACCOUNT`, e.g. `sfAccount`,
  `sfDestination`) the wrapper strips the leading variable-length byte and writes exactly the
  20-byte AccountID (`is_account` branch of `WRITE_WASM_MEMORY_OR_RETURN_AS_INT64`), so
  reading `sfAccount` into a 20-byte buffer returns `20`.
- Common `field_id` values from `hook/sfcodes.h`: `sfAccount` (`(8U<<16)+1`),
  `sfDestination` (`(8U<<16)+3`), `sfAmount` (`(6U<<16)+1`), `sfFee` (`(6U<<16)+8`),
  `sfSequence` (`(2U<<16)+4`), `sfTransactionType` (`(1U<<16)+2`), `sfMemos` (`(15U<<16)+9`).
- For an `STI_AMOUNT` field like `sfAmount` the serialized form is 8 bytes for native XAH
  (drops with the high bits set) or 48 bytes for an IOU/issued amount; size your buffer for
  the worse case (see [../macros](../../macros/amount-and-sto.md) `AMOUNT_TO_DROPS`).
- To parse a returned amount as a floating value, prefer loading the transaction into a slot
  and using [`slot_float`](../slot/slot_float.md), or the STO helpers in
  [utility](../sto/README.md).

**Minimal example.**

```c
uint8_t acc[20];
otxn_field((uint32_t)acc, 20, sfAccount);   // sender AccountID
```

**Practical example.**

<!-- adapted from SetHook_test.cpp, "Test otxn_field" -->

```c
#define sfAccount ((8U << 16U) + 1U)
int64_t hook(uint32_t reserved)
{
    _g(1, 1);

    // Documented error codes for the boundary and sanity cases:
    ASSERT(otxn_field(1, 1000000, sfAccount) == OUT_OF_BOUNDS);   // bad length
    ASSERT(otxn_field(0, 1, sfAccount)       == INVALID_ARGUMENT);// ptr 0 but len != 0
    ASSERT(otxn_field(0, 0, sfAccount)       == TOO_BIG);         // 20-byte field, no int64
    uint8_t acc[20];
    ASSERT(otxn_field((uint32_t)acc, 19, sfAccount) == TOO_SMALL);
    ASSERT(otxn_field((uint32_t)acc, 20, sfAccount) == 20);       // sender written
    ASSERT(otxn_field((uint32_t)acc, 20, 1)         == INVALID_FIELD);

    // The sender equals the hook account only for self-sent transactions.
    uint8_t acc2[20];
    ASSERT(hook_account((uint32_t)acc2, 20) == 20);

    accept(0, 0, 0);
}
```

**Related APIs.** [`otxn_type`](otxn_type.md), [`otxn_slot`](otxn_slot.md),
[`slot_subfield`](../slot/slot_subfield.md),
[`hook_account`](../control/hook_account.md); field codes in `hook/sfcodes.h`.
