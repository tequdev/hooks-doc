---
sidebarTitle: "Tracing"
---

# Tracing helpers

Debug-only wrappers over [`trace`](../api-reference/trace/trace.md),
[`trace_num`](../api-reference/trace/trace_num.md) and
[`trace_float`](../api-reference/trace/trace_float.md). Each **stringizes the variable
name** as the label, so the log shows the source identifier next to its value. All four
are gated on `DEBUG`, so they vanish entirely under `-DNDEBUG`.

```c
#define TRACEVAR(v)  if (DEBUG) trace_num(#v, sizeof(#v)-1, (int64_t)v);
#define TRACEHEX(v)  if (DEBUG) trace(#v, sizeof(#v)-1, v, sizeof(v), 1);
#define TRACEXFL(v)  if (DEBUG) trace_float(#v, sizeof(#v)-1, (int64_t)v);
#define TRACESTR(v)  if (DEBUG) trace(#v, sizeof(#v)-1, v, sizeof(v), 0);
```

(Abbreviated above; the real definitions add the exact casts.)

| Macro | Logs | Argument should be |
|---|---|---|
| `TRACEVAR(v)` | label + signed integer | an integer variable |
| `TRACEHEX(v)` | label + hex dump of the buffer | an array (uses `sizeof(v)`) |
| `TRACEXFL(v)` | label + XFL float | an `int64_t` XFL value |
| `TRACESTR(v)` | label + text | an array of text (uses `sizeof(v)`) |

```c
int64_t balance = 100;
TRACEVAR(balance);      // logs: balance: 100

uint8_t acc[20];
hook_account(acc, 20);
TRACEHEX(acc);          // logs: acc: <40 hex chars>
```

**Expression/statement note:** each expands to a bare `if (DEBUG) ...;`. Do not follow
one with an `else` on your own `if` — the trailing `if` will capture it. **`sizeof`
pitfall:** `TRACEHEX`/`TRACESTR` use `sizeof(v)` for the data length, so `v` must be an
array, not a pointer. Do not rely on trace output on validators — see the note under
[`trace`](../api-reference/trace/trace.md); these are inert above trace log level.
