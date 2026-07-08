# trace

**Summary.** Write a debug line to the server's trace log: an optional message label
followed by a data buffer rendered either as text or as hex. A no-op unless the server
is running at trace log level.

**Signature.**

```c
int64_t trace(
    uint32_t mread_ptr, uint32_t mread_len,   // message label
    uint32_t dread_ptr, uint32_t dread_len,   // data buffer
    uint32_t as_hex);                          // 0 = text, non-zero = hex
```

**Parameters.**

| Name | Meaning |
|---|---|
| `mread_ptr`, `mread_len` | A label string. Truncated to 128 bytes; a trailing NUL is stripped. May be empty (`0, 0`). |
| `dread_ptr`, `dread_len` | The data to render. Truncated to 1023 bytes. |
| `as_hex` | If non-zero, render `data` as uppercase hex. If zero, render as text (UTF-16LE input is down-converted to bytes; otherwise raw bytes). |

**Return value.** Always `0` on success; `OUT_OF_BOUNDS` (-1) if a region is out of
bounds. When the server is not at trace level the call returns `0` immediately without
formatting.

**Where output goes.** The server's debug/trace log under the `HookTrace[<account>]`
tag. In unit tests it surfaces through the test harness's journal at trace level. It is
purely diagnostic and has no effect on transaction outcome.

**Caveats.** Do not rely on `trace` in production consensus logic — validators run at
higher log levels, so these calls are typically inert. Message and data are truncated
(128 / 1023 bytes). This does *not* free you from guarding surrounding loops.

**Minimal example.**

```c
trace(SBUF("txn hash"), SBUF(hash), 1);   // hex render
trace(SBUF("note"), SBUF("started"), 0);  // text render
```

**Related APIs.** [`trace_num`](trace_num.md), [`trace_float`](trace_float.md),
and the [`TRACEHEX`/`TRACESTR`](../../macros/tracing.md) convenience macros.
