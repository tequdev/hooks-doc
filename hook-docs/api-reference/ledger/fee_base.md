# fee_base

**Summary.** Return the base fee (in drops) of the current ledger.

**Signature.**

```c
int64_t fee_base();
```

**Parameters.** None.

**Return value.** The current ledger's base fee in drops (`view().fees().base.drops()`). Does
not return an error. <!-- evidence: `HookAPI::fee_base()` returns
`hookCtx.applyCtx.view().fees().base.drops()`, and the WASM wrapper returns that accessor
directly without validation or an error path (`src/xrpld/app/hook/detail/HookAPI.cpp:1868-1871`,
`src/xrpld/app/hook/detail/applyHook.cpp:3383-3391` from xahaud commit
`d20e8ffb561034101d24668adbe9a513f639cb37`, release
`2026.10.13-release+4119`). -->

**Common failure patterns.** None — it is a pure accessor.

**Caveats / notes.**
- This is the *base* fee, not the fee required for an emitted transaction; for that use
  [`etxn_fee_base`](../emit/etxn_fee_base.md).

**Minimal example.**

```c
int64_t base = fee_base();
```

**Related APIs.** [`etxn_fee_base`](../emit/etxn_fee_base.md), [`ledger_seq`](ledger_seq.md).
