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
directly without validation or an error path (`src/xrpld/app/hook/detail/HookAPI.cpp:1802-1806`,
`src/xrpld/app/hook/detail/applyHook.cpp:3277-3285` from xahaud `origin/release`). -->

**Common failure patterns.** None — it is a pure accessor.

**Caveats / notes.**
- This is the *base* fee, not the fee required for an emitted transaction; for that use
  [`etxn_fee_base`](../emit/etxn_fee_base.md).

**Minimal example.**

```c
int64_t base = fee_base();
```

**Related APIs.** [`etxn_fee_base`](../emit/etxn_fee_base.md), [`ledger_seq`](ledger_seq.md).
