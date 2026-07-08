# Example: Emitting a Transaction

A hook can originate new transactions ("emitted" transactions) that the ledger
applies as a consequence of the triggering transaction. This example emits a
Payment when a condition is met, and handles the result in the callback `cbak`.

## Purpose

- Reserve emission capacity, build a Payment, compute its fee, and emit it.
- Receive the emitted transaction's outcome in `cbak` and react to it.

## APIs used

| API | Purpose | Reference |
|---|---|---|
| `etxn_reserve` | Declare, up front, how many transactions the hook will emit. | [emit-and-etxn.md](../api-reference/emit/etxn_reserve.md) |
| `etxn_details` | Write the `EmitDetails` object into the transaction template. | [emit-and-etxn.md](../api-reference/emit/etxn_details.md) |
| `etxn_fee_base` | Compute the required fee for the prepared transaction. | [emit-and-etxn.md](../api-reference/emit/etxn_fee_base.md) |
| `emit` | Submit the built transaction; writes its 32-byte hash. | [emit-and-etxn.md](../api-reference/emit/emit.md) |
| `etxn_generation` / `etxn_burden` | Emit-chain generation / burden bookkeeping. | [emit-and-etxn.md](../api-reference/emit/README.md) |
| `hook_account` | Source account for the emitted Payment. | [control.md](../api-reference/control/hook_account.md) |
| `otxn_field` / `otxn_param` | Read the trigger (e.g. destination) from the incoming txn. | [transaction.md](../api-reference/transaction/README.md) |
| `accept` / `rollback` | Terminate the hook. | [control.md](../api-reference/control/README.md) |

Helper macros used: `SBUF`, `ASSERT`. The Xahau SDK ships a
`PREPARE_PAYMENT_SIMPLE` macro (in the genesis headers) that builds a Payment
template and calls `etxn_details` + `etxn_fee_base` for you; the test hooks embed
the same macro inline. This example uses it.

## Processing flow

1. Guard the entry with `_g(1,1)`.
2. `etxn_reserve(n)` — reserve exactly the number of transactions you will emit.
   This is mandatory: `emit` fails if you have not reserved capacity.
3. Determine the recipient (here from a HookParameter via `otxn_param`).
4. Build the transaction. `PREPARE_PAYMENT_SIMPLE(buf, drops, to_acc, dtag, stag)`
   fills a Payment template, calls `etxn_details` to embed the `EmitDetails`, and
   calls `etxn_fee_base` to set the fee.
5. `emit(SBUF(hash), SBUF(buf))` — on success it returns `32` and writes the
   emitted transaction's hash.
6. `accept`.
7. When the emitted transaction is later applied (or fails), the ledger invokes
   the hook's `cbak` entry point with the outcome.

## Complete code example

This hook, when invoked, emits a 1-drop Payment to the account named in the
`bob` HookParameter, and confirms in `cbak`.

```c
#include "hookapi.h"

// PREPARE_PAYMENT_SIMPLE and its ENCODE_* helpers come from the Xahau genesis
// headers (hook/genesis/headers/macro.h). PREPARE_PAYMENT_SIMPLE_SIZE is the
// exact template size the macro produces.

// The callback: invoked with the outcome of each emitted transaction.
int64_t
cbak(uint32_t reserved)
{
    _g(1, 1);
    // reserved carries the result: 0 = the emitted txn was applied successfully.
    // Do any bookkeeping here (e.g. record success in state). We simply accept.
    accept(SBUF("emit: callback"), 0);
    return 0;
}

int64_t
hook(uint32_t reserved)
{
    _g(1, 1);

    // 1. Reserve capacity for exactly one emitted transaction.
    if (etxn_reserve(1) != 1)
        rollback(SBUF("emit: reserve failed"), 1);

    // 2. Read the destination AccountID from a HookParameter named "bob".
    uint8_t to[20];
    if (otxn_param(SBUF(to), "bob", 3) != 20)
        rollback(SBUF("emit: no destination param"), 2);

    // 3. Build the Payment template. The macro also calls etxn_details and
    //    etxn_fee_base internally and patches the fee into the buffer.
    uint8_t tx[PREPARE_PAYMENT_SIMPLE_SIZE];
    PREPARE_PAYMENT_SIMPLE(tx, 1, to, 0, 0);   // 1 drop, no dest/src tags

    // 4. Emit it. Success returns 32 and writes the emitted txn hash.
    uint8_t hash[32];
    if (emit(SBUF(hash), SBUF(tx)) != 32)
        rollback(SBUF("emit: emit failed"), 3);

    accept(SBUF("emit: ok"), 0);
    return 0;
}
```

`etxn_reserve` is called before `emit`, the fee is computed by the macro (not
hardcoded), and the `emit` return is checked for exactly `32`.

## Variations

**Emit conditionally.** Wrap the reserve/build/emit block in a condition (for
example, only emit when the incoming amount exceeds a threshold). Call
`etxn_reserve(1)` only on the path that actually emits, or reserve `0` otherwise.

**Emit more than one.** Reserve the total up front — `etxn_reserve(2)` — then
call `emit` twice with two distinct templates. Emitting more than you reserved
returns `TOO_MANY_EMITTED_TXN (-13)`.

**Building the template by hand.** If you are not using `PREPARE_PAYMENT_SIMPLE`,
the sequence is: encode the transaction fields into a buffer, call
`etxn_details(details_ptr, len)` to write the `EmitDetails` block, call
`etxn_fee_base(SBUF(tx))` to get the fee, patch the fee field, then `emit`. The
`prepare` API (requires `featureHooksUpdate2`) can fill the common emit fields on
a template for you — see [emit-and-etxn.md](../api-reference/emit/README.md).

**Chained emissions in `cbak`.** A callback can itself reserve and emit further
transactions. Each hop increases the emit generation and burden; check
`etxn_generation()` / `etxn_burden()` if your logic depends on chain depth.

## Caveats

- Emitted transactions have a null signing key and are authorized by the ledger's
  emission rules, not by a signature — you cannot emit on behalf of an account
  the hook is not installed on.
- The emitted transaction is not applied during the current hook execution; it is
  queued and applied afterward, and only then does `cbak` run.
- `HookCanEmit` and related amendments gate emission behavior; confirm the
  network you target has emission enabled for your hook's context.
- The fee must come from `etxn_fee_base` for the exact template you emit. A fee
  that is too small is rejected; an absurdly large one returns `FEE_TOO_LARGE (-10)`.

## Common mistakes

- **Forgetting `etxn_reserve`.** Calling `emit` without a prior reservation fails.
  Reserve the exact count before building.
- **Hardcoding the fee.** Fees depend on the transaction size and network load;
  a stale constant will under- or over-pay. Always use `etxn_fee_base` (which
  `PREPARE_PAYMENT_SIMPLE` calls for you) and re-run it if you change the template.
- **Computing the fee before `etxn_details`.** The `EmitDetails` block is part of
  the transaction, so it must be present before `etxn_fee_base` measures it.
  `PREPARE_PAYMENT_SIMPLE` orders these correctly; hand-built templates must too.
- **Ignoring `EMISSION_FAILURE (-11)`.** `emit` returning this (rather than `32`)
  means the ledger rejected the emitted transaction; check the return and handle
  it instead of assuming success.
- **Reserving too few.** Reserve `1` but emit twice and the second `emit` returns
  `TOO_MANY_EMITTED_TXN (-13)`.
- **Expecting the emitted transaction's effects immediately.** They apply after
  the current transaction; read results in `cbak`, not inline.

## Related documents

- [overview.md](../overview.md)
- [glossary.md](../glossary.md)
- [macros.md](../macros/README.md)
- [best-practices.md](../best-practices.md)
- [api-reference/emit-and-etxn.md](../api-reference/emit/README.md)
- [api-reference/transaction.md](../api-reference/transaction/README.md)
- [api-reference/control.md](../api-reference/control/README.md)
- [examples/payment-filter.md](payment-filter.md)
- [examples/memo-routing.md](memo-routing.md)
