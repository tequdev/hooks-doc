---
sidebarTitle: "Tools"
---

# Tools

Third-party and community tools that help you build Xahau Hooks.

## Available tools

- **[Transaction Builder](tx-builder.md)** — paste a transaction JSON (e.g.
  `{ "TransactionType": "AccountSet" }`) and it generates ready-to-paste C code
  for building and emitting that transaction from a hook: a pre-laid-out
  `uint8_t txn[N]` template, `*_OUT` pointer macros for each mutable field, and
  a `PREPARE_TXN()` macro that fills in the fixed emit fields. Live at
  <https://tx-builder.xahau.tools/>.
- **[Binary Visualizer](binary-visualizer.md)** — paste a serialized blob (hex,
  base64, or JSON) — a transaction, ledger entry, or manifest — and it walks
  the bytes field by field, showing each field's type-code, field-code, and
  payload, with a dedicated bit-level breakdown for `Amount` fields. Live at
  <https://binary-visualizer.xahau.tools/>.

## Related documents

- [Documentation index](../README.md)
- [Emit APIs](../api-reference/emit/README.md)
- [Emitted transaction example](../examples/emitted-transaction.md)
