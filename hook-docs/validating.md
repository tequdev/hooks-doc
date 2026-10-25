# Validating Hooks

`hook_validate` is an RPC method, added in xahaud release
`2026.10.13-release+4119`, that runs the `SetHook` install-time validator
against a compiled WASM module you supply, without building, signing, or
paying for a transaction. It performs the same two checks that
[Compiling Hooks](compiling.md) describes: the static guard checker
(`validateGuards`) and the WasmEdge load-and-validate smoke test. It also
reports the worst-case instruction count the guard checker computed, so you
can see how much of the 65,535 budget a hook consumes before you install it.
<!-- xahaud 2026.10.13-release+4119, src/xrpld/rpc/handlers/HookValidate.cpp:79-104 — validateGuards(*blob, logger, "", getImportWhitelist(rules), getGuardRulesVersion(rules)) followed by hook::HookExecutor::validateWasm(blob->data(), blob->size()); the RPC was introduced by commit 22e6ad21b4 "Add hook_validate RPC to run the hook guard checker (#882)", which is contained in that release tag -->

Use it as the step between "the compiler produced a `.wasm`" and "submit
`SetHook`": a module that `hook_validate` reports as valid will not be
rejected by the WASM checks in `SetHook` preflight on a node with the same
amendments enabled, and a module it rejects tells you which check failed
without burning a transaction.

## Where it is available

The method is enabled per node by the `[hook_validate_rpc]` config section:

| Node | Default | Enable with |
|---|---|---|
| Standalone (`xahaud -a`) | On | Nothing to do; `[hook_validate_rpc]` `0` turns it off |
| Networked (mainnet, testnet, your own node) | Off | `[hook_validate_rpc]` `1` in `xahaud.cfg` |

<!-- src/xrpld/core/detail/Config.cpp:860-862 — HOOK_VALIDATE_RPC = RUN_STANDALONE, then overridden by SECTION_HOOK_VALIDATE_RPC when present; cfg/xahaud-example.cfg:1591-1601 documents the section -->

When the method is off the node answers with the `notSupported` error. When
it is on it is open to non-admin clients, so it works on a node's public
JSON-RPC and WebSocket ports as well as the admin port; the node accounts it
as a heavy-burden request for rate limiting.
<!-- HookValidate.cpp:40-43 — rpcError(rpcNOT_SUPPORTED) when HOOK_VALIDATE_RPC is false; loadType = Resource::feeHeavyBurdenRPC; src/xrpld/rpc/detail/Handler.cpp:117 — {"hook_validate", byRef(&doHookValidate), Role::USER, NO_CONDITION}. Verified live on the 2026.10.13-release+4119 Docker image in standalone mode: the call succeeds on both the admin port (5005) and the public port (5007) with no config change -->

For local development the simplest setup is a standalone node, where the
method is on by default and every amendment can be enabled. See
"Results depend on amendments" below for why that matters.

## Request

The single parameter is `code`: the compiled and cleaned module as a hex
string, exactly the bytes you would put in
[CreateCode](sethook-fields/createcode.md). Upper- and lower-case hex are
both accepted. Produce it from a `.wasm` file with:

```sh
xxd -p -c0 hook.wasm
```

JSON-RPC over HTTP:

```sh
curl --json "{\"method\":\"hook_validate\",\"params\":[{\"code\":\"$(xxd -p -c0 hook.wasm)\"}]}" \
  http://localhost:5005
```

WebSocket, with the usual `command` form:

```json
{ "id": 1, "command": "hook_validate", "code": "0061736D0100..." }
```

Command line, through the node's own binary (uses the admin port in its
config):

```sh
xahaud hook_validate $(xxd -p -c0 hook.wasm)
```

<!-- src/xrpld/net/detail/RPCCall.cpp:536-543 and :1483 — parseHookValidate maps the one positional argument to jss::code; src/xrpld/app/main/Main.cpp:162 lists "hook_validate <hex>" in the usage text -->

The request is rejected with `invalidParams` before any validation runs when
`code` is missing, is not a string, is empty, has an odd number of hex
digits, is not hex, or decodes to more than 65,535 bytes (the `SetHook`
`WASM_TOO_BIG` ceiling, applied here as a parameter check).
<!-- HookValidate.cpp:45-66 — missing_field_error / expected_field_error / invalid_field_error(jss::code) and make_param_error("code exceeds the maximum hook size of ..."); the odd-length check exists because strUnHex would otherwise accept a leading nibble -->

## Response

| Field | Type | Meaning |
|---|---|---|
| `valid` | boolean | `true` only if the guard checker accepted the module **and** WasmEdge could load and validate it. |
| `instruction_count_hook` | string | Worst-case instruction count of `hook`, as computed by the guard checker. Present only when the guard check passed. |
| `instruction_count_cbak` | string | The same for `cbak`; `"0"` when the module has no `cbak`. Present only when the guard check passed. |
| `vm_error` | string | WasmEdge's load or validation error. Present only when the guard check passed but the VM rejected the module. |
| `log` | array of strings | The guard checker's log lines, one per entry, plus the message of any exception it threw. |

<!-- HookValidate.cpp:92-114 — valid = result.has_value(); counts via std::to_string(result->first/second) only inside if (result); vm_error set and valid forced false when validateWasm returns a message; log built line by line from the ostringstream, exceptionMsg appended last. jss.h: instruction_count_hook/instruction_count_cbak/vm_error/valid/log -->

Three details worth knowing when you script against it:

- **A rejected hook is not an RPC error.** `status` is `"success"` whenever
  the request was well formed; read `valid`, not `status`.
- **The counts are strings**, not numbers, so compare them after parsing.
- The two instruction counts are the figures that the `INSTRUCTION_EXCESS`
  check compares against 65,535; `instruction_count_hook` is the number to
  watch while you tune guards. See
  [Compiling Hooks: Guard validation at install time](compiling.md#guard-validation-at-install-time).

### A valid module

[Example: Payment Filter](examples/payment-filter.md) from this site, compiled
with [hooks-compiler](tools/hooks-compiler.md) and submitted to a standalone
node:

```json
{
  "result": {
    "instruction_count_cbak": "0",
    "instruction_count_hook": "125",
    "log": [
      "HookSet(50)[]: GuardCheck Total worse-case execution count: 125"
    ],
    "status": "success",
    "valid": true
  }
}
```

<!-- Live output from the 2026.10.13-release+4119 image for hook-docs/examples/payment-filter.md compiled with hooks-compiler 0.2.0 -Oz against xahaud hook/genesis/headers; the "Total worse-case execution count" line is Guard.h:810-812, GUARDLOG(hook::log::INSTRUCTION_COUNT), INSTRUCTION_COUNT = 50 in Enum.h -->

### A loop without a guard

The same request for a hook whose `for` loop has no `GUARD()` call:

```json
{
  "result": {
    "log": [
      "HookSet(28)[]: GuardCheck Missing first i32.const after loop instruction codesec: 0 hook byte offset: 112 [0x70]"
    ],
    "status": "success",
    "valid": false
  }
}
```

No instruction counts are reported, because the guard checker stopped at the
first failing check. The byte offset is counted from the start of the module
and points at the first instruction inside the loop body, where the guard's
`i32.const` was expected; `codesec` is the index of the function within the
code section.
<!-- Guard.h:131-139 GUARD_ERROR prints the parser position i, which indexes the whole wasm vector; in the sample module the loop opcode 0x03 sits at offset 0x6E and 0x70 is the byte after its block type -->
<!-- Live output; Guard.h:378-422 loop branch, GUARD_MISSING = 28. The WebSocket form was exercised live as well (command: hook_validate, valid: true) -->

### Over the instruction budget

A correctly guarded loop whose declared `maxiter` is far too large:

```json
{
  "result": {
    "log": [
      "HookSet(50)[]: GuardCheck Total worse-case execution count: 2240043",
      "HookSet(51)[]: GuardCheck Maximum possible instructions exceed 65535, please make your hook smaller or check your guards!"
    ],
    "status": "success",
    "valid": false
  }
}
```

<!-- Live output for a GUARD(70000) loop; Guard.h:810-823, INSTRUCTION_EXCESS = 51 -->

## Reading the log

Every log line has the shape `HookSet(<code>)[]: <message>`. The number in
parentheses is the validator's log code, the same code that a rejected
`SetHook` transaction records, but in numeric form. The table in
[Compiling Hooks: Common install-rejection causes](compiling.md#common-install-rejection-causes)
lists each code's number next to its name, so a `HookSet(28)` line can be
read as `GUARD_MISSING` and looked up there. Code `50` (`INSTRUCTION_COUNT`)
is informational and appears in every successful run; it is not a failure.
<!-- include/xrpl/hook/Guard.h:21-27 — GUARDLOG prints "HookSet(" << logCode << ")[" << guardLogAccStr << "]: " and the RPC passes "" as guardLogAccStr, hence the empty brackets; hook_log_code is enum : uint16_t in Enum.h:134-273 so the stream prints the integer -->

## Results depend on amendments

The validator takes two inputs from the node's current open ledger: the Hook
API import whitelist, which gains functions as amendments enable them, and
the guard-rules version, which decides whether `memory.copy`/`memory.fill`
are rejected and whether the nesting cap is 16 or 32. A hook that validates
on a standalone node with every amendment enabled can still be rejected by a
network where the amendment gating one of its imports is not yet active, and
the other way round.
<!-- HookValidate.cpp:70-86 — Rules copied from context.app.openLedger().current()->rules(), passed to hook_api::getImportWhitelist(rules) and hook_api::getGuardRulesVersion(rules) -->

So validate against a node whose amendment set matches the network you will
deploy to: the target network's own node with `[hook_validate_rpc]` enabled,
or a standalone node configured with the same amendments.

## What it does not check

`hook_validate` covers only the WASM module. It does not look at the rest of
a `SetHook` entry (`HookOn`, `HookNamespace`, `HookApiVersion`, parameters,
grants), does not check fees or reserves, and does not execute the hook. A
module that passes can still produce a rejected `SetHook` for reasons listed
in [SetHook Fields](sethook-fields/README.md), and can still `rollback` at
run time. Test behavior on a standalone node after installing it.

## Related documents

- [Compiling Hooks](compiling.md)
- [hooks-compiler](tools/hooks-compiler.md)
- [Developing Hooks in Languages Other Than C](other-languages.md)
- [Hook Best Practices](best-practices.md)
- [Guards](macros/guards.md)
- [CreateCode](sethook-fields/createcode.md)
