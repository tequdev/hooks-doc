# HookGrants

**Purpose:** an array of `sfHookGrant` objects, each authorizing one specific
hook (by WASM hash, optionally scoped to one account) to write into this
hook's namespace via `state_foreign_set` — the only mechanism by which one
hook can modify another account's Hook State.

**Field declarations.** `sfHookGrants` is `ARRAY`, code 20
(`include/xrpl/protocol/detail/sfields.macro:415`):

```cpp
UNTYPED_SFIELD(sfHookGrants,             ARRAY,     20)
```

`soeOPTIONAL` on `sfHook` (`src/libxrpl/protocol/InnerObjectFormats.cpp:94`).
Each element is an `sfHookGrant` object, `OBJECT` code 24
(`sfields.macro:375`), with the following template
(`InnerObjectFormats.cpp:105-109`):

```cpp
add(sfHookGrant.jsonName,
    sfHookGrant.getCode(),
    {{sfHookHash, soeREQUIRED},
     {sfAuthorize, soeOPTIONAL},
     {sfFlags, soeOPTIONAL}});
```

`sfHookGrants`/`sfHookGrant` are never stored on `ltHOOK_DEFINITION` — like
`sfHookParameters`, grants live only on the per-account `sfHook` entry
inside `ltHOOK`. (Contrast this with `sfHookParameters`, which
`ltHOOK_DEFINITION` **does** carry as its default set — see
[HookParameters](hookparameters.md).)

**Validation — `validateHookGrants` (`src/xrpld/app/tx/detail/SetHook.cpp:61-113`),
run for `hsoINSTALL`, `hsoUPDATE`, and `hsoCREATE`** whenever the array is
present (`SetHook.cpp:347-350,391-394,421-424`); forbidden entirely on
`hsoDELETE` and `hsoNSDELETE` (`SetHook.cpp:265,298`):

1. **Max 8 entries** (`GRANTS_EXCESS`, `SetHook.cpp:64-71`), verified by
   `SetHook_test.cpp:427-447` (9 grants → `temMALFORMED`).
2. **Every element must be an `sfHookGrant` object** (`GRANTS_ILLEGAL`,
   `SetHook.cpp:78-85`), verified by `SetHook_test.cpp:449-466` (a `Memo`
   object in the array instead → `temMALFORMED`).
3. **No self-grant.** `sfAuthorize` may not equal the transaction's own
   `sfAccount` — a hook owner cannot grant itself special access to its own
   state, which would be meaningless since local `state_set` is already
   unrestricted (`SetHook.cpp:87-95`):
   ```cpp
   if (hookGrantObj.isFieldPresent(sfAuthorize) &&
       hookGrantObj.getAccountID(sfAuthorize) == hookAcc)
   { ... "cannot self grant an account"; return false; }
   ```
4. **No duplicate `(sfHookHash, sfAuthorize)` pairs** — the same hash with
   the same (possibly absent) authorized account may not appear twice
   (`GRANTS_ILLEGAL`, `SetHook.cpp:96-109`), using `GrantKey =
   std::pair<uint256, std::optional<AccountID>>` (`SetHook.cpp:59`) as the
   dedup key — note an *absent* `sfAuthorize` is a distinct key from any
   present one, so `{hash, absent}` and `{hash, alice}` may coexist as two
   separate grants for the same hash.

**Runtime semantics — how a grant is consumed.**
`HookAPI::state_foreign_set` (`src/xrpld/app/hook/detail/HookAPI.cpp:1902-1955`)
is the enforcement point. A local `state_set` (the calling hook's own
account) is always allowed with no grant check
(`HookAPI.cpp:1909-1917`). For a genuinely foreign account:

- If a previous grant check in the same hook execution already failed,
  further attempts short-circuit to `PREVIOUS_FAILURE_PREVENTS_RETRY`
  without re-searching (`HookAPI.cpp:1920-1921` — "hook only gets one
  attempt", `HookAPI.cpp:2022-2025`).
- Otherwise it iterates every installed `sfHook` entry on the **target**
  (foreign) account's `ltHOOK`, and for each entry that carries
  `sfHookGrants`, first checks the namespace matches the one being written —
  from the entry's own `sfHookNamespace` if present, else the entry's
  `ltHOOK_DEFINITION`'s namespace (`HookAPI.cpp:1981-1998`). Only within a
  namespace-matching entry does it then scan the entry's grants for one
  whose `sfHookHash` equals the *calling* hook's own WASM hash
  (`hookCtx.result.hookHash`) **and** either has no `sfAuthorize` (any hook
  with that hash may write) or an `sfAuthorize` equal to the calling hook's
  *own account* (`hookCtx.result.account`) (`HookAPI.cpp:2002-2016`).
- No match anywhere → `foreignStateSetDisabled = true` and
  `Unexpected(NOT_AUTHORIZED)` (`HookAPI.cpp:2021-2026`). A match is cached
  per `(account, namespace)` pair so repeated writes in the same execution
  skip the search (`HookAPI.cpp:1940-1944,2029-2030`).

In short: a grant on account **B**'s installed hook says "any hook whose
code hashes to `sfHookHash` (optionally: only if that hook's *own* account
is `sfAuthorize`) may write into the namespace this entry uses on **B**'s
ledger". The grantor is the account whose state gets modified, not the
account making the call.

**Apply-time storage (`SetHook.cpp:1715-1734,2029-2036`):** an explicit
non-empty `sfHookGrants` array replaces the entry's stored grants verbatim;
an explicit **empty** array (`[]`) clears them; when `sfHookGrants` is
absent from an update, the previous grants are carried over unchanged
(`SetHook.cpp:1727-1734`, `UPDATE` case only — `INSTALL`/`CREATE` simply
omit the field if not supplied, since there is no prior entry to carry
values from).

**Owner reserve.** Unlike `sfCreateCode` (billed as a fee — see
[CreateCode](createcode.md)), each grant is a normal owner-reserved array
element: `SetHook::computeHookReserve` (`SetHook.cpp:1264-1279`) adds 1 unit
of reserve per grant, alongside 1 per parameter and 1 for the hook slot
itself.

**Verified examples (`SetHook_test.cpp:2854-2975`, "test adding multiple
grants" / "update grants" / "use an empty grants array to reset the
grants"):**

| Action | Result |
|---|---|
| Set `HookGrants` with two entries (one with `Authorize: bob`, one without) | Stored verbatim, `grants[0].sfAuthorize == bob`, `grants[1]` has no `sfAuthorize` (`SetHook_test.cpp:2864-2911`) |
| Update with a single-entry `HookGrants` array | Fully replaces the prior two-entry array (`SetHook_test.cpp:2914-2948`) |
| Update with `HookGrants: []` | Clears the field (`!hooks[1].isFieldPresent(sfHookGrants)`, `SetHook_test.cpp:2951-2975`) |

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
