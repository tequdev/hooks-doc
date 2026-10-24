---
layout: home
hero:
  name: Xahau Hooks
  text: C / WebAssembly API Documentation
  tagline: Small WebAssembly programs attached to accounts. They run on-ledger when a transaction touches the account, read the originating transaction and ledger, keep persistent state, emit transactions, and accept or rollback.
  actions:
    - theme: brand
      text: Start with the overview
      link: /overview
    - theme: alt
      text: API reference
      link: /api-reference/control/
    - theme: alt
      text: Examples
      link: /examples/payment-filter
features:
  - title: Grounded in source
    details: Every claim is traced to the xahaud repository (branch dev) - hook/extern.h, hook/error.h, hook/macro.h, the execution engine, and the test-suite example hooks.
  - title: 75 API functions
    details: Exact C signatures, parameters, return conventions, and error codes for every host function a hook can import, grouped by purpose.
  - title: Worked examples
    details: End-to-end hooks for payment filtering, state counters, memo routing, foreign state, and emitted transactions.
---

**Who this is for:** developers writing Hook smart contracts in C, and anyone
who needs an accurate reference for the 75 Hook API functions, their error
codes, and the execution model.

## Table of contents

| Document | Description |
|---|---|
| [Overview: The Xahau Hook Model](overview.md) | Conceptual foundation: what Hooks are, entry points, execution modes, environment limits, and the typical processing flow. |
| [SetHook Fields](sethook-fields/README.md) | `SetHook` fields that control hook triggering and permissions: `HookOn`, `HookOnIncoming`, `HookOnOutgoing`, `HookCanEmit`, `HookName`. |
| [Transactional Stake Holders (TSH)](tsh.md) | Transactional Stake Holders: strong vs. weak TSH, the two-condition gate for weak-TSH ("collect call") execution, and a per-transaction-type TSH table. |
| [Glossary](glossary.md) | Alphabetical glossary of Hook terminology (Slot, Keylet, XFL, Namespace, Grant, Burden, TSH, and more). |
| [XFL: Xahau's Fixed-Precision Floating-Point Format](xfl.md) | XFL concept page: the fixed-precision floating-point format's bit encoding, valid range, and relationship to the ledger's `Amount` format. |
| [NOP Bytes: Skippable Padding in Serialized Objects](nop-bytes.md) | The `0x99` NOP byte Xahau's deserializer skips: its rules and limits, which Hook APIs honor it, and how to use it for optional and variable-length fields in an emitted-transaction template. |
| [Helper Macros (`hook/macro.h`)](macros/README.md) | Helper macros from `hook/macro.h`: control flow, guards, buffer helpers, integer conversion, comparison. |
| [Tools](tools/README.md) | Community tooling for building Hooks, including the Transaction Builder code generator and the Binary Visualizer. |
| [Hook Best Practices](best-practices.md) | Practical guidance: guarding loops, buffer sizing, state and reserve management, error handling. |

### API reference, by group

| Group | Description |
|---|---|
| [Control APIs](api-reference/control/README.md) | Control functions: `_g`, `accept`, `rollback`, `hook_account`, `hook_hash`, `hook_param`, `hook_param_set`, `hook_again`, `hook_skip`, `hook_pos`. |
| [Transaction APIs](api-reference/transaction/README.md) | Originating-transaction functions: `otxn_field`, `otxn_id`, `otxn_type`, `otxn_slot`, `otxn_param`, `otxn_burden`, `otxn_generation`. |
| [State APIs](api-reference/state/README.md) | Hook state: `state`, `state_set`, `state_foreign`, `state_foreign_set`. |
| [Slot APIs](api-reference/slot/README.md) | The slot system: `slot_set`, `slot*`, `meta_slot`, `xpop_slot`. |
| [Ledger APIs](api-reference/ledger/README.md) | Ledger info: `ledger_*`, `fee_base`. |
| [Emit and Emitted-Transaction APIs](api-reference/emit/README.md) | Emitting transactions: `etxn_*`, `prepare`, `emit`. |
| [Float and Amount APIs](api-reference/float/README.md) | XFL floating-point math and amount serialization: `float_*`. |
| [Utility APIs](api-reference/utility/README.md) | Cryptography, address conversion, and keylet computation: `util_*`. |
| [STO APIs](api-reference/sto/README.md) | Serialized-object (STO) inspection/editing: `sto_*`. |
| [Trace APIs](api-reference/trace/README.md) | Debug tracing: `trace*`. |

### Worked examples

| Document | Description |
|---|---|
| [Example: Payment Filter](examples/payment-filter.md) | Worked example: inspect an incoming Payment and accept or rollback. |
| [Example: State Counter](examples/state-counter.md) | Worked example: read/increment/write a counter in hook state. |
| [Example: Emitting a Transaction](examples/emitted-transaction.md) | Worked example: reserve, prepare, and emit a transaction. |
| [Example: Foreign State](examples/foreign-state.md) | Worked example: read another account's state via `state_foreign`. |
| [Example: Memo Routing](examples/memo-routing.md) | Worked example: route behavior based on transaction memos/parameters. |

## Suggested reading order

For newcomers, read in this order:

1. [Overview](overview.md) — the model and vocabulary.
2. [Control APIs](api-reference/control/README.md) — how a hook starts, guards loops, and terminates.
3. [Transaction APIs](api-reference/transaction/README.md) — how to read the transaction that triggered the hook.
4. [State APIs](api-reference/state/README.md) — how to persist data.
5. The [Examples](examples/) — end-to-end hooks that tie it together.

Keep [Glossary](glossary.md) and [Helper Macros](macros/README.md) open alongside the
above; both are lookup references rather than linear reading.

## Reference use

Experienced developers can jump straight to the relevant `api-reference/*` page.
Each function is documented with its exact C signature from `hook/extern.h`, its
parameters, return convention, and error codes. The full error-code table lives
in [Overview](overview.md) and is repeated per function where relevant.

## Source of truth

These documents were derived from the developer-facing Hook API headers
(repo root `https://github.com/Xahau/xahaud`):

- `hook/extern.h` — canonical developer-facing declarations of all 75 API functions.
- `hook/error.h` — developer-facing error `#define`s.
- `hook/macro.h` — helper macros.
- `hook/hookapi.h` — top-level include; `KEYLET_*` and `COMPARE_*` constants.
- `hook/sfcodes.h`, `hook/tts.h`, `hook/ls_flags.h`, `hook/tx_flags.h` — field, transaction-type, and flag codes.

The `hook_return_code` enum, limits, keylet codes, exit types, HookSet log
codes, SetHook operations/flags, guard-validation rules, amendment gating
(`featureHooksUpdate1`, `featureHooksUpdate2`), and the Hook execution engine
itself round out the picture, and the example hooks referenced throughout
this doc set come from the project's own test suite.
<!--
- `include/xrpl/hook/Enum.h` — `hook_return_code` enum, limits, keylet codes, exit types, HookSet log codes, SetHook operations/flags.
- `include/xrpl/hook/hook_api.macro` — WasmEdge registration and amendment gating (`featureHooksUpdate1`, `featureHooksUpdate2`).
- `include/xrpl/hook/Guard.h` — guard validation rules.
- `src/xrpld/app/hook/applyHook.h` and `src/xrpld/app/hook/detail/applyHook.cpp` — the Hook execution engine.
- `src/test/app/SetHook_test.cpp` — real example hooks (between the `R"[test.hook](` and `)[test.hook]"` markers).
- `src/test/app/build_test_hooks.sh` — the test-hook compilation pipeline.
-->

The consolidated, cross-checked inventory these docs build on is
`.claude/plans/hook-docs/api-inventory.md`.

## Related documents

- [Overview: The Xahau Hook Model](overview.md)
- [SetHook Fields](sethook-fields/README.md)
- [Transactional Stake Holders (TSH)](tsh.md)
- [Glossary](glossary.md)
- [XFL: Xahau's Fixed-Precision Floating-Point Format](xfl.md)
- [NOP Bytes: Skippable Padding in Serialized Objects](nop-bytes.md)
- [Helper Macros (`hook/macro.h`)](macros/README.md)
- [Tools](tools/README.md)
- [Hook Best Practices](best-practices.md)
- [Control APIs](api-reference/control/README.md)
- [Transaction APIs](api-reference/transaction/README.md)
- [State APIs](api-reference/state/README.md)
- [Slot APIs](api-reference/slot/README.md)
- [Ledger APIs](api-reference/ledger/README.md)
- [Emit and Emitted-Transaction APIs](api-reference/emit/README.md)
- [Float and Amount APIs](api-reference/float/README.md)
- [Utility APIs](api-reference/utility/README.md)
- [STO APIs](api-reference/sto/README.md)
- [Trace APIs](api-reference/trace/README.md)
- [Example: Payment Filter](examples/payment-filter.md)
- [Example: State Counter](examples/state-counter.md)
- [Example: Emitting a Transaction](examples/emitted-transaction.md)
- [Example: Foreign State](examples/foreign-state.md)
- [Example: Memo Routing](examples/memo-routing.md)
