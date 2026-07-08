# Trace APIs

Debug tracing functions that write a label and a value (a buffer, a signed integer,
or an XFL float) to the server's trace log. They are purely diagnostic and have no
effect on transaction outcome. These functions used to share the "Utility APIs" page;
for the return-value and error-code conventions they follow, see
[Utility APIs](../utility/README.md).

---

## Index

| Function | Purpose |
|---|---|
| [`trace`](trace.md) | Write a message + data buffer to the server trace log. |
| [`trace_num`](trace_num.md) | Write a message + signed integer to the trace log. |
| [`trace_float`](trace_float.md) | Write a message + XFL float to the trace log. |

## Related documents

- [Utility APIs](../utility/README.md) — return-value conventions, `util_keylet`, and the other `util_*` functions.
- [STO APIs](../sto/README.md) — serialized-object parsing/editing helpers.
- [Hook API reference index](../../README.md)
- [Overview](../../overview.md) and [Glossary](../../glossary.md)
- [Helper macros](../../macros/README.md) — the `TRACE*` convenience macros that wrap these functions.
