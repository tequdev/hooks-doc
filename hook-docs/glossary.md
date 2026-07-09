# Glossary

Alphabetical glossary of terms used throughout the Xahau Hook C/WASM
documentation. Each entry links to the document where the term is used in depth.
Definitions are grounded in repository source (`include/xrpl/hook/Enum.h`,
`hook/extern.h`, `hook/hookapi.h`, `src/xrpld/app/hook/`, and the test hooks in
`src/test/app/`).

| Term | Definition |
|---|---|
| **`accept`** | Terminates the hook and lets the originating transaction apply. Never returns. Maps to `ExitType::ACCEPT`. See [overview.md](overview.md) and [api-reference/control.md](api-reference/control/README.md). |
| **Burden** | A measure of how much emitted-transaction "work" descends from a transaction. For the originating transaction it is 1 unless that transaction was itself emitted by a previous hook (comment on `otxn_burden` in `applyHook.cpp`). Read with `otxn_burden` / `etxn_burden`. See [api-reference/transaction.md](api-reference/transaction/README.md). |
| **`cbak`** | The callback entry point (`int64_t cbak(uint32_t)`). Called to report the result of a transaction the hook previously emitted. See [overview.md](overview.md). |
| **Callback** | The execution mode in which `cbak` runs to deliver the outcome of an emitted transaction (`isCallback`/`emitFailure` in `applyHook.h`; emission flag `hefCALLBACK = 0x2`). See [overview.md](overview.md). |
| **drops** | The smallest unit of XRP/native balance (1 XRP = 1,000,000 drops). Base fee is expressed in drops (`fee_base`). See [api-reference/ledger-and-slot.md](api-reference/ledger/README.md). |
| **Emitted Transaction** | A transaction a hook creates during its run and submits to be applied later via `emit`. It must first be counted with `etxn_reserve`. See [api-reference/emit-and-etxn.md](api-reference/emit/README.md) and [examples/emitted-transaction.md](examples/emitted-transaction.md). |
| **Execution metadata** | The record of a hook's execution written into transaction metadata: an `sfHookExecutions` array of `sfHookExecution` objects carrying `sfHookResult`, `sfHookReturnCode`, `sfHookReturnString`, `sfHookInstructionCount`, `sfHookEmitCount`, and `sfHookExecutionIndex` (built in `applyHook.cpp`). See [overview.md](overview.md). |
| **Generation** | A counter of how many emit "generations" deep a transaction is; 1 unless the originating transaction was itself emitted (comment on `otxn_generation` in `applyHook.cpp`). Read with `otxn_generation` / `etxn_generation`. See [api-reference/transaction.md](api-reference/transaction/README.md). |
| **Grant** | Authorization allowing one account's hook to write into another account's hook state. Without a grant, `state_foreign_set` returns `NOT_AUTHORIZED` (`-34`). See [api-reference/state.md](api-reference/state/README.md) and [examples/foreign-state.md](examples/foreign-state.md). |
| **Guard** | The `_g(guard_id, maxiter)` call required at the top of every loop, bounding its iterations. Missing/invalid guards are rejected at HookSet time (`Guard.h`; log codes `GUARD_IMPORT`/`GUARD_MISSING`/`GUARD_PARAMETERS`); exceeding a guard at runtime returns `GUARD_VIOLATION` (`-16`). See [api-reference/control.md](api-reference/control/README.md) and [macros.md](macros/guards.md). |
| **Hook** | A WebAssembly program installed on an account that runs on-ledger when a transaction touches that account. Also the name of the main entry point (`int64_t hook(uint32_t)`). See [overview.md](overview.md). |
| **Hook Definition (`ltHOOK_DEFINITION`)** | The on-ledger object holding a hook's WASM bytecode and reference count, keyed by hook hash (keylet code `HOOK_DEFINITION = 24`). Multiple accounts can install the same definition by hash via `hsoINSTALL`. |
| **Hook Parameter** | A key/value pair configured on a hook at install time and read at runtime with `hook_param`. Keys are up to 32 bytes, values up to 256 bytes, max 16 per hook (`Enum.h`). Distinct from parameters carried on the originating transaction (`otxn_param`). See [api-reference/control.md](api-reference/control/README.md). |
| **Hook State** | Persistent key/value storage scoped to an account and a namespace. Keys are 32 bytes; values up to `256 × scale` bytes (max 4096). Accessed with `state`/`state_set` and the `_foreign` variants. See [api-reference/state.md](api-reference/state/README.md). |
| **`HookCanEmit`** | A 256-bit `SetHook` field, evaluated with the same bit rule as `HookOn`, that restricts which transaction types a hook may `emit()`. Defaults to permitting everything, including `SetHook`, when absent. Requires `featureHookCanEmit`. See [sethook-fields.md](sethook-fields/hookcanemit.md). |
| **`HookName`** | An optional name attached to one installed hook (`ltHOOK` only, never the shared `ltHOOK_DEFINITION`). Any transaction can carry a matching `sfHookName` to force that specific named hook to run in addition to the chain's unnamed hooks. Requires `featureNamedHooks`. See [sethook-fields.md](sethook-fields/hookname.md). |
| **HookOn** | A 256-bit field configured on an installed hook that selects which transaction types cause the hook to fire — active-low for every transaction type except `ttHOOK_SET`, which is active-high. See [sethook-fields.md](sethook-fields/hookon.md). |
| **`HookOnIncoming` / `HookOnOutgoing`** | The direction-split form of `HookOn`, available under `featureHookOnV2`: `HookOnOutgoing` governs transactions sent by the hook's own account, `HookOnIncoming` governs transactions where the hook's account is some other stakeholder (e.g. a payment destination). Mutually exclusive with plain `HookOn` on the same hook object. See [sethook-fields.md](sethook-fields/hookon-incoming-outgoing.md). |
| **`hsfOVERRIDE`** | A `SetHook` flag (`0x01`, `Enum.h`) required to override or delete an existing hook. Without it, create/delete operations are rejected (log codes `CREATE_FLAG`, `DELETE_FLAG`, `OVERRIDE_MISSING`). See [overview.md](overview.md). |
| **Keylet** | A typed 32-byte key identifying a ledger object. Computed with `util_keylet` (using a `KEYLET_*` type such as `KEYLET_LINE`, `KEYLET_OFFER`, `KEYLET_ESCROW`) and passed to `slot_set` to load the object. See [api-reference/ledger-and-slot.md](api-reference/slot/README.md). |
| **Namespace** | A 32-byte partition of an account's hook state. An account may have up to 256 namespaces (`maxNamespaces()`); a namespace can be cleared with the `hsoNSDELETE` operation. See [api-reference/state.md](api-reference/state/README.md). |
| **Originating Transaction (`otxn`)** | The transaction that triggered the hook. Read its fields with `otxn_field`, its type with `otxn_type`, its id with `otxn_id`, and its parameters with `otxn_param`. See [api-reference/transaction.md](api-reference/transaction/README.md). |
| **`rollback`** | Terminates the hook, rejects the originating transaction, and reverts any state changes the hook made. Never returns. Maps to `ExitType::ROLLBACK`. See [api-reference/control.md](api-reference/control/README.md). |
| **SetHook** | The transaction type that installs, updates, or removes hooks on an account, using `HookSetOperation` values (`hsoCREATE`/`hsoINSTALL`/`hsoDELETE`/`hsoNSDELETE`/`hsoUPDATE`) and flags (`hsfOVERRIDE`/`hsfNSDELETE`/`hsfCOLLECT`). See [overview.md](overview.md). |
| **Slot** | A numbered runtime register (up to 255, `max_slots`) holding a loaded ledger object, the originating transaction, or a subfield. Populated with `slot_set`/`otxn_slot`, navigated with `slot_subfield`/`slot_subarray`, read with `slot`/`slot_size`/`slot_float`. See [api-reference/ledger-and-slot.md](api-reference/slot/README.md). |
| **Strong execution** | The pre-apply execution mode: the hook runs before the transaction is applied and may `rollback` to reject it (`isStrong` in `applyHook.h`; emission flag `hefSTRONG = 0x1`). See [overview.md](overview.md). |
| **TSH (Transactional Stake Holder)** | An account with a stake in a transaction (beyond the sending account) that can therefore have its hooks fire for that transaction. TSHs may be added as **weak** (observe only) or strong participants; the `SetHookTSH_test.cpp` suite exercises weak TSHs (`addWeakTSH`). Governed by `TSHFlags` (`tshROLLBACK`, `tshCOLLECT`, `tshMIXED` in `Enum.h`). **Unverified — needs confirmation:** the precise strong-vs-weak TSH firing rules per transaction type are not fully restated here; see `SetHookTSH_test.cpp`. |
| **Weak execution** | A post-apply re-execution requested by a strong hook via `hook_again()`. It observes the applied result and cannot roll it back (`executeAgainAsWeak` comment in `applyHook.h`). See [overview.md](overview.md). |
| **XFL** | Xahau's fixed-precision floating-point representation for ledger amounts, encoded as an `int64_t` of exponent + mantissa. Built and manipulated with the `float_*` functions. See [xfl.md](xfl.md). |

## Related documents

- [README.md](README.md)
- [overview.md](overview.md)
- [sethook-fields.md](sethook-fields/README.md)
- [macros.md](macros/README.md)
- [api-reference/control.md](api-reference/control/README.md)
- [api-reference/transaction.md](api-reference/transaction/README.md)
- [api-reference/state.md](api-reference/state/README.md)
- [api-reference/ledger-and-slot.md](api-reference/slot/README.md)
- [api-reference/ledger-and-slot.md](api-reference/ledger/README.md)
- [api-reference/emit-and-etxn.md](api-reference/emit/README.md)
- [api-reference/float-and-amount.md](api-reference/float/README.md)
- [api-reference/utility.md](api-reference/utility/README.md)
