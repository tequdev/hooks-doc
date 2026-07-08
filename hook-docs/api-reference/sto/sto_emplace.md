# sto_emplace

**Summary.** Produce a new serialized object equal to a source STO with one field
**inserted or replaced** at its canonical (sorted) position. The field is supplied
fully formed (header + payload), not just the payload.

**Signature.**

```c
int64_t sto_emplace(
    uint32_t write_ptr, uint32_t write_len,   // output buffer
    uint32_t sread_ptr, uint32_t sread_len,   // source object
    uint32_t fread_ptr, uint32_t fread_len,   // field to insert/replace (fully formed)
    uint32_t field_id);                        // field code being emplaced
```

**Parameters.**

| Name | Meaning |
|---|---|
| `write_ptr`, `write_len` | Output buffer. Must be at least `sread_len + fread_len`. |
| `sread_ptr`, `sread_len` | Source serialized object (2 .. 16384 bytes). |
| `fread_ptr`, `fread_len` | The fully-formed field to insert (2 .. 4096 bytes). Must not overlap the output or source buffers. |
| `field_id` | The `sf*` field code of the field being inserted (`type<<16 | index`). |

**Return value.** On success, the number of bytes written to `write_ptr`. Errors:

| Code | Value | Cause |
|---|---|---|
| `OUT_OF_BOUNDS` | -1 | A region out of bounds. |
| `TOO_SMALL` | -4 | `write_len < sread_len + fread_len`, or a buffer below its minimum (source < 2, field < 2). |
| `TOO_BIG` | -3 | `sread_len > 16384`, or `fread_len > 4096`. |
| `MEM_OVERLAP` | -43 | Output overlaps source and/or field buffers. |
| `PARSE_ERROR` | -18 | Source is malformed (or, under `fixHookAPI20251128`, the injected field's own field id does not match `field_id`). |
| `INTERNAL_ERROR` | -2 | Result exceeded the output buffer. |

**Common failure patterns.**
- Passing only the field payload instead of the fully-formed field (prefix + payload)
  → wrong output, or `PARSE_ERROR` under `fixHookAPI20251128`.
- Reusing the source buffer as the output buffer → `MEM_OVERLAP`. Use a distinct
  output buffer.
- Undersizing the output; always allocate `sread_len + fread_len`.

**Caveats.** The field is placed in canonical field order — you do not control the
insertion index. If a field with `field_id` already exists it is replaced. Use
[`sto_erase`](sto_erase.md) to remove a field. This is the workhorse for assembling
transaction blobs before [`emit`](../emit/emit.md).

**Minimal example.**

```c
uint8_t out[1024];
int64_t len = sto_emplace(SBUF(out), SBUF(src), SBUF(field_blob), sfDestination);
if (len < 0)
    rollback(SBUF("emplace failed"), len);
```

**Related APIs.** [`sto_erase`](sto_erase.md), [`sto_subfield`](sto_subfield.md),
[`float_sto`](../float/float_sto.md), [`emit`](../emit/emit.md).
