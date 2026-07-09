---
sidebarTitle: "Flags"
---

# Flags (on the `sfHook` object)

**Purpose:** a 32-bit bitfield inside each `sfHook` entry carrying
`SetHook`-specific control bits (`hsoDELETE`/`hsoNSDELETE` requirements,
`hsoINSTALL`/`hsoCREATE` override permission) and one runtime bit,
`hsfCOLLECT`, that persists onto the ledger and gates weak-execution hook
chains. This is a different field from the transaction's own top-level
`sfFlags` — see the warning below.

**Field declaration:** `UINT32`, code 2.
<!-- `include/xrpl/protocol/detail/sfields.macro:65`:

```cpp
TYPED_SFIELD(sfFlags,                    UINT32,     2)
```
-->

`sfFlags` is a generic, protocol-wide field, not hook-specific — it is
declared once and reused as a common field on every transaction type and
(automatically) on every ledger entry type. It is `soeOPTIONAL` on `sfHook`
and is not listed explicitly in `ltHOOK_DEFINITION`'s template because
`sfFlags` is one of the fields auto-attached to **every** `LEDGER_ENTRY`
(alongside `sfLedgerIndex`, `sfLedgerEntryType`, `sfRemarks`) — yet it is
still legally stored and read on a `ltHOOK_DEFINITION` SLE (see below).
<!-- `src/libxrpl/protocol/InnerObjectFormats.cpp:103`;
`include/xrpl/protocol/detail/ledger_entries.macro:94-110`. -->

**Don't confuse this with the transaction-level `sfFlags`.** A `SetHook`
transaction, like every transaction, carries its own top-level `sfFlags`
(the standard signing/canonical-signature bits). That field is checked
independently, unrelated to any `sfHook` object's flags, and gated by
`fixInvalidTxFlags`.
<!-- `SetHook::preflight`,
`src/xrpld/app/tx/detail/SetHook.cpp:745-750`:

```cpp
if (ctx.rules.enabled(fixInvalidTxFlags) &&
    ctx.tx.getFlags() & tfUniversalMask)
{
    JLOG(ctx.j.trace()) << "SetHook: Invalid flags set.";
    return temINVALID_FLAG;
}
```
-->

`SetHook` defines no `tfXxx` transaction flags of its own, so this simply
rejects any bit outside the universal mask (e.g. `tfFullyCanonicalSig`) on
the transaction itself. Everything else on this page is about the
**per-`sfHook`-object** `sfFlags`, which uses an entirely separate bit
namespace (`hsf*`, below).

**Hook-set flag values — `HookSetFlags`:**
<!-- `include/xrpl/hook/Enum.h:43-47`:

```cpp
enum HookSetFlags : uint8_t {
    hsfOVERRIDE = 0b00000001U,  // override or delete hook
    hsfNSDELETE = 0b00000010U,  // delete namespace
    hsfCOLLECT = 0b00000100U,   // allow collect calls on this hook
};
```
-->

| Flag | Value | Meaning |
|---|---|---|
| `hsfOVERRIDE` | `0x1` | Permission bit: this operation may replace/delete a hash already occupying the chain slot. |
| `hsfNSDELETE` | `0x2` | Request bit: destroy a namespace's Hook State as part of this operation (see [HookNamespace](hooknamespace.md) for full mechanics, including its use as a side effect on non-`hsoNSDELETE` operations). |
| `hsfCOLLECT` | `0x4` | Persistent bit: marks this hook eligible to run during weak (non-strong) "collect" execution. |

**Per-operation legality:**
<!-- Validated in `SetHook::validateHookSetEntry`,
`SetHook.cpp:250-622`. -->

- **`hsoNSDELETE`**: `sfFlags` required, and must
  equal **exactly** `hsfNSDELETE` — no other bit, including `hsfOVERRIDE`
  or `hsfCOLLECT`, may accompany it (`NSDELETE_FLAGS`).
  <!-- `SetHook.cpp:263-295`; `SetHook.cpp:284-292`:
  `if (flags != hsfNSDELETE) ... return false;`. -->
- **`hsoDELETE`**: `sfFlags` required and must
  include `hsfOVERRIDE` (`OVERRIDE_MISSING` otherwise); allowed bits are limited to
  `hsfOVERRIDE | hsfNSDELETE | hsfCOLLECT` — any other bit is
  `FLAGS_INVALID`. A missing flag and an all-1s `2147483648` value are both
  rejected.
  <!-- `SetHook.cpp:297-337`; `SetHook.cpp:316-324`;
  `SetHook.cpp:326-334`; verified by `SetHook_test.cpp:705-728`. -->
- **`hsoUPDATE`**: `hsfOVERRIDE` is forbidden
  outright; `hsfNSDELETE` is allowed **only** together with a newly
  supplied `sfHookNamespace` in the same entry (both conditions checked in
  one guard, `FLAGS_INVALID`). An override flag on update and `NSDELETE`
  without a namespace are both rejected.
  <!-- `SetHook.cpp:369-382`; verified by `SetHook_test.cpp:2416-2443`
  (override flag on update, and `NSDELETE` without a namespace, both
  rejected). -->
- **`hsoINSTALL`/`hsoCREATE`**: validation places no explicit restriction
  on `sfFlags` for these two — but `hsfOVERRIDE` is enforced
  separately, at **apply time**, as the permission to replace whatever
  currently occupies the target chain slot: `tecREQUIRES_FLAG` if a hook
  already exists there and `hsfOVERRIDE` is absent. An install
  without override and a second create without override both produce
  `tecREQUIRES_FLAG`.
  <!-- `validateHookSetEntry`; "flags may be present if the user so chooses",
  `SetHook.cpp:364,408`; `hsoCREATE`: `SetHook.cpp:1744-1753`;
  `hsoINSTALL`: `SetHook.cpp:1914-1923`; verified by
  `SetHook_test.cpp:658-668` and `SetHook_test.cpp:2108-2111`. -->

**What actually gets persisted — control bits are stripped before
storage on `hsoCREATE`/`hsoINSTALL`; `hsoUPDATE` stores the raw value, but
validation makes the two control bits unreachable there anyway.**
Control-only bits are removed before storage.
<!-- `setHook()` computes `newFlags` at `SetHook.cpp:1410-1420`:

```cpp
int newFlags = 0;
if (flags)
{
    newFlags = *flags;
    if (newFlags & hsfOVERRIDE)
        newFlags -= hsfOVERRIDE;
    if (newFlags & hsfNSDELETE)
        newFlags -= hsfNSDELETE;
}
```
-->

This stripped value (effectively just `hsfCOLLECT` plus any undefined
higher bits) is what gets written to the ledger for `hsoCREATE`'s new
`ltHOOK_DEFINITION` and for `hsoINSTALL`'s per-account entry. `hsoUPDATE`
instead stores the **raw, unstripped** submitted value. This looks like it could leave a
stray `hsfOVERRIDE`/`hsfNSDELETE` bit on the ledger, but operation inference
and the `hsoUPDATE` validation guard prevent that in a transaction that
actually validates: operation inference only returns `hsoUPDATE` when
*either* `sfHookNamespace` is absent *or* `hsfNSDELETE` is unset (any
`(Namespace present, hsfNSDELETE set)` pair is classified `hsoNSDELETE`
instead), and `hsoUPDATE`'s own validation rejects `flags & hsfNSDELETE`
whenever `sfHookNamespace` is absent. The only namespace/flag combination
that reaches `hsoUPDATE` validation with `hsfNSDELETE` set is therefore
exactly the one the guard rejects — so `hsfNSDELETE` can never survive
into an applied `hsoUPDATE`, and `hsfOVERRIDE` is rejected outright
regardless of `sfHookNamespace`. Raw-vs-stripped storage is a real
difference in the code, but it has no observable effect for `hsoUPDATE` in
practice, since validation already guarantees both control bits are absent
by the time the apply loop runs.
<!-- `SetHook.cpp:1883-1886`; `SetHook.cpp:2038-2039`;
`SetHook.cpp:1736-1737`: `newHook.setFieldU32(sfFlags, *flags)`;
`inferOperation` at `SetHook.cpp:242-244`; guard at
`SetHook.cpp:371-382`; `setHook()` apply loop. -->

**Runtime use — `hsfCOLLECT` gates weak execution.** Both fee calculation
and actual execution read a hook chain entry's stored `sfFlags` (falling
back to the definition's `sfFlags` if the entry has none) and skip
non-strong ("weak"/collect-only) invocations that lack `hsfCOLLECT`.
<!--

```cpp
// src/xrpld/app/tx/detail/Transactor.cpp:1386-1390
JLOG(j_.trace()) << "HookChainExecution: " << hookHash
                 << " strong:" << strong
                 << " flags&hsfCOLLECT: " << (flags & hsfCOLLECT);

// skip weakly executed hooks that lack a collect flag
if (!strong && !(flags & hsfCOLLECT))
    continue;
```
-->

The fee-estimation counterpart is identical in spirit, gating whether a
hook's fee is even added when only "collect calls" are being priced. This is the mechanism that lets a
hook opt in to firing during weakly-executed (TSH/collect) transaction
processing, as referenced from [HookOn](hookon.md)'s execution-mode
discussion.
<!-- `Transactor.cpp:307-311`. -->

**Common mistakes:**
- Setting the transaction's own top-level `Flags` field expecting it to
  control hook behavior — `hsf*` bits only exist inside each `sfHook`
  object's own `Flags` sub-field.
- Assuming `hsoINSTALL`/`hsoCREATE` forbid arbitrary flag bits the way
  `hsoDELETE`/`hsoNSDELETE` do. They don't restrict the *value* at
  validation time — the only enforcement is `hsfOVERRIDE`'s apply-time
  permission check.
- Assuming `hsoUPDATE`'s raw (unstripped) flag storage means `hsfNSDELETE`
  can end up persisted on a hook entry. Validation guarantees it can't:
  operation inference reclassifies any `(Namespace present, hsfNSDELETE set)`
  pair as `hsoNSDELETE`, and `hsoUPDATE`'s own guard rejects the only
  remaining case (`hsfNSDELETE` set with `sfHookNamespace` absent).
- Forgetting `hsoNSDELETE` rejects *any* extra bit, including
  `hsfOVERRIDE`/`hsfCOLLECT` — it must be exactly `hsfNSDELETE`, not merely
  "include" it.

## Related documents

- [HookNamespace](hooknamespace.md) — full `hsfNSDELETE` deletion mechanics,
  including its side-effect behavior on non-`hsoNSDELETE` operations.
- [HookOn](hookon.md) — the strong/weak execution model `hsfCOLLECT` plugs
  into.
- [operations-field-matrix.md](operations-field-matrix.md) — full
  per-operation field/flag matrix.
