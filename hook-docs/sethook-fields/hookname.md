# HookName

**Purpose:** an optional display/targeting name attached to one specific
installed hook (an `sfHook` entry in `ltHOOK`), which lets any later
transaction — not just `SetHook` — select that one hook out of a multi-hook
chain to guarantee it executes (and is paid for), regardless of its `HookOn`
value.

**Storage — `ltHOOK` only, never `ltHOOK_DEFINITION`.**
<!-- Confirmed by `SetHook_test.cpp:1760-1766`:

```cpp
// Check hook definition
auto const hookDef = env.le(keylet::hookDefinition(accept_hash));
BEAST_EXPECT(hookDef);
BEAST_EXPECT(!hookDef->isFieldPresent(sfHookName));   // never on the definition
```
-->

The per-account `ltHOOK` entry does carry it. This makes sense: the same WASM code (one
`ltHOOK_DEFINITION`, shared by hash) can be installed under different names on
different accounts, or under different names in the same account's chain.
<!-- `SetHook_test.cpp:1767-1775`. -->

**Amendment gating.** `featureNamedHooks`
(`Supported::yes`, `VoteBehavior::DefaultNo`) gates it in **two different places**, with two
**different** rejection codes:
<!-- `include/xrpl/protocol/detail/features.macro:39`. -->

1. Inside a `SetHook`'s `sfHook` object — `temDISABLED` if present without the
   amendment.
   <!-- `SetHook.cpp:815-817`:
   ```cpp
   if (!ctx.rules.enabled(featureNamedHooks) &&
       hookSetObj.isFieldPresent(sfHookName))
       return temDISABLED;
   ```
   -->
2. As the common transaction-level field (any transaction type) —
   `temMALFORMED` if present without `featureHooks` or `featureNamedHooks`
   in shared preflight.
<!-- `Transactor.cpp:152-160`:
   ```cpp
   if (ctx.tx.isFieldPresent(sfHookName))
   {
       if (!ctx.rules.enabled(featureHooks) ||
           !ctx.rules.enabled(featureNamedHooks))
           return temMALFORMED;

       if (!SetHook::validateHookName(ctx.tx.getFieldVL(sfHookName), ctx.j))
           return temMALFORMED;
   }
   ```
-->
   The same validation also enforces the length/UTF-8 rule below for
   *every* transaction carrying `sfHookName`, not only `SetHook`.

**Validation rules:**
<!-- `SetHook::validateHookName` (`SetHook.cpp:624-639`):

```cpp
bool
SetHook::validateHookName(Blob const& name, beast::Journal const& j)
{
    if (name.size() != 0 && (name.size() < 4 || 16 < name.size()))
    {
        JLOG(j.trace())
            << "sfHookName must be between 8 and 32 hex characters.";
        return false;
    }
    if (!URIToken::validateUTF8(name))
    {
        JLOG(j.trace()) << "sfHookName must be a valid UTF-8 string.";
        return false;
    }
    return true;
}
```
-->

Read this carefully: the check is on **raw byte length** (`name.size()`), which
must be **0** (clears the name) **or in `[4, 16]` bytes**. The log message says
"8 and 32 hex characters" because `Blob`/`VL` fields are transmitted as a hex
string in JSON RPC — 4–16 raw bytes is 8–32 hex characters on the wire, so the
message and the code agree once you account for the hex encoding. The name
must also be valid UTF-8 — a purely random 4-byte
blob like `DEADBEEF` (hex) fails this even though it passes the length check
while `"41424344"` encodes ASCII `ABCD`.
<!-- `URIToken::validateUTF8`; `SetHook_test.cpp:1718-1723`,
`"DEADBEEF" // not utf-8`; `"41424344"` is used in passing tests. -->

**Runtime semantics — targeting, not filtering.** During execution and fee
calculation, each `sfHook` entry with a
non-empty `HookName` becomes a **required match** against the triggering
transaction's own `sfHookName`.
<!-- `Transactor::executeHookChain`, `Transactor.cpp:1357-1369`;
`calculateHookChainFee`, `Transactor.cpp:286-298`:

```cpp
std::optional<Blob> requiredHookName;
if (hookObj.isFieldPresent(sfHookName) &&
    hookObj.getFieldVL(sfHookName).size() > 0)
    requiredHookName = hookObj.getFieldVL(sfHookName);

if (requiredHookName)
{
    // need to specify same hook name in the transaction
    if (!ctx_.tx.isFieldPresent(sfHookName))
        continue;
    if (*requiredHookName != ctx_.tx.getFieldVL(sfHookName))
        continue;
}
```
-->

The `continue` skips that hook entirely (as if it weren't in the chain) unless
the transaction's own `sfHookName` matches exactly. **Un-named hooks in the
same chain are unaffected** — they still run according to their own `HookOn`
regardless of whether the transaction carries a `HookName` or what it is.

**Verified example:** account `alice` has two
hooks installed: hook A named `"41424344"` and hook B unnamed.
<!-- `SetHook_test.cpp:1864-1930`. -->

| Transaction's `HookName` | Hooks that execute | Base fee |
|---|---|---|
| *(absent)* | B only | 19 drops |
| `"41424345"` (wrong name) | B only | 19 drops |
| `"41424344"` (correct name) | **A and B** | 28 drops (A's fee is added) |

This targeting also affects `calculateBaseFee` (the extra 9 drops above are
hook A's own fee, added only when it is actually going to run) and works
identically for weakly-executed (TSH/collect) and callback (`cbak`) hook
chains. The emitted callback transaction itself does **not** need to carry
`sfHookName` to trigger `cbak` on the named hook.
<!-- "Test Weak" and "Callback Execution",
`SetHook_test.cpp:1932-2032`; `SetHook_test.cpp:2029-2031`,
"Callback transaction doesn't need to have hook name". -->

**Common mistakes:**
- Expecting `HookName` to *filter out* unnamed hooks when a transaction
  specifies a name. It does not — unnamed hooks always run; naming only adds
  an extra, opt-in gate for the hooks that carry a name.
- Expecting to read/write `HookName` on `ltHOOK_DEFINITION`. It is never stored
  there — only on the per-account `ltHOOK` entry (`sfHook` object).
- Forgetting the two different rejection codes depending on where the
  unsupported field appears (`temDISABLED` inside a `SetHook`'s `sfHook`
  object vs. `temMALFORMED` as a transaction-level field) — do not assume one
  code covers both paths.
- Passing a name that fails UTF-8 validation despite being 4–16 bytes long
  (e.g. arbitrary binary/hex blobs) — validation checks both
  constraints independently.
