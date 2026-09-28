# sto_validate

**Summary.** Check whether a buffer is a well-formed serialized object (STO): parse it
field by field and confirm the fields consume exactly the whole buffer.

**Signature.**

```c
int64_t sto_validate(uint32_t tread_ptr, uint32_t tread_len);
```

**Parameters.**

| Name | Meaning |
|---|---|
| `tread_ptr`, `tread_len` | The candidate serialized object. Must be at least 2 bytes. |

**Return value.**

| Result | Value | Meaning |
|---|---|---|
| valid | 1 | Fields parse cleanly and end exactly at the buffer end. |
| invalid | 0 | A field failed to parse, or trailing/short bytes remain. |
| `TOO_SMALL` | -4 | `tread_len < 2`. |
| `OUT_OF_BOUNDS` | -1 | Region out of bounds. |

**Caveats.** Validation is structural (well-formed field encoding), not semantic — it
does not check that required fields are present for a given object type, nor that
values are in range. A maximum of 1024 fields are scanned. The scanner does not recognise
the `0x99` NOP byte the ledger's deserializer skips, so a NOP-padded template that `emit`
would accept is reported as invalid (`0`) here; see [nop-bytes](../../nop-bytes.md).

**Minimal example.**

```c
int64_t v = sto_validate(SBUF(blob));
if (v == 1)
    accept(SBUF("well-formed sto"), 0);
```

**Related APIs.** [`sto_subfield`](sto_subfield.md), [`sto_emplace`](sto_emplace.md),
[`slot_set`](../slot/slot_set.md).
