---
sidebarTitle: "hooks-compiler"
---

# hooks-compiler

[hooks-compiler](https://github.com/tequdev/hooks-compiler) compiles a C hook
to an install-ready WASM module with a single command, and produces the same
bytes every time for the same source. Clang, the linker, `wasm-opt`, and
`hook-cleaner` all run as WebAssembly inside Node, so there is nothing to
install beyond Node itself: no `wasienv`, no system clang, no `hook-cleaner`
build. The same package also runs in a browser Web Worker, which is how it is
used by web IDEs; this page covers the local command-line use.
<!-- https://github.com/tequdev/hooks-compiler README (main, 2026-10-18): "Deterministic Xahau C Hook compiler. Clang, lld, wasm-opt and hook-cleaner all run as WebAssembly, in the browser (Web Worker) or in Node." Published on npm as hooks-compiler, latest 0.2.0 (2026-10-17) -->

## Requirements

- Node 20.12 or newer. The toolchain (about 28 MB) ships inside the package's
  dependencies, so the first `npx` run downloads it once.
- The Hook API headers. The compiler does not bundle `hookapi.h`; point it at
  a directory that holds the headers your hook includes. The canonical set is
  xahaud's [`hook/genesis/headers`](https://github.com/Xahau/xahaud/tree/dev/hook/genesis/headers)
  directory (`hookapi.h`, `macro.h`, `sfcodes.h`, `extern.h`, `error.h`,
  `types.h`), which is what the compiler's own determinism tests compile
  against.
  <!-- README "Install": Node >= 20.12, assets ship in the dependency; README test/fixtures: include/ is "every .h from Xahau/xahaud hook/genesis/headers". Four of the five example hooks on this site (examples/*.md; emitted-transaction.md's snippet depends on macros defined in another block) compile with those headers; the hookapi.h in the package's examples/include is an older, smaller header that lacks e.g. COMPARE_GREATER -->

## Build a hook

```sh
npx hooks-compiler build hook.c -I include -o hook.wasm -Oz
```

- `hook.c` is the entry file. More `.c`/`.h` files may follow it; `-I <dir>`
  (repeatable) adds every file under `dir`, keyed by its path relative to
  `dir`, so `-I include` makes `include/hookapi.h` reachable as
  `#include "hookapi.h"`.
- `-O0` to `-O3`, `-Os`, `-Oz` select the clang optimization level. The
  default is `-O2`; `-Oz` gives the smallest module, which matters because
  creation fees are charged per byte (see [Hook Fees](../fees.md)).
- `-o` names the output (default `<entry>.wasm`). `--wat` also writes
  `<out>.wat`, the final module as WebAssembly Text, for the inspection steps
  in [Developing Hooks in Languages Other Than C: Inspecting your module before install](../other-languages.md#inspecting-your-module-before-install).
- `--json` prints a machine-readable summary to stdout instead of the one-line
  report: `output`, `sha256`, `rawSize`, `optimizedSize`, `finalSize`,
  `imports`, `exports` (and `wat` with `--wat`).

<!-- README "CLI" section; the flags and the --json keys were exercised locally with hooks-compiler 0.2.0 -->

A successful build of the payment-filter example from this site reports:

```json
{
  "output": "pf.wasm",
  "rawSize": 1187,
  "optimizedSize": 899,
  "finalSize": 772,
  "sha256": "dd07912276c519dcdd18e6fb7fdd06b99fa9c856ac1ef1979b7799dc06ae33c4",
  "imports": ["env._g", "env.otxn_type", "env.accept", "env.otxn_field", "env.rollback", "env.otxn_slot", "env.slot_subfield", "env.slot_float", "env.float_set", "env.float_compare"],
  "exports": ["hook"]
}
```

`imports` and `exports` are worth a glance on every build: every import must
be `env.<hook api name>` and the exports must be `hook` and, if present,
`cbak`, exactly as [Compiling Hooks](../compiling.md) requires. `finalSize` is
the byte count that `SetHook` sizes against the 65,535-byte ceiling and that
the creation fee is charged on.

`check` runs clang in syntax-only mode and prints its diagnostics without
producing a module; it exits non-zero if any line contains `error:`:

```sh
npx hooks-compiler check hook.c -I include
```

## What the pipeline does

```
hook.c  →  clang -c  →  wasm-ld  →  wasm-opt -Oz (MVP only)  →  hook-cleaner  →  hook.wasm
```

Clang 22 compiles for `wasm32` with `-mcpu=mvp -nostdlib -nostartfiles`;
`wasm-ld` links with `--export=hook --export-if-defined=cbak` and
`--allow-undefined`, which is what turns your Hook API calls into `env`
imports; binaryen's `wasm-opt` shrinks the module while restricted to the
WebAssembly MVP feature set, so no post-MVP opcode such as `memory.copy` can
be introduced; and `hook-cleaner` strips the custom sections and extra exports
that would otherwise fail install. The output is already the "clean" module
described under [Compiling Hooks: The underlying tools](../compiling.md#the-underlying-tools);
there is no separate cleaning step to run.
<!-- README "Exact arguments": clang -target wasm32 -mcpu=mvp -O2 -nostdlib -nostartfiles -Werror=implicit-function-declaration -Wno-error=int-conversion -w -I/src -c; wasm-ld --no-entry --allow-undefined --export=hook --export-if-defined=cbak; wasm-opt setFeatures(Features.MVP), -Oz; "wasm-opt runs before hook-cleaner because the cleaner strips the memory export". Toolchain is clang 22 via @live-codes/clang-wasm -->

Two compiler behaviors to know about:

- Calling a function that has no prototype is an error, not a warning
  (`-Werror=implicit-function-declaration`). A typo in a Hook API name, or a
  missing header, fails the build instead of producing an import the
  validator would reject later. Other warnings are suppressed.
  <!-- README "Exact arguments": -Werror=implicit-function-declaration still applies under -w -->
- A hook that never calls `_g` fails at the `hook-cleaner` step with
  `Guard function _g was not imported / missing.` That is the same
  requirement the on-ledger validator enforces as `GUARD_IMPORT`, caught
  before you reach a node.
  <!-- Observed with hooks-compiler 0.2.0 on a hook with no _g call: "hook-cleaner failed" followed by that message; the check is in tequdev/hook-cleaner cleaner.c -->

## Deterministic output

Compiling the same source files with the same options produces byte-identical
output, so the `sha256` the compiler reports identifies the build. The
project pins the exact versions of clang, binaryen, and `hook-cleaner` it
runs, and its own test suite builds a set of real hooks on several platforms
and compares the hashes against committed values.
<!-- README "Determinism": "The same sources produce byte-identical output"; test/fixtures README: Determinism workflow runs on x64 Linux, arm64 Linux, arm64 macOS and x64 Windows. Verified locally: two -Oz builds of the same hello.c on one machine gave identical SHA-256 6cbf1eeb... -->

This is what makes a hook's source auditable: anyone with the source, the
header set, the compiler version, and the optimization level can rebuild the
module and compare it with the one on the ledger. Note that the ledger's
`HookHash` is the SHA-512Half of the module bytes, not the SHA-256 the
compiler prints, so compare the bytes themselves or compute the ledger hash
from the output:

```sh
openssl dgst -sha512 hook.wasm | awk '{ print toupper(substr($2, 1, 64)) }'
```

<!-- src/xrpld/app/tx/detail/SetHook.cpp:1832-1833 (2026.10.13-release+4119) — createHookHash = sha512Half_s(Slice(wasmBytes)); sha512Half is the first 256 bits of SHA-512 -->

Record the three inputs together with the hash when you publish a hook:
source, header set, and the `hooks-compiler` version with its `-O` flag.

## Next steps

1. Run the module through [`hook_validate`](../validating.md) on a node whose
   amendments match your target network. The compiler checks C and module
   shape; the node's guard checker is what decides whether `SetHook` will
   accept the module and how much of the instruction budget it uses.
2. Hex-encode `hook.wasm` into [CreateCode](../sethook-fields/createcode.md)
   and install it with `SetHook`.

## Related documents

- [Compiling Hooks](../compiling.md)
- [Validating Hooks](../validating.md)
- [Developing Hooks in Languages Other Than C](../other-languages.md)
- [Hook Fees](../fees.md)
- [CreateCode](../sethook-fields/createcode.md)
