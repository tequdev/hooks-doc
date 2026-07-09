---
sidebarTitle: "Overview"
---

# Overview: The Xahau Hook Model

## What Hooks are

A **Hook** is a WebAssembly program installed on a Xahau account. When a
transaction affects that account, the Hook runs on-ledger as part of applying
the transaction. During its run a Hook can:

- read the **originating transaction** that triggered it (the `otxn_*` family),
- read and write **persistent state** scoped to the account and a namespace (the `state*` family),
- read **ledger objects** (accounts, trustlines, offers, escrows, and more) through **slots** and **keylets**,
- **emit** brand-new transactions to be applied later (the `etxn_*` / `emit` family),
- do **XFL** fixed-precision floating-point math (the `float_*` family),
- and finally **`accept`** the transaction (allowing it to apply) or **`rollback`** it (rejecting it).

The Hook API is the set of host functions the WASM module imports from the
`env` module to do all of the above. There are **75** such functions available
to a hook, registered with the WasmEdge runtime.
<!-- declared in hook/extern.h; registered with the WasmEdge runtime in include/xrpl/hook/hook_api.macro -->

## Entry points

A Hook WASM module exports at most two functions, both verified in the execution
engine, which looks up the exports named `"hook"` and `"cbak"`:
<!-- src/xrpld/app/hook/applyHook.h -->

```c
// Main entry point. Called when a transaction touches the hook account.
// reserved: 0 = strong execution, 1 = weak (collect-call/TSH) execution,
// 2 = again-as-weak (post-apply re-run requested via hook_again()).
int64_t hook(uint32_t reserved);

// Callback entry point. Called to report the result of a transaction this
// hook previously emitted. Optional — only needed if the hook emits.
// reserved: 0 = the emitted transaction was accepted, 1 = emit failure.
int64_t cbak(uint32_t reserved);
```
<!-- src/xrpld/app/tx/detail/Transactor.cpp:1426 (`(strong ? 0 : 1UL), // 0 = strong, 1 = weak`), :1891 (`2UL, // param 2 = aaw`), :1584 (`ctx_.tx.getTxnType() == ttEMIT_FAILURE ? 1UL : 0UL`); the value is passed as the WASM call argument at src/xrpld/app/hook/applyHook.h:439 (`WasmEdge_Value params[1] = {WasmEdge_ValueGenI32((int64_t)wasmParam)}`). See [tsh.md](tsh.md) for the full strong/weak/AAW model. -->

Both must return `int64_t`. A Hook must export `memory` and the `hook` function;
`cbak` is only required if the hook uses callbacks. (The HookSet validator emits
diagnostic log codes such as `EXPORT_HOOK_FUNC` and `EXPORT_CBAK_FUNC` when the
exported signatures are wrong.)
<!-- include/xrpl/hook/Enum.h -->

Neither `hook` nor `cbak` "returns" a result to the ledger in the usual sense —
a Hook terminates by calling `accept()` or `rollback()`, which never return.

## Execution modes

The execution engine distinguishes three modes:
<!-- relevant fields live on the HookContext/HookResult types in src/xrpld/app/hook/applyHook.h -->

- **Strong** — the hook runs **before** the originating transaction is applied.
  A strong hook can `rollback()` to reject the transaction. (Internally
  tracked via `isStrong`; the emission flag is `hefSTRONG = 0x1`.)
  <!-- isStrong in applyHook.h; hefSTRONG = 0x1 in Enum.h -->
- **Weak** — a strong pre-apply hook may call **`hook_again()`** to request an
  additional **post-apply** re-execution: a strong pre-apply hook can
  nominate additional weak post-apply execution. A weak execution observes
  the already-applied result and cannot roll it back.
  <!-- header comment on executeAgainAsWeak in applyHook.h: "hook_again allows strong pre-apply to nominate additional weak post-apply execution." -->
- **Callback** — when a transaction the hook emitted resolves, the engine calls
  `cbak` (emission flag `hefCALLBACK = 0x2`). If the emitted transaction
  failed, the callback is told so.
  <!-- isCallback flag in applyHook.h; hefCALLBACK = 0x2; emitFailure in applyHook.h -->

Which accounts a hook fires for is governed by the **TSH** (Transactional Stake
Holder) mechanism and its flags (`tshROLLBACK`, `tshCOLLECT`, `tshMIXED`). See
[glossary.md](glossary.md) for TSH.
<!-- tshROLLBACK, tshCOLLECT, tshMIXED in Enum.h -->

## Execution environment constraints

These are the enforced execution environment limits:
<!-- taken from include/xrpl/hook/Enum.h -->

| Constraint | Value |
|---|---|
| Max WASM size | 65,535 bytes (`0xFFFF`) |
| Max hooks per account (chain length) | 10 |
| Max namespaces per account | 256 |
| Max entries removed per namespace-delete | 256 |
| Max parameter key size | 32 bytes |
| Max parameter value size | 256 bytes |
| Max hook state scale | 16 |
| Max hook state value size | `256 × scale` (256 min, up to 4096) |
| Max slots | 255 |
| Max nonces | 255 |
| Max emitted transactions | 255 |
| Max hook parameters | 16 |
| Max state modifications (per hook) | 256 |

<!--
Source (Enum.h), by constraint:
- Max WASM size: maxHookWasmSize()
- Max hooks per account (chain length): maxHookChainLength()
- Max namespaces per account: maxNamespaces()
- Max entries removed per namespace-delete: maxNamespaceDelete()
- Max parameter key size: maxHookParameterKeySize()
- Max parameter value size: maxHookParameterValueSize()
- Max hook state scale: maxHookStateScale()
- Max hook state value size: maxHookStateDataSize()
- Max slots: max_slots
- Max nonces: max_nonce
- Max emitted transactions: max_emit
- Max hook parameters: max_params
- Max state modifications (per hook): max_state_modifications
-->

There is a single 256-entry limit, enforced at two points: the state-write
API returns `TOO_MANY_STATE_MODIFICATIONS` (`-44`) once a hook execution's
own modified-entry count reaches 256, and the finalize step returns
`tecHOOK_REJECTED` if the accumulated changes across the combined hook
chains exceed the same 256.
<!-- include/xrpl/hook/Enum.h:397 (max_state_modifications = 256); enforced at src/xrpld/app/hook/detail/HookAPI.cpp:2743-2744 and src/xrpld/app/hook/detail/applyHook.cpp:1392-1398. Editor note: the `-44` error's source comment at Enum.h:385 says "more than 5000 modified state entries" — that figure is a stale comment on the enum value and does not correspond to any enforced constant; do not "correct" the 256 figure above back to 5000 based on that comment. -->

**Loops must be guarded.** Every loop in a hook must call `_g(guard_id, maxiter)`
at its top. The HookSet validator, with log codes `GUARD_IMPORT` and
`GUARD_MISSING`, rejects hooks whose loops are not properly guarded. At
runtime, exceeding a guard's iteration count returns `GUARD_VIOLATION`
(`-16`). The guard rules are versioned by amendments: `GuardRuleFix20250131`
and `GuardRuleDepth32`, gated by `fix20250131` and `fixGuardDepth32`. See
[compiling.md](compiling.md) for the full validator behavior.
<!-- include/xrpl/hook/Guard.h; GUARD_IMPORT, GUARD_MISSING in Enum.h; getGuardRulesVersion in Enum.h. GUARD_PARAMETERS (Enum.h:181) is defined but not raised by any code path in this checkout — grep of src/ and include/ finds only its own definition. -->

## Data available inside a hook

- **The originating transaction** — read fields with `otxn_field`, its type with
  `otxn_type`, its hash with `otxn_id`, and any carried `HookParameter` with
  `otxn_param`. See [api-reference/transaction.md](api-reference/transaction/README.md).
- **Ledger objects** — compute a **keylet** (`util_keylet`, or one of the
  `KEYLET_*` constants) and load the object into a **slot** with `slot_set`, then
  drill into subfields with `slot_subfield`/`slot_subarray`. See
  [api-reference/ledger-and-slot.md](api-reference/slot/README.md).
- **Hook state** — key/value storage under the hook account and a namespace via
  `state`/`state_set` (and the foreign variants). See
  [api-reference/state.md](api-reference/state/README.md).
- **Parameters** — install-time parameters via `hook_param`; parameters attached
  to the originating transaction via `otxn_param`.
- **Ledger info** — sequence (`ledger_seq`), last-close time (`ledger_last_time`),
  last hash (`ledger_last_hash`), base fee (`fee_base`).

## Typical processing flow

The common shape of a hook is:

1. Read fields off the originating transaction and validate them.
2. Read (and possibly write) hook state.
3. Optionally reserve and emit transactions.
4. Terminate with `accept()` (apply) or `rollback()` (reject).

### A minimal annotated hook

This is the smallest meaningful hook: it inspects nothing and simply accepts.

```c
#include "hookapi.h"

// Main entry point. `reserved` is 0 here because this hook only runs strong.
int64_t hook(uint32_t reserved)
{
    // Read the account this hook is installed on into a 20-byte buffer.
    uint8_t acc[20];
    hook_account(SBUF(acc));           // SBUF(x) expands to (x, sizeof(x))

    // Emit a debug trace of the account id (as hex) to the node's log.
    TRACEHEX(acc);

    // Terminate: apply the originating transaction. The second argument is a
    // return/exit code recorded in the transaction metadata.
    accept(SBUF("done"), 0);           // never returns

    // Unreachable, but the C compiler wants a return.
    return 0;
}
```

`SBUF`, `TRACEHEX`, and the other helpers are documented in
[macros.md](macros/README.md).

## Core concepts

- **`accept()` vs `rollback()`** — both terminate the hook immediately and do not
  return. `accept()` lets the originating transaction proceed; `rollback()`
  rejects it and reverts any state changes the hook made. Internally these map to
  the `ExitType::ACCEPT` and `ExitType::ROLLBACK` values, and to the return
  sentinels `RC_ACCEPT` (`-20`) / `RC_ROLLBACK` (`-19`).
  <!-- Enum.h -->
- **`_g` guard** — the required loop guard; see the environment constraints above
  and [api-reference/control.md](api-reference/control/README.md).
- **`trace*` debugging** — `trace`, `trace_num`, and `trace_float` write to the
  node's debug log (subject to build/log configuration). See
  [api-reference/utility.md](api-reference/trace/README.md).
- **Error convention** — API functions return `int64_t`. A value `>= 0` is
  success (often a length or a computed value); a **negative** value is an error
  code from the table below. `accept`/`rollback` are the exceptions: they never
  return.

## Error codes

The error codes a Hook API function can return are the following named values
(`hook_api::hook_return_code`), also available as `#define`s for use in C hooks.
<!-- authoritative enum is hook_api::hook_return_code in include/xrpl/hook/Enum.h; hook/error.h mirrors the same names as #define's -->

| Name | Value | Meaning |
|---|---|---|
| `SUCCESS` | 0 | Success (values `> 0` may carry a payload such as a length). |
| `OUT_OF_BOUNDS` | -1 | Could not read/write a pointer the hook supplied. |
| `INTERNAL_ERROR` | -2 | Internal error (e.g. a corrupt directory). |
| `TOO_BIG` | -3 | Value you tried to store was too big. |
| `TOO_SMALL` | -4 | Value you tried to store/provide was too small. |
| `DOESNT_EXIST` | -5 | Requested thing was not found. |
| `NO_FREE_SLOTS` | -6 | No free slot (max 255). |
| `INVALID_ARGUMENT` | -7 | Invalid argument. |
| `ALREADY_SET` | -8 | A one-time parameter was already set. |
| `PREREQUISITE_NOT_MET` | -9 | A required parameter was not set first. |
| `FEE_TOO_LARGE` | -10 | Operation would produce an absurd fee. |
| `EMISSION_FAILURE` | -11 | Emitted transaction was not accepted. |
| `TOO_MANY_NONCES` | -12 | Exceeded the nonce limit. |
| `TOO_MANY_EMITTED_TXN` | -13 | Emitted more than reserved. |
| `NOT_IMPLEMENTED` | -14 | API reserved for a future version. |
| `INVALID_ACCOUNT` | -15 | Expected an account id, got something else. |
| `GUARD_VIOLATION` | -16 | A guarded loop/function exceeded its max iterations. |
| `INVALID_FIELD` | -17 | Requested field is `sfInvalid`. |
| `PARSE_ERROR` | -18 | Asked to parse invalid content. |
| `RC_ROLLBACK` | -19 | Terminate due to a `rollback()` call. |
| `RC_ACCEPT` | -20 | Terminate due to an `accept()` call. |
| `NO_SUCH_KEYLET` | -21 | Invalid keylet or keylet type. |
| `NOT_AN_ARRAY` | -22 | Count requested on a non-array. |
| `NOT_AN_OBJECT` | -23 | Subfield requested from a non-object. |
| `INVALID_FLOAT` | -10024 | Sentinel that can never be a valid exponent (note: not -24). |
| `DIVISION_BY_ZERO` | -25 | Division by zero. |
| `MANTISSA_OVERSIZED` | -26 | Mantissa too large. |
| `MANTISSA_UNDERSIZED` | -27 | Mantissa too small. |
| `EXPONENT_OVERSIZED` | -28 | Exponent too large. |
| `EXPONENT_UNDERSIZED` | -29 | Exponent too small. |
| `XFL_OVERFLOW` | -30 | A float operation overflowed. |
| `NOT_IOU_AMOUNT` | -31 | Amount was not an IOU amount. |
| `NOT_AN_AMOUNT` | -32 | Value was not an amount. |
| `CANT_RETURN_NEGATIVE` | -33 | Cannot return a negative value. |
| `NOT_AUTHORIZED` | -34 | Not authorized (e.g. foreign state without a grant). |
| `PREVIOUS_FAILURE_PREVENTS_RETRY` | -35 | A previous failure prevents retry. |
| `TOO_MANY_PARAMS` | -36 | Too many parameters. |
| `INVALID_TXN` | -37 | Invalid transaction. |
| `RESERVE_INSUFFICIENT` | -38 | A new state object would exceed the account reserve. |
| `COMPLEX_NOT_SUPPORTED` | -39 | Complex operation not supported. |
| `DOES_NOT_MATCH` | -40 | Two keylets required to match by type did not. |
| `INVALID_KEY` | -41 | User-supplied key was not valid. |
| `NOT_A_STRING` | -42 | Missing NUL terminator on a string argument. |
| `MEM_OVERLAP` | -43 | Two specified buffers overlap in memory. |
| `TOO_MANY_STATE_MODIFICATIONS` | -44 | Exceeded the 256-entry state-modification limit (see [Execution environment constraints](#execution-environment-constraints) above). |
| `TOO_MANY_NAMESPACES` | -45 | Exceeded the namespace limit. |

Note the deliberate gap: the sequence goes `-23`, then `INVALID_FLOAT = -10024`,
then `-25`; the value `-24` is unused.

## Execution results in transaction metadata

Each hook execution is recorded in the transaction's metadata. The engine builds
an `sfHookExecution` object and collects them into an `sfHookExecutions` array.
The fields set on each `sfHookExecution` object are:
<!-- src/xrpld/app/hook/detail/applyHook.cpp, around line 1566 -->

- `sfHookResult` — the exit type (`ExitType`: `ACCEPT`, `ROLLBACK`, `WASM_ERROR`).
- `sfHookAccount` — the account the hook that produced this entry is installed on.
- `sfHookReturnCode` — the exit/return code the hook passed to `accept`/`rollback`.
- `sfHookReturnString` — the message buffer passed to `accept`/`rollback`.
- `sfHookInstructionCount` — instructions executed.
- `sfHookEmitCount` — number of transactions this execution emitted.
- `sfHookExecutionIndex` — the execution's index in the chain.
- `sfHookStateChangeCount` — number of state entries this execution changed.
- `sfHookHash` — the hash of the `HookDefinition` (bytecode) that ran.

<!-- Field names verified in include/xrpl/protocol/detail/sfields.macro and their population in src/xrpld/app/hook/detail/applyHook.cpp:1566-1590. -->

## SetHook lifecycle summary

Hooks are installed, updated, and removed with the `SetHook` transaction. The
per-hook operation is one of the `HookSetOperation` values:
<!-- Enum.h -->

| Operation | Value | Meaning |
|---|---|---|
| `hsoINVALID` | -1 | Not a valid operation. |
| `hsoNOOP` | 0 | No operation. |
| `hsoCREATE` | 1 | Create a new hook (upload WASM). |
| `hsoINSTALL` | 2 | Install an existing hook definition by hash. |
| `hsoDELETE` | 3 | Delete the hook. |
| `hsoNSDELETE` | 4 | Delete a namespace. |
| `hsoUPDATE` | 5 | Update hook parameters/fields. |

For the fields that control *when* an installed hook fires and what it may
`emit()` — `HookOn`, `HookOnIncoming`, `HookOnOutgoing`, `HookCanEmit`, and the
hook-targeting `HookName` field — see [sethook-fields.md](sethook-fields/README.md).

The associated `HookSetFlags`:
<!-- Enum.h -->

| Flag | Value | Meaning |
|---|---|---|
| `hsfOVERRIDE` | 0x01 | Permit overriding/deleting an existing hook. |
| `hsfNSDELETE` | 0x02 | Permit deleting a namespace. |
| `hsfCOLLECT` | 0x04 | Allow `collect` calls on this hook. |

## Compilation pipeline

Hooks are compiled with **wasmcc**, post-processed with **hook-cleaner**, and
(for WAT-text hooks) with **wat2wasm** — sourced from wasienv, hook-cleaner-c,
and wabt respectively. See [compiling.md](compiling.md) for a full walkthrough
of the toolchain and why a stock build needs cleaning before it validates.
<!-- Test hooks in this repo are compiled by src/test/app/build_test_hooks.sh, which extracts the C source embedded between the R"[test.hook]( and )[test.hook]" markers in SetHook_test.cpp and produces SetHook_wasm.h. -->

## Related documents

- [README.md](README.md)
- [compiling.md](compiling.md) — the wasmcc/hook-cleaner/wat2wasm toolchain in depth.
- [execution-order.md](execution-order.md) — strong/weak/AAW ordering across a transaction's TSHs.
- [fees.md](fees.md) — the full creation/execution/collect-call/emission fee model in one place.
- [sethook-fields.md](sethook-fields/README.md)
- [glossary.md](glossary.md)
- [macros.md](macros/README.md)
- [best-practices.md](best-practices.md)
- [api-reference/control.md](api-reference/control/README.md)
- [api-reference/transaction.md](api-reference/transaction/README.md)
- [api-reference/state.md](api-reference/state/README.md)
- [api-reference/ledger-and-slot.md](api-reference/slot/README.md)
- [api-reference/ledger-and-slot.md](api-reference/ledger/README.md)
- [api-reference/emit-and-etxn.md](api-reference/emit/README.md)
- [api-reference/float-and-amount.md](api-reference/float/README.md)
- [api-reference/utility.md](api-reference/utility/README.md)
- [api-reference/utility.md](api-reference/sto/README.md)
- [api-reference/utility.md](api-reference/trace/README.md)
- [examples/payment-filter.md](examples/payment-filter.md)
