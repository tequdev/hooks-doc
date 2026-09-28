# Buffer comparison

Fixed-width and variable-width equality checks, plus an ordering comparison for account
ids. The fixed-width ones (`_20`/`_32`/`_64`) are **expressions** returning a boolean;
the guarded and account ones are **statements** that write into an output variable.

## BUFFER_EQUAL_20 / BUFFER_EQUAL_32 / BUFFER_EQUAL_64

```c
#define BUFFER_EQUAL_20(buf1, buf2) ( /* 2×uint64 + 1×uint32 compare */ )
#define BUFFER_EQUAL_32(buf1, buf2) ( /* 4×uint64 compare */ )
#define BUFFER_EQUAL_64(buf1, buf2) ( /* 8×uint64 compare */ )
```

Compare 20, 32, or 64 bytes for exact equality. **Expressions** — usable directly in an
`if`. They reinterpret the buffers as `uint64_t*`/`uint32_t*` and compare word by word,
so they are cheap but require that each buffer really holds at least that many bytes.

- `BUFFER_EQUAL_20` — for AccountIDs (20 bytes).
- `BUFFER_EQUAL_32` — for uint256 values: hashes, keys, namespaces, keylet indices.
- `BUFFER_EQUAL_64` — for 64-byte blobs.

```c
uint8_t hash1[32], hash2[32];
emit(SBUF(hash1), SBUF(tx));
emit(SBUF(hash2), SBUF(tx2));
if (!BUFFER_EQUAL_32(hash1, hash2))   // example usage
    accept(SBUF("distinct emit hashes"), 0);
```
<!-- original inline comment: "real usage from SetHook_test.cpp" -->

Caveat: the word-at-a-time reinterpretation assumes the buffers are large enough;
passing a buffer shorter than the fixed width reads out of bounds in your own memory.

## BUFFER_EQUAL_GUARD

```c
#define BUFFER_EQUAL_GUARD(output, buf1, buf1len, buf2, buf2len, n)\
{\
    output = ((buf1len) == (buf2len) ? 1 : 0);\
    for (int x = 0; GUARDM( (buf2len) * (n), 1 ), output && x < (buf2len); ++x)\
        output = *((uint8_t*)(buf1) + x) == *((uint8_t*)(buf2) + x);\
}
```

Variable-length, guarded byte comparison. **Statement** — it assigns the boolean result
to `output` (which you declare). `buf1len` may be dynamic but **`buf2len` must be a
compile-time constant** (it feeds the guard budget). `n` is how many times this line
executes at runtime (e.g. the surrounding loop count); pass `1` if it runs once. The
loop early-exits as soon as a byte differs.

```c
int equal = 0;
BUFFER_EQUAL_GUARD(equal, incoming, incoming_len, "EXPECTED", 8, 1);
if (equal) { /* ... */ }
```

## BUFFER_EQUAL_STR_GUARD / BUFFER_EQUAL_STR / BUFFER_EQUAL

```c
#define BUFFER_EQUAL_STR_GUARD(output, buf1, buf1len, str, n)\
    BUFFER_EQUAL_GUARD(output, buf1, buf1len, str, (sizeof(str)-1), n)

#define BUFFER_EQUAL_STR(output, buf1, buf1len, str)\
    BUFFER_EQUAL_GUARD(output, buf1, buf1len, str, (sizeof(str)-1), 1)

#define BUFFER_EQUAL(output, buf1, buf2, compare_len)\
    BUFFER_EQUAL_GUARD(output, buf1, compare_len, buf2, compare_len, 1)
```

Convenience wrappers over `BUFFER_EQUAL_GUARD`, all **statements**:

- `BUFFER_EQUAL_STR` / `BUFFER_EQUAL_STR_GUARD` compare a runtime buffer against a
  **string literal**, using `sizeof(str)-1` so the literal's trailing NUL is excluded.
  Use `_GUARD` when the comparison sits inside a loop (pass the loop count as `n`).
- `BUFFER_EQUAL` compares two buffers of the **same** `compare_len`.

```c
int is_usd = 0;
BUFFER_EQUAL_STR(is_usd, cur_ptr, cur_len, "USD");   // note: NUL excluded
```

## ACCOUNT_COMPARE

```c
#define ACCOUNT_COMPARE(compare_result, buf1, buf2)\
{\
    compare_result = 0;\
    for (int i = 0; GUARD(20), i < 20; ++i) { /* set -1 / 0 / 1 */ }\
}
```

Lexicographically compare two 20-byte account ids. **Statement** — writes `-1`
(`buf1 < buf2`), `0` (equal), or `1` (`buf1 > buf2`) into `compare_result`. The
canonical use is deciding trustline low/high account order.

```c
int cmp;
ACCOUNT_COMPARE(cmp, acc_a, acc_b);
uint8_t* low  = (cmp < 0) ? acc_a : acc_b;   // low account of the pair
uint8_t* high = (cmp < 0) ? acc_b : acc_a;
```
