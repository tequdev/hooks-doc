# float_sto

**Summary.** Serialize an XFL into the ledger's `Amount` wire format — native (XAH) or an
IOU with currency and issuer — optionally prefixed with an `sfXxx` field header.

**Signature.**

```c
int64_t float_sto(uint32_t write_ptr, uint32_t write_len,
                  uint32_t cread_ptr, uint32_t cread_len,
                  uint32_t iread_ptr, uint32_t iread_len,
                  int64_t float1, uint32_t field_code);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `write_ptr` | `uint32_t` | Destination buffer for the serialized amount. |
| `write_len` | `uint32_t` | Destination buffer length. |
| `cread_ptr` | `uint32_t` | Pointer to the currency code, or `0` for native. |
| `cread_len` | `uint32_t` | Currency length: `3` or `20`, or `0` for native/short. |
| `iread_ptr` | `uint32_t` | Pointer to the 20-byte issuer AccountID, or `0` for native. |
| `iread_len` | `uint32_t` | Issuer length: `20`, or `0` for native/short. |
| `float1` | `int64_t` | The XFL amount to serialize. |
| `field_code` | `uint32_t` | Output field selector — see below. |

**`field_code` values (verified in `HookAPI::float_sto`).**

- `0` — serialize a **native (XAH) drops** amount (8 bytes, no currency/issuer). Currency and
  issuer must both be absent.
- `0xFFFFFFFF` — **short** form: just the 8-byte serialized number, with no field header and
  no currency/issuer.
- otherwise — `(type << 16) | field`, an `sfXxx` code (for example `sfAmount = (6<<16)|1`).
  The output is the field-header byte(s) + 8-byte number + 20-byte currency + 20-byte issuer,
  so currency and issuer are **required**.

**Return value.** The number of bytes written on success (e.g. `49` for `sfAmount` with a
common field code, `50` for an uncommon one such as `sfDeliveredAmount`, `8` for the short/XRP
forms). Errors: `OUT_OF_BOUNDS` (-1) for a bad buffer; `INVALID_ARGUMENT` (-7) for
inconsistent arguments (currency without issuer or vice-versa, a non-`0`/non-`20` issuer
length, a currency length other than `3`/`20`, issuer supplied with a native/short field code,
or a native/short field code with no currency/issuer for a would-be IOU); `TOO_SMALL` (-4) if
`write_len` is smaller than the amount needs; `XFL_OVERFLOW` (-30) if a native amount's
exponent is out of drops range; `INVALID_FLOAT` (-10024) if `float1` is not a valid XFL.

**Common failure patterns.**
- Passing an issuer but no currency (or vice-versa) → `INVALID_ARGUMENT`.
- Using `field_code == 0` (XRP) together with a currency/issuer → `INVALID_ARGUMENT`.
- A destination buffer too small for the 49/50-byte IOU form → `TOO_SMALL`.

**Caveats / notes.**
- Currency may be given as a 3-byte ISO code (e.g. `"USD"`) or a full 20-byte currency; the
  serialized output always contains the full 20-byte currency.
- The short form (`0xFFFFFFFF`) is convenient when you already have a field header laid out in
  your buffer and only need the 8 amount bytes overwritten.
- Round-trips with [`float_sto_set`](float_sto_set.md).

**Minimal example.**

```c
uint8_t buf[49];
uint8_t issuer[20];
hook_account((uint32_t)issuer, 20);
uint8_t cur[3] = {'U','S','D'};
int64_t n = float_sto((uint32_t)buf, sizeof(buf),
                      (uint32_t)cur, 3, (uint32_t)issuer, 20,
                      amount, /* sfAmount */ (6U << 16U) + 1U);
```

**Practical example (adapted from `SetHook_test.cpp`, "Test float_sto").**

```c
uint8_t buf[50];
uint8_t iss[20];
hook_account((uint32_t)iss, 20);
uint8_t cur[3] = {'U','S','D'};

// invalid XFL is rejected
ASSERT(float_sto((uint32_t)buf, sizeof(buf), (uint32_t)cur, 3,
                 (uint32_t)iss, 20, -1, (6U<<16)+1U) == INVALID_FLOAT);

// serialize XFL 1234567.0 as an sfAmount IOU -> 49 bytes
int64_t n = float_sto((uint32_t)buf, sizeof(buf), (uint32_t)cur, 3,
                      (uint32_t)iss, 20, 6198187654261802496ULL, (6U<<16)+1U);
ASSERT(n == 49);
ASSERT(buf[0] == 0x61U);   // sfAmount field header

// round-trip it back to the same XFL
ASSERT(float_sto_set(buf, 49) == 6198187654261802496ULL);
```

**Related APIs.** [`float_sto_set`](float_sto_set.md),
[`slot_float`](../slot/slot_float.md),
[`hook_account`](../control/hook_account.md).
