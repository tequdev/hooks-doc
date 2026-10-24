# xpop_slot

**Summary.** Load the inner transaction and metadata of an XPOP (cross-chain proof) into two
slots. Only valid while processing an `Import` (`ttIMPORT`) transaction.
<!-- evidence: `HookAPI::xpop_slot` rejects non-`ttIMPORT` transactions with `PREREQUISITE_NOT_MET` (`src/xrpld/app/hook/detail/HookAPI.cpp:2405-2408` in xahaud `release`; covered by `src/test/app/HookAPI_test.cpp:2628-2638`). -->

Requires the **`featureHooksUpdate1`** amendment<!-- (hook_api.macro) -->.

**Signature.**

```c
int64_t xpop_slot(uint32_t slot_no_tx, uint32_t slot_no_meta);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `slot_no_tx` | `uint32_t` | Destination slot for the inner transaction, or `0` to allocate. |
| `slot_no_meta` | `uint32_t` | Destination slot for the inner metadata, or `0` to allocate. |

**Return value.** Returns `(slot_no_tx << 16) | slot_no_meta` — both chosen slot numbers
packed into one `int64_t` — on success. Errors: `PREREQUISITE_NOT_MET` (-9) if the originating
transaction is not an `Import`; `INVALID_ARGUMENT` (-7) if either slot exceeds `max_slots`, or
if both are the same non-zero slot (a collision); `NO_FREE_SLOTS` (-6) if not enough slots are
free for the auto-allocation requested; `INVALID_TXN` (-37) if Xahau cannot extract either the
XPOP inner transaction or its metadata.
<!-- evidence: the release implementation calls `Import::getInnerTxn` and returns `INVALID_TXN` when either result is absent (`src/xrpld/app/hook/detail/HookAPI.cpp:2438-2440`); the wrapper packs the pair as `(tx << 16) | meta` (`src/xrpld/app/hook/detail/applyHook.cpp:3930-3942`). -->

**Common failure patterns.**
- Calling it outside `Import` processing → `PREREQUISITE_NOT_MET`.
- Passing the same non-zero slot for both txn and meta → `INVALID_ARGUMENT`.

**Caveats / notes.**
- Unpack the result: `tx_slot = ret >> 16`, `meta_slot = ret & 0xFFFF`.
- Requires `featureHooksUpdate1`; before that amendment, a hook that references `xpop_slot`
  cannot be installed successfully.
  <!-- evidence: `xpop_slot` is feature-gated by `featureHooksUpdate1` in `include/xrpl/hook/hook_api.macro:366-369`, and the release integration test expects hook installation to fail with `temMALFORMED` before the amendment (`src/test/app/SetHook_test.cpp:8174-8184,8263-8267`). -->

**Minimal example.**

```c
int64_t r = xpop_slot(0, 0);       // auto-allocate both
uint32_t tx_slot   = (r >> 16) & 0xFFFF;
uint32_t meta_slot = r & 0xFFFF;
```

**Related APIs.** [`meta_slot`](meta_slot.md), [`slot_subfield`](slot_subfield.md).
