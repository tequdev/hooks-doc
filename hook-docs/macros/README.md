# Helper Macros (`hook/macro.h`)

`hook/macro.h` is an **optional** convenience header. Its first comment says so
directly: *"all of them are optional as is including macro.h at all."* Every macro
here expands to plain calls against the API documented in
[api-reference/](../api-reference/control/README.md) — nothing in this file is a distinct runtime
capability. You can use the macros, ignore them, or copy the ones you like into your
own project. In fact many of the hooks embedded in `src/test/app/SetHook_test.cpp`
re-`#define` a handful of these locally (their own `SBUF`, `GUARD`, `BUFFER_EQUAL_32`)
rather than including the whole header, which is a perfectly good pattern when you want
a self-contained single-file hook.

Including the header pulls in `hookapi.h` and `sfcodes.h` as well, so the `sf*` field
codes and `KEYLET_*` constants become available alongside the macros.

Two cross-cutting things to know before the catalog:

- **Statement macros vs. expression macros.** Some macros expand to a `{ ... }` block
  (a *statement*) and some expand to a value (an *expression*). A statement macro
  cannot be used where a value is expected (e.g. inside an `if (...)` condition or an
  assignment), and — because the block is not wrapped in a `do { } while(0)` — you
  should not put a `;`-sensitive construct like a dangling `else` immediately after it.
  Each entry below states which kind it is.
- **`sizeof` and `SBUF`.** Several macros (`SBUF`, `DONEMSG`, `NOPE`, the
  `BUFFER_EQUAL_STR*` family) call `sizeof` on their argument. That gives the array
  length only for a real array or string literal. On a *pointer* `sizeof` yields 4 (the
  WASM pointer width), not the buffer length — so `SBUF(ptr)` is almost always a bug.
  This pitfall is called out on each affected macro.

The `DEBUG` flag at the top of the header controls the `TRACE*` macros: it is `1`
unless `NDEBUG` is defined, in which case it is `0` and the trace macros compile to
nothing.

---

## Index

| Page | Covers |
|---|---|
| [Control flow: accept / rollback / assert](control-flow.md) | `DONEEMPTY`, `DONEMSG`, `DONE`, `ASSERT`, `NOPE`, `REQUIRE` |
| [Guards](guards.md) | `GUARD`, `GUARDM` |
| [Buffer pair helpers](buffer-helpers.md) | `SBUF`, `SVAR`, `CLEARBUF`, `BUFFER_SWAP` |
| [Report-buffer builders](report-buffers.md) | `RBUF`, `RBUF2` |
| [Tracing helpers](tracing.md) | `TRACEVAR`, `TRACEHEX`, `TRACEXFL`, `TRACESTR` |
| [Buffer comparison](buffer-comparison.md) | `BUFFER_EQUAL_20`/`_32`/`_64`, `BUFFER_EQUAL_GUARD`, `BUFFER_EQUAL_STR*`, `ACCOUNT_COMPARE` |
| [Integer ↔ buffer (big-endian)](integer-conversion.md) | `UINT*_TO_BUF`/`_FROM_BUF`, `INT64_TO_BUF`/`_FROM_BUF`, `BYTES20`/`BYTES32` copies, `FLIP_ENDIAN_*` |
| [Amount and STO helpers](amount-and-sto.md) | `AMOUNT_TO_DROPS`, `SUB_OFFSET`/`SUB_LENGTH` |
| [Constants defined in `macro.h`](constants.md) | `tfCANONICAL`, account-type (`at*`) and amount-type (`am*`) selectors |
| [Recommended patterns](patterns.md) | Idioms combining the macros above, lifted from the test hooks |
| [Proposed helpers (not in the repository)](proposed-helpers.md) | `REQUIRE_LEN`, `CHECK` — suggested, not shipped |

## Related documents

- [Documentation index](../README.md)
- [Overview](../overview.md) and [Glossary](../glossary.md) — error-code table and Amount/STO
  serialization background
- [Best practices](../best-practices.md) — guarding rules, resource limits, hook structure
- API reference:
  [control](../api-reference/control/README.md),
  [transaction](../api-reference/transaction/README.md),
  [state](../api-reference/state/README.md),
  [ledger and slot](../api-reference/slot/README.md),
  [emit and etxn](../api-reference/emit/README.md),
  [float and amount](../api-reference/float/README.md),
  [utility](../api-reference/utility/README.md) — `SBUF`, `SUB_OFFSET`/`SUB_LENGTH`, `TRACE*`,
  and STO helpers in context
- Worked examples:
  [payment filter](../examples/payment-filter.md),
  [state counter](../examples/state-counter.md),
  [emitted transaction](../examples/emitted-transaction.md),
  [foreign state](../examples/foreign-state.md),
  [memo routing](../examples/memo-routing.md)
