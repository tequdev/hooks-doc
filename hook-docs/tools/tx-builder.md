---
sidebarTitle: "Transaction Builder"
---

# Transaction Builder

A code generator that turns a transaction JSON into ready-to-paste C for
building and emitting that transaction from a Hook.

- **Tool:** [Xahau Hook Tx Builder](https://tx-builder.xahau.tools/)

## Why use it

Emitting a transaction requires laying out a serialized transaction template
by hand, computing each field's byte offset, and wiring up `etxn_details` /
`etxn_fee_base` in the right order. The Transaction Builder does this for you:
given any transaction JSON, it generates the template and pointer macros for
exactly the fields present, plus a `PREPARE_TXN()` macro that finishes the
fixed emit fields. It is the current recommended way to build emitted
transactions — prefer it over hand-writing a template.

## How to use it

1. Paste a transaction JSON into the tool, e.g. `{ "TransactionType": "AccountSet" }`.
2. Copy the generated `uint8_t txn[N]` block, the `*_OUT` macros, the helper
   macros, and `PREPARE_TXN()` into your hook.
3. Set the transaction-specific fields through the generated `*_OUT` pointer
   macros, using the matching helper macro for each field's type, e.g.
   `SET_NATIVE_AMOUNT(AMOUNT_OUT, drops)` for a native `Amount`, or
   `SET_ACCOUNT(DEST_OUT, accid)` for a 20-byte `Destination`.
4. Call `PREPARE_TXN()` to fill in the fixed emit fields (sequence numbers,
   `sfAccount`, `sfEmitDetails`, and the fee).
5. Call `emit(SBUF(hash), SBUF(txn))`.

## Worked example

Pasting `{ "TransactionType": "AccountSet" }` into the tool produces the
following block:

```c
// clang-format off
uint8_t txn[207] =
{
/* size, upto, field name               */
/*    3,    0, tt = AccountSet          */   0x12U, 0x00U, 0x03U,
/*    5,    3, flags                    */   0x22U, 0x00U, 0x00U, 0x00U, 0x00U,
/*    5,    8, sequence                 */   0x24U, 0x00U, 0x00U, 0x00U, 0x00U,
/*    6,   13, firstledgersequence      */   0x20U, 0x1AU, 0x00U, 0x00U, 0x00U, 0x00U,
/*    6,   19, lastledgersequence       */   0x20U, 0x1BU, 0x00U, 0x00U, 0x00U, 0x00U,
/*    9,   25, fee                      */   0x68U, 0x40U, 0x00U, 0x00U, 0x00U, 0x00U, 0x00U, 0x00U, 0x00U,
/*   35,   34, signingpubkey            */   0x73U, 0x21U, 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
/*   22,   69, account                  */   0x81U, 0x14U, 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
/*  116,   91, emit details             */ 
/*    0,  207,                          */ 
};
// clang-format on

// TX BUILDER
#define FLAGS_OUT (txn + 4U)
#define FLS_OUT (txn + 15U)
#define LLS_OUT (txn + 21U)
#define FEE_OUT (txn + 26U)
#define ACCOUNT_OUT (txn + 71U)
#define EMIT_OUT (txn + 91U)

#define COPY_20(ptr_to, ptr_from)                                              \
  do {                                                                         \
    unsigned char *buf_to = (unsigned char *)ptr_to;                           \
    unsigned char *buf_from = (unsigned char *)ptr_from;                       \
    *(uint64_t *)(buf_to + 0) = *(uint64_t *)(buf_from + 0);                   \
    *(uint64_t *)(buf_to + 8) = *(uint64_t *)(buf_from + 8);                   \
    *(uint32_t *)(buf_to + 16) = *(uint32_t *)(buf_from + 16);                 \
  } while (0)

#define FLIP_ENDIAN_32(value)                                                  \
  (uint32_t)(((value & 0xFFU) << 24) | ((value & 0xFF00U) << 8) |              \
             ((value & 0xFF0000U) >> 8) | ((value & 0xFF000000U) >> 24))

#define SET_UINT32(ptr, value) *((uint32_t *)(ptr)) = FLIP_ENDIAN_32(value);

#define SET_NATIVE_AMOUNT(ptr, amount)                                         \
  do {                                                                         \
    uint8_t *b = (ptr);                                                        \
    *b++ = 0b01000000 + ((amount >> 56) & 0b00111111);                         \
    *b++ = (amount >> 48) & 0xFFU;                                             \
    *b++ = (amount >> 40) & 0xFFU;                                             \
    *b++ = (amount >> 32) & 0xFFU;                                             \
    *b++ = (amount >> 24) & 0xFFU;                                             \
    *b++ = (amount >> 16) & 0xFFU;                                             \
    *b++ = (amount >> 8) & 0xFFU;                                              \
    *b++ = (amount >> 0) & 0xFFU;                                              \
  } while (0)

#define PREPARE_TXN()                                                          \
  do {                                                                         \
    etxn_reserve(1);                                                           \
    uint32_t fls = (uint32_t)ledger_seq() + 1;                                 \
    SET_UINT32(FLS_OUT, fls);                                                  \
    SET_UINT32(LLS_OUT, fls + 4);                                              \
    hook_account(ACCOUNT_OUT, 20);                                             \
    etxn_details(EMIT_OUT, 116U);                                              \
    int64_t fee = etxn_fee_base(SBUF(txn));                                    \
    SET_NATIVE_AMOUNT(FEE_OUT, fee);                                           \
    TRACEHEX(txn);                                                             \
  } while (0)
```

This particular template has no mutable `Amount` or `Destination` field
(`AccountSet` doesn't carry one), so the generated macro set for this example
is just `FLAGS_OUT`, `FLS_OUT`, `LLS_OUT`, `FEE_OUT`, `ACCOUNT_OUT`, and
`EMIT_OUT` — all of which `PREPARE_TXN()` fills in for you. A minimal hook
that emits this template as-is:

```c
#include "hookapi.h"

int64_t
hook(uint32_t reserved)
{
    _g(1, 1);

    // ... paste the generated txn[] block, *_OUT macros, helper macros,
    // and PREPARE_TXN() here ...

    PREPARE_TXN();
    uint8_t emithash[32];
    int64_t emit_result = emit(SBUF(emithash), SBUF(txn));
    if (emit_result != 32)
        rollback(SBUF("tx-builder: emit failed"), 1);

    accept(SBUF("tx-builder: ok"), 0);
    return 0;
}
```

For a transaction type with a mutable `Amount` or `Destination` (e.g.
`Payment`), the tool additionally generates `AMOUNT_OUT` / `DEST_OUT` macros;
set them before calling `PREPARE_TXN()`, e.g.
`SET_NATIVE_AMOUNT(AMOUNT_OUT, 1); SET_ACCOUNT(DEST_OUT, to_accid);`.

## Generated macros reference

### `*_OUT` pointer macros

Each `*_OUT` macro is a pointer into `txn`, positioned past that field's
serialized field-code prefix, i.e. pointing directly at the field's value
bytes. One is generated per mutable field present in the pasted JSON. Common
examples:

| Macro | Field |
|---|---|
| `TT_OUT` | `TransactionType` |
| `FLAGS_OUT` | `Flags` |
| `FEE_OUT` | `Fee` |
| `AMOUNT_OUT` | `Amount` |
| `ACCOUNT_OUT` | `Account` |
| `DEST_OUT` | `Destination` |
| `DTAG_OUT` | `DestinationTag` |
| `FLS_OUT` | `FirstLedgerSequence` |
| `LLS_OUT` | `LastLedgerSequence` |
| `EMIT_OUT` | `EmitDetails` |

### Helper macros

```c
#define COPY_20(ptr_to, ptr_from)                                              \
  do {                                                                         \
    unsigned char *buf_to = (unsigned char *)ptr_to;                           \
    unsigned char *buf_from = (unsigned char *)ptr_from;                       \
    *(uint64_t *)(buf_to + 0) = *(uint64_t *)(buf_from + 0);                   \
    *(uint64_t *)(buf_to + 8) = *(uint64_t *)(buf_from + 8);                   \
    *(uint32_t *)(buf_to + 16) = *(uint32_t *)(buf_from + 16);                 \
  } while (0)

#define FLIP_ENDIAN_32(value)                                                  \
  (uint32_t)(((value & 0xFFU) << 24) | ((value & 0xFF00U) << 8) |              \
             ((value & 0xFF0000U) >> 8) | ((value & 0xFF000000U) >> 24))

#define SET_UINT32(ptr, value) *((uint32_t *)(ptr)) = FLIP_ENDIAN_32(value);

#define SET_NATIVE_AMOUNT(ptr, amount)                                         \
  do {                                                                         \
    uint8_t *b = (ptr);                                                        \
    *b++ = 0b01000000 + ((amount >> 56) & 0b00111111);                         \
    *b++ = (amount >> 48) & 0xFFU;                                             \
    *b++ = (amount >> 40) & 0xFFU;                                             \
    *b++ = (amount >> 32) & 0xFFU;                                             \
    *b++ = (amount >> 24) & 0xFFU;                                             \
    *b++ = (amount >> 16) & 0xFFU;                                             \
    *b++ = (amount >> 8) & 0xFFU;                                              \
    *b++ = (amount >> 0) & 0xFFU;                                              \
  } while (0)
```

- **`COPY_20(ptr_to, ptr_from)`** — copies 20 bytes (an `AccountID`) from
  `ptr_from` to `ptr_to` using three word-sized loads/stores.
- **`FLIP_ENDIAN_32(value)`** — byte-swaps a 32-bit value, expression macro.
- **`SET_UINT32(ptr, value)`** — writes `value` at `ptr` as a big-endian
  `uint32_t`, used for `FLS_OUT` / `LLS_OUT` and similar 32-bit fields.
- **`SET_NATIVE_AMOUNT(ptr, amount)`** — writes an 8-byte native-XRP/XAH
  `Amount` (drops) at `ptr`, including the non-XRP-bit-clear high bit
  convention (`0b01000000 | top6bits`).
- **`SET_ACCOUNT(ptr_to, ptr_from)`** — generated for 20-byte `AccountID`
  fields such as `Account` and `Destination`; a thin wrapper around
  `COPY_20(ptr_to, ptr_from)`.
- **`SET_IOU_AMOUNT(ptr, issuer, currency, amount_xfl)`** — generated when the
  JSON's `Amount` is a non-native (IOU) amount object; writes the 48-byte IOU
  `Amount` (XFL value, currency code, issuer `AccountID`) at `ptr`.

### `PREPARE_TXN()`

```c
#define PREPARE_TXN()                                                          \
  do {                                                                         \
    etxn_reserve(1);                                                           \
    uint32_t fls = (uint32_t)ledger_seq() + 1;                                 \
    SET_UINT32(FLS_OUT, fls);                                                  \
    SET_UINT32(LLS_OUT, fls + 4);                                              \
    hook_account(ACCOUNT_OUT, 20);                                             \
    etxn_details(EMIT_OUT, 116U);                                              \
    int64_t fee = etxn_fee_base(SBUF(txn));                                    \
    SET_NATIVE_AMOUNT(FEE_OUT, fee);                                           \
    TRACEHEX(txn);                                                             \
  } while (0)
```

## What `PREPARE_TXN()` does / caveats

- **Calls `etxn_reserve(1)` for you.** Do not call `etxn_reserve` yourself
  before or after using this macro — a second call returns `ALREADY_SET`.
  This means a single `PREPARE_TXN()` call covers exactly one emitted
  transaction; if you need to emit more than one, you cannot use the
  generated `PREPARE_TXN()` as-is (it always reserves `1`).
- **Sets `FirstLedgerSequence` / `LastLedgerSequence`.** `FirstLedgerSequence`
  is `ledger_seq() + 1`; `LastLedgerSequence` is `FirstLedgerSequence + 4`,
  giving the emitted transaction a five-ledger validity window.
- **Fills `sfAccount` via `hook_account`** — the emitting account is always
  the hook's own account.
- **Writes `sfEmitDetails` via `etxn_details`.** The size passed, `116U`, is
  the `EmitDetails` size for a hook that does **not** export `cbak`. A hook
  that does export `cbak` needs `138U` instead — the tool bakes in the
  correct size based on what you tell it, so regenerate (or hand-adjust) the
  block if you add/remove a callback.
- **`etxn_details` is called before `etxn_fee_base`.** This ordering is
  required: `etxn_fee_base` measures the fee over the whole template
  including `EmitDetails`, so `EmitDetails` must already be written.
- **Computes the fee via `etxn_fee_base`** over the whole template and writes
  it to `FEE_OUT` — never hardcode a fee.
- **`TRACEHEX(txn)`** is debug tracing from `hook/macro.h`; it compiles out
  under release builds (`NDEBUG`).

## Related documents

- [Emit APIs](../api-reference/emit/README.md)
- [Emitted transaction](../examples/emitted-transaction.md)
- [Best practices](../best-practices.md)
- [Tools](README.md)
