# Xahau Hooks: C/WASM API Documentation

Xahau Hooks are small WebAssembly programs attached to accounts. They run
on-ledger whenever a transaction touches the account they are installed on, and
they can read the originating transaction, read and write persistent state, read
ledger objects, emit new transactions, and ultimately `accept` (apply) or
`rollback` (reject) the transaction.

This doc set describes the **C / WebAssembly Hook API** as it exists in this
repository (branch `dev`). Every claim here is grounded in repository source —
primarily `hook/extern.h`, `hook/error.h`, `hook/macro.h`, `hook/hookapi.h`,
`include/xrpl/hook/Enum.h`, `include/xrpl/hook/hook_api.macro`, the Hook
execution engine under `src/xrpld/app/hook/`, and the example hooks embedded in
`src/test/app/SetHook_test.cpp`.

**Who this is for:** developers writing Hook smart contracts in C, and anyone
who needs an accurate reference for the 75 Hook API functions, their error
codes, and the execution model.

## Table of contents

| Document | Description |
|---|---|
| [overview.md](overview.md) | Conceptual foundation: what Hooks are, entry points, execution modes, environment limits, and the typical processing flow. |
| [sethook-fields/](sethook-fields/README.md) | `SetHook` fields that control hook triggering and permissions: `HookOn`, `HookOnIncoming`, `HookOnOutgoing`, `HookCanEmit`, `HookName`. |
| [glossary.md](glossary.md) | Alphabetical glossary of Hook terminology (Slot, Keylet, XFL, Namespace, Grant, Burden, TSH, and more). |
| [xfl.md](xfl.md) | XFL concept page: the fixed-precision floating-point format's bit encoding, valid range, and relationship to the ledger's `Amount` format. |
| [macros/](macros/README.md) | Helper macros from `hook/macro.h`: control flow, guards, buffer helpers, integer conversion, comparison. |
| [tools/](tools/README.md) | Community tooling for building Hooks, including the Transaction Builder code generator and the Binary Visualizer. |
| [best-practices.md](best-practices.md) | Practical guidance: guarding loops, buffer sizing, state and reserve management, error handling. |

### API reference, by group

| Group | Description |
|---|---|
| [api-reference/control/](api-reference/control/README.md) | Control functions: `_g`, `accept`, `rollback`, `hook_account`, `hook_hash`, `hook_param`, `hook_param_set`, `hook_again`, `hook_skip`, `hook_pos`. |
| [api-reference/transaction/](api-reference/transaction/README.md) | Originating-transaction functions: `otxn_field`, `otxn_id`, `otxn_type`, `otxn_slot`, `otxn_param`, `otxn_burden`, `otxn_generation`. |
| [api-reference/state/](api-reference/state/README.md) | Hook state: `state`, `state_set`, `state_foreign`, `state_foreign_set`. |
| [api-reference/slot/](api-reference/slot/README.md) | The slot system: `slot_set`, `slot*`, `meta_slot`, `xpop_slot`. |
| [api-reference/ledger/](api-reference/ledger/README.md) | Ledger info: `ledger_*`, `fee_base`. |
| [api-reference/emit/](api-reference/emit/README.md) | Emitting transactions: `etxn_*`, `prepare`, `emit`. |
| [api-reference/float/](api-reference/float/README.md) | XFL floating-point math and amount serialization: `float_*`. |
| [api-reference/utility/](api-reference/utility/README.md) | Cryptography, address conversion, and keylet computation: `util_*`. |
| [api-reference/sto/](api-reference/sto/README.md) | Serialized-object (STO) inspection/editing: `sto_*`. |
| [api-reference/trace/](api-reference/trace/README.md) | Debug tracing: `trace*`. |

### Worked examples

| Document | Description |
|---|---|
| [examples/payment-filter.md](examples/payment-filter.md) | Worked example: inspect an incoming Payment and accept or rollback. |
| [examples/state-counter.md](examples/state-counter.md) | Worked example: read/increment/write a counter in hook state. |
| [examples/emitted-transaction.md](examples/emitted-transaction.md) | Worked example: reserve, prepare, and emit a transaction. |
| [examples/foreign-state.md](examples/foreign-state.md) | Worked example: read another account's state via `state_foreign`. |
| [examples/memo-routing.md](examples/memo-routing.md) | Worked example: route behavior based on transaction memos/parameters. |

## Suggested reading order

For newcomers, read in this order:

1. [overview.md](overview.md) — the model and vocabulary.
2. [api-reference/control/](api-reference/control/README.md) — how a hook starts, guards loops, and terminates.
3. [api-reference/transaction/](api-reference/transaction/README.md) — how to read the transaction that triggered the hook.
4. [api-reference/state/](api-reference/state/README.md) — how to persist data.
5. The [examples/](examples/) — end-to-end hooks that tie it together.

Keep [glossary.md](glossary.md) and [macros/](macros/README.md) open alongside the
above; both are lookup references rather than linear reading.

## Reference use

Experienced developers can jump straight to the relevant `api-reference/*` page.
Each function is documented with its exact C signature from `hook/extern.h`, its
parameters, return convention, and error codes. The full error-code table lives
in [overview.md](overview.md) and is repeated per function where relevant.

## Source of truth

These documents were derived from the following repository sources (repo root
`https://github.com/Xahau/xahaud`):

- `hook/extern.h` — canonical developer-facing declarations of all 75 API functions.
- `hook/error.h` — developer-facing error `#define`s.
- `hook/macro.h` — helper macros.
- `hook/hookapi.h` — top-level include; `KEYLET_*` and `COMPARE_*` constants.
- `hook/sfcodes.h`, `hook/tts.h`, `hook/ls_flags.h`, `hook/tx_flags.h` — field, transaction-type, and flag codes.
- `include/xrpl/hook/Enum.h` — `hook_return_code` enum, limits, keylet codes, exit types, HookSet log codes, SetHook operations/flags.
- `include/xrpl/hook/hook_api.macro` — WasmEdge registration and amendment gating (`featureHooksUpdate1`, `featureHooksUpdate2`).
- `include/xrpl/hook/Guard.h` — guard validation rules.
- `src/xrpld/app/hook/applyHook.h` and `src/xrpld/app/hook/detail/applyHook.cpp` — the Hook execution engine.
- `src/test/app/SetHook_test.cpp` — real example hooks (between the `R"[test.hook](` and `)[test.hook]"` markers).
- `src/test/app/build_test_hooks.sh` — the test-hook compilation pipeline.

The consolidated, cross-checked inventory these docs build on is
`.claude/plans/hook-docs/api-inventory.md`.

## Related documents

- [overview.md](overview.md)
- [sethook-fields/](sethook-fields/README.md)
- [glossary.md](glossary.md)
- [xfl.md](xfl.md)
- [macros/](macros/README.md)
- [tools/](tools/README.md)
- [best-practices.md](best-practices.md)
- [api-reference/control/](api-reference/control/README.md)
- [api-reference/transaction/](api-reference/transaction/README.md)
- [api-reference/state/](api-reference/state/README.md)
- [api-reference/slot/](api-reference/slot/README.md)
- [api-reference/ledger/](api-reference/ledger/README.md)
- [api-reference/emit/](api-reference/emit/README.md)
- [api-reference/float/](api-reference/float/README.md)
- [api-reference/utility/](api-reference/utility/README.md)
- [api-reference/sto/](api-reference/sto/README.md)
- [api-reference/trace/](api-reference/trace/README.md)
- [examples/payment-filter.md](examples/payment-filter.md)
- [examples/state-counter.md](examples/state-counter.md)
- [examples/emitted-transaction.md](examples/emitted-transaction.md)
- [examples/foreign-state.md](examples/foreign-state.md)
- [examples/memo-routing.md](examples/memo-routing.md)
