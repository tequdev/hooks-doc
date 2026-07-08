# sto_erase

**Summary.** Produce a new serialized object equal to a source STO with a field
**removed**. Implemented as a delete-mode [`sto_emplace`](sto_emplace.md).

**Signature.**

```c
int64_t sto_erase(
    uint32_t write_ptr, uint32_t write_len,   // output buffer
    uint32_t read_ptr,  uint32_t read_len,    // source object
    uint32_t field_id);                        // field code to remove
```

**Parameters.**

| Name | Meaning |
|---|---|
| `write_ptr`, `write_len` | Output buffer. Must be at least `read_len`. |
| `read_ptr`, `read_len` | Source serialized object. |
| `field_id` | The `sf*` code of the field to remove. |

**Return value.** On success, the number of bytes written (≤ `read_len`). If the field
was **not present**, the object is copied unchanged and the call returns
`DOESNT_EXIST` (-5). Other errors are inherited from `sto_emplace`
(`OUT_OF_BOUNDS`, `TOO_SMALL`, `TOO_BIG`, `MEM_OVERLAP`, `PARSE_ERROR`).

**Caveats.** Because deletion cannot grow the object, `write_len == read_len` is a safe
buffer size. As with `sto_emplace`, the output buffer must not overlap the source.

**Minimal example.**

```c
uint8_t out[1024];
int64_t len = sto_erase(SBUF(out), SBUF(src), sfSignature);
if (len == DOESNT_EXIST)
{
    // field wasn't there; `out` is unchanged copy of src
}
else if (len < 0)
    rollback(SBUF("erase failed"), len);
```

**Related APIs.** [`sto_emplace`](sto_emplace.md), [`sto_subfield`](sto_subfield.md).
