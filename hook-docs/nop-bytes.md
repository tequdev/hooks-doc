---
sidebarTitle: "NOP Bytes (0x99)"
---

# NOP Bytes: Skippable Padding in Serialized Objects

Xahau's serialized-object deserializer treats the byte **`0x99`** — a field ID whose type
code is `9` and whose field code is `9` — as a **NOP** ("no operation"). Wherever the parser
expects the next field ID, a `0x99` byte is silently consumed and skipped instead of being
decoded as a field. This is a Xahau-specific extension of the XRP Ledger binary format:
stock `rippled` rejects the same byte as an unknown field.

The feature exists for hooks. A hook usually emits a transaction from a **fixed-size template**
laid out at compile time (see the [Transaction Builder](tools/tx-builder.md)), and the byte
offset of every field is baked into the template. NOP bytes let a hook change the *shape*
of that template at runtime without moving any bytes:

- **Optional fields** — overwrite an unwanted field, header and payload, with `0x99` bytes
  and it disappears from the parsed transaction.
- **Variable-length fields** — reserve the maximum size for a `Blob`-type field (`sfBlob`,
  `sfMemoData`, …), write the real length prefix and data, and fill the unused tail with
  `0x99`.

This page documents exactly how the deserializer treats NOPs, which Hook APIs honor them and
which do not, and how to use them in an emitted-transaction template.

## What the ledger does

<!-- src/libxrpl/protocol/STObject.cpp: STObject::set(SerialIter&, int); src/libxrpl/protocol/STArray.cpp: STArray::STArray(SerialIter&, SField const&, int) -->

Both container deserializers — the one for objects (`STObject`) and the one for arrays
(`STArray`) — run the same loop: read a field ID, then decode the field it names. Xahau adds
one check at the top of that loop, before the end-of-object / end-of-array markers are tested
and before the field ID is looked up:

```cpp
uint8_t nop_counter = 0;

while (!sit.empty())
{
    int type;
    int field;
    sit.getFieldID(type, field);

    // pass nops
    if (type == 9 && field == 9)
    {
        if (++nop_counter == 64)
        {
            JLOG(debugLog().error()) << "Too many NOPS";
            Throw<std::runtime_error>("Too many NOPS");
        }
        continue;
    }

    // ... end-of-container markers, field lookup, field decoding ...
}
```

The consequences, each of which is verified against that code:

| Behaviour | Detail |
|---|---|
| **Which byte** | Exactly one byte, `0x99`: high nibble `9` = type code, low nibble `9` = field code. The two- and three-byte "uncommon" field-ID encodings cannot express a NOP, because the field-ID reader rejects an uncommon type or field code below 16.<!-- src/libxrpl/protocol/Serializer.cpp: SerialIter::getFieldID --> |
| **Where it is legal** | Anywhere a field ID is expected: between fields of an object, before the object's `0xE1` end marker, between elements of an array, and before the array's `0xF1` end marker. This applies at every nesting level — the top-level transaction, `sfEmitDetails`, each `sfMemo` object, the `sfMemos` array, and so on. |
| **Where it is *not* legal** | Inside a field's payload. The bytes of a `UInt32`, an `Amount`, or the declared length of a VL blob are decoded as that field's data; a `0x99` there is just the value `0x99`. |
| **Limit** | At most **63 NOPs per container**. The counter is a local of the deserializing loop, is never reset within one object or array, and the 64th NOP throws `Too many NOPS`, which fails the whole parse. Each nested object or array is parsed by its own loop and therefore has its own budget of 63. |
| **Not amendment-gated** | The check is unconditional. It was added in March 2023, before Xahau's mainnet launch, so every Xahau ledger has honored NOPs.<!-- Xahau/xahaud commit 24384be2 "allow nops to be specified in emitted txns" --> |
| **Never re-serialized** | A parsed object only knows its fields, so serializing it again produces the canonical encoding with **no** NOPs. NOP bytes therefore never reach the ledger, the transaction hash, signing data, or the emitted-transaction ledger entry (`ltEMITTED_TXN` stores a re-serialized copy).<!-- src/xrpld/app/hook/detail/applyHook.cpp: ptr->add(s) before emplace_back(STObject(sit, sfEmittedTxn)) --> |
| **No fee impact** | Fees are computed from the parsed fields (memo bytes, hook-parameter bytes, signer count, hook execution), never from the raw blob length, so NOP padding costs nothing.<!-- src/xrpld/app/tx/detail/Transactor.cpp: Transactor::calculateBaseFee --> |
| **Size limits still apply to the raw blob** | A transaction blob, NOPs included, must be between 10 bytes and 1 MiB before parsing begins.<!-- include/xrpl/protocol/Protocol.h: txMinSizeBytes / txMaxSizeBytes; src/libxrpl/protocol/STTx.cpp: STTx::STTx(SerialIter&) --> |

Because NOPs are dropped before any field is looked at, they also do not disturb
**canonical field ordering**: blanking out a field leaves the remaining fields in the order
they already had, and a NOP-filled tail after a shortened blob simply sits between that
field and the next one.

## Which Hook APIs honor NOPs

Not every Hook API parses a serialized object with the ledger's deserializer. The `sto_*`
family uses the hook engine's own lightweight scanner, `get_stobject_length`, which does
**not** know about NOPs — it rejects type code `9` (`STI_NUMBER`) as an unsupported type
before it ever compares the field code.<!-- src/xrpld/app/hook/detail/HookAPI.cpp: HookAPI::get_stobject_length ("not supported types") -->

| API | Parser | NOP bytes in the input buffer |
|---|---|---|
| [`emit`](api-reference/emit/emit.md) | `STTx` (ledger deserializer) | **Skipped.** The emitted transaction and its hash are built from the parsed fields; the NOPs are gone. |
| [`prepare`](api-reference/emit/prepare.md) | `STObject` (ledger deserializer) | **Skipped.** The returned blob is re-serialized from the parsed fields, so it contains no NOPs — `prepare` doubles as a NOP stripper. |
| [`etxn_fee_base`](api-reference/emit/etxn_fee_base.md) | `STTx` (ledger deserializer) | **Skipped.** The fee reflects the fields that survive parsing. |
| [`sto_validate`](api-reference/sto/sto_validate.md) | `get_stobject_length` | **Rejected** — returns `0` (invalid). |
| [`sto_subfield`](api-reference/sto/sto_subfield.md), [`sto_subarray`](api-reference/sto/sto_subarray.md) | `get_stobject_length` | **Rejected** — `PARSE_ERROR` (-18) as soon as the scan reaches a NOP. |
| [`sto_emplace`](api-reference/sto/sto_emplace.md), [`sto_erase`](api-reference/sto/sto_erase.md) | `get_stobject_length` | **Rejected** — `PARSE_ERROR` (-18) if a NOP precedes the target field in the source object, or (under `fixHookAPI20251128`) the injected field starts with one. |
| `otxn_field`, `slot_*`, `state*` | n/a | Not applicable. These read objects the ledger has already parsed, or load them by keylet/hash; there is no NOP byte to encounter. |

Too many NOPs (64 or more in one container) is a parse failure like any other:
`emit` returns `EMISSION_FAILURE` (-11), `prepare` returns `INVALID_ARGUMENT` (-7), and
`etxn_fee_base` returns `INVALID_TXN` (-37).<!-- HookAPI::emit / prepare / etxn_fee_base catch blocks -->

Outside the ledger, assume nothing understands NOPs. The XRP Ledger's `rippled` throws
`Unknown field` on `0x99`, and client-side decoders such as xahau.js's
`ripple-binary-codec` resolve the field ID through the field table, where type 9 / field 9
does not exist.<!-- xahau.js packages/ripple-binary-codec/src/serdes/binary-parser.ts: readField -> definitions.field.fromString --> If you need to inspect or hand a NOP-padded blob to
anything other than `emit`/`prepare`/`etxn_fee_base`, run it through `prepare` first (or
build the clean blob some other way) and work with the output.

## Using NOPs in an emitted-transaction template

Both patterns below start from a template such as the `uint8_t txn[]` block the
[Transaction Builder](tools/tx-builder.md) generates, plus one helper macro that writes a run
of NOP bytes under a [guard](macros/guards.md):

```c
// Fill `len` bytes at `ptr` with the NOP field ID 0x99.
// Keep every NOP_FILL for one container (the top-level txn, or one nested
// object) to a combined total of at most 63 bytes.
#define NOP_FILL(ptr, len)                                              \
    do {                                                                \
        uint8_t* _p = (uint8_t*)(ptr);                                  \
        for (int _i = 0; GUARD(len), _i < (len); ++_i)                  \
            _p[_i] = 0x99U;                                             \
    } while (0)
```

### Optional field

Reserve the field in the template at its full encoded size — header **and** payload — as if
it were always present. To include it, write the payload as usual; to omit it, overwrite the
whole reservation with NOPs. `sfDestinationTag` is one header byte (`0x2E`: type `2` =
`UInt32`, field `14`) plus a 4-byte payload:

```c
/*    5,   xx, destinationtag           */   0x2EU, 0x00U, 0x00U, 0x00U, 0x00U,
```

```c
#define DTAG_OUT (txn + xx + 1U)          // payload, as the Transaction Builder defines it

if (has_tag)
    SET_UINT32(DTAG_OUT, tag);            // field present: header stays, payload filled
else
    NOP_FILL(DTAG_OUT - 1U, 5U);          // field absent: header + payload become NOPs
```

The rest of the template is untouched either way, so every other `*_OUT` offset remains
valid and `PREPARE_TXN()` / `emit` work unchanged.

### Variable-length blob

Reserve the field at its **maximum** payload size. At runtime write the header, the real
length prefix, and the data, then NOP-fill whatever is left of the reservation. `sfBlob`
(type `7` = `VL`, field `26`) needs a two-byte header, `0x70 0x1A`, because its field code is
16 or more; a payload of up to 192 bytes takes a one-byte length prefix:

```c
/*   51,   xx, blob (max 48 bytes)      */   0x70U, 0x1AU, 0x30U, 0,0,0,0,0,0,0,0,0,0,0,0,
                                             0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
                                             0,0,0,0,0,0,0,0,0,0,0,0,
```

```c
#define BLOB_MAX 48U
#define BLOB_OUT (txn + xx + 3U)          // start of the payload

// `data`/`n` are the bytes to send, with n <= BLOB_MAX (and n <= 192 for the
// single-byte length prefix used here).
*(BLOB_OUT - 1U) = (uint8_t)n;            // real length prefix
for (int i = 0; GUARD(BLOB_MAX), i < n; ++i)
    BLOB_OUT[i] = data[i];
NOP_FILL(BLOB_OUT + n, BLOB_MAX - n);     // unused tail, at most 48 NOPs
```

The parser reads `n` bytes of `sfBlob`, then treats each padding byte as a NOP and moves on
to the next field. If the blob can also be omitted entirely, NOP the header and prefix too,
exactly as in the optional-field pattern.

### Budget planning

- The **63-NOP limit is per container, cumulative** across everything you blank out in it.
  An omitted 5-byte `sfDestinationTag` and 40 bytes of blob padding in the same top-level
  transaction use 45 of the 63. Size your reservations so the worst case fits.
- Nested containers have their own budgets. A `sfMemoData` inside an `sfMemo` object can
  carry up to 63 NOPs of its own, independent of the top-level transaction, and each `sfMemo`
  in `sfMemos` is counted separately.
- Keep a VL reservation at or below 192 bytes if you want a fixed one-byte length prefix. A
  payload that crosses 192 bytes changes the prefix from one byte to two, shifting where the
  data starts.
- A NOP-padded template cannot be fed to `sto_subfield`, `sto_emplace`, or friends. If you
  need those, generate the clean blob first (for example with
  [`prepare`](api-reference/emit/prepare.md)) and run the `sto_*` calls on its output.
- When the padding you need exceeds the budget, build the transaction with
  [`sto_emplace`](api-reference/sto/sto_emplace.md) from a template that omits the variable
  field instead; `sto_emplace` inserts the field at its canonical position and returns a new
  buffer.

## Related documents

- [tools/tx-builder](tools/tx-builder.md) — generating the fixed-size template that NOPs
  are applied to.
- [api-reference/emit/emit](api-reference/emit/emit.md),
  [api-reference/emit/prepare](api-reference/emit/prepare.md),
  [api-reference/emit/etxn_fee_base](api-reference/emit/etxn_fee_base.md) — the APIs
  that accept NOP-padded blobs.
- [api-reference/sto](api-reference/sto/README.md) — the APIs that do not.
- [examples/emitted-transaction](examples/emitted-transaction.md) — a complete emit
  walkthrough.
- [macros/guards](macros/guards.md) — the `GUARD` macro used by `NOP_FILL`.
- [glossary](glossary.md)
