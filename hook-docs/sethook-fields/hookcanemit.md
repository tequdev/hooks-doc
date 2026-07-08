# HookCanEmit

**Purpose:** restricts which transaction types a hook is permitted to `emit()`,
using the identical bit encoding and evaluation function as `HookOn`.

**Amendment gating:** `featureHookCanEmit`
(`include/xrpl/protocol/detail/features.macro:78`, `Supported::yes,
VoteBehavior::DefaultNo`). If the field is present in an `sfHook` object without
the amendment enabled, the whole `SetHook` operation is rejected:

```cpp
// SetHook.cpp:811-813
if (!ctx.rules.enabled(featureHookCanEmit) &&
    hookSetObj.isFieldPresent(sfHookCanEmit))
    return temDISABLED;
```

**Validation:** `SetHook.cpp:510-515` treats absence as a no-op — "HookCanEmit
field is an optional field for backward compatibility" — there is no length or
shape validation beyond it being a `UINT256`, and it is subject to the same
`hsoDELETE`/`hsoNSDELETE` exclusion as `HookOn` (`SetHook.cpp:270,303`).

**Runtime semantics.** `hook::canEmit` is literally `hook::canHook` applied to
the emitted transaction's type and the hook's effective `HookCanEmit` value
(`applyHook.cpp:827-831`):

```cpp
bool
hook::canEmit(ripple::TxType txType, ripple::uint256 hookCanEmit)
{
    return hook::canHook(txType, hookCanEmit);
}
```

— so the same active-low-except-`ttHOOK_SET` rule from [HookOn](hookon.md)
applies here too.

**Default value.** Unlike `HookOn` (default all-zero), `HookCanEmit` defaults
to a value with **only** bit 22 (`ttHOOK_SET`) set
(`applyHook.cpp:833-848`):

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

Feeding `1<<22` through `canHook` inverts to all-1s, so — per the code's own
comment — the default **allows every transaction type to be emitted,
including `ttHOOK_SET`**. There is no `getHookOn`-style directional resolution
here: it is simply `sfHook` entry → `ltHOOK_DEFINITION` → hardcoded default,
with no incoming/outgoing split.

**Enforcement point.** Checked inside the `emit()` host function
(`src/xrpld/app/hook/detail/HookAPI.cpp:529-535`):

```cpp
ripple::uint256 const& hookCanEmit = hookCtx.result.hookCanEmit;
if (!hook::canEmit(txType, hookCanEmit))
{
    JLOG(j.trace()) << "HookEmit[" << HC_ACC() << "]: Hook cannot emit this txn.";
    return Unexpected(EMISSION_FAILURE);
}
```

A disallowed emit returns `EMISSION_FAILURE` (`-11`) from `emit()` — the same
error code documented in `overview.md`'s error table — not a rollback; the hook
must check the return value itself.

**Worked/verified examples (`SetHook_test.cpp:14964-15048`, values confirmed
against actual `emit()` results in a running hook):**

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
