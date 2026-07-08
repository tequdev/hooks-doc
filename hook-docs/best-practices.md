# Hook Best Practices

Practical guidance for writing correct, installable, and maintainable Hook smart
contracts in C. This page splits guidance into two tiers:

- **[Mandatory rules](#mandatory-rules)** — things the network or toolchain
  *enforces*. Violating one gets your `SetHook` rejected outright, or makes the
  installed hook fail/rollback at runtime. These are not stylistic opinions;
  they are checked by code, and the check is cited so you can go read it.
- **[Recommendations](#recommendations)** — advice that makes hooks more
  correct, cheaper, and easier to maintain, but that nothing on-ledger checks
  for. You can ignore these and still get a working, installable hook; you'll
  just be more likely to ship a bug.

Each point states the rule, why it matters, and — where useful — a short
snippet. Cross-links point to the [api-reference/](api-reference/) pages and
worked [examples/](examples/) that demonstrate each idea.

## Mandatory rules

| Rule | Enforced by | Failure mode |
|---|---|---|
| [`_g` guard first in every loop](#guard-discipline-_g-first-in-every-loop) | `include/xrpl/hook/Guard.h` (`SetHook` validator) | Install rejected (`GUARD_MISSING`) if the loop doesn't open with `_g`; `GUARD_VIOLATION (-16)` at runtime if an unguarded/over-iterating path executes anyway |
| [No user-defined function calls / no `call_indirect`](#no-user-defined-functions--inline-everything) | `include/xrpl/hook/Guard.h` (`CALL_ILLEGAL`, `CALL_INDIRECT`) | `SetHook` rejected (`temMALFORMED`) |
| [`memory.grow`, `memory.copy`, `memory.fill` are disallowed](#no-memorygrow-memorycopy-memoryfill) | `include/xrpl/hook/Guard.h` (`MEMORY_GROW`, and `memory.copy`/`memory.fill` under `fix20250131`) | `SetHook` rejected (`temMALFORMED`) |
| [Block/loop nesting depth ≤ 16 (32 post-`fixGuardDepth32`)](#bound-nesting-depth) | `include/xrpl/hook/Guard.h` (`NESTING_LIMIT`) | `SetHook` rejected (`temMALFORMED`) |
| [Guard-checked worst-case instruction count < 65,535](#keep-hooks-small-and-under-the-instruction-cap) | `include/xrpl/hook/Guard.h` (`INSTRUCTION_EXCESS`) | `SetHook` rejected (`temMALFORMED`) |
| [Compiled WASM ≤ 65,535 bytes](#keep-hooks-small-and-under-the-instruction-cap) | `src/xrpld/app/tx/detail/SetHook.cpp` (`hook::maxHookWasmSize`, `WASM_TOO_BIG`) | `SetHook` rejected (`temMALFORMED`) |
| [Hook chain ≤ 10 hooks per account](#other-install-time-limits) | `src/xrpld/app/tx/detail/SetHook.cpp` (`hook::maxHookChainLength`) | `SetHook` rejected (`temMALFORMED`) |
| [HookParameter key ≤ 32 bytes, value ≤ 256 bytes](#other-install-time-limits) | `src/xrpld/app/tx/detail/SetHook.cpp` (`hook::maxHookParameterKeySize/ValueSize`) | `SetHook` rejected (`temMALFORMED`) |
| [`etxn_reserve` before any `emit`, and never emit more than reserved](#emission-caveats-reserve-first-fee-via-etxn_fee_base) | `src/xrpld/app/hook/detail/HookAPI.cpp` (`etxn_reserve`, `emit`) | `emit` returns `PREREQUISITE_NOT_MET (-9)` if you never reserved, `TOO_MANY_EMITTED_TXN (-13)` if you exceed the reserved count |
| [State writes respect reserve, size, and modification-count limits](#mind-the-reserve-and-state-limits) | `src/xrpld/app/hook/detail/HookAPI.cpp` (`set_state_cache`), `src/xrpld/app/hook/detail/applyHook.cpp` (`state_set`) | `RESERVE_INSUFFICIENT (-38)`, `TOO_BIG (-3)`, `TOO_MANY_STATE_MODIFICATIONS (-44)`, or `TOO_MANY_NAMESPACES (-45)` |
| [Foreign-account state writes need a grant](#foreign-state-reads-are-open-writes-need-a-grant) | `src/xrpld/app/hook/detail/HookAPI.cpp` (`state_foreign_set`) | `NOT_AUTHORIZED (-34)`, and a subsequent retry in the same hook execution returns `PREVIOUS_FAILURE_PREVENTS_RETRY (-35)` |

### Guard discipline: `_g` first, in every loop

Every loop must call the guard function `_g` (via the `GUARD` /`GUARDM` macros)
at the top of the loop body, before any other work. The `SetHook` validator
(`include/xrpl/hook/Guard.h`) statically parses each loop's opening
instructions and requires exactly two `i32.const` pushes followed by a `call`
to the imported `_g` function; if that pattern is missing it rejects the hook
at install time (see the "Missing first/second i32.const" and "Missing call to
`_g`" checks around `Guard.h`'s loop-parsing logic). At runtime, a loop that
iterates past the declared `maxiter` trips `GUARD_VIOLATION (-16)`.

```c
for (int i = 0; GUARD(32), i < n && i < 32; ++i) { /* ... */ }
```

- `GUARD(maxiter)` expands to `_g((1ULL << 31) + __LINE__, maxiter + 1)` — the
  guard id is derived from the source line, so each loop gets a distinct id.
- Use `GUARDM(maxiter, n)` when two or more guarded loops share one source line.
- A guard's `maxiter` must be non-zero (`Guard.h`: "Guard call cannot specify 0
  maxiter"), and the loop index must be bounded by a compile-time-visible
  constant so the checker can compute the worst-case count.
- There is a hard cap of 1024 total `_g` calls per hook (`MAX_GUARD_CALLS`).

The very first statement of `hook` (and `cbak`) should be `_g(1,1)`: the body
runs at most once, but the guard is still required by convention for symmetry
with looped code — see [control.md](api-reference/control/README.md).

See [control.md](api-reference/control/README.md) for `_g` and [macros.md](macros/guards.md)
for the guard macros.

### No user-defined functions — inline everything

The guard checker **disallows calling any function that is not a whitelisted API
import** (`CALL_ILLEGAL`, `Guard.h`: "Hook calls a function outside of the
whitelisted imports") and also forbids `call_indirect` (`CALL_INDIRECT`,
`Guard.h`: "Call indirect detected and is disallowed in hooks"). In practice
this means a hook cannot call its own helper functions or use function
pointers: all logic must be inlined into `hook`/`cbak`. Either violation makes
`validateGuards` return no result, which `SetHook.cpp` turns into a
`temMALFORMED` rejection of the transaction.

Why: the static guard analysis needs to bound execution, which it cannot do
across arbitrary call graphs or indirect calls. This is why the Xahau SDK is
built from macros rather than functions — `SBUF`, `PREPARE_PAYMENT_SIMPLE`,
`BUFFER_EQUAL_GUARD`, and the rest expand inline.

How to comply: write reusable logic as macros, or mark helpers
`inline __attribute__((always_inline))` so the compiler eliminates the call.
Verify with `mise run build-test-hook` (or the project's hook build) that the
resulting WASM installs — a stray real call will be rejected at `SetHook`.

### No `memory.grow`, `memory.copy`, `memory.fill`

The guard checker unconditionally rejects `memory.grow` (`MEMORY_GROW`), and
(since the `fix20250131` guard-rules revision) also rejects the bulk-memory
`memory.copy` and `memory.fill` instructions. A hook's linear memory is fixed
at compile time — don't rely on growing it, and don't rely on the compiler
lowering `memcpy`/`memset` to these opcodes for large or non-constant-sized
operations (small, constant-sized copies are typically lowered to plain
load/store instructions and are unaffected).

Why: unbounded memory growth and bulk-memory operations undermine the same
static-bound guarantees that guarded loops exist to provide, so the validator
closes them off entirely rather than trying to bound them.

### Bound nesting depth

The guard checker enforces a maximum block/loop nesting depth — 16 levels by
default, 32 under the `fixGuardDepth32` guard-rules revision
(`Guard.h`: `NESTING_LIMIT`, "Maximum allowable depth of blocks reached...
Flatten your loops and conditions!"). Exceeding it rejects the hook at
install time.

Why: the worst-case-execution calculation walks the block tree recursively:
without a depth cap, deeply nested control flow could make that computation
itself unbounded.

### Keep hooks small and under the instruction cap

Two independent, enforced limits apply:

- **WASM binary size ≤ 65,535 bytes (`0xFFFF`).** `src/xrpld/app/tx/detail/SetHook.cpp`
  checks the compiled blob against `hook::maxHookWasmSize()` and rejects
  (`temMALFORMED`, logged as `WASM_TOO_BIG`) anything larger — both for
  `hsoCREATE` and for a hook update that replaces the code.
- **Guard-computed worst-case instruction count < 65,535.** The guard checker
  walks every block, multiplies loop bodies by their declared `maxiter`, and
  sums the result; if that worst-case count reaches `0xFFFF` it logs
  `INSTRUCTION_EXCESS` ("Maximum possible instructions exceed 65535...") and
  rejects the install. This is why a hook with modest source size can still
  fail to install if its guarded loops have large `maxiter` values.

Because installability is a hard ceiling, not just a cost consideration,
prefer smaller hooks that return as soon as they know the answer:

```c
if (otxn_type() != ttPAYMENT)
    accept(SBUF("not a payment"), 0);   // skip the rest for non-Payments
```

Gate on the cheap checks (`otxn_type`, a parameter presence test) before doing
expensive slot or state work — this keeps you under both limits and reduces
the per-instruction execution fee charged for the hook's actual instruction
count (`hook::computeExecutionFee`).

### Other install-time limits

`SetHook.cpp` enforces a few more structural limits at install time, all
resulting in `temMALFORMED`:

- **Hook chain length ≤ 10** (`hook::maxHookChainLength()`) — an account
  cannot install an 11th hook.
- **HookParameter key ≤ 32 bytes, value ≤ 256 bytes**
  (`hook::maxHookParameterKeySize()` / `maxHookParameterValueSize()`).
- **`hsoNSDELETE` requires exactly the `hsfNSDELETE` flag; overriding or
  deleting an existing hook requires `hsfOVERRIDE`** — sending the wrong flag
  combination for the operation is rejected before the WASM is even inspected.

### Emission caveats: reserve first, fee via `etxn_fee_base`

To emit a transaction: (1) `etxn_reserve(n)` up front for the exact count,
(2) build the template and embed `EmitDetails` with `etxn_details`, (3) compute
the fee with `etxn_fee_base` **after** the details are in place, (4) `emit`.

- **Enforced:** `emit()` checks `hookCtx.expected_etxn_count` and returns
  `PREREQUISITE_NOT_MET (-9)` if `etxn_reserve` was never called, or
  `TOO_MANY_EMITTED_TXN (-13)` if you emit more than you reserved
  (`src/xrpld/app/hook/detail/HookAPI.cpp`, `HookAPI::emit` /
  `HookAPI::etxn_reserve`). `etxn_reserve` itself can only be called once per
  hook execution (`ALREADY_SET (-8)` on a second call) and is capped at
  `hook_api::max_emit` (255) reservations.
- The fee must be derived, not hardcoded — it depends on the exact template size,
  which includes the `EmitDetails` block. `PREPARE_PAYMENT_SIMPLE` orders these
  steps correctly.
- Emitted transactions apply *after* the current one; observe their outcome in
  `cbak`, not inline. Emit chains increase generation and burden
  (`etxn_generation` / `etxn_burden`).
- `emit` returns `32` (writing the txn hash) on success; `EMISSION_FAILURE (-11)`
  means the ledger rejected the transaction body itself (e.g. malformed STTx,
  disallowed pseudo-transaction, or a type not permitted by `hookCanEmit`).

See [emit-and-etxn.md](api-reference/emit/README.md) and the
[emitted-transaction example](examples/emitted-transaction.md).

### Mind the reserve and state limits

State writes are bounded by several runtime-enforced limits, all checked in
`src/xrpld/app/hook/detail/HookAPI.cpp` (`set_state_cache`) and
`src/xrpld/app/hook/detail/applyHook.cpp` (`state_set`):

- Each new state entry consumes owner reserve on the hook account; a write
  that would exceed the account's available reserve returns
  `RESERVE_INSUFFICIENT (-38)`.
- State values are up to 256 bytes by default (up to `256 × hookStateScale`,
  max 4096 at `hookStateScale = 16`); a larger write returns `TOO_BIG (-3)`
  (`hook::maxHookStateDataSize`).
- There is a per-hook-execution cap of 256 state modifications
  (`hook::max_state_modifications`); exceeding it returns
  `TOO_MANY_STATE_MODIFICATIONS (-44)`.
- An account may have at most 256 namespaces (`hook::maxNamespaces()`);
  creating one more returns `TOO_MANY_NAMESPACES (-45)`.

Why: state that "sometimes fails to save" is usually one of these enforced
limits, not a logic bug — check the `state_set` return rather than assuming it
stored.

To delete an entry (and reclaim its reserve), write a zero-length value:
`state_set(0, 0, SBUF(key))`.

### Foreign state: reads are open, writes need a grant

`state_foreign` reads any account's namespace without permission. `state_foreign_set`
to another account only succeeds if that account published a matching grant
(`sfHookGrants` naming your hook's `sfHookHash`, and optionally an `sfAuthorize`
account); otherwise `HookAPI::state_foreign_set`
(`src/xrpld/app/hook/detail/HookAPI.cpp`) returns `NOT_AUTHORIZED (-34)`.
Writing to the hook's own account never needs a grant. Once a foreign write has
failed for lack of a grant, the failure latches for the rest of the hook's
execution: a retry returns `PREVIOUS_FAILURE_PREVENTS_RETRY (-35)` without
re-checking grants.

See [state.md](api-reference/state/README.md) and the
[foreign-state example](examples/foreign-state.md).

## Recommendations

The rest of this guidance improves correctness, cost, and maintainability, but
nothing in the toolchain or runtime enforces it — a hook that ignores it can
still install and run.

### Check every API return value

Every Hook API function returns `int64_t`, and a **negative value is an error
code** (see the full table in [overview.md](overview.md)). Non-negative returns
carry a result: bytes written, a slot number, an XFL value, or `32` for an
emitted-transaction hash. Never use a returned value without checking its sign
first — a length you assume is positive may be `DOESNT_EXIST (-5)` or
`OUT_OF_BOUNDS (-1)`.

```c
int64_t len = otxn_field(SBUF(buf), sfAmount);
if (len < 0)
    rollback(SBUF("read failed"), 1);   // handle before using buf
```

Why: state reads that miss, fields that are absent, and buffers that are too
small all return quietly as negative numbers. Treating them as data corrupts
later logic. The test hooks in `SetHook_test.cpp` assert on exact return values
for exactly this reason.

### Manage buffer sizes explicitly

Serialized values have exact sizes; size buffers to them and check the returned
length against what you expect.

| Value | Size | Notes |
|---|---|---|
| AccountID (raw) | 20 bytes | `otxn_field(sfAccount/sfDestination)` returns `20`. |
| Hash / state key / namespace | 32 bytes | State keys are up to 32 bytes; namespaces are exactly 32. |
| Native (XAH) amount | 8 bytes | `otxn_field(sfAmount)` returns `8`; convert with `AMOUNT_TO_DROPS`. |
| IOU amount | 48 bytes | `otxn_field(sfAmount)` returns `48` (value only, no field code). |
| Emitted-txn hash | 32 bytes | `emit` returns `32` on success. |

Why: a buffer sized at 8 for `sfAmount` truncates an IOU (or returns
`TOO_SMALL (-4)`); the 8-vs-48 length is itself a reliable native/IOU
discriminator. The [payment-filter example](examples/payment-filter.md) relies on
exactly this.

```c
uint8_t amt[48];                     // fits XAH (8) or IOU (48)
int64_t n = otxn_field(SBUF(amt), sfAmount);
if (n == 8)   { /* native */ }
else if (n == 48) { /* IOU */ }
```

### Avoid state-key collisions

State lives under `(account, namespace, key)`. Within one namespace, keep logical
maps apart with a **key prefix** or use **separate namespaces**.

```c
uint8_t key[21];
key[0] = 0x01;                        // map discriminator
otxn_field(key + 1, 20, sfAccount);   // per-account key: 0x01 + AccountID
```

Why: two features that both key state by AccountID will overwrite each other if
they share the exact same key. A one-byte prefix (keys are up to 32 bytes, an
AccountID is 20) or a distinct namespace keeps them separate. See
[state.md](api-reference/state/README.md) and the
[state-counter example](examples/state-counter.md).

### Use meaningful `accept` / `rollback` messages and codes

The message and error code you pass to `accept` / `rollback` are recorded in the
transaction metadata: each hook execution produces an `sfHookExecution` object
carrying `sfHookResult` (accept vs rollback), `sfHookReturnCode` (your code), and
`sfHookReturnString` (your message). Use distinct codes per failure site.

```c
if (BUFFER_EQUAL_20(dest, BLOCKED))
    rollback(SBUF("destination blocked"), 2);   // code 2 is unique to this path
```

Why: when a transaction is rejected on-ledger, these fields are the only record
of *why*. Reusing one code (or an empty message) everywhere makes production
failures undiagnosable. The `DONE`, `DONEMSG`, `NOPE`, and `ASSERT` macros in
[macros.md](macros/control-flow.md) build well-formed terminations (they use `__LINE__` as the
code, which is naturally unique per site).

### Handle Amounts and serialized objects correctly

- Do not byte-compare amounts. Read them as XFL — `otxn_slot` → `slot_subfield(sfAmount)`
  → `slot_float`, or `float_sto_set` on a serialized amount — and compare with
  `float_compare` (which returns `1`/`0`, or a negative error, not a subtraction
  sign).
- `AMOUNT_TO_DROPS` only works on an 8-byte native amount buffer; it returns `-2`
  when the amount is not native. Treat any negative as "not XAH".
- Locate STObject subfields with `sto_subfield` / `sto_subarray`, which return a
  packed offset+length: unpack with `SUB_OFFSET(x)` and `SUB_LENGTH(x)`.

See [float-and-amount.md](api-reference/float/README.md),
[utility.md](api-reference/sto/README.md), and [macros.md](macros/amount-and-sto.md).

### Don't ship heavy trace calls in production

`trace`, `trace_num`, and `trace_float` write to the server's **trace**-level log
(tagged `HookTrace[<account>]:`); they produce no on-ledger output and are no-ops
when trace logging is disabled. The `TRACEVAR` / `TRACEHEX` / `TRACEXFL` /
`TRACESTR` macros are additionally gated on the `DEBUG` flag and compile out under
`NDEBUG`.

Why: even a no-op trace call is still code — it adds to the WASM size and the
instruction budget. Use the `DEBUG`-gated macros so release builds drop them, and
avoid leaving verbose tracing in a hook you intend to install on mainnet. See the
debugging section of the [memo-routing example](examples/memo-routing.md).

### Distinguish "not found" from "error"

Several APIs signal absence with a specific code you should branch on separately
from real failures: `state`/`state_foreign` return `DOESNT_EXIST (-5)` for a
missing key, `otxn_param` returns `DOESNT_EXIST (-5)` for an absent parameter,
`slot_subfield(sfMemos)` returns `DOESNT_EXIST (-5)` when there are no memos, and
`slot_count` returns `NOT_AN_ARRAY (-22)` on a non-array.

Why: "the value isn't set yet" is usually normal control flow (use a default,
start a counter at zero), whereas `OUT_OF_BOUNDS` or `TOO_BIG` is a bug. Collapsing
them into one `< 0` branch hides real errors and mishandles first-run cases — see
the [state-counter](examples/state-counter.md) and
[foreign-state](examples/foreign-state.md) examples.

### Structure hooks for testability

Mirror the pattern in `src/test/app/SetHook_test.cpp`: a hook is embedded as C
source, compiled, installed with `SetHook`, then exercised by sending a
transaction and asserting on the result and the emitted metadata.

- Keep decision points as explicit `rollback(msg, code)` calls with unique codes,
  so a test can assert on the exact rejection reason.
- Prefer `otxn_param` / HookParameters for inputs a test can vary, over
  hard-coded constants.
- Build with `mise run build-test-hook` and run the suite with `mise test` to
  confirm the hook both installs (passes guard/validation) and behaves.

Why: a hook that only "looks right" but fails `SetHook` validation, or whose
rejection reasons are indistinguishable, is hard to trust. The test harness is
the fastest way to prove both the static (installable) and dynamic (correct)
properties.

## Related documents

- [README.md](README.md)
- [overview.md](overview.md)
- [glossary.md](glossary.md)
- [macros.md](macros/README.md)
- [api-reference/control.md](api-reference/control/README.md)
- [api-reference/transaction.md](api-reference/transaction/README.md)
- [api-reference/state.md](api-reference/state/README.md)
- [api-reference/ledger-and-slot.md](api-reference/slot/README.md)
- [api-reference/ledger-and-slot.md](api-reference/ledger/README.md)
- [api-reference/emit-and-etxn.md](api-reference/emit/README.md)
- [api-reference/float-and-amount.md](api-reference/float/README.md)
- [api-reference/utility.md](api-reference/utility/README.md)
- [examples/payment-filter.md](examples/payment-filter.md)
- [examples/state-counter.md](examples/state-counter.md)
- [examples/emitted-transaction.md](examples/emitted-transaction.md)
- [examples/foreign-state.md](examples/foreign-state.md)
- [examples/memo-routing.md](examples/memo-routing.md)
