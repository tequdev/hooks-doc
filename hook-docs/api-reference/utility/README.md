# Utility APIs

Helper functions for cryptography, address conversion, keylet computation,
serialized-object (STO) inspection/editing, and debug tracing. These functions do
not read or mutate ledger state directly (with the exception of `util_keylet`,
which consults the active `Rules`/amendments to decide which keylet types are
available). They are pure helpers you call to prepare data for the state, slot,
emit, and transaction APIs documented elsewhere.

All 13 functions in this category are always available (no amendment gate on the
API itself; a few `util_keylet` *keylet types* are individually amendment-gated —
see below). This page covers the five `util_*` functions; the STO helpers and the
trace helpers that used to share this page now have their own pages: see
[STO APIs](../sto/README.md) and [Trace APIs](../trace/README.md).

A note on the calling convention: every `*_ptr`/`*_len` pair refers to a region of
the hook's own linear WASM memory. Any pointer/length pair that is out of bounds of
that memory returns [`OUT_OF_BOUNDS`](#return-values-and-error-codes) (`-1`). Pointer
values are 32-bit offsets into WASM memory, not host pointers.

---

## Return values and error codes

Utility functions follow the standard hook convention: a **non-negative** return is a
result (a count of bytes written, a packed offset/length, a boolean `0`/`1`, or a
keylet length of `34`), and a **negative** return is an error code. Always test
`result < 0` before using the value. Codes referenced above:

| Code | Value | Code | Value |
|---|---|---|---|
| `OUT_OF_BOUNDS` | -1 | `INVALID_FIELD` | -17 |
| `INTERNAL_ERROR` | -2 | `PARSE_ERROR` | -18 |
| `TOO_BIG` | -3 | `NO_SUCH_KEYLET` | -21 |
| `TOO_SMALL` | -4 | `INVALID_KEY` | -41 |
| `DOESNT_EXIST` | -5 | `MEM_OVERLAP` | -43 |
| `INVALID_ARGUMENT` | -7 | | |

See [`error.h` / the full error table](../../glossary.md) for the complete list.

---

## Index

| Function | Purpose |
|---|---|
| [`util_raddr`](util_raddr.md) | 20-byte AccountID → base58 r-address string. |
| [`util_accid`](util_accid.md) | base58 r-address string → 20-byte AccountID. |
| [`util_verify`](util_verify.md) | Verify a secp256k1/ed25519 signature over a payload. |
| [`util_sha512h`](util_sha512h.md) | SHA-512Half (first 32 bytes of SHA-512) of a buffer. |
| [`util_keylet`](util_keylet.md) | Compute a ledger keylet of a given `KEYLET_*` type. |

See also the [STO APIs](../sto/README.md) index (`sto_validate`, `sto_subfield`,
`sto_subarray`, `sto_emplace`, `sto_erase`) and the [Trace APIs](../trace/README.md)
index (`trace`, `trace_num`, `trace_float`).

## Related documents

- [Hook API reference index](../../README.md)
- [Overview](../../overview.md) and [Glossary](../../glossary.md)
- [Helper macros](../../macros/README.md) — `SBUF`, `SUB_OFFSET`/`SUB_LENGTH`, `TRACE*`,
  `BUFFER_EQUAL_*`, integer conversion helpers
- [Ledger and slot APIs](../slot/README.md) — `slot_set`, `slot_subfield`,
  `ledger_keylet` (keylet consumers)
- [State APIs](../state/README.md) — `state`, `state_foreign` (namespace/keylet usage)
- [Float and Amount APIs](../float/README.md) — XFL values used by `trace_float`,
  `float_sto`
- [Emit and etxn APIs](../emit/README.md) — assembling and emitting transactions built
  with `sto_emplace`
- [Best practices](../../best-practices.md)
