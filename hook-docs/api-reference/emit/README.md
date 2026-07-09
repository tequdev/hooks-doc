---
sidebarTitle: "Emit APIs"
---

# Emit and Emitted-Transaction APIs

This page documents the eight **emit-and-etxn** Hook APIs: the functions a hook uses to
construct, price, and emit a new transaction of its own, plus the counters that make emitted
transactions deterministic and loop-safe.

All signatures are copied verbatim from `hook/extern.h`. Return codes reference the shared
error table in [../../glossary.md](../../glossary.md); the values quoted below come from
`include/xrpl/hook/Enum.h` and `hook/error.h`, and every behaviour is taken from the
implementations in `src/xrpld/app/hook/detail/applyHook.cpp` and
`src/xrpld/app/hook/detail/HookAPI.cpp`.

> **There is no `invoke` Hook API.** `ttINVOKE` (`99`, `hook/tts.h`) is a *transaction type*
> that triggers hooks, not an API function. Do not look for an `invoke()` call — hooks emit
> transactions with [`emit`](emit.md).

---

## The emission lifecycle

A hook does not "send" a transaction directly; it hands the ledger a fully-formed,
already-serialized transaction blob, and the ledger queues it for application in a later
ledger. The steps below are enforced in this order — every emit-related call first checks
that a reservation exists (`hookCtx.expected_etxn_count`, which starts at `-1`), so
`etxn_reserve` must come first.

1. **Reserve.** Call [`etxn_reserve(n)`](etxn_reserve.md) once, declaring the number of
   transactions this hook execution intends to emit. Until this is done, every other function
   on this page returns `PREREQUISITE_NOT_MET` (-9). `n` must be `1..255`.

2. **Build the raw transaction.** Assemble the transaction as a serialized `STObject` in a
   memory buffer. The recommended way is to generate the template — and the `PREPARE_TXN()`
   macro that fills the fixed fields — with the [Transaction Builder](../../tools/tx-builder.md).
   Alternatively, build it by hand with the `ENCODE_*` macro idiom shown in the test hooks, or
   (under `HooksUpdate2`) hand a partial template to [`prepare`](prepare.md), which fills in the
   fixed fields for you.

3. **Insert `sfEmitDetails`.** Call [`etxn_details(buf, len)`](etxn_details.md) to write the
   `sfEmitDetails` object into the transaction. This object is what marks the transaction as
   hook-emitted and ties it to the originating transaction, the emitting hook, and a unique
   nonce.

4. **Compute the fee.** Call [`etxn_fee_base(buf, len)`](etxn_fee_base.md) over the serialized
   transaction to get the minimum drops it must pay, and write that value into its `sfFee`
   field. An emitted transaction that under-pays is rejected by `emit`.

5. **Emit.** Call [`emit(hash_out, 32, buf, len)`](emit.md). It re-parses the transaction,
   checks it against every emission rule, queues it on success, and writes the 32-byte
   transaction hash into `hash_out`. It returns `32`.

The `cbak` entry point (below) lets the emitting hook observe the emitted transaction's
eventual outcome.

### Burden, generation, and the anti-emission-loop mechanism

Two counters ride along in `sfEmitDetails` and exist specifically to stop hooks from emitting
transactions forever (verified in `HookAPI::emit`, `etxn_burden`, `etxn_generation`):

- **Generation** — [`etxn_generation()`](etxn_generation.md) returns `otxn_generation() + 1`.
  A user-submitted transaction has generation `0`; a transaction it emits carries generation
  `1`; a transaction *that* transaction's hook emits carries generation `2`, and so on.
  `emit` rejects any transaction whose generation is `10` or more
  (`sfEmitGeneration >= 10` → `EMISSION_FAILURE`). This is a hard ceiling on emission depth.

- **Burden** — [`etxn_burden()`](etxn_burden.md) returns `otxn_burden() * expected_etxn_count`.
  Because each hop multiplies the burden by the number of children reserved, a fan-out of
  emissions makes the burden grow geometrically. Burden overflow is reported as
  `FEE_TOO_LARGE` (-10). Burden is carried so downstream fee/anti-abuse accounting can price
  deeper emission chains more expensively.

`emit` verifies that the generation and burden a hook wrote into `sfEmitDetails` match the
values `etxn_generation()`/`etxn_burden()` compute, so you cannot forge a lower value.
Using [`etxn_details`](etxn_details.md) to build the object guarantees the correct values.

### The `cbak` callback entry point

If a hook's WASM exports a `cbak` function, the hook is said to *have a callback*
(`hasCallback`), and [`etxn_details`](etxn_details.md) adds an `sfEmitCallback` field (the hook
account) to every `sfEmitDetails` it writes — which is why the details object is 22 bytes
larger when a callback is present. When an emitted transaction later reaches its outcome, the
ledger runs the emitting hook's `cbak` instead of `hook`:

```c
int64_t cbak(uint32_t r)
{
    // r & 1 == 1  -> the emitted transaction failed
    // r & 1 == 0  -> the emitted transaction was applied
    // The "originating transaction" during cbak is the emitted transaction itself,
    // so otxn_* reads describe the emitted txn.
    return accept(0, 0, 0);
}
```

The only fact the code guarantees about the argument is bit 0: `emitFailure = isCallback &&
(wasmParam & 1)` in `applyHook.cpp`. A callback may itself emit further transactions, but it
must call [`etxn_reserve`](etxn_reserve.md) again first — a fresh execution starts with no
reservation (see the `cbak` in `SetHook_test.cpp`, "Test emit").

---

## Index

| Function | Purpose |
|---|---|
| [`etxn_reserve`](etxn_reserve.md) | Declare how many transactions this hook will emit. Must precede all other emit calls. |
| [`etxn_nonce`](etxn_nonce.md) | Write a unique nonce for an emitted transaction. |
| [`etxn_details`](etxn_details.md) | Write the `sfEmitDetails` object required in every emitted transaction. |
| [`etxn_fee_base`](etxn_fee_base.md) | Compute the minimum fee an emitted transaction must pay. |
| [`etxn_generation`](etxn_generation.md) | Generation counter that an emitted transaction will carry. |
| [`etxn_burden`](etxn_burden.md) | Burden value that an emitted transaction will carry. |
| [`emit`](emit.md) | Validate and queue a fully-formed transaction; write its hash. |
| [`prepare`](prepare.md) | Fill in the common emit fields on a template transaction (requires `HooksUpdate2`). |

## Related documents

- [../../README.md](../../README.md) — documentation index.
- [../../overview.md](../../overview.md) — hook execution model, strong/weak/callback executions.
- [../../glossary.md](../../glossary.md) — full error-code and term reference.
- [../../macros.md](../../macros/README.md) — the `ENCODE_*`, `SBUF`, and `ASSERT` helpers used to
  build emitted transactions.
- [../../tools/tx-builder.md](../../tools/tx-builder.md) — generate emitted-transaction templates
  and the `PREPARE_TXN()` macro.
- [../../best-practices.md](../../best-practices.md) — structuring emissions and callbacks.
- [../../examples/emitted-transaction.md](../../examples/emitted-transaction.md) — a full
  emit-a-payment example.
- [control.md](../control/README.md) — `accept`/`rollback` and how they keep or discard emissions.
- [transaction.md](../transaction/README.md) — `otxn_generation`, `otxn_burden`, and the other
  originating-transaction accessors.
- [ledger-and-slot.md](../ledger/README.md) — `fee_base`, `ledger_seq`, `ledger_nonce`.
- [float-and-amount.md](../float/README.md) — building the `sfAmount` values you emit.
