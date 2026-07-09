# HookGrants

**Purpose:** an array of `sfHookGrant` objects, each authorizing one specific
hook (by WASM hash, optionally scoped to one account) to write into this
hook's namespace via `state_foreign_set` — the only mechanism by which one
hook can modify another account's Hook State.

**Field declarations.** `sfHookGrants` is `ARRAY`, code 20.
<!-- `include/xrpl/protocol/detail/sfields.macro:415`:

```cpp
UNTYPED_SFIELD(sfHookGrants,             ARRAY,     20)
```
-->

It is `soeOPTIONAL` on `sfHook`. Each element is an `sfHookGrant` object,
`OBJECT` code 24, with required `sfHookHash` and optional `sfAuthorize` and
`sfFlags` fields.
<!-- `src/libxrpl/protocol/InnerObjectFormats.cpp:94`;
`sfields.macro:375`; `InnerObjectFormats.cpp:105-109`:

```cpp
add(sfHookGrant.jsonName,
    sfHookGrant.getCode(),
    {{sfHookHash, soeREQUIRED},
     {sfAuthorize, soeOPTIONAL},
     {sfFlags, soeOPTIONAL}});
```
-->

`sfHookGrants`/`sfHookGrant` are never stored on `ltHOOK_DEFINITION` — like
`sfHookParameters`, grants live only on the per-account `sfHook` entry
inside `ltHOOK`. (Contrast this with `sfHookParameters`, which
`ltHOOK_DEFINITION` **does** carry as its default set — see
[HookParameters](hookparameters.md).)

**Validation.** For `hsoINSTALL`, `hsoUPDATE`, and `hsoCREATE`, the grants
are validated whenever the array is present; grants are forbidden entirely
on `hsoDELETE` and `hsoNSDELETE`.
<!-- `validateHookGrants`
(`src/xrpld/app/tx/detail/SetHook.cpp:61-113`);
`SetHook.cpp:347-350,391-394,421-424`; `SetHook.cpp:265,298`. -->

1. **Max 8 entries** (`GRANTS_EXCESS`); 9 grants produce `temMALFORMED`.
   <!-- `SetHook.cpp:64-71`; verified by `SetHook_test.cpp:427-447`. -->
2. **Every element must be an `sfHookGrant` object** (`GRANTS_ILLEGAL`,
   `temMALFORMED` otherwise).
   <!-- `SetHook.cpp:78-85`; verified by `SetHook_test.cpp:449-466`
   (a `Memo` object in the array). -->
3. **No self-grant.** `sfAuthorize` may not equal the transaction's own
   `sfAccount` — a hook owner cannot grant itself special access to its own
   state, which would be meaningless since local `state_set` is already
   unrestricted.
   <!-- `SetHook.cpp:87-95`:
   ```cpp
   if (hookGrantObj.isFieldPresent(sfAuthorize) &&
       hookGrantObj.getAccountID(sfAuthorize) == hookAcc)
   { ... "cannot self grant an account"; return false; }
   ```
   -->
4. **No duplicate `(sfHookHash, sfAuthorize)` pairs** — the same hash with
   the same (possibly absent) authorized account may not appear twice
   (`GRANTS_ILLEGAL`). An *absent* `sfAuthorize` is a distinct key from any
   present one, so `{hash, absent}` and `{hash, alice}` may coexist as two
   separate grants for the same hash.
   <!-- `SetHook.cpp:96-109`; the dedup key is `GrantKey =
   std::pair<uint256, std::optional<AccountID>>` (`SetHook.cpp:59`). -->

**Runtime semantics — how a grant is consumed.**
A local `state_set` (the calling hook's own account) is always allowed with
no grant check. For a genuinely foreign account:
<!-- Enforcement is implemented by `HookAPI::state_foreign_set`
(`src/xrpld/app/hook/detail/HookAPI.cpp:1902-1955`);
`HookAPI.cpp:1909-1917`. -->

- If a previous grant check in the same hook execution already failed,
  further attempts short-circuit to `PREVIOUS_FAILURE_PREVENTS_RETRY`
  without re-searching.
  <!-- `HookAPI.cpp:1920-1921` — "hook only gets one attempt";
  `HookAPI.cpp:2022-2025`. -->
- Otherwise it iterates every installed `sfHook` entry on the **target**
  (foreign) account's `ltHOOK`, and for each entry that carries
  `sfHookGrants`, first checks the namespace matches the one being written —
  from the entry's own `sfHookNamespace` if present, else the entry's
  `ltHOOK_DEFINITION`'s namespace. Only within a
  namespace-matching entry does it then scan the entry's grants for one
  whose `sfHookHash` equals the *calling* hook's own WASM hash
  (`hookCtx.result.hookHash`) **and** either has no `sfAuthorize` (any hook
  with that hash may write) or an `sfAuthorize` equal to the calling hook's
  *own account* (`hookCtx.result.account`).
  <!-- `HookAPI.cpp:1981-1998`; `HookAPI.cpp:2002-2016`. -->
- No match anywhere → `foreignStateSetDisabled = true` and
  `Unexpected(NOT_AUTHORIZED)`. A match is cached
  per `(account, namespace)` pair so repeated writes in the same execution
  skip the search.
  <!-- `HookAPI.cpp:2021-2026`; `HookAPI.cpp:1940-1944,2029-2030`. -->

In short: a grant on account **B**'s installed hook says "any hook whose
code hashes to `sfHookHash` (optionally: only if that hook's *own* account
is `sfAuthorize`) may write into the namespace this entry uses on **B**'s
ledger". The grantor is the account whose state gets modified, not the
account making the call.

**Apply-time storage:** an explicit
non-empty `sfHookGrants` array replaces the entry's stored grants verbatim;
an explicit **empty** array (`[]`) clears them; when `sfHookGrants` is
absent from an update, the previous grants are carried over unchanged
(`UPDATE` case only — `INSTALL`/`CREATE` simply
omit the field if not supplied, since there is no prior entry to carry
values from).
<!-- `SetHook.cpp:1715-1734,2029-2036`; `SetHook.cpp:1727-1734`. -->

**Owner reserve.** Unlike `sfCreateCode` (billed as a fee — see
[CreateCode](createcode.md)), each grant is a normal owner-reserved array
element: each grant adds 1 unit of reserve, alongside 1 per parameter and 1
for the hook slot itself.
<!-- `SetHook::computeHookReserve` (`SetHook.cpp:1264-1279`). -->

**Verified examples:**
<!-- `SetHook_test.cpp:2854-2975`, "test adding multiple grants" / "update
grants" / "use an empty grants array to reset the grants". -->

| Action | Result |
|---|---|
| Set `HookGrants` with two entries (one with `Authorize: bob`, one without) | Stored verbatim, `grants[0].sfAuthorize == bob`, `grants[1]` has no `sfAuthorize` <!-- `SetHook_test.cpp:2864-2911` --> |
| Update with a single-entry `HookGrants` array | Fully replaces the prior two-entry array <!-- `SetHook_test.cpp:2914-2948` --> |
| Update with `HookGrants: []` | Clears the field <!-- `!hooks[1].isFieldPresent(sfHookGrants)`, `SetHook_test.cpp:2951-2975` --> |

**Common mistakes:**
- Assuming a self-grant (`sfAuthorize == sfAccount` of the `SetHook`
  transaction) is merely redundant. It is explicitly rejected as
  `temMALFORMED`, not silently accepted.
- Confusing "which hook can write" (`sfHookHash` in the grant) with "which
  account can write". `sfAuthorize`, when present, restricts the *account*
  that owns the authorized hook — it does not itself name a hook.
- Assuming grants transfer automatically when updating other fields. On
  `hsoUPDATE`, omitting `sfHookGrants` preserves the old array; explicitly
  supplying `[]` is required to clear it — these are different transactions.
- Forgetting the one-attempt rule: once a `state_foreign_set` call fails
  authorization once in a hook's execution, every subsequent foreign-state
  write in that same execution fails immediately without re-checking grants.

## Related documents

- [HookParameters](hookparameters.md) — the other array field with similar
  per-`sfHook`-entry storage and owner-reserve accounting, but stored (as a
  default set) on `ltHOOK_DEFINITION` as well, unlike grants.
- [HookNamespace](hooknamespace.md) — namespace resolution used to match a
  grant to the state key being written.
- [operations-field-matrix.md](operations-field-matrix.md) — per-operation
  legality of `sfHookGrants`.
