---
sidebarTitle: "TSH"
---

# Transactional Stake Holders (TSH)

A **Transactional Stake Holder (TSH)** is an account — other than the
originating (`sfAccount`) account — that a transaction affects closely enough
that the account's own installed hooks are also given a chance to run for
that transaction. The canonical example is a `Payment`: the sender's hooks
always fire (they are the originator, not a TSH), and the **destination**
account is added as a TSH so its hooks fire too, even though the destination
did not sign or submit the transaction.

Which accounts become a transaction's TSHs is fixed and deterministic: for
each transaction type, Xahau derives the TSH set from the transaction's own
fields (for a `Payment`, for instance, the `sfDestination`). Because every
node applies the same rules, you can tell from a transaction alone whose hooks
will be offered a chance to run. If hooks are not enabled on the network, or
the transaction has no originating `sfAccount`, it has no TSHs. Every
transaction type has a defined rule — see
[TSH by transaction type](#tsh-by-transaction-type) below for the full list.
<!-- src/xrpld/app/hook/detail/applyHook.cpp:27-595 — getTransactionalStakeHolders(STTx const& tx, ReadView const& rv); returns {} if featureHooks disabled or no sfAccount, then switches over tx.getTxnType() with one case per known TxType (default calls UNREACHABLE, so every compiled TxType must be handled explicitly). applyHook.cpp:30-42, 585-587 -->

Two rules govern how that set is built, and both matter when reading the table
below:

- **The originating account is never its own TSH.** The account that signs and
  submits the transaction is the *originator*, not a TSH; its own hooks run as
  the "outgoing" chain instead (see
  [Relationship to HookOn](#relationship-to-hookonhookonincoming) below). If a
  rule below would nominate the originator, that nomination is dropped.
- **Strong wins over weak.** If the same account qualifies as a TSH more than
  once for one transaction (for example, as both a URIToken's owner and its
  issuer), and one qualification is strong while another is weak, the account
  is treated as a **strong** TSH — a later weak nomination can never downgrade
  an account that has already been added as strong.
<!-- Internal: each case calls a local ADD_TSH(account, strength) lambda; it is a no-op when acc_r == *otxnAcc (originator excluded), and duplicate nominations for one account are OR-combined (tshSTRONG=true dominates tshWEAK=false). src/xrpld/app/hook/detail/applyHook.cpp:48-57, 52-56, 59-60
```cpp
auto const ADD_TSH = [&otxnAcc, &tshEntries, &upto](
                         const AccountID& acc_r, bool rb) {
    if (acc_r != *otxnAcc)
    {
        if (tshEntries.find(acc_r) != tshEntries.end())
            tshEntries[acc_r].second |= rb;
        else
            tshEntries.emplace(acc_r, std::make_pair(upto++, rb));
    }
};
```
-->

## Strong TSH vs Weak TSH

Every TSH is classified as either **strong** or **weak**. The strength decides
when the account's hooks run and whether they can stop the transaction.

<!-- Internal: getTransactionalStakeHolders returns a vector<pair<AccountID, bool>>; the bool is the strength flag — tshSTRONG=true (a.k.a. tshROLLBACK), tshWEAK=false (a.k.a. tshCOLLECT). src/xrpld/app/hook/detail/applyHook.cpp:59-60
```cpp
bool const tshSTRONG = true;  // tshROLLBACK
bool const tshWEAK = false;   // tshCOLLECT
```
-->

**Strong TSH.** The account's hooks run *before* the transaction is applied to
the ledger, in the same pass as the originating account's own hooks. A strong
TSH's hook can `rollback`, and doing so rejects the whole transaction before it
takes effect — so a strong TSH can veto a transaction that names it. If a
strong TSH's hook chain does not accept (it rolls back or otherwise fails), the
transaction is rejected for everyone.
<!-- src/xrpld/app/tx/detail/Transactor.cpp:1975-2013 (strong pass), 1704-1807 (doTSH), 1806-1807 (rollback propagation) -->

**Weak TSH.** The account's hooks run only as a **collect call**, after the
transaction has already been applied to the ledger. A weak TSH observes the
transaction but cannot change its outcome — whatever a weak hook returns, the
transaction stands.
<!-- src/xrpld/app/tx/detail/Transactor.cpp:2353, 2390 (post-application weak call result is unchecked); contrast with 1806-1807 where a strong-pass failure aborts the transaction -->

An account added as strong for a transaction is run only in the strong
(pre-apply) pass, and an account added as weak only in the weak (post-apply)
pass; the two never mix for the same account on the same transaction.
<!-- src/xrpld/app/tx/detail/Transactor.cpp:1704-1705 -->

Fees also differ by strength. A strong TSH's hook-chain fee is folded into the
transaction's required fee up front, so it is paid by the originating account.
A weak TSH instead pays its own hook-chain fee out of its own balance when its
collect call runs (subject to the affordability check described below).
<!-- src/xrpld/app/tx/detail/Transactor.cpp:1745-1750 (strong TSH fee forced to 0, already paid), 1751-1777 (weak TSH pays from own balance); 396-405 (calculateBaseFee sums strong-TSH chain fees into the base fee) -->

A related but distinct path: a **strong** hook (the originator's own, or a
strong TSH's) can call `hook_again()` during its strong run to request one
extra weak re-execution of *itself* after the transaction applies. This runs in
the same post-apply phase as weak TSHs, but because it re-runs the same hook
that asked for it — not a new account — it is not subject to the two-condition
opt-in described below.
<!-- src/xrpld/app/tx/detail/Transactor.cpp:1970-1973, 2024-2033 (aawMap built from hookResult.executeAgainAsWeak), 2392-2394 (doAgainAsWeak call), 1813- (doAgainAsWeak definition) -->

### A separate, amendment-gated source of weak TSHs

When the `featureIOUIssuerWeakTSH` amendment is enabled, there is an
additional source of weak TSHs on top of the per-transaction-type rules:
**any** account whose IOU or MPT trust-line balance is changed by the
transaction — regardless of transaction type — becomes a weak TSH. 
<!-- This is how
AMM operations (`ttAMM_CREATE`, `ttAMM_DEPOSIT`, `ttAMM_WITHDRAW`, `ttAMM_VOTE`,
`ttAMM_BID`, `ttAMM_DELETE`, `ttAMM_CLAWBACK`), which nominate no TSHs of their
own, still give the issuer or holder of an affected token a weak collect call. -->
<!-- src/xrpld/app/hook/detail/applyHook.cpp:516-526 (empty AMM cases, comment "weakTSH with IOUIssuerWeakTSH Amendment"); src/xrpld/app/tx/detail/Transactor.cpp:1621-1646 (addWeakTSHFromBalanceChanges), 2374-2380 (call site, gated on featureIOUIssuerWeakTSH) -->

Before that amendment is enabled, the accounts eligible for the weak pass are
re-derived after the transaction has applied (rather than reusing the set
computed before the strong pass), so that TSH rules depending on
post-application ledger state resolve correctly.
<!-- src/xrpld/app/tx/detail/Transactor.cpp:2382-2388 (weak-pass TSH list recomputed post-apply when featureIOUIssuerWeakTSH is off) -->

## Conditions for Weak TSH execution

Being nominated as a weak TSH is necessary but not sufficient for that
account's hooks to actually run. Two independent conditions must **both** hold
for a specific installed hook to execute during a weak (collect) pass:

1. **The account has opted in with the `asfTshCollect` account flag.** The
   account turns this on with an `AccountSet` transaction (`sfSetFlag` =
   `asfTshCollect`, value `11`), which sets `lsfTshCollect` (`0x02000000`) on
   its account root. During a collect pass, an account whose `lsfTshCollect`
   is not set has its entire hook chain skipped and is charged nothing. The
   account must also be able to afford the chain's fee plus its reserve out of
   its current balance, or its chain is skipped for lack of funds.
   <!-- include/xrpl/protocol/TxFlags.h:91 (asfTshCollect = 11); include/xrpl/protocol/LedgerFormats.h:137 (lsfTshCollect = 0x02000000); src/xrpld/app/tx/detail/SetAccount.cpp:480-488 (AccountSet sets/clears the ledger flag); Transactor.cpp:1751-1763 (weak branch reads sfFlags and skips if lsfTshCollect unset), 1765-1776 (affordability check)
   ```cpp
   uint32_t tshFlags = tshAcc->getFieldU32(sfFlags);
   if (!(tshFlags & lsfTshCollect))
   {
       // this TSH doesn't allow collect calls, skip
       continue;
   }
   ```
   -->
2. **The specific hook was installed with the `hsfCOLLECT` flag (`0x04`).**
   Even when an account's chain is allowed to run as a collect call, any
   individual hook in that chain that was installed without `hsfCOLLECT` is
   skipped. The fee a weak TSH is charged counts only the hooks that carry
   `hsfCOLLECT`, so it matches exactly the set of hooks that actually run.
   <!-- include/xrpl/hook/Enum.h:46 (hsfCOLLECT = 0b00000100U); src/xrpld/app/tx/detail/Transactor.cpp:1380-1390 (executeHookChain skips non-collect hooks on weak pass), 300-322 (calculateHookChainFee collectCallsOnly filter), 1732-1733 (fee estimate uses collectCallsOnly on weak pass)
   ```cpp
   // skip weakly executed hooks that lack a collect flag
   if (!strong && !(flags & hsfCOLLECT))
       continue;
   ```
   -->

If either condition is not met — the account never set `asfTshCollect`, or
the particular hook was installed without `hsfCOLLECT` — that hook simply
does not run for that weak-TSH pass. No error is raised and no metadata is
produced for the skipped hook; it is as if it were never installed for this
transaction.

**Worked example.** Bob wants his hook to fire as a collect call whenever he
is a weak TSH on someone else's `Payment`:

1. Bob sends `AccountSet` with `sfSetFlag = asfTshCollect` (11) — this sets
   `lsfTshCollect` on Bob's account root.
2. Bob installs (or updates) his hook with a `SetHook` `hsoCREATE`/`hsoUPDATE`
   entry whose `sfFlags` includes `hsfCOLLECT` (`0x04`), alongside whatever
   `HookOn`/`HookOnIncoming` bits select the transaction types he cares about
   — see [sethook-fields/flags.md](sethook-fields/flags.md) for the full
   `hsfOVERRIDE`/`hsfNSDELETE`/`hsfCOLLECT` flag reference.
3. Now, whenever a `Payment` (or any other transaction type that nominates Bob
   as a weak TSH — see the table below) is processed, Bob's hook runs after the
   transaction applies, with a `TxMeta` reflecting the already-applied result,
   and cannot reject the transaction.

If Bob skips step 1, or installs the hook without `hsfCOLLECT`, his hook is
never invoked as a TSH — only as the originating account's own hook chain
when Bob himself sends a transaction.

## TSH by transaction type

The table below gives the TSH rule for every transaction type, grouping types
that share the same rule. "Strong"/"Weak" is the strength each account is added
with; entries marked conditional depend on ledger state, transaction flags, or
an amendment, as noted.
<!-- one case per known TxType; 74 case labels in total, all accounted for below and in the commented NFT/AMM/etc. rows -->

| Transaction type(s) | TSH account(s) | Strength | Notes |
|---|---|---|---|
| `ttCRON` | `sfOwner` | Weak | |
| `ttREMIT` | `sfDestination` | Strong | If present. |
| | `sfInform` | Weak | Only if `sfInform` differs from both the sender and the destination. |
| | Issuer of each `sfURITokenIDs` entry | Strong if `lsfBurnable` set on the token, else Weak | Only if the token exists and its issuer differs from both its owner and the destination. |
| `ttIMPORT` | `sfIssuer` | Weak under `fixXahauV2`, Strong otherwise | Only if `sfIssuer` present. |
| `ttURITOKEN_BURN` | none | — | If token issuer == owner, no TSH is added (already covered by the burner being the otxn account). |
| | Under `fixXahauV1`: the non-burning party (issuer if owner burns, owner if issuer burns) | Weak | Only added if that account exists on ledger. |
| | Pre-`fixXahauV1` (legacy): the non-burning party | Strong | |
| `ttURITOKEN_BUY` | Current owner | Strong | Only if owner differs from the buyer (`sfAccount`). |
| | Issuer | Strong if `lsfBurnable`, else Weak | Only if issuer differs from owner. |
| `ttURITOKEN_MINT` | `sfDestination` | Strong | Only under `fixXahauV2`, and only if `sfDestination` present. |
| `ttURITOKEN_CANCEL_SELL_OFFER` | URIToken's `sfDestination` | Weak | Only under `fixXahauV2`, and only if the token's sell offer carries a `sfDestination`. |
| `ttURITOKEN_CREATE_SELL_OFFER` | Issuer | Strong if `lsfBurnable`, else Weak | Only if issuer differs from owner. |
| | `sfDestination` (of the tx) | Strong | Only if present. |
| `ttACCOUNT_SET`, `ttOFFER_CANCEL`, `ttTICKET_CREATE`, `ttHOOK_SET`, `ttOFFER_CREATE` | none | — | Self-transactions: no TSH is ever added. `OFFER_CREATE`'s counterparties from order-book crossing are **not** TSHes. |
| `ttREGULAR_KEY_SET` | `sfRegularKey` | Strong | Only if `sfRegularKey` is present. |
| `ttDEPOSIT_PREAUTH` | `sfAuthorize` | Strong | Only if `sfAuthorize` is present. |
| `ttPAYMENT`, `ttESCROW_CREATE`, `ttCHECK_CREATE`, `ttACCOUNT_DELETE`, `ttPAYCHAN_CREATE`, `ttINVOKE` | `sfDestination` | Strong | Only if `sfDestination` present. |
| `ttTRUST_SET` | Issuer of `sfLimitAmount` | Weak | Only if `sfLimitAmount` present. |
| `ttESCROW_CANCEL`, `ttESCROW_FINISH` | Escrow's `sfAccount` (source) | Strong | Resolved via `sfOwner`+`sfOfferSequence` or (under `fixXahauV1`) `sfEscrowID`. |
| | Escrow's `sfDestination` | Strong for `ttESCROW_FINISH`, Weak for `ttESCROW_CANCEL` | Only if destination differs from source. |
| `ttPAYCHAN_FUND`, `ttPAYCHAN_CLAIM` | Channel's `sfAccount` | Strong | Resolved via `sfChannel`. |
| | Channel's `sfDestination` | Weak | |
| `ttCHECK_CASH`, `ttCHECK_CANCEL` | Check's `sfAccount` | Strong | Resolved via `sfCheckID`. |
| | Check's `sfDestination` | Weak | |
| `ttSIGNER_LIST_SET` | Each `sfSignerEntries[].sfAccount` | Strong | Lets a listed signer's hooks veto being added to the list. |
| `ttGENESIS_MINT` | Each `sfGenesisMints[].sfDestination` | Weak | |
| `ttCLAWBACK` | `sfHolder` (for MPT amounts) or the clawed-back amount's issuer (for IOU) | Weak | |
| `ttCRON_SET` | none | — | |
| `ttORACLE_SET`, `ttORACLE_DELETE` | none | — | |
| `ttREMARKS_SET` | none | — | |
| `ttAMENDMENT`, `ttFEE`, `ttUNL_MODIFY`, `ttEMIT_FAILURE`, `ttUNL_REPORT` | none | — | Pseudo-transactions; no originating account to compare against in the usual sense. |

<!-- | `ttNFTOKEN_MINT`, `ttCLAIM_REWARD` | `sfIssuer` | Strong | Only if `sfIssuer` present on the tx. |
| `ttNFTOKEN_BURN`, `ttNFTOKEN_CREATE_OFFER` | NFT issuer | Strong if the `NFTokenID` encodes `tfStrongTSH`, else Weak | Requires the referenced NFT to be found via `sfNFTokenID`/`sfOwner`\|`sfAccount`. |
| | `sfOwner` | Weak | Only if `sfOwner` is present (i.e. distinct from `sfAccount`). |
| `ttNFTOKEN_ACCEPT_OFFER` | NFT issuer (from whichever offer is present) | Strong if `tfStrongTSH` set on the `NFTokenID`, else Weak | |
| | Buy offer's owner and (if present) destination | Strong | Only if a buy offer (`sfNFTokenBuyOffer`) is present and resolves. |
| | Sell offer's owner and (if present) destination | Strong | Only if a sell offer (`sfNFTokenSellOffer`) is present and resolves. |
| `ttNFTOKEN_CANCEL_OFFER` | Each cancelled offer's owner, destination (if any), and NFT issuer | Weak | Iterates `sfNFTokenOffers`; issuer cannot block a cancellation but still gets a collect call. |
| `ttAMM_CREATE`, `ttAMM_DEPOSIT`, `ttAMM_WITHDRAW`, `ttAMM_VOTE`, `ttAMM_BID`, `ttAMM_DELETE`, `ttAMM_CLAWBACK` | none directly | — | Empty case; see [A separate, amendment-gated source of weak TSHs](#a-separate-amendment-gated-source-of-weak-tshs) — under `featureIOUIssuerWeakTSH`, affected IOU issuers/holders become weak TSHs via balance-change detection instead. |
| `ttXCHAIN_CREATE_CLAIM_ID`, `ttXCHAIN_COMMIT`, `ttXCHAIN_CLAIM`, `ttXCHAIN_ACCOUNT_CREATE_COMMIT`, `ttXCHAIN_ADD_CLAIM_ATTESTATION`, `ttXCHAIN_ADD_ACCOUNT_CREATE_ATTESTATION`, `ttXCHAIN_MODIFY_BRIDGE`, `ttXCHAIN_CREATE_BRIDGE` | none | — | Marked `// TODO: Implement if needed` in source; not yet implemented. |
| `ttDID_SET`, `ttDID_DELETE` | none | — | `// TODO: Implement if needed`. |
| `ttLEDGER_STATE_FIX` | `sfOwner` | Weak | Only if present. |
| `ttMPTOKEN_ISSUANCE_CREATE`, `ttMPTOKEN_ISSUANCE_DESTROY`, `ttMPTOKEN_ISSUANCE_SET`, `ttMPTOKEN_AUTHORIZE` | none | — | `// TODO: Implement if needed`. |
| `ttCREDENTIAL_CREATE`, `ttCREDENTIAL_ACCEPT`, `ttCREDENTIAL_DELETE` | none | — | `// TODO: Implement if needed`. |
| `ttNFTOKEN_MODIFY` | none | — | `// TODO: Implement if needed`. |
| `ttPERMISSIONED_DOMAIN_SET`, `ttPERMISSIONED_DOMAIN_DELETE` | none | — | `// TODO: Implement if needed`. | -->


<!-- src/xrpld/app/hook/detail/applyHook.cpp:74-588 — every branch of the switch, in source order -->

## Relationship to HookOn/HookOnIncoming

The TSH rules decide **whose** hooks get a chance to run for a transaction, and
they also classify each account as *outgoing* (the originator) or *incoming*
(a TSH). That direction selects which `HookOn` field applies: an outgoing
account's hooks are filtered by `sfHookOnOutgoing`, an incoming (TSH) account's
by `sfHookOnIncoming`. If the applicable field does not select this
transaction's type, the hook is skipped.

<!-- src/xrpld/app/tx/detail/Transactor.cpp:1372-1376 (TSH chains always pass isOutgoing=false — see 1797-1804); 1996-2003 (originator's own chain passes isOutgoing=true)
```cpp
uint256 hookOn = hook::getHookOn(
    hookObj, hookDef, isOutgoing ? sfHookOnOutgoing : sfHookOnIncoming);
if (!hook::canHook(ctx_.tx.getTxnType(), hookOn))
    continue;  // skip if it can't
```
-->

`HookOn` (or its `HookOnIncoming`/`HookOnOutgoing` split under
`featureHookOnV2`) then decides **whether** a specific installed hook fires
for this transaction's type, independent of TSH strength. A hook on a strong
TSH account whose `HookOnIncoming` excludes this transaction type never runs,
even though its account was nominated as a strong TSH; conversely `hsfCOLLECT`
(see [Conditions for Weak TSH execution](#conditions-for-weak-tsh-execution))
only matters once `HookOn`/`HookOnIncoming` has already allowed the hook to
be considered. See [sethook-fields/hookon.md](sethook-fields/hookon.md) and
[sethook-fields/hookon-incoming-outgoing.md](sethook-fields/hookon-incoming-outgoing.md)
for the bit-selection rules themselves.

## Related documents

- [README.md](README.md)
- [glossary.md](glossary.md)
- [overview.md](overview.md)
- [sethook-fields/flags.md](sethook-fields/flags.md)
- [sethook-fields/hookon.md](sethook-fields/hookon.md)
- [sethook-fields/hookon-incoming-outgoing.md](sethook-fields/hookon-incoming-outgoing.md)
