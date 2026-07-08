# Amount and STO helpers

## AMOUNT_TO_DROPS

```c
#define AMOUNT_TO_DROPS(amount_buffer)\
     (((amount_buffer)[0] >> 7) ? -2 : ( /* decode 8-byte big-endian XRP drops */ ))
```

Decode the 8-byte serialized **native XRP** Amount payload into an `int64_t` drop
count. **Expression.** Returns the drop value on success, or `-2` if the high bit of
byte 0 is set — which in XRPL Amount encoding means the value is *not* native XRP (it is
an IOU/MPT), so there are no drops to extract. The macro masks off the format/sign flag
bits in byte 0 and assembles the remaining bytes big-endian.

```c
uint8_t amt[48];                       // Amount field from otxn_field/sto_subfield
otxn_field(SBUF(amt), sfAmount);
int64_t drops = AMOUNT_TO_DROPS(amt);  // >=0 for XRP, -2 if the amount is an IOU
if (drops < 0)
    NOPE("expected native XRP");
```

Caveats:
- Pass the **8-byte Amount payload** (for XRP the serialized amount is 8 bytes; an IOU
  amount is 48 bytes and this macro will detect the IOU flag and return `-2`). This is a
  raw bit decode, not the [`float_*`](../api-reference/float/README.md) path — use the
  float APIs when you need to do arithmetic on IOU amounts.
- The mask constant in the definition is written `0xb00111111`; it reads like an
  intended binary literal `0b00111111` (i.e. `0x3F`, clearing the top two flag bits).
  For all valid XRP drop amounts the two encodings produce the same result, but if you
  are adapting this macro for unusual inputs, verify the masking against
  [the Amount serialization](../glossary.md) first. **Unverified — needs confirmation**
  whether the literal is intentional or a latent typo.

## SUB_OFFSET / SUB_LENGTH

```c
#define SUB_OFFSET(x) ((int32_t)(x >> 32))
#define SUB_LENGTH(x) ((int32_t)(x & 0xFFFFFFFFULL))
```

Unpack the `int64_t` returned by
[`sto_subfield`](../api-reference/sto/sto_subfield.md),
[`sto_subarray`](../api-reference/sto/sto_subarray.md) and the slot subfield/subarray
APIs, which encode a result as `(offset << 32) | length`. **Expressions.** `SUB_OFFSET`
gives the byte offset **relative to the buffer you passed in**; `SUB_LENGTH` gives the
field's byte length. Full usage and the offset-is-relative caveat are documented once,
under [`sto_subfield`](../api-reference/sto/sto_subfield.md) — this section only names
the macros so callers know where they come from.

```c
int64_t r = sto_subfield(SBUF(sto), sfAmount);
if (r < 0)
    NOPE("no amount field");
uint8_t* amount = sto + SUB_OFFSET(r);   // SUB_LENGTH(r) bytes
```
