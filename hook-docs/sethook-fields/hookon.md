# HookOn

**Purpose:** selects which transaction types cause a hook to fire, as a 256-bit
field where each bit position corresponds to a `TxType` value.

**Amendment gating:** before `featureHookOnV2`, `sfHookOn` is mandatory on
create — omitting it is rejected.
<!-- From `SetHook.cpp:458-469`:

```cpp
// validate sfHookOn
if (!hookSetObj.isFieldPresent(sfHookOn))
{
    if (!ctx.rules.enabled(featureHookOnV2))
    {
        ...
            << "]: Malformed transaction: SetHook must include "
               "sfHookOn before featureHookOnV2 is enabled.";
        return false;
    }
    ...
```
-->


Once `featureHookOnV2` is enabled, a create/install/update may supply **either**
`sfHookOn` alone **or** the `sfHookOnIncoming`/`sfHookOnOutgoing` pair, but never
both — see [HookOnIncoming / HookOnOutgoing](hookon-incoming-outgoing.md) for
the mutual-exclusivity rule and confirming test cases.

**Runtime semantics — the bit layout.** The active-high/active-low split is
easy to get backwards, so it's worth spelling out precisely.
<!-- The check is `hook::canHook` in
`src/xrpld/app/hook/detail/applyHook.cpp:806-825`, quoted here in full because the
active-high/active-low split is easy to get backwards:

```cpp
// Called by Transactor.cpp to determine if a transaction type can trigger a
// given hook... The HookOn field in the SetHook transaction determines which
// transaction types (tt's) trigger the hook. Every bit except ttHookSet is
// active low, so for example ttESCROW_FINISH = 2, so if the 2nd bit (counting
// from 0) from the right is 0 then the hook will trigger on ESCROW_FINISH. If
// it is 1 then ESCROW_FINISH will not trigger the hook. However ttHOOK_SET = 22
// is active high, so by default (HookOn == 0) ttHOOK_SET is not triggered by
// transactions. If you wish to set a hook that has control over ttHOOK_SET then
// set bit 1U<<22.
bool
hook::canHook(ripple::TxType txType, ripple::uint256 hookOn)
{
    // invert ttHOOK_SET bit
    hookOn ^= UINT256_BIT[ttHOOK_SET];

    // invert entire field
    hookOn = ~hookOn;

    return (hookOn & UINT256_BIT[txType]) != beast::zero;
}
```
-->

In words: for every transaction type **except** `ttHOOK_SET` (22), a `0` bit
means "fire on this type" and a `1` bit means "don't fire" (active-low). For
`ttHOOK_SET` specifically, the sense is flipped: a `1` bit means "fire on
`SetHook`" and `0` (the default, since `HookOn` defaults to all-zero) means
"don't fire on `SetHook`". `UINT256_BIT` is a precomputed table of 256 one-hot
`uint256` values.<!-- (`include/xrpl/hook/Misc.h:9`) -->

**Effective value resolution (`hookObj` vs `hookDef`).** A hook's live `HookOn`
value is not read from a single field — it resolves with this precedence:
first the entry's own directional field on `obj` if present, then a generic
`HookOn` on `obj`, then the same directional field on `def`, then a generic
`HookOn` on `def`, and finally zero.
<!-- `hook::getHookOn` (`applyHook.cpp:850-865`):

```cpp
ripple::uint256
hook::getHookOn(
    STObject const& obj,
    std::shared_ptr<SLE const> const& def,
    SField const& field)
{
    if (obj.isFieldPresent(field))
        return obj.getFieldH256(field);
    if (obj.isFieldPresent(sfHookOn))
        return obj.getFieldH256(sfHookOn);
    if (def->isFieldPresent(field))
        return def->getFieldH256(field);
    if (def->isFieldPresent(sfHookOn))
        return def->getFieldH256(sfHookOn);
    return uint256{0};
}
```
-->

`obj` is the per-account `sfHook` entry in `ltHOOK`; `def` is the shared
`ltHOOK_DEFINITION`; `field` is `sfHookOnIncoming` or `sfHookOnOutgoing`
(direction is resolved by the caller — see below). So a generic `HookOn` set on
the *account's* hook entry overrides direction-specific values from the
*definition*, and a generic `HookOn` on the definition is the last fallback
before an implicit zero. This avoids storing a value on
`ltHOOK` when it's identical to the definition's default.<!-- see
`SetHook.cpp:1976-1987`, the storage-optimization comment "set the hookon field
if it differs from definition" -->

**Worked example — fire only on `ttPAYMENT` (0), never on `ttHOOK_SET` (22):**

Start from all-1s (nothing fires) and clear bit 0 (arm `ttPAYMENT`), leaving bit
22 at `0` (so `ttHOOK_SET` stays off, matching the default). The result is
`0xFFF...FFE` — all `f`s except the last hex digit, which is `e` (`1110`,
clearing only bit 0):

```
ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffbffffe
```

This value (used as `HookOnOutgoing`) has zero-bit positions `{0, 22}` — bit 0
clear (fires on `ttPAYMENT`), bit 22 clear (does not fire on `ttHOOK_SET`). A
paired `HookOnIncoming` value clearing bits `{22, 99}` — `ttINVOKE = 99` —
achieves the same reasoning applied to `ttINVOKE` instead of `ttPAYMENT`.
<!-- This is exactly the value used in
`src/test/app/SetHook_test.cpp:1564-1566`, commented `// Payment high`. The
paired `HookOnIncoming` value is from the same test
(`SetHook_test.cpp:1561-1563`, commented `// Invoke high`); `ttINVOKE = 99` per
`transactions.macro:557`. -->

**Common mistakes:**
- Treating `HookOn` as active-high uniformly. It is active-*low* for every
  transaction type except `ttHOOK_SET`, which is active-*high*.
- Forgetting that a generic `HookOn` on the `sfHook` object silently overrides
  *both* directions even if the definition has distinct
  `HookOnIncoming`/`HookOnOutgoing` values — installing a hook with `HookOn = 0`
  at the `ltHOOK` level makes it fire on both incoming and outgoing traffic
  regardless of the definition's split values.<!-- see the "Execution" test at
  `SetHook_test.cpp:1600-1656` -->
- Assuming `HookOn == 0` disables the hook entirely. It means "fire on
  everything except `SetHook`" — the least restrictive, not the most
  restrictive, setting.
