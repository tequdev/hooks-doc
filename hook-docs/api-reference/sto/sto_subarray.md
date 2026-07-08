# sto_subarray

**Summary.** Index into a serialized array and return the location of the *n*-th
element. Like [`sto_subfield`](sto_subfield.md), it returns a packed offset+length; here
the element is always returned **fully formed** (wrapper included).

**Signature.**

```c
int64_t sto_subarray(uint32_t read_ptr, uint32_t read_len, uint32_t array_id);
```

**Parameters.**

| Name | Meaning |
|---|---|
| `read_ptr`, `read_len` | A serialized array (or an object whose leading field is the array). At least 2 bytes. |
| `array_id` | The zero-based index of the element to locate. |

**Return value.** `(offset << 32) | length` on success (offset relative to
`read_ptr`, length is the element's full byte length). Errors: `TOO_SMALL` (-4),
`OUT_OF_BOUNDS` (-1), `DOESNT_EXIST` (-5, index past the end), `PARSE_ERROR` (-18).

**Caveats.** If the buffer begins with an array wrapper (`0xFn`), the implementation
unwraps it before indexing; a raw array from `sto_subfield`/`slot_subfield` works
directly. The `fixHookAPI20251128` amendment corrects unwrapping for field values > 15
(two-byte wrappers `0xF0 nn`) — behavior differs slightly before/after that amendment
for such arrays. Up to 1024 elements are scanned.

**Minimal example.**

```c
// memos is an STI_ARRAY payload (e.g. from sto_subfield(..., sfMemos))
int64_t e0 = sto_subarray(memos, memos_len, 0);
if (e0 >= 0)
{
    uint8_t* first = memos + SUB_OFFSET(e0);
    // SUB_LENGTH(e0) bytes, fully-formed Memo object
}
```

**Related APIs.** [`sto_subfield`](sto_subfield.md),
[`slot_subarray`](../slot/slot_subarray.md), [`slot_count`](../slot/slot_count.md).
