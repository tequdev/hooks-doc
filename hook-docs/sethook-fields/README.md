# SetHook Fields: HookOn, HookOnIncoming, HookOnOutgoing, HookCanEmit, HookName

This page documents five fields that control **when** an installed hook fires and
**what** it is allowed to do: `HookOn`, `HookOnIncoming`, `HookOnOutgoing`,
`HookCanEmit`, and `HookName`. All five exist on this branch (`dev`). Field
definitions come from `include/xrpl/protocol/detail/sfields.macro`; storage
locations from `include/xrpl/protocol/detail/ledger_entries.macro`,
`src/libxrpl/protocol/TxFormats.cpp`, and `src/libxrpl/protocol/InnerObjectFormats.cpp`;
validation from `src/xrpld/app/tx/detail/SetHook.cpp` and
`src/xrpld/app/tx/detail/Transactor.cpp`; runtime semantics from
`src/xrpld/app/hook/detail/applyHook.cpp` and `src/xrpld/app/hook/detail/HookAPI.cpp`;
worked examples verified against `src/test/app/SetHook_test.cpp`.

## Where these fields live

A `SetHook` transaction carries `sfHooks` (required), an array of `sfHook`
objects (`HookSetObject`). Each `sfHook` entry describes one operation
(`hsoCREATE`/`hsoINSTALL`/`hsoDELETE`/`hsoNSDELETE`/`hsoUPDATE`/`hsoNOOP`,
inferred by `SetHook::inferOperation`) applied to one position in the account's
hook chain. See `../overview.md` for the lifecycle table.

| Field | SField type | Where it can appear | Required/optional |
|---|---|---|---|
| `HookOn` | `UINT256` (code 20) | `sfHook` (per-account `ltHOOK` entry), `ltHOOK_DEFINITION` | `soeOPTIONAL` in both |
| `HookOnIncoming` | `UINT256` (code 94) | `sfHook`, `ltHOOK_DEFINITION` | `soeOPTIONAL` in both |
| `HookOnOutgoing` | `UINT256` (code 93) | `sfHook`, `ltHOOK_DEFINITION` | `soeOPTIONAL` in both |
| `HookCanEmit` | `UINT256` (code 96) | `sfHook`, `ltHOOK_DEFINITION` | `soeOPTIONAL` in both |
| `HookName` | `VL` (code 97) | `sfHook` **only** (never `ltHOOK_DEFINITION`); also a common field on **every** transaction type | `soeOPTIONAL` |

Exact declarations (`include/xrpl/protocol/detail/sfields.macro:195,207-216,296`):

```cpp
TYPED_SFIELD(sfHookOn,                   UINT256,   20)
...
TYPED_SFIELD(sfHookOnOutgoing,           UINT256,   93)
TYPED_SFIELD(sfHookOnIncoming,           UINT256,   94)
TYPED_SFIELD(sfHookCanEmit,              UINT256,   96)
...
TYPED_SFIELD(sfHookName,                 VL,        97)
```

`ltHOOK_DEFINITION` (`include/xrpl/protocol/detail/ledger_entries.macro:94-110`) declares all
four `UINT256` fields `soeOPTIONAL`, but **not** `sfHookName`:

```cpp
LEDGER_ENTRY(ltHOOK_DEFINITION, 'D', HookDefinition, hook_definition, ({
    {sfHookHash,             soeREQUIRED},
    {sfHookOn,               soeOPTIONAL},
    {sfHookOnIncoming,       soeOPTIONAL},
    {sfHookOnOutgoing,       soeOPTIONAL},
    {sfHookCanEmit,          soeOPTIONAL},
    {sfHookNamespace,        soeREQUIRED},
    ...
}))
```

`sfHookName` is instead a **common field on every transaction type**
(`src/libxrpl/protocol/TxFormats.cpp:31-52`, the `commonFields` list shared by all
`TxFormats`), alongside `sfHookParameters`. This lets a caller target one named
hook in a chain when submitting *any* transaction (Payment, Invoke, TrustSet,
...) — see the [HookName](hookname.md) section.

## Index

| Field | Purpose |
|---|---|
| [HookOn](hookon.md) | Selects which transaction types cause a hook to fire. |
| [HookOnIncoming / HookOnOutgoing](hookon-incoming-outgoing.md) | Splits `HookOn` into independent incoming/outgoing bit fields. |
| [HookCanEmit](hookcanemit.md) | Restricts which transaction types a hook is permitted to `emit()`. |
| [HookName](hookname.md) | Names one installed hook so any transaction can target it directly. |

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
