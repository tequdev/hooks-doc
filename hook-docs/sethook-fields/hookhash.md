# HookHash

**Purpose:** references an existing, already-uploaded WASM binary by its
content hash, so a `SetHook` entry can install that code onto an account's
hook chain without resubmitting the bytes (`hsoINSTALL`), and so `hsoCREATE`
can deduplicate identical WASM across the whole ledger via reference counting.

**Field declaration:** `UINT256`, code 31
(`include/xrpl/protocol/detail/sfields.macro:206`):

```cpp
TYPED_SFIELD(sfHookHash,                 UINT256,   31)
```

`soeOPTIONAL` on `sfHook` (`src/libxrpl/protocol/InnerObjectFormats.cpp:92`)
and `soeREQUIRED` on `sfHookGrant`
(`InnerObjectFormats.cpp:107` — see [HookGrants](hookgrants.md)) and on
`ltHOOK_DEFINITION` (`include/xrpl/protocol/detail/ledger_entries.macro:95`,
where it identifies the definition object itself).

**Operation inference.** `SetHook::inferOperation`
(`src/xrpld/app/tx/detail/SetHook.cpp:210-245`) reads presence of `sfHookHash`
and `sfCreateCode` together:

```cpp
if (hasHash && hasCode)  // Both HookHash and CreateCode: invalid
    return hsoINVALID;
else if (hasHash)  // Hookhash only: install
    return hsoINSTALL;
```

Both present is `hsoINVALID` → `temMALFORMED`
(`SetHook.cpp:613-620`, "SetHook must provide only one of sfCreateCode or
sfHookHash"), confirmed by `SetHook_test.cpp:2226-2237` ("Cannot have both
CreateCode and HookHash") and by the direct `inferOperation` unit test at
`SetHook_test.cpp:3053-3060`. `sfHookHash` alone infers `hsoINSTALL`
(`SetHook_test.cpp:3029-3035`).

**Existence check (preclaim).** For every `sfHook` entry carrying
`sfHookHash`, `SetHook::preclaim` requires the referenced
`ltHOOK_DEFINITION` to already exist on the ledger, independent of which
operation it turns out to be (`SetHook.cpp:704-728`):

```cpp
if (!ctx.view.exists(keylet::hookDefinition(hash)))
{
    ... "Malformed transaction: No hook exists with the specified hash.";
    return terNO_HOOK;
}
```

`keylet::hookDefinition` hashes under `LedgerNameSpace::HOOK_DEFINITION =
'D'` (`src/libxrpl/protocol/Indexes.cpp:74,198-202`), matching the `ltHOOK_DEFINITION`
ledger-entry type code `'D'` (`ledger_entries.macro:94`).

**Install validation (`hsoINSTALL`, `SetHook.cpp:339-367`):** Parameters and
Grants are optionally validated; `sfHookApiVersion` is forbidden
(`API_ILLEGAL`, `SetHook.cpp:352-360` — see
[HookApiVersion](hookapiversion.md)); Namespace/HookOn/Flags are explicitly
allowed ("may be present if the user so chooses").

**Apply-time semantics (`hsoINSTALL`, `SetHook.cpp:1913-2045`):**
- Overriding an existing hook at that chain position requires `hsfOVERRIDE`,
  otherwise `tecREQUIRES_FLAG` (`SetHook.cpp:1914-1923`, tested at
  `SetHook_test.cpp:658-681`, "can't/can set extant hook hash over other hook
  without/with override flag").
- The target `ltHOOK_DEFINITION` must exist at apply time too, otherwise
  `tecNO_ENTRY` (`SetHook.cpp:1926-1934`, tested at
  `SetHook_test.cpp:632-644`, install with a nonexistent
  `DEADBEEF...` hash).
- On success the definition's reference count is incremented
  (`incrementReferenceCount(newDefSLE)`, `SetHook.cpp:1954`), and if an old
  hook occupied that chain slot, its old definition's reference count is
  decremented (`SetHook.cpp:1938-1944`, calling `reduceReferenceCount` —
  see below).
- `sfHookNamespace`, `sfHookOn`/`sfHookOnIncoming`/`sfHookOnOutgoing`,
  `sfHookCanEmit`, and `sfHookName` are all accepted on install and are
  stored on the per-account `sfHook` entry **only when they differ from the
  target definition's own value** (`SetHook.cpp:1962-2016`) — the same
  storage-optimization pattern documented in [HookOn](hookon.md). Grants are
  stored verbatim if the array is non-empty (`SetHook.cpp:2030-2036`).

**Reference counting.** `ltHOOK_DEFINITION` carries `sfReferenceCount`
(`UINT64`, `ledger_entries.macro:105`, `soeREQUIRED`). Two free functions in
`SetHook.cpp:1064-1099` maintain it:

```cpp
// returns true if the reference counted ledger entry should be marked for
// deletion i.e. it has a zero reference count after the decrement
bool
reduceReferenceCount(std::shared_ptr<STLedgerEntry>& sle)
{
    if (sle && sle->isFieldPresent(sfReferenceCount))
    {
        uint64_t refCount = sle->getFieldU64(sfReferenceCount);
        if (refCount > 0)
        {
            refCount--;
            sle->setFieldU64(sfReferenceCount, refCount);
        }
        return refCount <= 0;
    }
    return false;
}
```

Every operation that removes a hash from a chain slot — `hsoDELETE`
(`SetHook.cpp:1575-1581`), `hsoUPDATE`'s implicit replace-in-place path is
not applicable (an update never changes `sfHookHash`), `hsoCREATE` when it
overrides an existing installed hash (`SetHook.cpp:1834-1840`), and
`hsoINSTALL` overriding an existing hash (`SetHook.cpp:1938-1944`) — calls
`reduceReferenceCount` on the *old* definition and, if it reaches zero,
queues that keylet in `keyletsToDestroy` for erasure at the end of
`setHook()` (`SetHook.cpp:2126-2140`). A fresh `hsoCREATE` sets the new
definition's count to exactly `1` (`SetHook.cpp:1872`); a fresh `hsoINSTALL`
of a hash that isn't otherwise referenced would raise it from whatever it
already was.

**`hsoCREATE` deduplicates by falling through to `hsoINSTALL`.** If the
uploaded WASM's SHA-512Half hash already matches an existing
`ltHOOK_DEFINITION` — either already on the ledger or inserted earlier in
the same transaction's `sfHooks` loop — `hsoCREATE` does **not** create a
second definition. It reuses the existing one and `[[fallthrough]]`s
directly into the `hsoINSTALL` case (`SetHook.cpp:1768-1788,1907`), so
install's flag/reference-count/field rules above apply verbatim to a
"CREATE" that turns out to be identical code someone else already uploaded.

**Verified example — reference count lifecycle (`SetHook_test.cpp:2270-2350`):**

| Step | Action | `accept` definition refcount | `rollback` definition refcount |
|---|---|---|---|
| 1 | `alice` creates `accept` at position 0 | 1 | — |
| 2 | `alice` creates `accept` again at position 1 (second install target via the same hash) | 3 *(2 from alice + 1 from an earlier `bob` create in the same test)* | — |
| 3 | `alice` overrides position 0 with `rollback` (`hsfOVERRIDE`) | 2 (decremented) | 1 (new) |

**Verified example — deletion drops a definition at zero (`SetHook_test.cpp:799-891`):**
after creating four hooks (`accept`, `makestate`, `rollback`, `accept2`) and
deleting only the third (`rollback`), `env.le(rollback_keylet)` becomes
`nullptr` because its reference count hit zero, while the other three
definitions remain (`SetHook_test.cpp:826-836`). Deleting the remaining
three then removes all their definitions and the account's `ltHOOK` object
itself (`SetHook_test.cpp:858-891`).

**Common mistakes:**
- Supplying both `sfHookHash` and `sfCreateCode` in one `sfHook` entry —
  always `temMALFORMED` (`hsoINVALID`), regardless of whether `sfCreateCode`
  is empty or not.
- Assuming `hsoCREATE` always allocates a new `ltHOOK_DEFINITION`. If the
  bytes hash to an already-existing definition, it silently becomes an
  install of that definition (subject to install's `hsfOVERRIDE` rule if
  something else already occupies the target chain slot).
- Forgetting that `preclaim` checks hash existence for **every** `sfHook`
  entry with `sfHookHash` present, before any ledger mutation — a
  transaction with one valid install and one install-by-nonexistent-hash
  fails entirely with `terNO_HOOK`, nothing is partially applied.

## Related documents

- [HookGrants](hookgrants.md) — `sfHookGrant` also carries a required
  `sfHookHash`, used for a different purpose (authorizing `state_foreign_set`
  access), not chain installation.
- [operations-field-matrix.md](operations-field-matrix.md) — full
  per-operation table including where `sfHookHash` is required/forbidden.
- [README.md](README.md) — field-location table and `sfHook`/`ltHOOK_DEFINITION`
  templates.
