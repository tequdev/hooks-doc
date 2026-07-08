# Float and Amount APIs

This page documents the sixteen **float-and-amount** Hook APIs: the `float_*` family that
lets a hook do arbitrary-precision decimal arithmetic on token amounts and serialize the
result into (or read it out of) the ledger's `Amount` format.

All signatures are copied verbatim from `hook/extern.h`. Return codes reference the shared
error table in [../../glossary.md](../../glossary.md); values come from `include/xrpl/hook/Enum.h`
and `hook/error.h`, and every behaviour below is taken from the implementations in
`src/xrpld/app/hook/detail/applyHook.cpp` and `src/xrpld/app/hook/detail/HookAPI.cpp`.

---

## What an XFL is

An **XFL** (the hooks floating-point format) is a single `int64_t` that encodes a decimal
number the same way the ledger encodes IOU (token) amounts: a sign, a normalized mantissa,
and a base-10 exponent. Its valid ranges are fixed (`src/xrpld/app/hook/HookAPI.h`):

- **Mantissa** — exactly 16 significant digits: `1000000000000000` (`minMantissa`) to
  `9999999999999999` (`maxMantissa`). Non-zero values are always normalized to this width.
- **Exponent** — `-96` (`minExponent`) to `80` (`maxExponent`).
- **Zero** — represented by the literal `int64_t` value `0` (the one XFL with no mantissa).

A value's XFL bit-pattern is a *positive* `int64_t`; the number's own sign lives inside that
encoding, not in the sign of the `int64_t`. As a result **any negative `int64_t` is not a
valid XFL** — passing one (for example `-1`) returns `INVALID_FLOAT`. This is why the
"invalid float" sentinel has the unusual value **`INVALID_FLOAT = -10024`** (deliberately not
`-24`): it is a number chosen so it can never itself be mistaken for a valid XFL or a valid
exponent. Most functions on this page validate their XFL arguments up front and return
`-10024` if the argument does not decode to a legal mantissa/exponent.

Because XFLs are opaque encoded integers, you never read the mantissa or exponent by shifting
bits yourself — use [`float_mantissa`](float_mantissa.md), [`float_sign`](float_sign.md), and the
arithmetic functions. To move a value between XFL form and the ledger wire format, use
[`float_sto`](float_sto.md) / [`float_sto_set`](float_sto_set.md). To turn an XFL into a plain
integer (e.g. drops), use [`float_int`](float_int.md).

---

## Working with amounts: reading and comparing

Two idioms cover almost every hook that inspects a transaction amount.

**1. Native XAH via `AMOUNT_TO_DROPS`.** When the amount is native, the `sfAmount` field is 8
bytes of drops. The [`AMOUNT_TO_DROPS`](../../macros/amount-and-sto.md) macro decodes those bytes to an integer
number of drops without going through XFL at all — cheaper when you only need an integer
comparison:

```c
// Reject a native Payment below 10 XAH (10,000,000 drops).
uint8_t amt[48];
int64_t len = otxn_field((uint32_t)amt, sizeof(amt), sfAmount);  // sfAmount = (6<<16)|1
if (len != 8)
    rollback(SBUF("expected a native amount"), 1);   // 8 bytes == native XAH
int64_t drops = AMOUNT_TO_DROPS(amt);                 // negative on error
if (drops < 0 || drops < 10000000LL)
    rollback(SBUF("amount too small"), 2);
accept(SBUF("ok"), 0);
```

**2. IOU via `float_sto_set` + `float_compare`.** For a token amount, decode the serialized
`Amount` field into an XFL and compare against an XFL threshold:

```c
// Reject an IOU Payment below a 100.0 threshold.
uint8_t amt[48];
int64_t len = otxn_field((uint32_t)amt, sizeof(amt), sfAmount);
if (len != 48)
    rollback(SBUF("expected an IOU amount"), 1);      // 48 bytes == IOU (8 + 20 + 20)
int64_t value     = float_sto_set((uint32_t)amt, len);
int64_t threshold = float_set(0, 100);                 // 100.0
if (float_compare(value, threshold, COMPARE_LESS) == 1)
    rollback(SBUF("amount below threshold"), 2);
accept(SBUF("ok"), 0);
```

**Percentage calculation.** To take a percentage of an amount — for a fee, a reward split,
etc. — scale the XFL with [`float_mulratio`](float_mulratio.md):

```c
// Compute a 1.5% fee on an XFL amount, rounded down (15 / 1000).
int64_t fee = float_mulratio(amount, 0, 15, 1000);
if (fee < 0)
    rollback(SBUF("fee calc failed"), fee);
```

The number of bytes returned by [`otxn_field`](../transaction/otxn_field.md) for `sfAmount`
distinguishes the two cases at runtime: `8` for native XAH, `48` for an IOU (8-byte amount +
20-byte currency + 20-byte issuer).

---

## Index

| Function | Purpose |
|---|---|
| [`float_set`](float_set.md) | Build an XFL from an exponent and mantissa. |
| [`float_one`](float_one.md) | The XFL constant `1.0`. |
| [`float_mantissa`](float_mantissa.md) | Extract the mantissa of an XFL. |
| [`float_sign`](float_sign.md) | Extract the sign of an XFL. |
| [`float_negate`](float_negate.md) | Flip the sign of an XFL. |
| [`float_sum`](float_sum.md) | Add two XFLs. |
| [`float_multiply`](float_multiply.md) | Multiply two XFLs. |
| [`float_mulratio`](float_mulratio.md) | Multiply an XFL by an integer ratio (numerator/denominator). |
| [`float_divide`](float_divide.md) | Divide one XFL by another. |
| [`float_invert`](float_invert.md) | Reciprocal `1/x` of an XFL. |
| [`float_compare`](float_compare.md) | Compare two XFLs (equal / less / greater). |
| [`float_log`](float_log.md) | Base-10 logarithm of an XFL. |
| [`float_root`](float_root.md) | n-th root of an XFL. |
| [`float_int`](float_int.md) | Convert an XFL to a scaled integer. |
| [`float_sto`](float_sto.md) | Serialize an XFL into an `Amount` STO field. |
| [`float_sto_set`](float_sto_set.md) | Parse an `Amount` STO back into an XFL. |

## Related documents

- [../../README.md](../../README.md) — documentation index.
- [../../overview.md](../../overview.md) — hook execution model.
- [../../glossary.md](../../glossary.md) — full error-code and term reference (including the
  `INVALID_FLOAT = -10024` and `XFL_OVERFLOW` entries).
- [../../macros.md](../../macros/README.md) — `AMOUNT_TO_DROPS`, `SBUF`, `TRACEXFL`, and the field-code
  helpers.
- [../../best-practices.md](../../best-practices.md) — validating amounts and avoiding precision
  surprises.
- [transaction.md](../transaction/README.md) — `otxn_field` for reading the `sfAmount` field.
- [ledger-and-slot.md](../slot/README.md) — `slot_float` reads a slotted amount directly as
  an XFL.
- [emit-and-etxn.md](../emit/README.md) — building the amounts you serialize into emitted
  transactions.
- [utility.md](../sto/README.md) — `sto_subfield` and the other STO helpers.
- [../../examples/payment-filter.md](../../examples/payment-filter.md) — a threshold-check hook end
  to end.
