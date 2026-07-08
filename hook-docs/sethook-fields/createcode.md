# CreateCode

**Purpose:** carries the raw WASM bytecode for a new hook (`hsoCREATE`), or —
when present but **empty** — signals deletion of the hook at that chain
position (`hsoDELETE`). It is the only field whose *emptiness*, not its
absence, changes which operation is inferred.

**Field declaration:** `VL` (variable-length blob), code 11
(`include/xrpl/protocol/detail/sfields.macro:273`):

```cpp
TYPED_SFIELD(sfCreateCode,               VL,        11)
```

`soeOPTIONAL` on `sfHook` (`src/libxrpl/protocol/InnerObjectFormats.cpp:93`);
`soeREQUIRED` on `ltHOOK_DEFINITION`
(`include/xrpl/protocol/detail/ledger_entries.macro:103` — every definition
that exists on the ledger stores the code that produced it, keyed by its own
hash).

**Operation inference — presence vs. emptiness.**
`SetHook::inferOperation` (`src/xrpld/app/tx/detail/SetHook.cpp:212-224`):

```cpp
uint64_t wasmByteCount = hookSetObj.isFieldPresent(sfCreateCode)
    ? hookSetObj.getFieldVL(sfCreateCode).size()
    : 0;

bool hasHash = hookSetObj.isFieldPresent(sfHookHash);
bool hasCode = hookSetObj.isFieldPresent(sfCreateCode);

if (hasHash && hasCode)  // Both HookHash and CreateCode: invalid
    return hsoINVALID;
else if (hasHash)  // Hookhash only: install
    return hsoINSTALL;
else if (hasCode)  // CreateCode only: either delete or create
    return wasmByteCount > 0 ? hsoCREATE : hsoDELETE;
```

Confirmed by the direct unit tests at `SetHook_test.cpp:3015-3027`: a
non-empty blob (`{1}`) infers `hsoCREATE`, an explicitly-set-but-empty blob
(`ripple::Blob{}`) infers `hsoDELETE`. **Omitting `sfCreateCode` entirely is
not the same as an empty one** — with neither `sfCreateCode` nor
`sfHookHash` present, inference falls through to the NOOP/UPDATE/NSDELETE
branch instead (see [operations-field-matrix.md](operations-field-matrix.md)).

**Size limit — checked in `preflight`, before operation-specific
validation.** `maxHookWasmSize()` returns `0xFFFFU` (65,535 bytes,
`include/xrpl/hook/Enum.h:94-98`). The check runs unconditionally whenever
`sfCreateCode` is present, for every `sfHook` entry in the transaction
(`SetHook.cpp:795-804`):

```cpp
if (hookSetObj.isFieldPresent(sfCreateCode) &&
    hookSetObj.getFieldVL(sfCreateCode).size() > hook::maxHookWasmSize())
{
    ... "Malformed transaction: SetHook operation would create blob larger
    than max";
    return temMALFORMED;
}
```

This runs before `inferOperation`/`validateHookSetEntry`, so an oversized
blob is rejected the same way whether it would have been a create or (in
the pathological case of a >64 KiB blob that somehow reads as non-empty) any
other operation. Verified by `SetHook_test.cpp:2121-2128` ("If CreateCode is
present, then it must be less than 64kib", `long_wasm`, `temMALFORMED`).

**`hsoCREATE` validation (`SetHook.cpp:413-611`)**, run only after the other
create-specific field checks pass (namespace present, API version present
and `0`, HookOn rules, optional HookName — see
[HookNamespace](hooknamespace.md), [HookApiVersion](hookapiversion.md),
[HookOn](hookon.md)):

1. **Guard validation.** `validateGuards(hook, logger, hsacc,
   hook_api::getImportWhitelist(ctx.rules),
   hook_api::getGuardRulesVersion(ctx.rules))`
   (`SetHook.cpp:548-553`) statically analyzes every loop in the module for
   the `_g()` guard call the Hook API requires (see the `hook-dev`/`hook-api`
   guides for the guard system itself). This is a generic, non-rippled-specific
   routine (`SetHook.cpp:532-534` comment) that also returns, on success, a
   `std::pair<uint64_t, uint64_t>` of estimated maximum instruction counts for
   `hook()` and `cbak()` (`SetHook.h:44-48`, the `HookSetValidation` variant) —
   these feed `hook::computeExecutionFee` to set the new definition's
   `sfFee`/`sfHookCallbackFee` (`SetHook.cpp:1819-1881`).
2. **WasmEdge smoke test.** Independently of guard analysis,
   `hook::HookExecutor::validateWasm(hook.data(), hook.size())`
   (`src/xrpld/app/hook/applyHook.h:370-384`) loads the module into a real
   WasmEdge VM and runs `WasmEdge_VMValidate` — catching malformed WASM that
   passes the guard scan but isn't actually loadable/instantiable
   (`SetHook.cpp:595-609`, `WASM_TEST_FAILURE` on failure).

Both checks must pass; either failure makes the whole `SetHook` transaction
`temMALFORMED` at preflight, or (if re-run at apply time, see below)
`tecINTERNAL`.

**Fee — 500 drops per byte, not owner-reserved.** Unlike hook-chain slots
and parameters/grants (owner-reserved, 1 unit each — see
`SetHook::computeHookReserve`, `SetHook.cpp:1264-1279`), `sfCreateCode`'s
cost is billed as a **transaction fee surcharge**, computed in
`SetHook::calculateBaseFee` (`SetHook.cpp:643-702`):

```cpp
XRPAmount createFee{0};
if (hookSetObj.isFieldPresent(sfCreateCode))
    createFee = XRPAmount{hook::computeCreationFee(
        hookSetObj.getFieldVL(sfCreateCode).size())};
```

```cpp
// src/xrpld/app/hook/detail/applyHook.cpp:706-713
int64_t
hook::computeCreationFee(uint64_t byteCount)
{
    int64_t fee = ((int64_t)byteCount) * 500ULL;
    if (fee < byteCount)
        return 0x7FFFFFFFFFFFFFFFLL;  // overflow guard

    return fee;
}
```

**Note on a nearby comment:** the code that assembles the final owner-reserve
accounting (`SetHook.cpp:2070-2074`) contains a comment claiming
`sfCreateCode` and `sfHookParameters` are billed "5000 drops per byte" —
this does not match the actual arithmetic. `computeCreationFee` charges
**500** drops/byte for `sfCreateCode` (above), and the top-level submitted
`sfHookParameters` array is charged **1** drop per name+value byte total
(`SetHook.cpp:657-683`, `// one drop per byte`) despite its own comment
saying it is "billed at the same rate as code bytes" — it manifestly is not.
Treat the executable code (`hook::computeCreationFee`,
`applyHook.cpp:706-713`) as authoritative over either comment.

**`hsoCREATE` deduplicates by hash, falling through to `hsoINSTALL`.**
`SetHook::setHook()` hashes the submitted bytes with `sha512Half_s` and
checks whether a `ltHOOK_DEFINITION` with that hash already exists — on the
ledger or freshly inserted earlier in the same transaction's loop
(`SetHook.cpp:1768-1788`). If so, no new definition is created; the case
`[[fallthrough]]`s into `hsoINSTALL` (`SetHook.cpp:1907`) — see
[HookHash](hookhash.md) for the full reference-count lifecycle this implies.
Only when the hash is genuinely new does `SetHook.cpp:1789-1906` re-run
`validateHookSetEntry` (this time with ledger access, though the function
remains context-free) and construct the new `ltHOOK_DEFINITION` SLE with
`sfCreateCode` set verbatim to the submitted bytes
(`newHookDef->setFieldVL(sfCreateCode, wasmBytes)`, `SetHook.cpp:1869`).

**Empty `sfCreateCode` — `hsoDELETE` (`SetHook.cpp:297-337`, apply at
`SetHook.cpp:1549-1584`).** Only `sfCreateCode` (empty) and `sfFlags` may be
present; `sfFlags` is required and must include `hsfOVERRIDE`
(`OVERRIDE_MISSING` otherwise); allowed flag bits are limited to
`hsfOVERRIDE | hsfNSDELETE | hsfCOLLECT` (`FLAGS_INVALID` otherwise). At
apply time this places a blank `sfHook` object at that chain position and
decrements (and potentially destroys) the old hash's `ltHOOK_DEFINITION` —
see [HookHash](hookhash.md) for the verified reference-count example
(`SetHook_test.cpp:799-891`).

**Verified example — WASM containing `memory.fill`/`memory.copy`
(`SetHook_test.cpp:2038-2081`, "Test fill/copy").** These instructions are
rejected as malformed (`temMALFORMED`) only once `fix20250131` is enabled;
before the fix they pass guard/smoke validation and `tesSUCCESS`. This shows
guard validation rules are themselves amendment-gated and can change what
`sfCreateCode` accepts across network upgrades.

**Common mistakes:**
- Treating "omitted" and "empty" as equivalent. Omitting `sfCreateCode`
  entirely (with no `sfHookHash` either) infers NOOP or UPDATE/NSDELETE
  depending on other fields; an explicit empty blob always infers `hsoDELETE`.
- Assuming a >64 KiB blob is rejected only for `hsoCREATE`. The size check
  in preflight fires for *any* `sfHook` entry carrying `sfCreateCode`,
  before the operation is even inferred.
- Assuming guard validation and the WasmEdge smoke test are the same check —
  they are independent and both must pass; guard validation is a static
  analysis for the `_g()` loop-guard convention, the smoke test is a real
  VM load/validate pass.
- Repeating the "5000 drops per byte" figure from the nearby code comment —
  the actual rate, per `hook::computeCreationFee`, is 500 drops/byte for
  code and roughly 1 drop/byte for parameters (see above).

## Related documents

- [HookHash](hookhash.md) — install semantics and the full
  `ltHOOK_DEFINITION` reference-counting lifecycle that `hsoCREATE` falls
  into on a hash collision.
- [HookNamespace](hooknamespace.md), [HookApiVersion](hookapiversion.md),
  [HookOn](hookon.md) — the other fields `hsoCREATE` requires alongside
  `sfCreateCode`.
- [flags.md](flags.md) — `hsfOVERRIDE`/`hsfNSDELETE`/`hsfCOLLECT` and their
  per-operation legality, including the delete-flag requirement above.
- [operations-field-matrix.md](operations-field-matrix.md) — full
  per-operation field matrix.
