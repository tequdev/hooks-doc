---
sidebarTitle: "Other Languages"
---

# Developing Hooks in Languages Other Than C

Validations on `SetHook` judges bytes, not source language: it walks the WASM
export/import/code sections of whatever binary you submit and never asks what
compiler produced it. Any toolchain that emits a conforming `wasm32` module —
Rust, Zig, AssemblyScript, hand-written WebAssembly Text, or anything else —
can install and run as a hook. This page assumes you already know the hook
model ([overview](overview.md)) and the validator's exact contract
([compiling](compiling.md)); it doesn't restate either. What it covers is
what that contract implies once you step outside a toolchain designed for it,
and how to satisfy each requirement from a non-C compiler.

The short version: the constraints exist to make a guard-type hook's
worst-case execution statically boundable, and that goal is deeply hostile to
the runtime machinery most managed-language toolchains assume they can rely
on — garbage collectors, dynamic memory growth, indirect dispatch, and
exception unwinding all disappear. What's left is closer to freestanding
embedded programming than application development, regardless of which
language's syntax you're using to get there.

## The contract your module must satisfy

| Constraint | What it means for a non-C toolchain | Documented at |
|---|---|---|
| Exports `hook` (and `cbak` if the hook emits) with the exact type `int64_t f(uint32_t)`, identical types for both | Your toolchain must emit exactly these two export names, with this exact WASM signature — no wrapper shims, no differing calling convention between the two | [compiling](compiling.md#entry-points-hook-and-cbak) |
| Imports restricted to module `env` and the Hook API whitelist, plus `_g` — no WASI, no other host imports | Anything your standard library pulls in from `wasi_snapshot_preview1` or any module other than `env` fails validation outright | [compiling](compiling.md#imports-only-the-hook-api-nothing-else) |
| `_g` must be imported even with no loops | Your module must call `_g` at least once (conventionally as the first statement of `hook`) or the compiler never emits the import, and the whole binary is rejected | [compiling](compiling.md#imports-only-the-hook-api-nothing-else) |
| Every loop opens with the literal `i32.const <guard_id>`, `i32.const <maxiter>`, `call $_g` sequence, `maxiter` a non-zero constant | Loop guarding is a byte-pattern check, not a semantic one — your compiler's optimizer must not reorder, hoist, or constant-fold this sequence away from the top of the loop body | [compiling](compiling.md#guard-validation-at-install-time) |
| No `call` to any function index beyond the imports | All logic must end up inlined into `hook`/`cbak` at the WASM level — no helper functions, no runtime-support calls left in the code section | [compiling](compiling.md#no-user-defined-function-calls), [best-practices](best-practices.md#no-user-defined-functions-—-inline-everything) |
| `call_indirect` unconditionally rejected | No function pointers, vtables, trait objects, interfaces, or closures that lower to indirect calls | [compiling](compiling.md#no-user-defined-function-calls) |
| `memory.grow` rejected | Linear memory is fixed at compile time — no toolchain-managed heap that grows on demand, which rules out most garbage collectors and general-purpose allocators | [compiling](compiling.md#no-user-defined-function-calls), [best-practices](best-practices.md#no-memory-grow-memory-copy-memory-fill) |
| `memory.copy`/`memory.fill` rejected (`fix20250131`) | Bulk-memory instructions can't appear in the binary; large or non-constant-size copies must be avoided since the compiler may lower them to these opcodes instead of a load/store loop | [compiling](compiling.md#no-user-defined-function-calls), [best-practices](best-practices.md#no-memory-grow-memory-copy-memory-fill) |
| Block/loop/if nesting depth ≤ 16 (32 under `fixGuardDepth32`) | Generated control flow that nests deeply — pattern-match desugaring, iterator chains, derived trait impls — can exceed the cap even when the source looks flat | [compiling](compiling.md#guard-validation-at-install-time), [best-practices](best-practices.md#bound-nesting-depth) |
| Guard-derived worst-case instruction count < 65,535 | Every loop's declared `maxiter`, multiplied through nested loops, feeds one global bound — verbose codegen from a non-C toolchain reaches this ceiling faster than hand-written C at equivalent logical complexity | [compiling](compiling.md#guard-validation-at-install-time), [best-practices](best-practices.md#keep-hooks-small-and-under-the-instruction-cap) |
| Compiled WASM ≤ 65,535 bytes | Runtime support code (panic formatting, GC, standard-library routines) is exactly what blows this budget in a stock non-C build | [compiling](compiling.md#structural-limits-size-and-the-smoke-test), [best-practices](best-practices.md#keep-hooks-small-and-under-the-instruction-cap) |
| No custom sections | Debug info and name-mapping data — which most non-C toolchains emit by default — must be stripped by a cleaning step before install | [compiling](compiling.md#extra-exports-vs-custom-sections) |
| Hooks terminate via `accept()`/`rollback()` | `hook`/`cbak` never meaningfully "return" a value; your language's normal function-return path is not how a hook ends | [overview](overview.md#entry-points) |

## Why stock toolchains fail out of the box

A `wasm32` build straight off a mainstream non-C toolchain almost never
installs unmodified. Every failure traces back to runtime machinery the
language assumes it can use freely, and every one of those assumptions
collides with a specific row in the table above:

- **Garbage collectors and general-purpose allocators** need to request more
  linear memory as the heap grows, and their internal bookkeeping runs
  through ordinary function calls. Both `memory.grow` and any resulting
  `CALL_ILLEGAL` are hard rejects — there is no way to run a real GC or a
  `malloc`-style allocator inside a hook.
- **Panic/exception unwinding machinery** pulls in formatting code (to build
  the panic message), unwinding tables, and internal calls to the panic
  handler — all of which are either non-inlined function calls or bytes the
  size cap can't absorb. Code paths that can panic (array indexing, integer
  overflow checks, `unwrap()`-style calls) are a common source of
  unexpectedly large binaries even when the "happy path" logic is small.
- **Vtables, closures, and interface/trait-object dispatch** lower to
  `call_indirect` in WASM, which is rejected unconditionally regardless of
  how the source code expressed the polymorphism.
- **Runtime startup and scheduler code** (goroutine schedulers, green-thread
  runtimes, module-initialization sequences some languages inject
  automatically) run through internal calls the hook never invokes directly
  and can't inline away — it's scaffolding the toolchain adds unconditionally,
  not logic you wrote.
- **Debug and name custom sections**, emitted by default by most toolchains'
  debug builds, are a hard reject regardless of content and must be stripped.
- **WASI imports** get pulled in transitively the moment standard-library
  code touches I/O, environment variables, clocks, or some allocator
  implementations — none of which are hosted in a hook's `env` import
  module, so any WASI import fails validation.
- **Standard-library binary bloat** — formatting, collections, string
  processing — routinely pushes a "hello world"-equivalent non-C build past
  the 65,535-byte cap before any hook logic is added.

One thing this list deliberately does **not** claim: the validator does not
statically reject floating-point WASM opcodes. The reason to avoid native
`f32`/`f64` arithmetic in a hook isn't a validator rule — it's that the
contract's whole purpose is deterministic, boundable execution, and IEEE-754
float semantics vary subtly across implementations in ways that undermine
determinism guarantees the same way an unbounded loop would. The documented
answer is to do arithmetic in the fixed-precision **XFL** format instead; see
[xfl](xfl.md) for the format and [api-reference/float/README](api-reference/float/README.md)
for the API. If your language's compiler happens to emit float opcodes for
XFL-adjacent bit manipulation, that's incidental — the guidance is about
which arithmetic *format* your hook logic uses, not which WASM opcodes are
legal.

## A language-agnostic workflow

Regardless of source language, producing an installable hook follows the
same sequence:

1. **Target freestanding `wasm32`** — no OS target, no WASI. Most toolchains
   call this something like `wasm32-unknown-unknown` or a "freestanding" /
   "bare-metal" profile.
2. **Declare the Hook API host functions as imports from `env` yourself.**
   There is no SDK to link against for most languages — write the equivalent
   of C's `extern` declarations for whichever Hook API functions your logic
   calls, naming the exact signatures the API expects.
3. **Export `hook` (and `cbak`, if needed) with the exact signature** —
   `int64_t hook(uint32_t)`. Any mismatch here fails validation before
   anything else is even checked.
4. **Force full inlining of all internal code**, via whatever your toolchain
   offers for aggressive inlining, and check the actual output for residual
   calls to non-imported functions.
5. **Guard every loop with literal constants**, using a technique from the
   next section, and verify the compiler emitted the required byte pattern.
6. **Strip custom sections.** `hook-cleaner` (from `hook-cleaner-c`) operates
   on the WASM binary itself, not on C-specific structure, so it works on
   output from any toolchain. See [compiling](compiling.md#toolchain-pipeline).
7. **Inspect the result with `wasm2wat`** (from `wabt`) before ever
   submitting a `SetHook` transaction — see
   [Inspecting your module before install](#inspecting-your-module-before-install)
   below.
8. **Check size and worst-case instruction count** against the same 65,535
   ceilings [compiling](compiling.md#structural-limits-size-and-the-smoke-test)
   documents — non-C output tends to run closer to both limits than C.
9. **Estimate fees** before deploying, since both ceilings just checked feed
   directly into cost — see [Fee implications of your toolchain](#fee-implications-of-your-toolchain)
   and [fees](fees.md).
10. **Test before mainnet.** Install on a test network, exercise the hook
    with real transactions, and confirm `sfHookExecutions` metadata looks as
    expected — the validator only proves your binary is *installable*, not
    that its logic is correct.

## Satisfying the guard contract without the C macros

[compiling](compiling.md#guard-validation-at-install-time) and
[api-reference/control/_g](api-reference/control/_g.md) describe the raw
contract `_g(guard_id, maxiter)` must satisfy; the [`GUARD`/`GUARDM`
macros](macros/guards.md) are a C-preprocessor convenience for generating
conforming calls, not something the validator knows about — a non-C
toolchain has no macro layer to lean on and must reproduce the same byte
pattern directly.

The semantics to reproduce, restated for a toolchain with no macros:

- **Every loop needs a call to `_g` as the literal first three instructions
  of its body**: push the guard id, push `maxiter`, call `_g`. Both pushed
  values must be `i32.const` — compile-time literals, never a computed or
  loaded value.
- **`guard_id` must be unique per loop site.** Reusing one guard id across
  two different loops merges their iteration counts against a single budget,
  which can trip a guard violation earlier than either loop alone would.
  Since you have no `__LINE__`-equivalent macro doing this for you
  automatically, derive distinct ids yourself — a monotonically incrementing
  constant per loop in source order is sufficient.
- **`maxiter` must be a non-zero literal constant**, not a value derived from
  a variable, parameter, or prior computation, and it must be an honest
  worst-case bound for the loop it guards.
- **There is a hard cap of 1024 total `_g` calls per hook** (loop-guard calls
  and any other call to `_g` combined) — see
  [compiling](compiling.md#guard-validation-at-install-time).

Two practical strategies for getting the compiler to actually emit this,
in order of preference:

**(a) Write source so the guard call is naturally the first statement of
every loop body**, and then **verify the compiler didn't move anything in
front of it**. The binding must be a direct declaration of the imported `_g`
— never a local wrapper function, since a call to the wrapper is a call to a
defined function and fails validation. The import itself is safe from
deletion (the optimizer can't see into a host call, so it must preserve it),
but the optimizer is still free to schedule other loop-body instructions —
hoisted address computations, loop-carried temporaries — ahead of the call,
which breaks the required position even though the call survives. Constant
literal arguments at the call site help the compiler emit the two
`i32.const`s directly.

**(b) Post-process the compiled output mechanically.** If your language's
codegen makes it awkward to guarantee the exact instruction order from
source, insert the guard sequence into the `.wat` text (or directly into the
binary) as a build step after compilation, before running `hook-cleaner`.
This trades source-level readability for a build pipeline you fully control.

**Whichever strategy you use, the final verification step is the same:**
open the compiled `.wat` with `wasm2wat` and confirm, by eye, that every
`loop` instruction is immediately followed by
`i32.const <id>  i32.const <maxiter>  call $_g` with no other instructions
in between and no rearrangement. Don't trust that source-level guard
placement survived optimization — check the actual output every time you
change the compiler, its flags, or the source itself.

## Language notes

General toolchain characteristics for common non-C languages, evaluated
against the contract above. These are properties of the languages and their
mainstream toolchains, not of xahaud — treat them as a starting assessment,
not a guarantee, and verify current behavior with `wasm2wat` against
whatever compiler version you actually use.

### Rust

The most viable non-C option, because Rust's ecosystem already has a mature
`no_std`, allocator-free story for embedded targets.

- Build with `#![no_std]` and no global allocator — nothing in your code
  should require heap allocation.
- Set `panic = "abort"` in your build profile and provide a minimal
  `#[panic_handler]` — the default unwinding panic path pulls in formatting
  and unwinding machinery you don't want in the binary at all.
- Export the entry point as
  `#[no_mangle] pub extern "C" fn hook(reserved: u32) -> i64`, matching the
  `int64_t hook(uint32_t)` signature the validator requires; the same
  pattern applies to `cbak`.
- Declare Hook API imports in an `extern "C"` block — Rust places these in
  module `env` by default when targeting `wasm32-unknown-unknown`, which is
  what the validator requires.
- Tune `lto = true` and `opt-level` aggressively, and mark internal helpers
  `#[inline(always)]`.
- **Watch for compiler-inserted calls to `memcpy`/`memset`.** Rust's
  `compiler-builtins` crate provides these for large or non-constant-size
  copies, and they show up as genuine defined functions in the code section
  — a `call` to one of them is `CALL_ILLEGAL` even though you never wrote
  the call yourself. Keep copies small and constant-sized so the compiler
  lowers them to plain load/store instructions instead.
- **Watch for bounds-check panics.** Array indexing (`buf[i]`) inserts an
  implicit bounds check that panics on failure, pulling in panic machinery
  even with a minimal handler. Prefer `get_unchecked`-style APIs paired with
  your own explicit bounds check that ends in `rollback()`, so the failure
  path is logic you control rather than compiler-inserted panic code.
- **Avoid `core::fmt` entirely.** Any use of formatting machinery (including
  transitively, through a derived `Debug` impl or a `panic!` with a format
  string) pulls in a surprising amount of code for a size-constrained
  binary.

### AssemblyScript

The closest option to a "scripting" experience, since its syntax resembles
TypeScript, but it requires deliberately avoiding almost everything that
makes it comfortable to use.

- Compile with `--runtime stub` (or an equivalent minimal-runtime setting) —
  AssemblyScript's default runtime includes a garbage collector, which needs
  `memory.grow` and internal calls the validator rejects.
- Avoid managed objects, strings, and closures — these depend on the GC
  runtime and, for closures, on indirect dispatch.
- Declare Hook API imports with `@external` (or the equivalent import
  declaration for your AssemblyScript version), targeting module `env`.
- Exported functions must match the `i32` parameter / `i64` result signature
  the validator expects.
- Workable for simple, arithmetic-and-branching hooks with no dynamic data
  structures; fragile quickly beyond that, since so much of the language's
  ergonomic surface depends on the managed runtime you're disabling.

### Zig

A strong option, structurally similar to C in how directly it maps to WASM
and how little runtime machinery it assumes by default.

- Target freestanding `wasm32` — Zig's cross-compilation story makes this
  target straightforward to select explicitly.
- Use `export fn` for `hook`/`cbak` and `extern` declarations for Hook API
  imports.
- Zig has no mandatory runtime to fight in the way Rust's panic/unwind
  machinery or a managed language's GC does — closer in character to C than
  any other option here, which makes it viable for the same reasons C is.

### Go and TinyGo

Not practically viable for guard-type hooks today — this is a plain
assessment, not a missing recipe.

- **Standard Go's WASM output** requires a substantial runtime: a garbage
  collector, a goroutine scheduler, and its own set of host imports. None of
  this can be stripped away by application-level code changes, since it's
  load-bearing for the language's own execution model, not optional library
  code.
- **TinyGo** produces meaningfully smaller binaries and can target
  freestanding WASM, but it still emits its own runtime, garbage-collector
  calls, and — depending on which language features your code touches —
  indirect dispatch for interfaces. Getting a TinyGo build all the way down
  to zero `memory.grow`, zero `call_indirect`, and zero non-inlined internal
  calls is not a matter of tuning flags; it would mean avoiding most of what
  makes Go and TinyGo distinct from writing in a lower-level language in the
  first place.

If your project needs Go's syntax specifically, budget for this being
substantially harder than the other options above rather than expecting a
straightforward path.

### Other languages

The checklist in this page generalizes beyond the languages named above:
**anything that can emit a freestanding, fully-inlined, statically-bounded
`wasm32` module can work**, and the same per-row checks in
[The contract your module must satisfy](#the-contract-your-module-must-satisfy)
apply regardless of source syntax. Conversely, **interpreted or JIT-compiled
languages, and anything that fundamentally depends on a garbage collector,
cannot work** — there's no way to interpret bytecode or manage a growing heap
within a module that can never call `memory.grow` and can never call a
locally-defined function.

## Inspecting your module before install

Before ever submitting a `SetHook` transaction, disassemble the compiled
(and cleaned) binary with `wasm2wat` and check it by hand:

```sh
wasm2wat hook.wasm -o hook.wat
```

- **Every `import` is `(import "env" "<name>" ...)`.** No other module name
  should appear anywhere in the import section, and every name must be
  either a whitelisted Hook API function or `_g`.
- **The exports include `hook` with type `(param i32) (result i64)`**, and
  `cbak` with the identical type if present.
- **`grep -c call_indirect hook.wat` returns `0`.** Any occurrence is an
  automatic reject.
- **`grep -c memory.grow hook.wat` and the equivalent for `memory.copy`/
  `memory.fill` all return `0`.**
- **Every `call` instruction targets an imported function**, not a
  locally-defined one. In the `.wat` text, imported functions are numbered
  first; a `call` referencing a function index at or beyond your module's
  first locally-defined function is a `CALL_ILLEGAL` reject.
- **Every `loop` opens with the two-`i32.const`-then-`call $_g` pattern**,
  with a nonzero literal `maxiter`. Check this for every single loop in the
  output, not just the ones you wrote guards for by hand — codegen can
  introduce loops your source didn't explicitly contain (e.g. desugared
  iterator chains or compiler-generated copy loops).
- **Block/loop/if nesting stays within the enforced depth** — count the
  deepest nesting in the `.wat` output for any function.
- **File size is at or under 65,535 bytes** (`wc -c hook.wasm`).

If a `SetHook` transaction is rejected despite this checklist, the
transaction's log code identifies exactly which check failed — see the
[common install-rejection causes table in compiling](compiling.md#common-install-rejection-causes)
to decode it.

## Fee implications of your toolchain

Both structural ceilings this page has emphasized map directly onto cost.
Creating a hook charges 500 drops per byte of `sfCreateCode` — and non-C
toolchains are usually the worse offender here, since standard-library and
runtime-support code inflates binary size well beyond what equivalent C
produces. A hook that's twice as large to deploy costs twice as much, before
its logic runs even once. See [fees](fees.md#deployment-costs-sethook)
for the full creation-cost model.

Execution fees come from the guard-derived worst-case instruction count,
computed once at install time and charged flat on every subsequent firing.
Verbose codegen — more instructions per logical loop body — and generous
`maxiter` declarations both push this count up directly; a hook that declares
`maxiter` far above what it actually needs pays for the declared worst case
on every execution, not the typical case. See
[fees](fees.md#runtime-execution-costs) for how the stored `sfFee` is
derived and charged.

## Related documents

- [overview](overview.md)
- [compiling](compiling.md)
- [best-practices](best-practices.md)
- [fees](fees.md)
- [xfl](xfl.md)
- [api-reference/control/_g](api-reference/control/_g.md)
- [macros/guards](macros/guards.md)
