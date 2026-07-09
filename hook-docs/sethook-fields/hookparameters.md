# HookParameters

**Purpose:** an array of name/value pairs a hook can read at runtime via
`hook_param()`. `hsoCREATE` sets the *default* parameter set on the shared
`ltHOOK_DEFINITION`; every other operation that carries `sfHookParameters`
performs a three-way merge against that default, letting each account that
installs the same WASM override individual parameters without duplicating
the whole set.

**Field declarations.** `sfHookParameters` is `ARRAY`, code 19.
<!--
include/xrpl/protocol/detail/sfields.macro:414

```cpp
UNTYPED_SFIELD(sfHookParameters,         ARRAY,     19)
```
-->

It is `soeOPTIONAL` on `sfHook`; `soeREQUIRED` on `ltHOOK_DEFINITION` — a
definition always carries its (possibly empty) default array. Each element
is an `sfHookParameter` object, `OBJECT` code 23, with a template requiring
`sfHookParameterName` (`soeREQUIRED`) and `sfHookParameterValue`
(`soeOPTIONAL`).
<!--
src/libxrpl/protocol/InnerObjectFormats.cpp:96
include/xrpl/protocol/detail/ledger_entries.macro:101
sfields.macro:374
InnerObjectFormats.cpp:111-114

```cpp
add(sfHookParameter.jsonName,
    sfHookParameter.getCode(),
    {{sfHookParameterName, soeREQUIRED},
     {sfHookParameterValue, soeOPTIONAL}});
```
-->

`sfHookParameterName`/`sfHookParameterValue` are both `VL`, codes 24 and 25
respectively.
<!-- sfields.macro:287-288 -->

**Validation** runs for `hsoINSTALL`, `hsoUPDATE`, and `hsoCREATE` whenever
the array is present; forbidden entirely on `hsoDELETE`/`hsoNSDELETE`.
<!--
`validateHookParams` (src/xrpld/app/tx/detail/SetHook.cpp:115-205), run
whenever the array is present (SetHook.cpp:341-344,385-388,414-418);
forbidden on hsoDELETE/hsoNSDELETE (SetHook.cpp:265,298).
-->

1. **Max 16 entries** (`HOOK_PARAMS_COUNT`) — 17 params is rejected as
   `temMALFORMED`.
   <!-- SetHook.cpp:121-129; verified SetHook_test.cpp:485-508 -->
2. **Every element must be an `sfHookParameter` object**
   (`PARAMETERS_ILLEGAL`).
   <!-- SetHook.cpp:135-142; verified SetHook_test.cpp:571-588 -->
3. **Every element's sub-fields must only be `sfHookParameterName`/`Value`**
   (`PARAMETERS_FIELD`), and `sfHookParameterName` must actually be present
   (`PARAMETERS_NAME`).
   <!-- SetHook.cpp:148-160; SetHook.cpp:166-174 -->
4. **Size limits** — name ≤ `hook::maxHookParameterKeySize()` = 32 bytes,
   value ≤ `hook::maxHookParameterValueSize()` = 256 bytes
   (`HOOK_PARAM_SIZE`); a 33-byte name or a 257-byte value is rejected.
   <!-- include/xrpl/hook/Enum.h:60-70; check at SetHook.cpp:179-189;
   verified SetHook_test.cpp:531-568 -->
5. **No duplicate names within the submitted array**
   (`PARAMETERS_NAME_REPEATED`).
   <!-- SetHook.cpp:191-201; verified SetHook_test.cpp:510-529 -->

Note this validates only the *submitted* array's internal consistency — it
does not know about, or check against, any existing default on
`ltHOOK_DEFINITION`. That reconciliation happens separately, at apply time.

**The three-value semantics of a submitted parameter** apply at apply time
for `hsoUPDATE` and `hsoINSTALL`. A parameter in a `SetHook`'s
`sfHookParameters` array can take one of three shapes, and each means
something different:
<!--
`updateHookParameters` (SetHook.cpp:1105-1256); the three-shape table below
mirrors a comment preserved in the code because the distinction is easy to
lose (SetHook.cpp:1117-1136).
-->

| Shape | JSON | Effect |
|---|---|---|
| Name + populated Value | `{Name: "X", Value: "Y"}` | Set the pair on the account's `sfHook` entry — **unless** it exactly matches the definition's default for that name, in which case it is omitted (implicitly inherits the default) |
| Name + empty Value (EV) | `{Name: "X", Value: ""}` | Set an explicit null/blank override on the entry — **unless** the definition has no default for that name at all, in which case it is dropped (nothing to override) |
| Name only, Value absent (AV) | `{Name: "X"}` | **Always** removes any entry-level override for that name, resetting it to the definition's default (even if the default doesn't exist either) |

The algorithm starts from the entry's existing stored parameters (empty for
`hsoINSTALL`, since there is no prior entry), overlays every name from the
submitted array (AV becomes an unpopulated value, EV becomes a
populated-but-empty one), then for each name that also has a definition
default: drops it from the result if the resolved value is
absent-or-equal-to-default, or keeps it as an explicit blank if it's an EV
that differs from a default that does exist. Finally, anything still
AV-or-EV-without-a-default is dropped entirely. The 16-entry cap and the
per-entry size limits are re-checked on the *merged* result too, failing
with `tecINTERNAL` on overflow — this is a defense-in-depth re-check, not
expected to trigger given preflight validation already bounded the input.
<!--
SetHook.cpp:1138-1213 (oldParameters); explicitBlanks, SetHook.cpp:1169-1194;
SetHook.cpp:1201-1213; re-check at SetHook.cpp:1215-1244.
-->

**`hsoCREATE` just stores the submitted array as the definition's default,
unmerged.** There is no three-way merge on create — every name/value pair
supplied becomes the baseline every later install/update is diffed against.
<!--
SetHook.cpp:1861-1865

```cpp
newHookDef->setFieldArray(
    sfHookParameters,
    hookSetObj->get().isFieldPresent(sfHookParameters)
        ? hookSetObj->get().getFieldArray(sfHookParameters)
        : STArray{});
```
-->

**Owner reserve vs. transaction fee — two different charges.** Adding a
parameter that ends up stored on the account's `sfHook` entry costs 1
owner-reserve unit (same as grants — see [HookGrants](hookgrants.md)).
Separately, a **flat 1 drop per byte** of name+value in the transaction's
*submitted* `sfHookParameters` array is added to the transaction fee —
charged once at submission regardless of whether the merge above later
discards some entries as matching defaults. A code comment claims
parameters are "billed at the same rate as code bytes", but `sfCreateCode`
is billed 500 drops/byte (see [CreateCode](createcode.md)) — the comment
does not match the 1-drop/byte arithmetic actually implemented; treat the
code as authoritative.
<!--
`SetHook::computeHookReserve` (SetHook.cpp:1264-1279); `SetHook::calculateBaseFee`
(SetHook.cpp:657-683); comment at SetHook.cpp:658; `hook::computeCreationFee`.
-->

**Verified examples:**
<!-- SetHook_test.cpp:2597-2796 -->

| Action | Result |
|---|---|
| Add 3 new parameters via update | All 3 stored alongside the 2 set at create <!-- SetHook_test.cpp:2603-2663 --> |
| Submit `{Name: "CAFE"}` (AV, no value) | `CAFE` removed from the entry — reset to default <!-- SetHook_test.cpp:2665-2716 --> |
| Submit `{Name: "CAFE", Value: ""}` (EV) | `CAFE` re-added to the entry with an explicit empty value, since `CAFE`'s definition default is non-empty and differs <!-- SetHook_test.cpp:2718-2772 --> |
| Submit `HookParameters: []` (empty array, not merged per-name) | **All** parameters removed from the entry <!-- !hooks[0].isFieldPresent(sfHookParameters), SetHook_test.cpp:2774-2796 --> |

Note the last row: an empty array is a distinct, coarser signal than any
per-parameter AV — it wipes every override on the entry in one step, not
just the ones named.

**Common mistakes:**
- Confusing AV (`{Name}`, no `Value` key) with EV (`{Name, Value: ""}`).
  AV always deletes the override; EV only survives if the definition has no
  default to fall back to, otherwise it also collapses to a delete.
- Assuming `hsoCREATE`'s array participates in the same reset-to-default
  logic. It doesn't — create simply writes what's submitted as the new
  baseline; there is nothing yet to diff against.
- Repeating the "same rate as code bytes" comment for the parameter fee —
  the executed rate is 1 drop/byte, not `hook::computeCreationFee`'s 500
  drops/byte.
- Forgetting that the 16-entry/size-limit re-check after merging can itself
  fail (`tecINTERNAL`) even though preflight already validated the
  submitted array — this can only happen if the merge with existing state
  pushes the *result* over a limit the input alone didn't.

## Related documents

- [fees.md](../fees.md) — where the flat 1-drop/byte parameter fee fits
  into the full hook fee model.
- [HookGrants](hookgrants.md) — the sibling array field with matching
  8-vs-16 count limits and per-entry owner reserve, but no definition-level
  defaults or three-way merge.
- [CreateCode](createcode.md) — the create-time fee comparison referenced
  above.
- [operations-field-matrix.md](operations-field-matrix.md) — full
  per-operation legality table.
