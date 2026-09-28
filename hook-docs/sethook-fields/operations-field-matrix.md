---
sidebarTitle: "Operation Matrix"
---

# SetHook Operations: Field Matrix

Every element of a `SetHook` transaction's `sfHooks` array is one `sfHook`
object, and every `sfHook` object is interpreted as exactly one of six
operations — `hsoCREATE`, `hsoINSTALL`, `hsoUPDATE`, `hsoDELETE`,
`hsoNSDELETE`, or `hsoNOOP` — inferred purely from which of the object's 12
possible fields are present. This page is the authoritative per-operation
map of which fields are required, optional, or forbidden.
<!-- every rule traced to src/xrpld/app/tx/detail/SetHook.cpp -->

## How the operation is inferred

The operation is inferred roughly as follows:
<!--
`SetHook::inferOperation` (`src/xrpld/app/tx/detail/SetHook.cpp:210-245`):

```cpp
HookSetOperation
SetHook::inferOperation(STObject const& hookSetObj)
{
    uint64_t wasmByteCount = hookSetObj.isFieldPresent(sfCreateCode)
        ? hookSetObj.getFieldVL(sfCreateCode).size()
        : 0;

    bool hasHash = hookSetObj.isFieldPresent(sfHookHash);
    bool hasCode = hookSetObj.isFieldPresent(sfCreateCode);

    if (hasHash && hasCode)  // Both HookHash and CreateCode: invalid
        return hsoINVALID;
    else if (hasHash)  // Hookhash only: install
        return hsoINSTALL;
    else if (hasCode)  // CreateCode only: either delete or create
        return wasmByteCount > 0 ? hsoCREATE : hsoDELETE;
    else if (
        !hasHash && !hasCode && !hookSetObj.isFieldPresent(sfHookGrants) &&
        !hookSetObj.isFieldPresent(sfHookNamespace) &&
        !hookSetObj.isFieldPresent(sfHookParameters) &&
        !(hookSetObj.isFieldPresent(sfHookOn) ||
          (hookSetObj.isFieldPresent(sfHookOnOutgoing) &&
           hookSetObj.isFieldPresent(sfHookOnIncoming))) &&
        !hookSetObj.isFieldPresent(sfHookCanEmit) &&
        !hookSetObj.isFieldPresent(sfHookApiVersion) &&
        !hookSetObj.isFieldPresent(sfHookName) &&
        !hookSetObj.isFieldPresent(sfFlags))
        return hsoNOOP;

    uint32_t flags = hookSetObj.isFieldPresent(sfFlags)
        ? hookSetObj.getFieldU32(sfFlags)
        : 0;

    return hookSetObj.isFieldPresent(sfHookNamespace) && (flags & hsfNSDELETE)
        ? hsoNSDELETE
        : hsoUPDATE;
}
```
-->

In order: **both** `sfHookHash` and `sfCreateCode` present → `hsoINVALID`.
**Only** `sfHookHash` → `hsoINSTALL`. **Only** `sfCreateCode` → `hsoCREATE`
if non-empty, `hsoDELETE` if empty. Neither present, and every other field
also absent → `hsoNOOP`. Otherwise: `hsoNSDELETE` if `sfHookNamespace` is
present **and** the `hsfNSDELETE` bit is set in `sfFlags`, else `hsoUPDATE`.

**The subtle NOOP condition.** The `sfHookOn` term inside the NOOP check is
`!(hasOn || (hasOutgoing && hasIncoming))` — note this is **not** symmetric
between the plain field and the directional pair. `sfHookOn` alone
disqualifies NOOP the instant it's present. But `sfHookOnOutgoing` and
`sfHookOnIncoming` only disqualify NOOP when **both** are present together —
if an `sfHook` object carries `sfHookOnOutgoing` (or `sfHookOnIncoming`)
**alone**, with every other field absent, the object still infers as
`hsoNOOP` and that lone directional field is silently ignored (the apply
loop's NOOP case simply copies the old hook through unchanged, never
reading the field at all). <!-- SetHook.cpp:1538-1544 --> This is easy to
trigger by accident: submitting `{HookOnOutgoing: <value>}` with nothing
else in the object does **not** update anything.

**`sfHooks`-array-level checks that apply before any per-object
inference** gate the whole transaction regardless of what individual
objects infer to: `featureHooks` must be enabled (`temDISABLED`
otherwise); the transaction's own top-level `sfFlags` must be clean of
non-universal bits when `fixInvalidTxFlags` is enabled
(`temINVALID_FLAG`); `sfHooks` must be present, non-empty, and at most
`hook::maxHookChainLength()` = 10 entries (`temMALFORMED`); every element
must be an `sfHook` object; a present `sfCreateCode` may not exceed
`hook::maxHookWasmSize()` = 65,535 bytes regardless of operation; every
non-blank `sfHook` object may only contain the 12 fields listed below —
anything else is `temMALFORMED`; and at least one `sfHook` object in the
array must be non-blank (`HOOKS_ARRAY_BLANK`).
<!-- SetHook.cpp:730-865; maxHookChainLength() check per
include/xrpl/hook/Enum.h:100-104; field-whitelist check at
SetHook.cpp:819-837 -->

## The matrix

| Field | CREATE | INSTALL | UPDATE | DELETE | NSDELETE | NOOP |
|---|---|---|---|---|---|---|
| `sfHookHash` | F [^hash-create] | **R** | F [^hash-update] | F | F | F |
| `sfCreateCode` | **R** (non-empty) | F [^code-other] | F [^code-other] | **R** (empty) [^code-delete] | F | F |
| `sfHookGrants` | O | O | O | F | F | F |
| `sfHookNamespace` | **R** | O | O [^ns-update] | F | **R** | F |
| `sfHookParameters` | O | O | O | F | F | F |
| `sfHookOn` | R/O [^onv2] | O | O | F | F | F |
| `sfHookOnIncoming` | R/O [^onv2] | O [^onv2-gate] | O [^onv2-gate] | F | F | F |
| `sfHookOnOutgoing` | R/O [^onv2] | O [^onv2-gate] | O [^onv2-gate] | F | F | F |
| `sfHookCanEmit` | O [^canemit] | O [^canemit] | O [^canemit] | F | F | F |
| `sfHookApiVersion` | **R** (must be `0`) | F | F | F | F | F |
| `sfHookName` | O [^name] | O [^name] | O [^name] | F | F | F |
| `sfFlags` | O [^flags-create] | O [^flags-install] | O [^flags-update] | **R** [^flags-delete] | **R** [^flags-nsdelete] | F |

`R` = required, `O` = optional (subject to the cited validation), `F` =
forbidden (presence is rejected, or — where noted — reclassifies the
object as a different operation before the forbidding check would even
run). NOOP forbids all 12 fields by construction: any field present other
than a directional `HookOn` field presented alone (see "subtle NOOP
condition" above) makes the object something other than NOOP.

[^hash-create]: Presence together with non-empty `sfCreateCode` infers
    `hsoINVALID`, not `hsoCREATE` — see `inferOperation` above.
[^hash-update]: `sfHookHash` presence always infers `hsoINSTALL` (or
    `hsoINVALID` with `sfCreateCode`) — an object with `sfHookHash` is
    never classified `hsoUPDATE`.
[^code-other]: Presence (even as an empty blob) reclassifies the object as
    `hsoCREATE`/`hsoDELETE`, never `hsoINSTALL`/`hsoUPDATE`.
[^code-delete]: Must be present as an **empty** blob; a non-empty blob
    infers `hsoCREATE` instead.
[^ns-update]: If both `sfHookNamespace` and `hsfNSDELETE` (in `sfFlags`)
    are present, the object infers `hsoNSDELETE`, not `hsoUPDATE` — see
    [HookNamespace](hooknamespace.md).
[^onv2]: Before `featureHookOnV2`: `sfHookOn` alone is required. With
    `featureHookOnV2`: either `sfHookOn` alone, **or** both
    `sfHookOnIncoming` and `sfHookOnOutgoing` together (and they must
    differ) — never a mix of `sfHookOn` with either directional field. See
    [HookOnIncoming / HookOnOutgoing](hookon-incoming-outgoing.md).
[^onv2-gate]: Directional `HookOn` fields are only valid when
    `featureHookOnV2` is enabled and **both** `sfHookOnIncoming` and
    `sfHookOnOutgoing` are supplied together with different values. See
    [HookOnIncoming / HookOnOutgoing](hookon-incoming-outgoing.md).
[^canemit]: Gated globally: any non-blank `sfHook` object carrying
    `sfHookCanEmit` without `featureHookCanEmit` enabled is `temDISABLED`,
    independent of which operation it is.
    <!-- SetHook.cpp:811-813 -->
    See [HookCanEmit](hookcanemit.md).
[^name]: Gated globally: any non-blank `sfHook` object carrying
    `sfHookName` without `featureNamedHooks` enabled is `temDISABLED`,
    and the value must pass
    `SetHook::validateHookName` (4–16 bytes or empty, valid UTF-8).
    <!-- SetHook.cpp:815-817 -->
    See [HookName](hookname.md).
[^flags-create]: `hsfOVERRIDE` is required only if a hook already occupies
    the target chain slot (apply-time `tecREQUIRES_FLAG` otherwise); no
    other bit is restricted by `validateHookSetEntry`.
    <!-- SetHook.cpp:1744-1753 -->
[^flags-install]: Same `hsfOVERRIDE` rule as create; no other bit
    restricted.
    <!-- SetHook.cpp:1914-1923 -->
[^flags-update]: `hsfOVERRIDE` is forbidden outright; `hsfNSDELETE` is
    accepted by `inferOperation`/validation only in combination with
    `sfHookNamespace` — but that exact combination is *always* classified
    `hsoNSDELETE`, not `hsoUPDATE` (see [^ns-update]), so a validated
    `hsoUPDATE` can never actually carry `hsfNSDELETE`. See
    [flags](flags.md).
[^flags-delete]: Required; must include `hsfOVERRIDE`; allowed bits are
    limited to `hsfOVERRIDE | hsfNSDELETE | hsfCOLLECT`.
    <!-- SetHook.cpp:316-334 -->
[^flags-nsdelete]: Required; must equal **exactly** `hsfNSDELETE`, no other
    bit.
    <!-- SetHook.cpp:284-292 -->

## Per-operation detail

### `hsoCREATE`
<!-- SetHook.cpp:413-611, apply SetHook.cpp:1743-1908 -->

- `sfCreateCode` non-empty, ≤ 65,535 bytes; guard-validated and
  WasmEdge-smoke-tested (see [CreateCode](createcode.md)).
- `sfHookNamespace` required (`NAMESPACE_MISSING` otherwise).
- `sfHookApiVersion` required, must equal `0` (`API_MISSING`/`API_INVALID`).
- Exactly one of `sfHookOn` alone, or `sfHookOnIncoming` +
  `sfHookOnOutgoing` together (distinct values, requires
  `featureHookOnV2`); before the amendment, `sfHookOn` alone is mandatory.
- `sfHookGrants`/`sfHookParameters`, if present, validated by
  `validateHookGrants`/`validateHookParams` and become the new
  definition's *default* set — not merged against anything, since there is
  no prior definition.
- `sfHookName`, if present, validated by `validateHookName`; requires
  `featureNamedHooks`.
- `sfHookCanEmit`, if present, requires `featureHookCanEmit`; no additional
  shape validation.
  <!-- SetHook.cpp:510-515 -->
- `sfFlags`: `hsfOVERRIDE` required only to replace an already-installed
  hash at the same chain slot.
- If the WASM's hash already matches an existing `ltHOOK_DEFINITION`, the
  whole operation `[[fallthrough]]`s into `hsoINSTALL`'s apply logic —
  see [HookHash](hookhash.md).
  <!-- SetHook.cpp:1907 -->

### `hsoINSTALL`
<!-- SetHook.cpp:339-367, apply SetHook.cpp:1913-2045 -->

- `sfHookHash` required; `preclaim` requires the referenced
  `ltHOOK_DEFINITION` to already exist (`terNO_HOOK`).
  <!-- SetHook.cpp:704-728 -->
- `sfHookApiVersion` forbidden (`API_ILLEGAL`).
- `sfHookGrants`/`sfHookParameters`, if present, validated the same way as
  create; parameters go through the three-way merge described in
  [HookParameters](hookparameters.md) (starting from an empty prior set).
- `sfHookNamespace`, `sfHookOn`/`sfHookOnIncoming`/`sfHookOnOutgoing`,
  `sfHookCanEmit`, `sfHookName` are all accepted with no
  install-specific structural checks in `validateHookSetEntry` beyond the
  global amendment gates on `HookCanEmit`/`HookName` — see the deviation
  note below regarding the Incoming/Outgoing pair. At apply time each is
  stored on the entry only if it differs from the target definition's
  resolved value (the same storage-optimization pattern as `hsoUPDATE`).
  <!-- SetHook.cpp:1962-2016 -->
- `sfFlags`: `hsfOVERRIDE` required only if a hook already occupies the
  target chain slot (`tecREQUIRES_FLAG` otherwise).

### `hsoUPDATE`
<!-- SetHook.cpp:369-411, apply SetHook.cpp:1586-1741 -->

- Inferred whenever none of `sfHookHash`/`sfCreateCode` are present, at
  least one other field is present, and it isn't the specific
  `(sfHookNamespace present, hsfNSDELETE set)` pair that infers
  `hsoNSDELETE` instead.
- `sfHookApiVersion` forbidden (`API_ILLEGAL`).
- `hsfOVERRIDE` forbidden unconditionally; `hsfNSDELETE` is only accepted
  by validation together with `sfHookNamespace`, but that combination is
  never actually classified `hsoUPDATE` (see [^flags-update] above) — so
  in effect `hsoUPDATE` can carry neither control bit.
- `sfHookGrants`/`sfHookParameters`: absent → prior value carried over
  unchanged; explicit empty array → cleared; non-empty → replaces
  (grants) or three-way-merges (parameters, see
  [HookParameters](hookparameters.md)).
- `sfHookNamespace`, `sfHookOn`/`sfHookOnIncoming`/`sfHookOnOutgoing`,
  `sfHookCanEmit`, `sfHookName`: all optional, each stored on the entry
  only if it differs from the resolved definition value, else removed
  from the entry to fall back to the default. This has been confirmed by
  individually setting each field, then individually resetting each back
  to its definition default.
  <!-- SetHook.cpp:1618-1693; confirmed by SetHook_test.cpp:2459-2594 -->
- `sfFlags`, if present, is stored verbatim (raw, not the
  `hsfOVERRIDE`/`hsfNSDELETE`-stripped value used by create/install — see
  [flags](flags.md) for why this has no observable effect here).

### `hsoDELETE`
<!-- SetHook.cpp:297-337, apply SetHook.cpp:1549-1584 -->

- Only `sfCreateCode` (empty) and `sfFlags` may be present; every other
  field — grants, parameters, `HookOn`/`HookOnIncoming`/`HookOnOutgoing`,
  `HookCanEmit`, `HookApiVersion`, `HookNamespace`, `HookName` — is
  forbidden (`DELETE_FIELD`). This has been verified exhaustively.
  <!-- SetHook_test.cpp:730-770 -->
- `sfFlags` required, must include `hsfOVERRIDE` (`OVERRIDE_MISSING`
  otherwise); allowed bits limited to
  `hsfOVERRIDE | hsfNSDELETE | hsfCOLLECT` (`FLAGS_INVALID` otherwise).
- At apply time: places a blank `sfHook` at that chain position; if a hook
  previously occupied the slot, its `ltHOOK_DEFINITION` reference count is
  decremented (and the definition erased if it reaches zero) — see
  [HookHash](hookhash.md).
- If `hsfNSDELETE` is also set, the *prior* occupant's namespace is queued
  for destruction as a side effect — see
  [HookNamespace](hooknamespace.md).
  <!-- SetHook.cpp:1509-1514 -->

### `hsoNSDELETE`
<!-- SetHook.cpp:263-295, apply via destroyNamespace, SetHook.cpp:881-1059 -->

- Only `sfHookNamespace` and `sfFlags` may be present, and **both are
  required**; every other field is forbidden (`NSDELETE_FIELD`). This has
  been verified exhaustively.
  <!-- SetHook_test.cpp:923-960 -->
- `sfFlags` must equal **exactly** `hsfNSDELETE` — no other bit, including
  `hsfOVERRIDE` or `hsfCOLLECT` (`NSDELETE_FLAGS`).
- Does not touch the hook chain itself — the `sfHook` array slot this
  entry occupies is otherwise treated like NOOP for chain purposes (the
  prior hook at that position, if any, is carried through unchanged); only
  the named namespace's Hook State is affected. See
  [HookNamespace](hooknamespace.md) for the full deletion mechanics,
  including the `fixNSDelete`-gated partial-delete (`tesPARTIAL`) and
  owner-reserve-refund behavior.

### `hsoNOOP`
<!-- SetHook.cpp:259-261, apply SetHook.cpp:1538-1544 -->

- All 12 fields absent (subject to the directional-`HookOn` quirk
  described above). A wholly blank `sfHook` object (`getCount() == 0`) is
  skipped even earlier, in the preflight per-array-element loop, and
  doesn't reach `inferOperation` at all.
  <!-- SetHook.cpp:806-807 -->
- At apply time, the chain slot is left exactly as it was (existing hook
  copied through unchanged, or a blank placeholder if none existed).

## Amendment gates

- `featureHooks` gates the entire transaction type.
  <!-- include/xrpl/protocol/detail/features.macro:99; SetHook.cpp:733-739 -->
- `featureHookOnV2` governs the directional
  `HookOn` form: use plain `sfHookOn`, or use the
  `sfHookOnIncoming`/`sfHookOnOutgoing` pair with different values. See
  [HookOnIncoming / HookOnOutgoing](hookon-incoming-outgoing.md).
  <!-- features.macro:67 -->
- `featureHookCanEmit` and `featureNamedHooks`
  each gate their field **globally**, on every
  non-blank `sfHook` object regardless of inferred operation.
  <!-- features.macro:78, features.macro:39; SetHook.cpp:811-817 -->

## Related documents

- [README](README.md) — full field-location table and index.
- [HookHash](hookhash.md), [CreateCode](createcode.md) — the two fields
  that drive `inferOperation`'s primary branch.
- [HookGrants](hookgrants.md), [HookParameters](hookparameters.md) — the
  two array fields, both optional on CREATE/INSTALL/UPDATE, forbidden on
  DELETE/NSDELETE.
- [HookNamespace](hooknamespace.md) — the field with opposite
  required/forbidden rules between DELETE and NSDELETE.
- [HookApiVersion](hookapiversion.md) — legal in exactly one operation.
- [flags](flags.md) — full `hsf*` bit reference.
- [HookOn](hookon.md), [HookOnIncoming / HookOnOutgoing](hookon-incoming-outgoing.md),
  [HookCanEmit](hookcanemit.md), [HookName](hookname.md) — the four fields
  documented before this page was added.
