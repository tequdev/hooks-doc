---
sidebarTitle: "Binary Visualizer"
---

# Binary Visualizer

A browser tool that decodes a serialized Xahau blob — a transaction, a ledger
entry, a manifest, or any other STObject — field by field, showing the
type-code, field-code, and raw payload bytes for each field in order.

- **Tool:** [Xahau Binary Visualizer](https://binary-visualizer.xahau.tools/)

## Why use it

Hooks work entirely in terms of raw serialized bytes: `otxn_field` and
`slot_subfield`/`sto_subfield` hand you an offset and length into a byte buffer,
not a parsed structure, and building an emitted transaction template (as in the
[Transaction Builder](tx-builder.md)) means laying out field headers, VL
prefixes, and amount encodings by hand. When a hook's byte math doesn't line up
— an unexpected field length, an off-by-one offset, a mis-encoded amount — the
fastest way to find out why is to paste the exact bytes into a visualizer and
see the field boundaries the ledger itself would see. It turns "what does this
hex blob actually contain" from a manual nibble-counting exercise into a
click-through breakdown.

It is also useful independent of debugging a specific hook: reading an
`sfHookExecutions` array from transaction metadata, inspecting an
`sfEmitDetails` object you built by hand, or checking what a `ltHOOK_DEFINITION`
or `ltHOOK_STATE` object looks like on the wire.

## How to use it

1. Paste hex, base64, or JSON into the single text box, then click outside it
   (or it re-runs on every change). The tool auto-detects which of the three it
   is — including base64-encoded JSON — and decodes accordingly.
2. For hex/base64 input, it walks the bytes and prints, per field, in order:
   the type-code, the field-code, and the field's raw payload — indenting
   nested `STObject`/`STArray` fields and marking their end markers.
3. `Amount` fields get a dedicated breakdown instead of a flat payload: for
   native XAH it splits out the XAH-bit and sign bit from the drops value; for
   an IOU it splits out the not-XAH bit, sign bit, 8-bit exponent (both the raw
   stored value and the adjusted exponent), the mantissa, the 3-letter currency
   code, and the 20-byte issuer — the same sign/exponent/mantissa layout
   documented in [../xfl.md](../xfl.md).
4. Any value inside a decoded JSON blob that looks like hex or base64 becomes
   clickable — clicking it re-decodes just that inner value, and a "Go up"
   link returns to the outer blob. This is convenient for drilling from a
   transaction's JSON down into one serialized inner blob (for example a
   `Blob`-typed field) without re-copying it by hand.
5. It ships with its own default field definitions (`def.json`), which already
   include Xahau's Hook fields, so nothing extra needs to be loaded for typical
   Xahau blobs. A different field-definitions JSON can be supplied via a query
   string, e.g. `?path/to/definitions.json`, if you need to decode against a
   different field set.

## Worked example

Pasting the 49-byte serialized `sfAmount` field for an IOU amount of
`1234567.0 USD` — the same XFL value used in
[`float_sto`'s worked example](../api-reference/float/float_sto.md)
(`6198187654261802496`, adapted from `SetHook_test.cpp`, "Test float_sto")
serialized with a placeholder issuer:

```
61D60462D5077C86000000000000000000000000005553440000000000ABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD
```

produces a breakdown along these lines:

- **Field:** `Amount` (type `6`, field `1` — the single-byte header `0x61`).
- **Type:** `AMOUNT`.
- **Flags + Exponent:** not-XAH bit `1`, sign bit `1` (positive), exponent raw
  `88` / adjusted `-9`, plus the first two mantissa bits.
- **Mantissa:** `1234567000000000`.
- **Currency Code:** `USD`.
- **Issuer:** the 20-byte issuer `AccountID`.

That raw exponent/mantissa split is exactly what
[`float_sto_set`](../api-reference/float/float_sto_set.md) would decode into
the XFL `6198187654261802496` inside a hook — the visualizer just shows you
the same bits without writing any C.

## Related documents

- [Tools](README.md)
- [Documentation index](../README.md)
- [Transaction Builder](tx-builder.md)
- [STO APIs](../api-reference/sto/README.md)
- [XFL](../xfl.md)
