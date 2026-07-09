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

## Related documents

- [Documentation index](../README.md)
- [Emit APIs](../api-reference/emit/README.md)
- [Emitted transaction example](../examples/emitted-transaction.md)
