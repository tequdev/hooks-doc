# Integer ↔ buffer (big-endian)

XRPL serializes integers big-endian (network byte order). These macros write and read
integers to/from byte buffers in that order. The `*_TO_BUF` macros are **statements**
(they write into a buffer); the `*_FROM_BUF` macros are **expressions** (they return the
value). They cover 8/16/32/64-bit unsigned plus signed 64-bit.

```c
#define UINT8_TO_BUF(buf, i)  { /* write 1 byte */ }
#define UINT16_TO_BUF(buf, i) { /* write 2 bytes, MSB first */ }
#define UINT32_TO_BUF(buf, i) { /* write 4 bytes, MSB first */ }
#define UINT64_TO_BUF(buf, i) { /* write 8 bytes, MSB first */ }
#define INT64_TO_BUF(buf, i)  { /* 8 bytes; sign in top bit of byte 0 */ }

#define UINT8_FROM_BUF(buf)  /* -> uint8  */
#define UINT16_FROM_BUF(buf) /* -> uint64 */
#define UINT32_FROM_BUF(buf) /* -> uint64 */
#define UINT64_FROM_BUF(buf) /* -> uint64 */
#define INT64_FROM_BUF(buf)  /* -> int64; reads sign from top bit */
```

Notes and caveats:

- The `TO_BUF` macros write exactly 1/2/4/8 bytes starting at `buf`; the destination
  must have room. They cast `buf` to `unsigned char*` internally, so any pointer type
  is fine.
- `UINT16/32/64_FROM_BUF` return a `uint64_t` regardless of width (the upper bytes are
  zero for the narrower reads). Assign to an appropriately sized variable.
- **Signed handling** is non-standard: `INT64_TO_BUF` stores magnitude in the low 63
  bits and sets the top bit of byte 0 for negatives; `INT64_FROM_BUF` reverses that
  (sign-magnitude, *not* two's complement). `UINT8_TO_BUF` also OR-s in `0x80` when the
  value is negative. Use these only paired with each other, not to interoperate with
  two's-complement encodings.

```c
uint8_t buf[8];
UINT64_TO_BUF(buf, 0x0123456789ABCDEFULL);   // buf[0]=0x01 ... buf[7]=0xEF
uint64_t back = UINT64_FROM_BUF(buf);         // 0x0123456789ABCDEF
```

---

## Byte-array copy and endian flip

### BYTES20_TO_BUF / BYTES20_FROM_BUF / BYTES32_TO_BUF / BYTES32_FROM_BUF

```c
#define BYTES20_TO_BUF(buf, i)   { /* copy 20 bytes buf<-i via 2×u64 + 1×u32 */ }
#define BYTES20_FROM_BUF(buf, i) { /* copy 20 bytes i<-buf */ }
#define BYTES32_TO_BUF(buf, i)   { /* copy 32 bytes via 4×u64 */ }
#define BYTES32_FROM_BUF(buf, i) { /* copy 32 bytes */ }
```

Fixed-size 20- or 32-byte memory copies, done as aligned word moves. **Statements.**
`_TO_BUF` copies `i -> buf`; `_FROM_BUF` copies `buf -> i`. Both operands must be at
least the stated width. These are a fast alternative to a guarded byte loop when the
length is exactly 20 (AccountID) or 32 (uint256).

```c
uint8_t dst[32];
BYTES32_TO_BUF(dst, src);   // dst now equals the 32 bytes at src
```

### FLIP_ENDIAN_32 / FLIP_ENDIAN_64

```c
#define FLIP_ENDIAN_32(n) /* byte-reverse a uint32 */
#define FLIP_ENDIAN_64(n) /* byte-reverse a uint64 */
```

Reverse the byte order of a 32- or 64-bit value. **Expressions.** Use when you must
convert between the host/native ordering of a WASM value and the big-endian ordering the
ledger uses — though for reading/writing serialized fields the
`UINT*_FROM_BUF`/`UINT*_TO_BUF` macros above already handle endianness, so reach for
`FLIP_ENDIAN_*` only when you hold a value in a register and need it byte-reversed.
