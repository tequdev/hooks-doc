# SetHook Fields

This directory documents all 12 fields of the `sfHook` inner object used by
`SetHook` (`ttHOOK_SET`) transactions — `HookHash`, `CreateCode`,
`HookGrants`, `HookNamespace`, `HookParameters`, `HookOn`,
`HookOnIncoming`, `HookOnOutgoing`, `HookCanEmit`, `HookApiVersion`,
`HookName`, and `Flags` — plus a page mapping which of them are
required, optional, or forbidden for each of the six operations
(`hsoCREATE`/`hsoINSTALL`/`hsoUPDATE`/`hsoDELETE`/`hsoNSDELETE`/`hsoNOOP`)
a `sfHook` object can represent. All fields and rules described here exist
on this branch (`dev`); this branch has no `HookApiVersion 1` (gas-metered)
ABI, so `HookApiVersion` accepts only `0`.

Field definitions come from `include/xrpl/protocol/detail/sfields.macro`;
storage locations from `include/xrpl/protocol/detail/ledger_entries.macro`,
`src/libxrpl/protocol/TxFormats.cpp`, and
`src/libxrpl/protocol/InnerObjectFormats.cpp`; validation and
operation-inference logic from `src/xrpld/app/tx/detail/SetHook.cpp` and
`src/xrpld/app/tx/detail/Transactor.cpp`; runtime semantics from
`src/xrpld/app/hook/detail/applyHook.cpp` and
`src/xrpld/app/hook/detail/HookAPI.cpp`; worked examples verified against
`src/test/app/SetHook_test.cpp`.

**Start with [operations-field-matrix.md](operations-field-matrix.md)** if
you want the per-operation required/optional/forbidden table first — the
individual field pages below go deeper on the runtime and validation
semantics of each field but assume familiarity with the six operations.

## Where these fields live

A `SetHook` transaction carries `sfHooks` (required), an array of `sfHook`
objects (`HookSetObject`). Each `sfHook` entry describes one operation
(`hsoCREATE`/`hsoINSTALL`/`hsoDELETE`/`hsoNSDELETE`/`hsoUPDATE`/`hsoNOOP`,
inferred by `SetHook::inferOperation`) applied to one position in the account's
hook chain. See `../overview.md` for the lifecycle table.

| Field | SField type (code) | Where it can appear | Required/optional |
|---|---|---|---|
| `HookHash` | `UINT256` (31) | `sfHook`; `sfHookGrant` (as `sfHookGrant`'s own `HookHash`); `ltHOOK_DEFINITION` (identifies the definition itself) | `soeOPTIONAL` on `sfHook`, `soeREQUIRED` on `sfHookGrant` and `ltHOOK_DEFINITION` |
| `CreateCode` | `VL` (11) | `sfHook`, `ltHOOK_DEFINITION` | `soeOPTIONAL` on `sfHook`, `soeREQUIRED` on `ltHOOK_DEFINITION` |
| `HookGrants` | `ARRAY` (20) | `sfHook` **only** — never `ltHOOK_DEFINITION` | `soeOPTIONAL` |
| `HookNamespace` | `UINT256` (32) | `sfHook`, `ltHOOK_DEFINITION` | `soeOPTIONAL` on `sfHook`, `soeREQUIRED` on `ltHOOK_DEFINITION` |
| `HookParameters` | `ARRAY` (19) | `sfHook`, `ltHOOK_DEFINITION` (default set) | `soeOPTIONAL` on `sfHook`, `soeREQUIRED` on `ltHOOK_DEFINITION` |
| `HookOn` | `UINT256` (20) | `sfHook`, `ltHOOK_DEFINITION` | `soeOPTIONAL` in both |
| `HookOnIncoming` | `UINT256` (94) | `sfHook`, `ltHOOK_DEFINITION` | `soeOPTIONAL` in both |
| `HookOnOutgoing` | `UINT256` (93) | `sfHook`, `ltHOOK_DEFINITION` | `soeOPTIONAL` in both |
| `HookCanEmit` | `UINT256` (96) | `sfHook`, `ltHOOK_DEFINITION` | `soeOPTIONAL` in both |
| `HookApiVersion` | `UINT16` (20) | `sfHook`, `ltHOOK_DEFINITION` | `soeOPTIONAL` on `sfHook`, `soeREQUIRED` on `ltHOOK_DEFINITION` |
| `HookName` | `VL` (97) | `sfHook` **only** (never `ltHOOK_DEFINITION`); also a common field on **every** transaction type | `soeOPTIONAL` |
| `Flags` | `UINT32` (2) | `sfHook`; auto-attached to every `ltHOOK_DEFINITION`/ledger entry (not listed explicitly in its macro); also a distinct, unrelated top-level field on every transaction | `soeOPTIONAL` |

`HookOn`, `HookApiVersion`, and `HookGrants` all show a numeric code of
`20` above — this is not a collision. An SField code is only unique
*within* its `SerializedTypeID` (`UINT256`, `UINT16`, `ARRAY`
respectively here), not globally; see
`include/xrpl/protocol/detail/sfields.macro` for the full type-scoped
numbering.

Exact declarations
(`include/xrpl/protocol/detail/sfields.macro:59,65,195,206-207,213-216,273,287-288,296,329,374-375,414-415`):

```cpp
TYPED_SFIELD(sfHookApiVersion,           UINT16,    20)
TYPED_SFIELD(sfFlags,                    UINT32,     2)
TYPED_SFIELD(sfHookOn,                   UINT256,   20)
TYPED_SFIELD(sfHookHash,                 UINT256,   31)
TYPED_SFIELD(sfHookNamespace,            UINT256,   32)
TYPED_SFIELD(sfHookOnOutgoing,           UINT256,   93)
TYPED_SFIELD(sfHookOnIncoming,           UINT256,   94)
TYPED_SFIELD(sfHookCanEmit,              UINT256,   96)
TYPED_SFIELD(sfCreateCode,               VL,        11)
TYPED_SFIELD(sfHookParameterName,        VL,        24)
TYPED_SFIELD(sfHookParameterValue,       VL,        25)
TYPED_SFIELD(sfHookName,                 VL,        97)
UNTYPED_SFIELD(sfHookParameter,          OBJECT,    23)
UNTYPED_SFIELD(sfHookGrant,              OBJECT,    24)
UNTYPED_SFIELD(sfHookParameters,         ARRAY,     19)
UNTYPED_SFIELD(sfHookGrants,             ARRAY,     20)
```

`ltHOOK_DEFINITION` (`include/xrpl/protocol/detail/ledger_entries.macro:94-110`) declares:

```cpp
LEDGER_ENTRY(ltHOOK_DEFINITION, 'D', HookDefinition, hook_definition, ({
    {sfHookHash,             soeREQUIRED},
    {sfHookOn,               soeOPTIONAL},
    {sfHookOnIncoming,       soeOPTIONAL},
    {sfHookOnOutgoing,       soeOPTIONAL},
    {sfHookCanEmit,          soeOPTIONAL},
    {sfHookNamespace,        soeREQUIRED},
    {sfHookParameters,       soeREQUIRED},
    {sfHookApiVersion,       soeREQUIRED},
    {sfCreateCode,           soeREQUIRED},
    {sfHookSetTxnID,         soeREQUIRED},
    {sfReferenceCount,       soeREQUIRED},
    {sfFee,                  soeREQUIRED},
    {sfHookCallbackFee,      soeOPTIONAL},
    {sfPreviousTxnID,        soeOPTIONAL},
    {sfPreviousTxnLgrSeq,    soeOPTIONAL},
}))
```

Neither `sfHookGrants` nor `sfHookName` appear here — grants and the
display name are per-account (`sfHook`-entry-only) concepts, never part of
the shared, hash-addressed definition (see [HookGrants](hookgrants.md) and
[HookName](hookname.md)). `sfFlags` also doesn't appear in this list, but
is not per-account-only —
it is one of the fields auto-attached to every `LEDGER_ENTRY` (alongside
`sfLedgerIndex`, `sfLedgerEntryType`, `sfRemarks`), so `ltHOOK_DEFINITION`
does carry it in practice (see [flags.md](flags.md)).

`sfHookName` is instead a **common field on every transaction type**
(`src/libxrpl/protocol/TxFormats.cpp:31-52`, the `commonFields` list shared by all
`TxFormats`), alongside `sfHookParameters`. This lets a caller target one named
hook in a chain when submitting *any* transaction (Payment, Invoke, TrustSet,
...) — see the [HookName](hookname.md) section.

## Index

**Start here:** [operations-field-matrix.md](operations-field-matrix.md) —
the full per-operation (CREATE/INSTALL/UPDATE/DELETE/NSDELETE/NOOP)
required/optional/forbidden table for all 12 fields, with `inferOperation`
explained and every rule cited.

| Field | Purpose |
|---|---|
| [HookHash](hookhash.md) | Installs an already-uploaded WASM by hash; drives `ltHOOK_DEFINITION` reference counting. |
| [CreateCode](createcode.md) | Uploads new WASM (`hsoCREATE`) or, if empty, marks the slot for deletion (`hsoDELETE`). |
| [HookGrants](hookgrants.md) | Authorizes specific hooks to write into this hook's namespace via `state_foreign_set`. |
| [HookNamespace](hooknamespace.md) | Selects the Hook State key-space a hook reads/writes; also the target of `hsoNSDELETE`. |
| [HookParameters](hookparameters.md) | Per-install/update overrides of a hook's named parameters, three-way-merged against the definition's defaults. |
| [HookOn](hookon.md) | Selects which transaction types cause a hook to fire. |
| [HookOnIncoming / HookOnOutgoing](hookon-incoming-outgoing.md) | Splits `HookOn` into independent incoming/outgoing bit fields. |
| [HookCanEmit](hookcanemit.md) | Restricts which transaction types a hook is permitted to `emit()`. |
| [HookApiVersion](hookapiversion.md) | Declares the Hook API ABI version; on this branch, must be `0`, and only legal on `hsoCREATE`. |
| [HookName](hookname.md) | Names one installed hook so any transaction can target it directly. |
| [flags.md](flags.md) | The `hsf*` control/persistent bits (`hsfOVERRIDE`, `hsfNSDELETE`, `hsfCOLLECT`) carried in each `sfHook` object's own `Flags`. |
| [operations-field-matrix.md](operations-field-matrix.md) | Per-operation field legality matrix (see "Start here" above). |

## Related documents

- [../overview.md](../overview.md) — SetHook lifecycle, operations/flags, and the
  general error-code table (`EMISSION_FAILURE` and others).
- [../api-reference/control/README.md](../api-reference/control/README.md) — `hook_pos`, `hook_skip`,
  and other chain-position/control functions referenced by the execution model
  here.
- [../api-reference/emit/README.md](../api-reference/emit/README.md) — `emit`,
  `etxn_reserve`, and the rest of the emission API that `HookCanEmit` gates.
- [../glossary.md](../glossary.md) — definitions of `SetHook`, `HookOn`, TSH, and
  other terms used throughout this page.
