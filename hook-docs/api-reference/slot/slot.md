# slot

**Summary.** Write the serialized contents of a slot to WASM memory, or return small contents
as an `int64_t`.

**Signature.**

```c
int64_t slot(uint32_t write_ptr, uint32_t write_len, uint32_t slot);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `write_ptr` | `uint32_t` | Destination buffer. `0` returns the data as an `int64_t` (see notes). |
| `write_len` | `uint32_t` | Destination length. Must be `0` when `write_ptr == 0`. |
| `slot` | `uint32_t` | Slot to read. |

**Return value.** Returns the number of bytes written on success. Errors: `OUT_OF_BOUNDS` (-1)
for a bad buffer; `INVALID_ARGUMENT` (-7) if `write_ptr == 0` but `write_len != 0`;
`TOO_SMALL` (-4) if the buffer is too small for the data (or `write_len < 1` with a non-zero
pointer); `DOESNT_EXIST` (-5) if the slot is empty; `INTERNAL_ERROR` (-2) if the slot entry is
corrupt. When `write_ptr == 0` the serialized bytes are returned as a big-endian `int64_t`
(values > 8 bytes then return `TOO_BIG`).

**Common failure patterns.**
- Reading a slot that was never set (or was cleared) → `DOESNT_EXIST`.
- A destination buffer smaller than the slotted data → `TOO_SMALL`.

**Caveats / notes.**
- The bytes written are the *serialized* form of the slotted object/field. For a leaf field
  reached via [`slot_subfield`](slot_subfield.md), that is the field's serialized value.
- For an `STI_ACCOUNT` field the leading length byte is stripped, so you get the raw 20-byte
  AccountID (same convention as [`otxn_field`](../transaction/otxn_field.md)).

**Minimal example.**

```c
uint8_t buf[64];
int64_t n = slot((uint32_t)buf, sizeof(buf), s);   // n = bytes written
```

**Practical example.**

```c
// Drill to the Account field of a slotted object and copy the 20-byte id out.
uint32_t child = slot_subfield(parent, sfAccount, 0);
if (child > 0)
{
    uint8_t acc[20];
    if (slot((uint32_t)acc, sizeof(acc), child) == 20)
        accept(SBUF("read account"), 0);
}
rollback(SBUF("no account field"), __LINE__);
```

**Related APIs.** [`slot_set`](slot_set.md), [`slot_subfield`](slot_subfield.md),
[`slot_size`](slot_size.md).
