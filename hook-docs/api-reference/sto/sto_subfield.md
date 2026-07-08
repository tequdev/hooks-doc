# sto_subfield

**Summary.** Locate a named field inside a serialized object and return where it is.
The result packs a byte **offset** and a byte **length** into a single `int64_t`;
extract them with the [`SUB_OFFSET` / `SUB_LENGTH`](../../macros/amount-and-sto.md#sub_offset--sub_length)
macros.

**Signature.**

```c
int64_t sto_subfield(uint32_t read_ptr, uint32_t read_len, uint32_t field_id);
```

**Parameters.**

| Name | Meaning |
|---|---|
| `read_ptr`, `read_len` | The serialized object to scan (at least 2 bytes). |
| `field_id` | The field code, encoded as `(type_code << 16) | field_index` (the `sf*` codes in `hook/sfcodes.h`). |

**Return value.** On success, a packed `int64_t`:
`(offset << 32) | length`, where `offset` is the byte offset **from `read_ptr`** and
`length` is the field's byte length.

- For **non-array** fields, the returned offset/length point at the **payload only**
  (the field header/prefix is excluded).
- For **array** fields (`STI_ARRAY`, type `0xF`), the field is returned **fully
  formed** — offset/length span the whole wrapped array, header included.

Errors:

| Code | Value | Cause |
|---|---|---|
| `TOO_SMALL` | -4 | `read_len < 2`. |
| `OUT_OF_BOUNDS` | -1 | Region out of bounds. |
| `DOESNT_EXIST` | -5 | The field is not present in the object. |
| `PARSE_ERROR` | -18 | The object is malformed. |

Because a valid result is always non-negative and an error is always negative, test
`result < 0` before decoding.

**Common failure patterns.**
- Building `field_id` incorrectly. Use the `sf*` constant from `hook/sfcodes.h`
  directly (they already encode `type<<16 | index`); do not pass a bare field index.
- Forgetting that non-array payloads exclude the field prefix — an `sfAmount` payload
  is 8 bytes (XRP) or 48 bytes (IOU), not the header+payload.

**Caveats.** The returned offset is relative to `read_ptr`, so the absolute pointer is
`read_ptr + SUB_OFFSET(result)`.

**Minimal example.**

```c
int64_t r = sto_subfield(SBUF(txblob), sfAmount);
if (r < 0)
    rollback(SBUF("no amount"), r);
uint32_t off = SUB_OFFSET(r);
uint32_t len = SUB_LENGTH(r);
uint8_t* amount = txblob + off;   // len bytes of Amount payload
```

**Practical example.** Read the `sfAccount` of a serialized object loaded from state:

```c
int64_t r = sto_subfield(SBUF(sto), sfAccount);
if (r > 0 && SUB_LENGTH(r) == 20)
{
    uint8_t acc[20];
    for (int i = 0; GUARD(20), i < 20; ++i)
        acc[i] = sto[SUB_OFFSET(r) + i];
}
```

**Related APIs.** [`sto_subarray`](sto_subarray.md), [`sto_emplace`](sto_emplace.md),
[`SUB_OFFSET`/`SUB_LENGTH`](../../macros/amount-and-sto.md#sub_offset--sub_length),
slot-based equivalents [`slot_subfield`](../slot/slot_subfield.md).
