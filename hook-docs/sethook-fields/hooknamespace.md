# HookNamespace

**Purpose:** a 256-bit value that partitions a hook's persistent Hook State
into independent key-spaces. Two hooks installed under different namespaces
never see each other's state even if their state keys collide; the same
namespace value is also the *target* a `hsoNSDELETE` operation wipes.

**Field declaration:** `UINT256`, code 32
(`include/xrpl/protocol/detail/sfields.macro:207`):

```cpp
TYPED_SFIELD(sfHookNamespace,            UINT256,   32)
```

`soeOPTIONAL` on `sfHook` (`src/libxrpl/protocol/InnerObjectFormats.cpp:95`);
`soeREQUIRED` on `ltHOOK_DEFINITION`
(`include/xrpl/protocol/detail/ledger_entries.macro:100` — every definition
has a default namespace baked in at creation time).

**Do not confuse with `sfHookNamespaces` (plural).** That is a separate
`VECTOR256` field (`sfields.macro:329`) stored directly on `ltACCOUNT_ROOT`,
tracking the *set* of namespaces the account currently has live Hook State
in — maintained by `hook::addHookNamespaceEntry`/`removeHookNamespaceEntry`
(`src/xrpld/app/hook/detail/applyHook.cpp:748-800`) as state is written and
capped at `hook::maxNamespaces()` = 256
(`include/xrpl/hook/Enum.h:106-110`, enforced with `TOO_MANY_NAMESPACES`
at `src/xrpld/app/hook/detail/HookAPI.cpp:2789,2827`). `sfHookNamespace`
(singular, documented here) is the per-hook-entry/per-definition field that
*selects* which of those namespaces a given hook reads/writes.

**Effective namespace resolution — entry overrides definition.** Whenever
code needs "the" namespace for an installed hook, the pattern is: use the
per-account `sfHook` entry's own `sfHookNamespace` if present, otherwise
fall back to the `ltHOOK_DEFINITION`'s `sfHookNamespace`. This appears
identically in the fee/execution path
(`src/xrpld/app/tx/detail/Transactor.cpp:1394-1398`, "fetch the namespace
either from the hook object of, if absent, the hook def"), in the
grant-matching path (`HookAPI.cpp:1981-1998`, see
[HookGrants](hookgrants.md)), and in `setHook()`'s own bookkeeping
(`SetHook.cpp:1432-1435`, resolving `oldNamespace`).

**`hsoCREATE` requires it.** `SetHook.cpp:426-435`:

```cpp
if (!hookSetObj.isFieldPresent(sfHookNamespace))
{
    ... "SetHook ltHookDefinition must contain sfHookNamespace.";
    return false;
}
```

Verified by `SetHook_test.cpp:2130-2152` ("HSO Create operation must contain
namespace", `temMALFORMED` when omitted).

**`hsoINSTALL`/`hsoUPDATE`: optional, storage-optimized like `HookOn`.**
Both operations may supply a different namespace than the target
definition's default. It is written to the per-account `sfHook` entry
**only if it differs** from the resolved definition namespace; if it
matches, any stale override on the entry is cleared instead
(`hsoUPDATE`: `SetHook.cpp:1618-1628`; `hsoINSTALL`: `SetHook.cpp:1962-1964`)
— the same pattern documented in [HookOn](hookon.md)'s "Effective value
resolution" section. Verified by `SetHook_test.cpp:2553-2594` ("reset
hookon, hookcanemit, and namespace to defaults" — resetting `HookNamespace`
back to the definition's zero value removes `sfHookNamespace` from the
stored entry).

**`hsoDELETE` forbids it; `hsoNSDELETE` requires it — opposite rules on
the two operations that both use `sfCreateCode`-adjacent flags.**
`hsoDELETE` (`SetHook.cpp:297-337`) rejects a transaction that includes
`sfHookNamespace` alongside empty `sfCreateCode` (`DELETE_FIELD`, verified
`SetHook_test.cpp:730-770`). `hsoNSDELETE` (`SetHook.cpp:263-295`) requires
**both** `sfHookNamespace` and `sfFlags == hsfNSDELETE` to be present
(`NSDELETE_FIELD`/`NSDELETE_FLAGS`), and forbids every other field —
grants, parameters, `HookOn`/`HookOnIncoming`/`HookOnOutgoing`,
`HookCanEmit`, `HookApiVersion`, `HookName`.

**Operation inference depends on the `(sfHookNamespace, hsfNSDELETE)`
pair, not on the hook chain slot's actual current namespace.**
`SetHook::inferOperation` (`SetHook.cpp:242-244`):

```cpp
return hookSetObj.isFieldPresent(sfHookNamespace) && (flags & hsfNSDELETE)
    ? hsoNSDELETE
    : hsoUPDATE;
```

Because `hsoNSDELETE` is inferred the instant *both* are present, the
`sfHookNamespace` value in an `hsoNSDELETE` entry is an arbitrary
**target** namespace, not necessarily the one currently associated with any
hook at that chain slot — you can NSDELETE a namespace that belongs to a
different hook in the same account entirely, or one left over from a hook
that has since been deleted; `destroyNamespace` (below) doesn't check that
a live hook still references it.

**`hsfNSDELETE` as a side effect on *other* operations.** The flag bit
`hsfNSDELETE` is not exclusive to the `hsoNSDELETE` operation — it is also
in `hsoDELETE`'s allowed-flags whitelist
(`hsfOVERRIDE | hsfNSDELETE | hsfCOLLECT`, `SetHook.cpp:326`), and nothing
stops it appearing (unchecked) in `hsoCREATE`/`hsoINSTALL` flags either.
`setHook()`'s apply loop handles this generically, for **any** operation
except NOOP/INVALID (`SetHook.cpp:1495-1522`):

```cpp
if (flags && (*flags & hsfNSDELETE))
{
    if (op == hsoNOOP || op == hsoINVALID) { /* nothing */ }
    else if (op == hsoNSDELETE && newDirKeylet)
        namespacesToDestroy.emplace(*newNamespace);
    else if (oldDirKeylet)
        namespacesToDestroy.emplace(*oldNamespace);
    else { /* warn: nothing to delete */ }
}
```

So a `hsoDELETE` (delete the hook) combined with `Flags:
hsfOVERRIDE|hsfNSDELETE` destroys **the outgoing hook's old namespace** in
the same transaction — deleting the hook and wiping its state atomically.
`op == hsoNSDELETE` is the only branch that destroys the *newly specified*
namespace (`*newNamespace`); every other operation that carries the flag
destroys the *slot's prior* namespace (`*oldNamespace`) instead.

**Deletion mechanics — `SetHook::destroyNamespace`
(`SetHook.cpp:881-1059`).** Called once per unique namespace queued in
`namespacesToDestroy`, after all other ledger insert/update work for the
transaction (`SetHook.cpp:2119-2124`). If the namespace's state directory
(`keylet::hookStateDir(account, ns)`) doesn't exist or is already empty,
this is treated as success (opportunistic delete — "the flag can't block the
SetHook transaction just because... the namespace was deleted in the
previous transaction", `SetHook.cpp:902-907`). Otherwise it walks the
directory and erases every `ltHOOK_STATE` entry found.

- **`fixNSDelete` gates two behaviors** (`ctx.rules.enabled(fixNSDelete)`,
  feature declared at `include/xrpl/protocol/detail/features.macro:88`):
  1. **A per-transaction cap.** With the fix, at most
     `hook::maxNamespaceDelete()` = 256 entries
     (`include/xrpl/hook/Enum.h:112-117`) are deleted per `SetHook`; if more
     remain, the function returns `tesPARTIAL` (`SetHook.cpp:950-954,1058`)
     and the caller must resubmit an identical `hsoNSDELETE` to continue.
     Without the fix, the loop is unbounded and deletes the entire namespace
     in one pass.
  2. **Owner-reserve refund.** With the fix, `sleAccount`'s `sfOwnerCount`
     is reduced by `toDelete.size() * scale` (`SetHook.cpp:1040-1052`,
     `adjustOwnerCount`). **Without the fix, the reserve is never refunded**
     even though the state entries are gone — a real pre-fix reserve
     accounting bug, confirmed by the verified example below.
- `sfHookStateCount` on the account is decremented by the number of entries
  actually deleted regardless of the fix (`SetHook.cpp:1025-1038`).
- The namespace is removed from the account's `sfHookNamespaces` tracking
  vector only on a **complete** (non-partial) delete
  (`SetHook.cpp:1054-1055`).

**Verified example — pre-fix reserve leak vs. post-fix partial delete
(`SetHook_test.cpp:1153-1272`, "Checks partial nsdelete operation"):** a
hook writes 256 Hook State entries (`sfOwnerCount` reaches 258). One
`hsoNSDELETE` transaction is submitted for that namespace:

| `fixNSDelete` | Result | Directory after | `sfOwnerCount` after |
|---|---|---|---|
| disabled | `tesSUCCESS` (single pass, unbounded) | gone | **still 258** (reserve not refunded — bug) |
| enabled | `tesPARTIAL` (capped at 256) | still present | 2 (256 entries refunded) |
| enabled, resubmitted | `tesSUCCESS` | gone | 1 (fully refunded) |

**Common mistakes:**
- Assuming `hsoNSDELETE`'s `sfHookNamespace` must match a namespace
  currently in use by an installed hook. It doesn't — the operation deletes
  whatever namespace value you give it, opportunistically succeeding even
  if nothing exists there.
- Assuming `hsfNSDELETE` only does something when the operation is
  literally `hsoNSDELETE`. It also fires as a side effect on any other
  operation (notably `hsoDELETE`), but targets the chain slot's *previous*
  namespace rather than a namespace named in the same transaction.
- Relying on pre-`fixNSDelete` behavior for reserve accounting — before the
  fix, deleting a namespace's state does not return the owner reserve it
  was consuming.
- Forgetting `tesPARTIAL` requires a resubmission with the *same*
  `sfHookNamespace` (and `hsfNSDELETE` flag) to finish deleting namespaces
  larger than 256 entries.

## Related documents

- [HookOn](hookon.md) — the storage-optimization pattern (`sfHook` entry
  overrides definition default) that `sfHookNamespace` also follows.
- [HookGrants](hookgrants.md) — grant matching resolves the same
  entry-vs-definition namespace before checking a grant's hash/authorize.
- [flags.md](flags.md) — `hsfNSDELETE` and the other `sfHook`-level flags.
- [operations-field-matrix.md](operations-field-matrix.md) — full
  per-operation legality table.
