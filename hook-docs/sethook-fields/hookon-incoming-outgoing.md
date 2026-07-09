---
sidebarTitle: "HookOnIncoming/Outgoing"
---

# HookOnIncoming / HookOnOutgoing

**Purpose:** split `HookOn` into two independent bit fields so a hook can react
differently depending on whether the triggering transaction is outgoing from
the hook's own account or incoming to it (from some other account's
transaction).

**Amendment gating:** both fields require `featureHookOnV2`
(`include/xrpl/protocol/detail/features.macro:67`, `Supported::yes,
VoteBehavior::DefaultNo`). Before the amendment, only plain `HookOn` is
accepted; supplying `HookOnIncoming`/`HookOnOutgoing` without the amendment is
rejected (`temMALFORMED`, confirmed by the `!hookOnV2 ? ter(temMALFORMED) :
ter(tesSUCCESS)` assertions at `SetHook_test.cpp:1408-1437`).

**Validation rules (`SetHook.cpp:458-508`):**
- If `sfHookOn` is **absent** on a create, `featureHookOnV2` must be enabled
  and **both** `sfHookOnOutgoing` and `sfHookOnIncoming` must be present,
  and they must be **different from each other**:
  ```cpp
  auto const outgoing = hookSetObj.getFieldH256(sfHookOnOutgoing);
  auto const incoming = hookSetObj.getFieldH256(sfHookOnIncoming);
  if (outgoing == incoming)
  {
      ... "SetHook outgoing and incoming hookon must be different.";
      return false;
  }
  ```
  (If they were required to be equal, you should simply use plain `HookOn`
  instead; the pair only exists to let the two directions diverge.)
- If `sfHookOn` **is** present, neither `sfHookOnOutgoing` nor
  `sfHookOnIncoming` may also be present (`temMALFORMED` otherwise) — the two
  forms are mutually exclusive at the object level.
- Both rules are exercised directly in `SetHook_test.cpp:1471-1518`
  ("Only Incomig/Outgoing HookOn", "One Incomig/Outgoing HookOn and HookOn",
  "Incoming == Outgoing", "HookOn and both Fields" — all `temMALFORMED`).
- `hsoDELETE` and `hsoNSDELETE` operations must **not** carry any of `HookOn`,
  `HookOnIncoming`, or `HookOnOutgoing` (`SetHook.cpp:263-330`).

**Direction semantics — what "incoming" and "outgoing" mean.** The perspective
is always the account the hook is installed on, and it is decided by the
caller, not by the field-resolution code. `Transactor::calculateHookChainFee`
and `Transactor::executeHookChain` both take an `isOutgoing` flag:

```cpp
// Transactor.cpp:307-308 (fee) and :1372-1373 (execution) — identical pattern
uint256 hookOn = hook::getHookOn(
    hookObj, hookDef, isOutgoing ? sfHookOnOutgoing : sfHookOnIncoming);
```

The call sites resolve `isOutgoing`:
- The hook chain on the transaction's **own** `sfAccount` is evaluated with
  `isOutgoing = true` → uses `HookOnOutgoing`
  (`Transactor.cpp:393-395`: `calculateHookChainFee(view, tx,
  keylet::hook(tx.getAccountID(sfAccount)), true)`).
- The hook chains on other **transactional stakeholders** (accounts with a
  stake in the transaction besides the sender — e.g. a `Destination`, found via
  `hook::getTransactionalStakeHolders`) are evaluated with `isOutgoing = false`
  → uses `HookOnIncoming` (`Transactor.cpp:399-405`).
- `ClaimReward.cpp:165-167` independently confirms this reading: the hook
  installed on the reward *issuer* (not the transaction's `Account`) is checked
  against `sfHookOnIncoming`, because a `ClaimReward` transaction is incoming
  to the issuer, not sent by it.

So: **outgoing** = this account is the transaction's sender (`sfAccount`);
**incoming** = this account is some other stakeholder of the transaction (e.g.
a payment destination), and the transaction arrived at it without it being the
sender.

**Worked/verified example (`SetHook_test.cpp:1558-1596`):** a hook installed on
`alice` with `HookOnOutgoing` armed only for `ttPAYMENT` and `HookOnIncoming`
armed only for `ttINVOKE`:

| Transaction | Direction for alice | Fires? |
|---|---|---|
| `invoke(bob) → dest(alice)` | incoming (alice is destination) | yes (Invoke armed on incoming) |
| `pay(bob, alice, ...)` | incoming | no (Payment not armed on incoming) |
| `pay(alice, bob, ...)` | outgoing (alice is sender) | yes (Payment armed on outgoing) |
| `invoke(alice)` | outgoing | no (Invoke not armed on outgoing) |

**Common mistakes:**
- Supplying `HookOnIncoming`/`HookOnOutgoing` with equal values — rejected;
  use plain `HookOn` for that case.
- Mixing `HookOn` with either directional field on the same `sfHook` object —
  rejected.
- Assuming "incoming"/"outgoing" refers to money flow direction. It refers to
  whether *this account* is the transaction's sender, for any transaction
  type — including non-payment types like `Invoke` or `ClaimReward`.
