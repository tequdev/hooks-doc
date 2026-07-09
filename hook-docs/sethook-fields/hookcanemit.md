# HookCanEmit

**Purpose:** restricts which transaction types a hook is permitted to `emit()`,
using the identical bit encoding and evaluation function as `HookOn`.

**Amendment gating:** `featureHookCanEmit`
is supported with `VoteBehavior::DefaultNo`. If the field is present in an
`sfHook` object without the amendment enabled, the whole `SetHook` operation is
rejected with `temDISABLED`.

<!-- `include/xrpl/protocol/detail/features.macro:78`, `Supported::yes`,
`VoteBehavior::DefaultNo`
```cpp
// SetHook.cpp:811-813
if (!ctx.rules.enabled(featureHookCanEmit) &&
    hookSetObj.isFieldPresent(sfHookCanEmit))
    return temDISABLED;
```
-->

**Validation:** Absence is treated as a no-op because `HookCanEmit` is optional
for backward compatibility. There is no length or shape validation beyond it
being a `UINT256`, and it is subject to the same `hsoDELETE`/`hsoNSDELETE`
exclusion as `HookOn`.
<!-- `SetHook.cpp:510-515`, `SetHook.cpp:270,303` -->

**Runtime semantics.** The emitted transaction's type and the hook's effective
`HookCanEmit` value are evaluated identically to `HookOn`.

<!-- `hook::canEmit`, `hook::canHook`, `applyHook.cpp:827-831`
```cpp
bool
hook::canEmit(ripple::TxType txType, ripple::uint256 hookCanEmit)
{
    return hook::canHook(txType, hookCanEmit);
}
```
-->

The same active-low-except-`ttHOOK_SET` rule from [HookOn](hookon.md) therefore
applies here too.

**Default value.** Unlike `HookOn` (default all-zero), `HookCanEmit` defaults
to a value with **only** bit 22 (`ttHOOK_SET`) set.

<!-- `hook::getHookCanEmit`, `applyHook.cpp:833-848`
```cpp
ripple::uint256
hook::getHookCanEmit(
    ripple::STObject const& hookObj,
    SLE::pointer const& hookDef)
{
    // default allows all transaction types
    uint256 defaultHookCanEmit = UINT256_BIT[ttHOOK_SET];

    uint256 hookCanEmit =
        (hookObj.isFieldPresent(sfHookCanEmit)
             ? hookObj.getFieldH256(sfHookCanEmit)
             : hookDef->isFieldPresent(sfHookCanEmit)
             ? hookDef->getFieldH256(sfHookCanEmit)
             : defaultHookCanEmit);
    return hookCanEmit;
}
```
-->

Under the `HookOn` evaluation rule, `1<<22` inverts to all-1s, so the default
**allows every transaction type to be emitted, including `ttHOOK_SET`**. There
is no directional resolution: the effective value is selected from the
`sfHook` entry, then `ltHOOK_DEFINITION`, then the hardcoded default, with no
incoming/outgoing split.
<!-- `hook::canHook`, `hook::getHookOn` -->

**Enforcement point.** The permission is checked inside the `emit()` host
function. A disallowed emit returns `EMISSION_FAILURE` (`-11`) from `emit()` —
the same error code documented in `overview.md`'s error table — not a rollback;
the hook must check the return value itself.

<!-- `src/xrpld/app/hook/detail/HookAPI.cpp:529-535`
```cpp
ripple::uint256 const& hookCanEmit = hookCtx.result.hookCanEmit;
if (!hook::canEmit(txType, hookCanEmit))
{
    JLOG(j.trace()) << "HookEmit[" << HC_ACC() << "]: Hook cannot emit this txn.";
    return Unexpected(EMISSION_FAILURE);
}
```
-->

**Worked examples** (values reflect actual `emit()` results in a running hook):
<!-- Verified by `SetHook_test.cpp:14964-15048`. -->

| `HookCanEmit` value | Effect |
|---|---|
| *(absent)* | `0x0...400000` (bit 22 only) → default → **all** types emittable, including `ttHOOK_SET` |
| `0x0...400000` (bit 22 only, set explicitly) | same as absent — this *is* the default |
| `0x00...00` (all zero) | Everything **except** `ttHOOK_SET` is emittable (`Payment`/`AccountSet` succeed, emitting a `SetHook` returns `EMISSION_FAILURE`) |
| `0xFF...FF` (all one) | **Only** `ttHOOK_SET` is emittable (`Payment`/`AccountSet` return `EMISSION_FAILURE`, emitting a `SetHook` succeeds) |

**Common mistakes:**
- Assuming an absent `HookCanEmit` is maximally restrictive. It is maximally
  *permissive* — it allows emitting everything, `SetHook` included.
- Assuming `HookCanEmit = 0` blocks all emission. It blocks only `SetHook`
  emission; every other type remains emittable.
- Forgetting `canEmit` shares `HookOn`'s active-high quirk for bit 22 — an
  all-`0xFF` `HookCanEmit` looks maximally permissive but is in fact maximally
  *restrictive* (only `SetHook` allowed).
