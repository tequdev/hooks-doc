---
sidebarTitle: "XFL"
---

# XFL: Xahau's Fixed-Precision Floating-Point Format

**XFL** (**e****X**tended **F**ixed-point **L**edger) is Xahau's fixed-precision
floating-point format: a single `int64_t` that represents a decimal number as a
**mantissa** (its significant digits) and an **exponent** (a base-10 scale
factor), encoded together in one 64-bit word. Hooks use XFL everywhere they do
decimal arithmetic on token amounts — it is the numeric type behind the entire
`float_*` API family, `slot_float`, `trace_float`, and `float_sto`/`float_sto_set`.

This page explains the format itself: its bit layout, its valid range, why the
encoding guarantees a valid XFL is never a negative `int64_t`, and how it maps
onto the ledger's own `Amount` wire format. For the function-by-function API
(signatures, parameters, error codes), see
[api-reference/float/README](api-reference/float/README.md).

## Why XFL exists

Ledger token amounts are not stored as IEEE-754 floats — floats are not
deterministic across platforms/compilers, which consensus cannot tolerate.
Instead, both the ledger's serialized IOU `Amount` format and XFL use the same
alternative: a normalized decimal **mantissa** scaled by a base-10 **exponent**,
so `value = mantissa * 10^exponent`. XFL is that same idea shrunk to fit
entirely inside the return-value slot of a Hook API call (an `int64_t`), so a
hook can pass a decimal amount across the WASM host boundary as a single scalar
instead of a serialized byte buffer.

## The encoding

An XFL's 64 bits are laid out as follows:
<!-- from src/xrpld/app/hook/HookAPI.h, functions get_exponent, get_mantissa, is_negative, invert_sign, set_sign, set_mantissa, set_exponent, lines 39-118 -->

| Bits | Meaning |
|---|---|
| 63 | Unused, always `0` for any valid XFL. |
| 62 | Sign: `1` = positive value, `0` = negative value. (Inverted from a plain `int64_t`'s own sign bit — see below.) |
| 61–54 (8 bits) | Exponent, stored as `exponent + 97` so the stored field is always non-negative. |
| 53–0 (54 bits) | Mantissa: the value's significant digits, normalized to exactly 16 digits. |

- **Mantissa** — normalized to exactly 16 significant digits: `1000000000000000`
  (`minMantissa`) to `9999999999999999` (`maxMantissa`).
  <!-- defined in src/xrpld/app/hook/HookAPI.h:39-40 -->
  `float_set` and the arithmetic functions
  normalize any input mantissa/exponent pair to this width before encoding it;
  you never need to pre-normalize a
  value yourself.
  <!-- see normalize_xfl in the same file -->
- **Exponent** — ranges from `-96` (`minExponent`) to `80` (`maxExponent`).
  <!-- src/xrpld/app/hook/HookAPI.h:41-42 -->
  `set_exponent` rejects anything outside
  that range with `EXPONENT_OVERSIZED` (-28) or `EXPONENT_UNDERSIZED` (-29)
  before it ever reaches the caller as `INVALID_FLOAT`.
- **Zero** — the one XFL with no mantissa. It is represented by the literal
  `int64_t` value `0`, not by a zero mantissa inside the sign/exponent/mantissa
  layout above.
  <!-- get_exponent/get_mantissa special-case float1 == 0 and
  return 0 directly; make_float returns 0ULL whenever the mantissa is
  zero -->

### Worked decode

`float_sto.md`'s practical example serializes the XFL value
`6198187654261802496` as `1234567.0`.
<!-- adapted from SetHook_test.cpp, "Test float_sto" -->
Decoding that value by hand shows the layout above in practice:

```
6198187654261802496 = 0b101011000000100011000101101010100000111011111001000011000000000
bit 63 (unused)        = 0
bit 62 (sign)           = 1                    -> positive
bits 61-54 (exponent)   = 88 (binary 01011000)  -> 88 - 97 = -9
bits 53-0  (mantissa)   = 1234567000000000

value = 1234567000000000 * 10^-9 = 1234567.0
```

### Why negative `int64_t` is never a valid XFL

Bit 63 is never set on a valid XFL — the sign of the represented number lives
in bit 62, not in the sign bit of the surrounding `int64_t`. That means every
valid XFL is, numerically, a non-negative `int64_t`. Passing a negative
`int64_t` (for example plain `-1`, or an error code mistakenly forwarded as an
amount) is rejected outright as `INVALID_FLOAT`, before any bit decoding
happens.
<!-- get_exponent and get_mantissa both check `if (float1 < 0) return
Unexpected(INVALID_FLOAT);` as their very first step
(src/xrpld/app/hook/HookAPI.h:48-49,62-63) -->

This is also why the "invalid float" sentinel is defined as the unusual value
**`INVALID_FLOAT = -10024`** rather than something in the small negative range
most other Hook error codes use, next to the ordinary
sequential codes like `DIVISION_BY_ZERO = -25` and `XFL_OVERFLOW = -30`.
<!-- hook/error.h:28, next to codes at lines 29 and 34 -->
Choosing a value far outside the ordinary error range makes
`INVALID_FLOAT` unmistakable — it can never collide with a legitimate small
negative error code, a valid exponent, or any other value a `float_*` function
might otherwise plausibly return.

Related normalization error codes, all from `hook/error.h`:

| Code | Value | Meaning |
|---|---|---|
| `INVALID_FLOAT` | -10024 | Argument is not a valid XFL (negative `int64_t`, or fails to decode). |
| `MANTISSA_OVERSIZED` | -26 | Mantissa above `maxMantissa`. |
| `MANTISSA_UNDERSIZED` | -27 | Mantissa below `minMantissa` after normalization. |
| `EXPONENT_OVERSIZED` | -28 | Exponent above `maxExponent` (80). |
| `EXPONENT_UNDERSIZED` | -29 | Exponent below `minExponent` (-96). |
| `XFL_OVERFLOW` | -30 | Value normalizes outside the representable range entirely. |

## Relationship to the ledger's IOU Amount format

XFL is not a Hook-only invention layered on top of the ledger's amount type —
it mirrors it directly. The wire format for a
non-native (IOU) `Amount` is:
<!-- serialization comment in src/libxrpl/protocol/STAmount.cpp:665-680 -->

- high bit (63): `0` for XAH, `1` for issued currency,
- next bit (62): `1` for positive, `0` for negative,
- next 8 bits (61-54): `mOffset + 97`,
- remaining 54 bits (53-0): the mantissa.

The ledger defines the exact same bounds Hooks use:
`cMinOffset = -96`, `cMaxOffset = 80`, `cMinValue = 1000000000000000ull`,
`cMaxValue = 9999999999999999ull`.
<!-- STAmount.h:65-70 -->
An XFL is that same sign/exponent/mantissa
triple with the "is this an issued currency" flag bit (63) simply left unset —
which is exactly what guarantees a valid XFL fits in a non-negative `int64_t`.
This is why `float_sto`/`float_sto_set` (see below) can convert between the two
representations with nothing more than shifting that one bit and re-attaching
a currency/issuer.

Native XAH amounts don't go through this mantissa/exponent scheme on the wire
(they're plain drops), but when a hook pulls a native amount into XFL form —
via `slot_float`, for instance — it is normalized to an XFL with exponent `-6`
(drops), so it composes with IOU amounts in the same `float_*` arithmetic
without special-casing.

## Where a hook developer encounters XFLs

- **`float_*` functions** (`float_set`, `float_sum`, `float_multiply`,
  `float_divide`, `float_compare`, `float_mulratio`, `float_log`, `float_root`,
  `float_invert`, `float_negate`, `float_mantissa`, `float_sign`, `float_int`,
  `float_one`) — the arithmetic and inspection API. Full reference:
  [api-reference/float/README](api-reference/float/README.md).
- **`slot_float(slot_no)`** — reads a slotted `STI_AMOUNT` (a `sfAmount`-typed
  field already loaded into a slot via `slot_subfield`) directly as an XFL,
  without you having to hand-decode the serialized `Amount` bytes. See
  [api-reference/slot/slot_float](api-reference/slot/slot_float.md).
- **`trace_float(read_ptr, read_len, float1)`** — logs an XFL as
  `mantissa*10^(exponent)`, or `<ZERO>`/`<INVALID>` for those special cases.
  See [api-reference/trace/trace_float](api-reference/trace/trace_float.md)
  and the `TRACEXFL(v)` macro in `hook/macro.h`.
  <!-- hook/macro.h:40 -->
- **`float_sto`/`float_sto_set`** — convert an XFL to and from the ledger's
  serialized `Amount` wire bytes (the format described above), so a hook can
  read an amount out of a transaction/ledger object, or build one to `emit`.
  See [api-reference/float/float_sto](api-reference/float/float_sto.md) and
  [api-reference/float/float_sto_set](api-reference/float/float_sto_set.md).

## Worked examples

Building and comparing an XFL value in C, in the same style used throughout
this doc set:

```c
#include "hookapi.h"

int64_t
hook(uint32_t reserved)
{
    _g(1, 1);

    // 3.14 = 314 * 10^-2
    int64_t pi_ish = float_set(-2, 314);

    // Double it: 2 * 3.14 = 6.28
    int64_t two    = float_set(0, 2);
    int64_t doubled = float_multiply(pi_ish, two);
    if (doubled < 0)
        rollback(SBUF("float_multiply failed"), doubled);

    // Compare against a threshold of 5.0
    int64_t five = float_set(0, 5);
    if (float_compare(doubled, five, COMPARE_GREATER) == 1)
        accept(SBUF("6.28 is greater than 5"), 0);

    accept(SBUF("not greater"), 0);
    return 0;
}
```

`float_compare` returns `1`/`0` for true/false (or a negative error code) —
never treat it like a C three-way comparator or subtract two XFLs to compare
them; see [best-practices](best-practices.md) for that pitfall.

A second example, decoding a token amount straight out of a transaction and
logging it:

```c
uint8_t amt[48];
int64_t len = otxn_field((uint32_t)amt, sizeof(amt), sfAmount);
if (len != 48)
    rollback(SBUF("expected an IOU amount"), 1);

int64_t value = float_sto_set((uint32_t)amt, len);
trace_float(SBUF("incoming amount"), value);   // logs: incoming amount: Float <mantissa>*10^(<exponent>)
```

## Related documents

- [api-reference/float/README](api-reference/float/README.md) — the full
  `float_*` function reference (signatures, parameters, error codes,
  worked examples per function).
- [glossary](glossary.md) — the XFL glossary entry and the shared
  error-code table.
- [api-reference/slot/slot_float](api-reference/slot/slot_float.md) —
  reading a slotted amount directly as an XFL.
- [api-reference/trace/trace_float](api-reference/trace/trace_float.md) —
  logging XFL values.
- [best-practices](best-practices.md) — validating amounts and avoiding
  precision surprises.
- [examples/payment-filter](examples/payment-filter.md) — a worked
  threshold-check hook using `float_compare`.
