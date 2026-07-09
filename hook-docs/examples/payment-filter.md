---
sidebarTitle: "Payment Filter"
---

# Example: Payment Filter

A payment filter is the canonical Hook: it inspects the transaction that touched
the account and decides whether to `accept` (let it apply) or `rollback` (reject
it). This example covers gating on transaction type, matching the counterparty
against an allow/block list, and rejecting payments above a threshold for both
native XAH and issued (IOU) amounts.

## Purpose

- Run only for `Payment` transactions; pass everything else through.
- Reject payments to (or from) a specific account.
- Reject payments whose amount exceeds a limit, handling native XAH and IOU
  amounts uniformly.

## APIs used

| API | Purpose | Reference |
|---|---|---|
| `otxn_type` | Read the originating transaction's type. | [transaction.md](../api-reference/transaction/otxn_type.md) |
| `otxn_field` | Read `sfAccount` / `sfDestination` / `sfAmount` off the transaction. | [transaction.md](../api-reference/transaction/otxn_field.md) |
| `otxn_slot` | Load the whole originating transaction into a slot. | [transaction.md](../api-reference/transaction/otxn_slot.md) |
| `slot_subfield` | Narrow a slot to a subfield (`sfAmount`). | [ledger-and-slot.md](../api-reference/slot/slot_subfield.md) |
| `slot_float` | Read a slotted amount as an XFL value. | [ledger-and-slot.md](../api-reference/slot/slot_float.md) |
| `float_compare` | Compare two XFL values. | [float-and-amount.md](../api-reference/float/float_compare.md) |
| `float_set` | Build an XFL threshold from exponent + mantissa. | [float-and-amount.md](../api-reference/float/float_set.md) |
| `hook_account` | Read the account the hook is installed on. | [control.md](../api-reference/control/hook_account.md) |
| `accept` / `rollback` | Terminate and apply / reject the transaction. | [control.md](../api-reference/control/README.md) |

Helper macros used: `SBUF`, `GUARD`, `AMOUNT_TO_DROPS`, `BUFFER_EQUAL_20`,
`ACCOUNT_COMPARE` — see [macros.md](../macros/README.md).

## Processing flow

1. Guard the entry with `_g(1,1)` (required once at the top of `hook`).
2. Call `otxn_type()`. If it is not `ttPAYMENT` (value `0`), `accept` immediately
   — the hook has nothing to say about non-Payments.
3. Read `sfDestination` (or `sfAccount` for the sender) with `otxn_field`. A
   raw AccountID is 20 bytes, so a successful read returns `20`.
4. Compare the 20-byte AccountID against your blocklist with `BUFFER_EQUAL_20`.
   On a match, `rollback`.
5. Read the amount. Two equivalent options:
   - **Native only:** `otxn_field(SBUF(buf), sfAmount)`; a native amount is 8
     bytes, so a return of `8` means XAH. Convert with `AMOUNT_TO_DROPS`.
   - **Native and IOU:** load the amount into a slot and read it as XFL with
     `slot_float`, then compare with `float_compare`. This path is uniform across
     XAH and issued currencies.
6. `accept` if the payment is within limits, otherwise `rollback`.

## Complete code example

This hook rejects Payments to one blocked account and rejects any Payment worth
more than 100 (XAH or any IOU) by reading the amount as XFL.

```c
#include "hookapi.h"

// The account payments may NOT be sent to (20-byte raw AccountID).
// Fill in with a real AccountID; zeros here are a placeholder.
uint8_t const BLOCKED[20] = {
    0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
};

int64_t
hook(uint32_t reserved)
{
    _g(1, 1);  // guard: this hook body runs at most once

    // 1. Only filter Payment transactions; pass everything else through.
    if (otxn_type() != ttPAYMENT)
        accept(SBUF("payment-filter: not a payment"), 0);

    // 2. Read the destination AccountID (raw 20 bytes).
    uint8_t dest[20];
    if (otxn_field(SBUF(dest), sfDestination) != 20)
        rollback(SBUF("payment-filter: no destination"), 1);

    // 3. Reject payments to the blocked account.
    if (BUFFER_EQUAL_20(dest, BLOCKED))
        rollback(SBUF("payment-filter: destination blocked"), 2);

    // 4. Read the payment amount as an XFL via a slot.
    //    otxn_slot loads the whole txn; slot_subfield narrows to sfAmount;
    //    slot_float interprets it as XFL (works for XAH and IOU).
    if (otxn_slot(1) != 1)
        rollback(SBUF("payment-filter: cannot slot txn"), 3);
    if (slot_subfield(1, sfAmount, 2) != 2)
        rollback(SBUF("payment-filter: no amount"), 4);

    int64_t amt = slot_float(2);
    if (amt < 0)
        rollback(SBUF("payment-filter: bad amount"), 5);

    // 5. Build the threshold 100.0 as XFL and compare.
    //    float_set(exponent, mantissa): 100 = 1 * 10^2.
    int64_t limit = float_set(2, 1);
    if (limit < 0)
        rollback(SBUF("payment-filter: bad limit"), 6);

    // float_compare returns 1 (true) when the mode holds.
    if (float_compare(amt, limit, COMPARE_GREATER) == 1)
        rollback(SBUF("payment-filter: amount over limit"), 7);

    accept(SBUF("payment-filter: ok"), 0);
    // Unreachable, but every path must terminate.
    return 0;
}
```

Every API return value is checked, the single implicit "loop" (the hook body)
carries a guard, and every path ends in `accept` or `rollback`.

## Variations

**Native-only threshold with `AMOUNT_TO_DROPS`.** If your account only ever
receives XAH, you can skip the slot machinery:

```c
uint8_t amt[48];                       // large enough for XAH or IOU
int64_t len = otxn_field(SBUF(amt), sfAmount);
if (len == 8)                          // 8 bytes => native XAH
{
    int64_t drops = AMOUNT_TO_DROPS(amt);   // -2 if the buffer is not native
    if (drops < 0)
        rollback(SBUF("bad native amount"), 1);
    if (drops > 100000000)             // 100 XAH = 100_000_000 drops
        rollback(SBUF("over 100 XAH"), 2);
}
else
{
    // len == 48 => IOU; handle or reject as policy requires
    rollback(SBUF("IOU not accepted"), 3);
}
```

`otxn_field(sfAmount)` returns `8` for a native amount and `48` for an IOU
amount (the serialized value only — no leading field code). This size test is a
reliable native/IOU discriminator.

**Gate on the sender instead of the destination.** Read `sfAccount` rather than
`sfDestination`; the sender's AccountID is also 20 bytes.

**Ordered comparison with `ACCOUNT_COMPARE`.** When you need a sorted allowlist
or a range, `ACCOUNT_COMPARE(result, a, b)` sets `result` to `-1`, `0`, or `1`.

**Allowlist (invert the logic).** Loop over an array of permitted AccountIDs and
`rollback` if none matched. Guard the loop: `for (int i = 0; GUARD(N), i < N; ++i)`.

## Caveats

- A Strong hook running before the transaction applies can `rollback` to veto it;
  the sender's fee is still burned. Only a Strong hook installed on an account in
  the transaction's [TSH](../glossary.md) set is invoked for it — install the hook
  on the account whose payments you want to police.
- `slot_float` on a slot that is not an amount returns `NOT_AN_AMOUNT (-32)`;
  always check for a negative return before comparing.
- The `accept`/`rollback` message and code are recorded in the transaction
  metadata (`sfHookExecution` → `sfHookReturnString` / `sfHookReturnCode`), so
  use distinct codes to make failures diagnosable.

## Common mistakes

- **Comparing an amount buffer with `==` or `memcmp`.** Serialized amounts encode
  currency and issuer, so two economically-equal IOU amounts can differ byte for
  byte. Convert to XFL and use `float_compare`.
- **Assuming `sfAmount` is always 8 bytes.** It is 8 for XAH but 48 for IOU.
  Sizing the buffer at 8 and reading an IOU truncates or returns `TOO_SMALL (-4)`.
- **Using `AMOUNT_TO_DROPS` on an IOU buffer.** The macro returns `-2` when the
  amount is not native (its high bit is set); treat a negative result as "not XAH".
- **Forgetting to gate on `otxn_type`.** Without the `ttPAYMENT` check the hook
  runs for every transaction type that reaches the account (offers, trustlines,
  `SetHook` itself), and `otxn_field(sfDestination)` will return `DOESNT_EXIST (-5)`
  on transactions that have no destination.
- **Treating `float_compare` like a C comparison.** It returns `1`/`0` (or a
  negative error), not the sign of a subtraction. Check `== 1` for "true".
- **Omitting the leading `_g(1,1)`.** A hook with no guard fails validation at
  `SetHook` time (`GUARD_MISSING`), so it never installs.

## Related documents

- [overview.md](../overview.md)
- [glossary.md](../glossary.md)
- [macros.md](../macros/README.md)
- [best-practices.md](../best-practices.md)
- [api-reference/transaction.md](../api-reference/transaction/README.md)
- [api-reference/control.md](../api-reference/control/README.md)
- [api-reference/ledger-and-slot.md](../api-reference/slot/README.md)
- [api-reference/float-and-amount.md](../api-reference/float/README.md)
- [examples/state-counter.md](state-counter.md)
- [examples/memo-routing.md](memo-routing.md)
