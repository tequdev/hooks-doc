# HookAPIVersion

**Purpose:** declares which Hook API ABI a newly created hook's WASM was
written against. On this branch (`dev`) the only accepted value is `0`
(Guard-type hooks); there is no gas-metered ABI (`HookApiVersion 1`) or
`sfHookGas`/`sfHookCallbackGas`/`sfHookWeakGas` fields in this codebase.

**Field declaration:** `UINT16`, code 20.
<!-- `include/xrpl/protocol/detail/sfields.macro:59`:

```cpp
TYPED_SFIELD(sfHookApiVersion,           UINT16,    20)
```
-->

It is `soeOPTIONAL` on `sfHook` and `soeREQUIRED` on
`ltHOOK_DEFINITION`.
<!-- `src/libxrpl/protocol/InnerObjectFormats.cpp:101`;
`include/xrpl/protocol/detail/ledger_entries.macro:102`. -->

**Storage is definition-only — the mirror image of `HookName`.** Unlike
most `sfHook` fields, `sfHookApiVersion` is never legal on the per-account
`sfHook` entry at all (forbidden on install and update — see below), so it
only ever exists on `ltHOOK_DEFINITION`. The `hsoCREATE` case writes it
exclusively onto the new definition
and never onto the `newHook` object representing the account's chain entry.
This is the exact opposite storage rule from
[HookName](hookname.md), which lives only on the entry and never on
the definition — don't assume every `sfHook` field is dual-homed.
<!-- `newHookDef->setFieldU16(sfHookApiVersion, ...)`,
`SetHook.cpp:1866-1868`; `newHook`. -->

**Required and pinned to `0` on `hsoCREATE`.**
<!-- `SetHook.cpp:437-456`:

```cpp
if (!hookSetObj.isFieldPresent(sfHookApiVersion))
{
    ... "SetHook sfHookApiVersion must be included.";
    return false;
}

auto version = hookSetObj.getFieldU16(sfHookApiVersion);
if (version != 0)
{
    // we currently only accept api version 0
    ... "SetHook sfHook->sfHookApiVersion invalid. (Try 0).";
    return false;
}
```
-->

Both branches are `temMALFORMED` (`API_MISSING`/`API_INVALID`): missing and
`HookApiVersion: 1` values are rejected. This confirms the branch has no live gas-hook ABI —
`1` is not a placeholder for a future feature flag, it is simply invalid
input today.
<!-- Verified by `SetHook_test.cpp:2154-2176` and
`SetHook_test.cpp:2178-2201` ("must contain valid api version"). -->

**Forbidden on `hsoINSTALL` (`API_ILLEGAL`)** — installing a hash never lets you
re-declare its ABI version, since that's a property of the WASM the
definition already fixed at create time.
<!-- `SetHook.cpp:352-360`:

```cpp
// api version not allowed in update
if (hookSetObj.isFieldPresent(sfHookApiVersion))
{
    ... "SetHook install operation sfHookApiVersion must not be included.";
    return false;
}
```
-->

(The comment says "not allowed in update" but this branch of the code is in
the `hsoINSTALL` case — the message text is copy-pasted from the update
case below it; the check itself is correctly scoped to install by virtue of
which `switch` arm it's in.) It produces `temMALFORMED`.
<!-- Verified by `SetHook_test.cpp:619-630`
("Hook Install operation cannot set apiversion"). -->

**Forbidden on `hsoUPDATE`, identically (`API_ILLEGAL`)** — same rejection,
same log code.
<!-- `SetHook.cpp:396-404`; verified by `SetHook_test.cpp:2445-2457`
("ApiVersion not allowed in update"). -->

**Forbidden on `hsoDELETE` and `hsoNSDELETE`** as part of each operation's
"only these fields may be present" whitelist —
see [operations-field-matrix](operations-field-matrix.md).
<!-- `SetHook.cpp:304,271`. -->

**Net effect:** `sfHookApiVersion` is legal in exactly one place across the
entire `SetHook` surface — a `hsoCREATE` entry, where it is mandatory and
must equal `0`. Every other operation forbids it outright, and it is never
readable back from a per-account `sfHook` entry, only from the
`ltHOOK_DEFINITION` the entry's `sfHookHash` points at.

**Common mistakes:**
- Sending `HookApiVersion: 0` on an install or update "just to be explicit"
  — this is rejected exactly like any other non-empty value would be; the
  field must be entirely absent outside of create.
- Assuming a value other than `0` is reserved for gas-metered hooks on this
  branch. There is no gas-hook support here; any non-zero value is simply
  malformed input, not a forward-compatible flag.
- Looking for `sfHookApiVersion` on the per-account `ltHOOK` entry when
  inspecting a live hook. It is only ever on `ltHOOK_DEFINITION`; the
  per-account entry only carries `sfHookHash` pointing at it.

## Related documents

- [HookName](hookname.md) — the field with the opposite storage rule
  (entry-only, never on the definition).
- [CreateCode](createcode.md) — the other fields `hsoCREATE` requires
  alongside `sfHookApiVersion`.
- [operations-field-matrix](operations-field-matrix.md) — full
  per-operation field matrix, including the amendment gates for the other
  create-time fields.
