# STO APIs

APIs for parsing and manipulating serialized transaction objects (STOs) — locating a
field or array element by code, and inserting or removing a field to build a new
object. These functions used to share the "Utility APIs" page; for the return-value
and error-code conventions they follow, see [Utility APIs](../utility/README.md).

---

## Index

| Function | Purpose |
|---|---|
| [`sto_validate`](sto_validate.md) | Check that a buffer is a well-formed serialized object. |
| [`sto_subfield`](sto_subfield.md) | Locate a field within an STO (returns packed offset+length). |
| [`sto_subarray`](sto_subarray.md) | Locate an array element within an STO array. |
| [`sto_emplace`](sto_emplace.md) | Insert or replace a field within an STO. |
| [`sto_erase`](sto_erase.md) | Remove a field from an STO. |

## Related documents

- [Utility APIs](../utility/README.md) — return-value conventions, `util_keylet`, and the other `util_*` functions.
- [Trace APIs](../trace/README.md) — debug tracing helpers.
- [Hook API reference index](../../README.md)
- [Overview](../../overview.md) and [Glossary](../../glossary.md)
- [Helper macros](../../macros/README.md) — `SUB_OFFSET`/`SUB_LENGTH` for unpacking `sto_subfield`/`sto_subarray` results.
