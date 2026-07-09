# Compiling Hooks

A Hook is not C source — it is the compiled **WebAssembly (WASM) module**
stored in [`sfCreateCode`](sethook-fields/createcode.md). Getting from a `.c`
file to an installed hook means passing through a compiler, a cleaning step,
and finally a static validator that runs inside `xahaud` itself before the
`SetHook` transaction is ever queued. This page describes exactly what that
validator checks — the module shape it demands, the toolchain that produces a
conforming binary, and the concrete rejection reasons you'll hit if it
doesn't.

## What compilation produces

The compiler output is a single WASM module. `xahaud` never executes anything
else: no interpreted source, no bytecode format of its own, just the standard
WASM binary format loaded into a WasmEdge VM instance per execution.
[overview.md](overview.md)'s "Compilation pipeline" section covers the
toolchain names in brief; this page covers what the validator actually
enforces on the resulting binary.

Every hook must also declare which Hook API ABI it targets via
[`HookApiVersion`](sethook-fields/hookapiversion.md). On this branch the field
is required on `hsoCREATE` and the **only accepted value is `0`** — the
guard-type ABI this page describes. Any other value, or an absent field, is
rejected as `temMALFORMED` (`API_MISSING` / `API_INVALID`) before the WASM
itself is even inspected.
<!-- src/xrpld/app/tx/detail/SetHook.cpp:437-456 — hsoCREATE case: sfHookApiVersion must be present and getFieldU16(sfHookApiVersion) != 0 rejects with "we currently only accept api version 0" -->

Because the whole point of the guard system is to let every node compute an
identical worst-case instruction bound for a hook before running it, the
validator's checks below aren't style preferences — they're what make a
guard-type hook's execution boundable and deterministic across the network in
the first place.
<!-- include/xrpl/hook/Guard.h — compute_wce (~206-263) walks the block tree once, multiplying loop bodies by their declared maxiter, to derive a single worst-case instruction count per hook; this is only possible because every loop's iteration bound is a static literal enforced at the point described in "Guard validation at install time" below -->

## The required module shape

`SetHook` runs the compiled blob through a static, single-pass WASM
validator — followed by a real WasmEdge load-and-validate smoke test,
entirely during **preflight** (before any ledger state is touched, and
identically on every node). Both checks are mandatory and independent;
either failure makes the whole `SetHook` transaction `temMALFORMED`.
<!-- src/xrpld/app/tx/detail/SetHook.cpp:731-849 (SetHook::preflight) calls validateHookSetEntry (line 842) for every sfHook entry, entirely inside preflight, before preclaim/doApply touch the ledger; SetHook.cpp:519-611 is the hsoCREATE case within validateHookSetEntry that runs validateGuards (include/xrpl/hook/Guard.h) then hook::HookExecutor::validateWasm -->

### Entry points: `hook` and `cbak`

A conforming module exports exactly:

```c
int64_t hook(uint32_t reserved);          // required
int64_t cbak(uint32_t reserved);          // optional — only if the hook emits
```

The validator parses the export section looking specifically for entries
named `hook` and `cbak`. `hook` is mandatory (`EXPORT_MISSING` if absent);
`cbak` is optional. For whichever of the two is present, the validator
resolves it to a function type and checks that type has **exactly one
parameter of type `i32`** (`PARAM_HOOK_CBAK` otherwise) and **exactly one
result of type `i64`** (`RETURN_HOOK_CBAK` otherwise). If both `hook` and
`cbak` are exported, they must resolve to the *same* function type
(`HOOK_CBAK_DIFF_TYPES` otherwise) — so `cbak`'s signature can't drift from
`hook`'s even if you never touch it directly.
<!-- include/xrpl/hook/Guard.h:1081-1159 — export-section scan, EXPORT_HOOK_FUNC/EXPORT_CBAK_FUNC/EXPORT_MISSING; Guard.h:1198-1221 — HOOK_CBAK_DIFF_TYPES (hook and cbak func types must match); Guard.h:1306-1381 — PARAM_HOOK_CBAK (param_count must == 1, param_type must == 0x7F i32); Guard.h:1431-1446 — RETURN_HOOK_CBAK (result_count must == 1, result_type must == 0x7E i64) -->

There is no separate "does `hook` return the right thing" check beyond the
type signature — a hook never actually returns a value to the ledger in the
normal sense, since it's expected to terminate via `accept()`/`rollback()`.
See [overview.md](overview.md#entry-points) for that convention.

### Extra exports vs. custom sections

A raw `clang`-targeting-wasm32 build typically emits more than just `hook`
and `cbak` — helper exports, and (if debug info is on) custom sections. These
are treated very differently:

- **Extra *exports* are silently skipped, not rejected.** The export-section
  loop only special-cases entries literally named `hook` or `cbak`; any other
  export name is walked past without inspection.
  <!-- include/xrpl/hook/Guard.h:1143-1148 — for an export whose name isn't exactly "hook" or "cbak", the loop does `i += name_len + 1; parseLeb128(...)` and moves on with no error path -->
- **A custom section (WASM section id `0`) is a hard reject.** This is the
  actual reason an unprocessed `clang`/`emscripten` build usually fails to
  install — debug-info and name-mapping data land in custom sections, and the
  validator rejects the presence of *any* custom section outright,
  independent of what it contains.
  <!-- include/xrpl/hook/Guard.h:914-921 — section_type == 0 is rejected unconditionally with CUSTOM_SECTION_DISALLOWED, message: "Hook contained a custom section, which is not allowed. Use cleaner." -->

So "hook-cleaner strips extra exports" is a cleanliness step, not something
the validator requires — but "hook-cleaner strips custom sections" **is**
mandatory, because the validator won't accept a binary that still has one.

### Imports: only the Hook API, nothing else

Every function a hook imports must come from the `env` module and must be a
name present in the current Hook API whitelist (amendment-gated per
function). Importing from any
other module name, or importing a name the whitelist doesn't recognize, is
rejected (`IMPORT_MODULE_ENV`, `IMPORT_ILLEGAL`). This whitelist is also
where the mandatory `_g` guard import is discovered.
<!-- include/xrpl/hook/Guard.h:947-1071 — import-section scan: mod_length/name must equal "env" (IMPORT_MODULE_ENV), import name must be found in import_whitelist (IMPORT_ILLEGAL); include/xrpl/hook/Enum.h:410-431 (getImportWhitelist) builds the whitelist from hook_api.macro, amendment-gated per entry -->

A subtlety worth knowing: **every hook must import `_g`, even one with no
loops at all.** After the import section is fully parsed, the validator
unconditionally checks that `_g` was among the imports and rejects the whole
transaction (`GUARD_IMPORT`) if not — this check doesn't depend on whether
the hook contains any guarded loops. In practice this means every hook must
call `_g` at least once somewhere in its source (conventionally `_g(1,1)` as
the first statement of `hook`), or the compiler won't emit the `_g` import
and the binary will never pass validation.
<!-- include/xrpl/hook/Guard.h:1064-1071 — "if (guard_import_number == -1) { GUARDLOG(GUARD_IMPORT) ... return {}; }" runs once per hook right after the import section is parsed, unconditional on loop presence -->

### No user-defined function calls

The guard checker disallows calling any function whose index is beyond the
imported functions — i.e., a locally-defined function in the module's own
code section can never legally be the target of a `call` instruction
(`CALL_ILLEGAL`). `call_indirect` (function-pointer/vtable calls) is rejected
outright and unconditionally (`CALL_INDIRECT`).
<!-- include/xrpl/hook/Guard.h:495-520 — call (0x10U): callee_idx > last_import_idx is rejected with CALL_ILLEGAL, comment "disallow calling of user defined functions inside a hook"; Guard.h:522-529 — call_indirect (0x11U) is unconditionally CALL_INDIRECT -->

Note what this means precisely: the mechanism is a **call-graph restriction**,
not an export whitelist and not a "no local functions" ban at the WASM level.
A locally-defined helper function *can* exist in the compiled module's code
section — it's just that no instruction in the module is permitted to call
it, so it can never execute. In practice, always compile with helpers marked
`inline __attribute__((always_inline))` (or written as macros) so the
compiler eliminates the call entirely, rather than relying on the validator
to reject a stray real call after the fact. See
[best-practices.md](best-practices.md#no-user-defined-functions-—-inline-everything).

`memory.grow` is rejected unconditionally (`MEMORY_GROW`); the bulk-memory
`memory.copy` and `memory.fill` instructions are additionally rejected once
the `fix20250131` guard-rules revision is enabled (`GuardRuleFix20250131`).
Small, constant-sized `memcpy`/`memset` calls are typically lowered by the
compiler to plain load/store instructions and are unaffected.
<!-- include/xrpl/hook/Guard.h:686-694 — memory.grow (0x40U) unconditional MEMORY_GROW reject; Guard.h:639-653 — memory.copy (fc_type 10) and memory.fill (fc_type 11) rejected only if rulesVersion & GuardRuleFix20250131 -->

### Guard validation at install time

Every `loop` instruction (WASM opcode `0x03`) must open with the exact byte
pattern `i32.const <guard_id>, i32.const <maxiter>, call <_g's import index>`
— the validator parses these three instructions literally at the top of each
loop body. `maxiter` must be a non-zero literal (`i32.const`, not a computed
value), and the called function index must resolve to the imported `_g`.
Missing or malformed pieces of this pattern reject with `GUARD_MISSING`; a
`maxiter` of zero is rejected the same way.
<!-- include/xrpl/hook/Guard.h:378-422 — loop (instr == 0x03U) branch: first i32.const (GUARD_ERROR "Missing first i32.const..."), second i32.const as the iteration_bound (GUARD_ERROR "Missing second i32.const..."), call to guard_func_idx (GUARD_ERROR "...was not _g"), iteration_bound == 0 rejected ("Guard call cannot specify 0 maxiter") -->

This is the install-time check the [`GUARD`/`GUARDM` macros](macros/guards.md)
exist to satisfy mechanically, and it's what [`_g`](api-reference/control/_g.md)
enforces at runtime once a loop is inside its budget. This page doesn't
duplicate that semantics — see those two pages for the runtime guard model
and the macro forms.

Two more structural limits are enforced in the same pass, both walking the
block/loop/if nesting tree the guard scan builds:

- **Block/loop/if nesting depth** is capped at 16 levels (32 under the
  `fixGuardDepth32` guard-rules revision); exceeding it rejects with
  `NESTING_LIMIT`.
  <!-- include/xrpl/hook/Guard.h:794-808 — max_level = 16, or 32 if rulesVersion & GuardRuleDepth32; recursion_limit_reached in compute_wce rejects with NESTING_LIMIT -->
- **Worst-case instruction count**, computed by multiplying each loop's
  instruction count by its declared `maxiter` recursively up the block tree,
  must stay under 65,535; reaching or exceeding it rejects with
  `INSTRUCTION_EXCESS`.
  <!-- include/xrpl/hook/Guard.h:810-823 — wce >= 0xFFFFU rejects with INSTRUCTION_EXCESS -->

There is also a hard cap of 1024 total `_g` calls per hook (`MAX_GUARD_CALLS`),
checked both at loop-start guard calls and any other call to `_g`.
<!-- include/xrpl/hook/Guard.h:421-422, 513-517 — guard_count++ > MAX_GUARD_CALLS rejects with "Too many guard calls! Limit is 1024" at both the loop-guard call site and the general call-instruction site -->

### Structural limits: size and the smoke test

Independently of guard validation, the compiled blob itself is size-checked
against a fixed ceiling (65,535 bytes / `0xFFFF`) — this check runs in
`preflight` for *every* `sfHook` entry that carries `sfCreateCode`, before
guard validation even starts, and rejects `temMALFORMED` (`WASM_TOO_BIG`) if
exceeded.
<!-- src/xrpld/app/tx/detail/SetHook.cpp:795-804 — per-sfHook-entry size check against hook::maxHookWasmSize(), runs before validateHookSetEntry is called on that same entry -->

After guard validation passes, `xahaud` independently loads the module into a
real WasmEdge VM instance and asks WasmEdge itself to load and validate the
module — a smoke test that catches malformed WASM the static guard scan
doesn't reject but that genuinely isn't loadable or instantiable. Failure
here is logged as `WASM_TEST_FAILURE` and also produces `temMALFORMED`.
<!-- src/xrpld/app/hook/applyHook.h:369-388 (HookExecutor::validateWasm — WasmEdge_VMLoadWasmFromBuffer then WasmEdge_VMValidate); src/xrpld/app/tx/detail/SetHook.cpp:595-609 (call site, WASM_TEST_FAILURE on failure) -->

Guard validation is also re-run (with ledger access this time, though the
routine itself stays context-free) at apply time for a genuinely new hash,
and its failure there maps to `tecINTERNAL` rather than `temMALFORMED` — see
[sethook-fields/createcode.md](sethook-fields/createcode.md) for that
apply-time detail.
<!-- src/xrpld/app/tx/detail/SetHook.cpp:869 (SetHook::doApply), re-run of validateHookSetEntry at ~1798-1799 within doApply, tecINTERNAL on failure at ~1811 -->

## Toolchain pipeline

The repo's own pages name a specific toolchain for producing a conforming
binary from C source:
[overview.md](overview.md#compilation-pipeline) and
[best-practices.md](best-practices.md#no-user-defined-functions-—-inline-everything)
reference:

1. **`wasmcc`** (from `wasienv`) — a clang-based compiler that targets
   `wasm32`, producing the raw WASM module from C source.
2. **`hook-cleaner`** (from `hook-cleaner-c`) — strips custom sections and
   non-`hook`/`cbak` exports from the raw compiler output. The custom-section
   strip is what actually makes the difference between "installs" and
   `CUSTOM_SECTION_DISALLOWED`; the export strip is cosmetic (see above), but
   keeps the binary minimal and its behavior easy to reason about.
3. **`wat2wasm`** (from `wabt`) — only needed if you're hand-writing or
   inspecting WebAssembly Text (`.wat`) rather than compiling from C.

The reference hooks used throughout these docs are compiled from C source
embedded in xahaud's own test suite, via a repeatable local build task.
<!-- overview.md:302-307 and best-practices.md:100-101 already document these tool names and the mise task; not independently re-verified against the xahaud checkout in this pass since they are build-tooling names, not consensus-affecting runtime behavior. This project's own test hooks are compiled through src/test/app/build_test_hooks.sh, which extracts embedded C source from SetHook_test.cpp and produces SetHook_wasm.h; the repeatable local command is `mise run build-test-hook`. -->

A typical pipeline looks like:

```
hook.c  →  wasmcc  →  hook.wasm (raw)  →  hook-cleaner  →  hook.wasm (clean)
                                                                  │
                                                     hex-encode into sfCreateCode
                                                                  │
                                                          SetHook transaction
```

The final step — hex-encoding the cleaned WASM bytes into `sfCreateCode` — is
mechanical; see [sethook-fields/createcode.md](sethook-fields/createcode.md)
for the field itself and [sethook-fields/README.md](sethook-fields/README.md)
for the rest of a `SetHook` entry's required fields (`HookNamespace`,
`HookApiVersion`, `HookOn`).

## The edit → compile → install → test loop

A practical development cycle:

1. **Edit** the C source, following the mandatory rules in
   [best-practices.md](best-practices.md#mandatory-rules) — guard discipline,
   inlined helpers only, size/instruction budgets.
2. **Compile and clean** with `wasmcc` then `hook-cleaner`.
3. **Install** with a `SetHook` transaction — `hsoCREATE` for new code, or
   `hsoUPDATE`/`hsoINSTALL` for an existing hash. See
   [sethook-fields/README.md](sethook-fields/README.md) for the full
   operation-inference rules.
4. **Test** by sending transactions that should trigger the hook and
   inspecting `sfHookExecutions` metadata, or by tracing with
   `trace`/`trace_num`/`trace_float` (see the debugging guidance in
   [best-practices.md](best-practices.md#dont-ship-heavy-trace-calls-in-production)).
5. On a rejection, read the `SetHook` transaction's log code (see the table
   below) and go back to step 1 — nothing about steps 2-4 tells you *why* a
   binary was rejected beyond the log code the validator emitted.

## Common install-rejection causes

| Symptom (log code) | Cause |
|---|---|
| `WASM_TOO_BIG` | Compiled (and cleaned) blob exceeds 65,535 bytes. |
| `CUSTOM_SECTION_DISALLOWED` | Raw compiler output still carries a debug/name custom section — run it through `hook-cleaner`. |
| `EXPORT_MISSING` / `EXPORT_HOOK_FUNC` | No export named `hook` at all, or it doesn't have type `int64_t hook(uint32_t)`. |
| `EXPORT_CBAK_FUNC` / `HOOK_CBAK_DIFF_TYPES` | `cbak` is exported with the wrong signature, or a different type than `hook`. |
| `PARAM_HOOK_CBAK` / `RETURN_HOOK_CBAK` | `hook`/`cbak` doesn't take exactly one `i32` parameter and return exactly one `i64`. |
| `IMPORT_MODULE_ENV` / `IMPORT_ILLEGAL` | An import isn't from module `env`, or its name isn't a whitelisted Hook API function. |
| `GUARD_IMPORT` | `_g` is never called anywhere in the hook, so the compiler never emitted its import. |
| `GUARD_MISSING` | A loop doesn't open with the literal `i32.const, i32.const, call _g` pattern, or `maxiter` is `0`. |
| `CALL_ILLEGAL` | The module calls a locally-defined (non-inlined) helper function instead of a Hook API import. |
| `CALL_INDIRECT` | The module uses a function pointer / `call_indirect`. |
| `MEMORY_GROW` | The module uses `memory.grow`. |
| `NESTING_LIMIT` | Block/loop/if nesting exceeds 16 levels (32 post-`fixGuardDepth32`). |
| `INSTRUCTION_EXCESS` | Guard-computed worst-case instruction count reaches 65,535. |
| `WASM_TEST_FAILURE` | Guard validation passed but WasmEdge couldn't load/validate the module (genuinely malformed WASM). |
| `API_MISSING` / `API_INVALID` | `sfHookApiVersion` absent, or not `0`, on `hsoCREATE`. |

<!-- Row-by-row source verification (same checkout as the rest of this page):
WASM_TOO_BIG — SetHook.cpp:795-804; CUSTOM_SECTION_DISALLOWED — Guard.h:914-921;
EXPORT_MISSING/EXPORT_HOOK_FUNC — Guard.h:1081-1159; EXPORT_CBAK_FUNC/HOOK_CBAK_DIFF_TYPES — Guard.h:1130-1221;
PARAM_HOOK_CBAK/RETURN_HOOK_CBAK — Guard.h:1306-1446; IMPORT_MODULE_ENV/IMPORT_ILLEGAL — Guard.h:947-1071;
GUARD_IMPORT — Guard.h:1064-1071; GUARD_MISSING — Guard.h:378-422; CALL_ILLEGAL — Guard.h:495-520;
CALL_INDIRECT — Guard.h:522-529; MEMORY_GROW — Guard.h:686-694; NESTING_LIMIT — Guard.h:794-808;
INSTRUCTION_EXCESS — Guard.h:810-823; WASM_TEST_FAILURE — applyHook.h:369-388 + SetHook.cpp:595-609;
API_MISSING/API_INVALID — SetHook.cpp:437-456. Paths: include/xrpl/hook/Guard.h,
src/xrpld/app/hook/applyHook.h, src/xrpld/app/tx/detail/SetHook.cpp. -->

## Related documents

- [overview.md](overview.md)
- [best-practices.md](best-practices.md)
- [macros/guards.md](macros/guards.md)
- [api-reference/control/_g.md](api-reference/control/_g.md)
- [sethook-fields/createcode.md](sethook-fields/createcode.md)
- [sethook-fields/hookapiversion.md](sethook-fields/hookapiversion.md)
