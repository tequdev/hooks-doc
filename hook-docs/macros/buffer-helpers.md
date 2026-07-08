# Buffer pair helpers

The API takes buffers as `(ptr, len)` pairs. These macros produce both halves from a
single name.

## SBUF

```c
#define SBUF(str) (uint32_t)(str), sizeof(str)
```

Expand a buffer/array name into the `ptr, len` pair the API expects. Expression (an
argument list fragment). **The single most-used macro in hook code.**

```c
uint8_t acc[20];
hook_account(SBUF(acc));            // -> hook_account((uint32_t)acc, 20)
accept(SBUF("done"), 0);            // -> accept((uint32_t)"done", 5, 0)
```

**`sizeof` pitfall (important):** `SBUF` only works on arrays and string literals.
`sizeof` on a pointer is 4, so `SBUF(ptr)` passes length 4 — a common and silent bug.
When you have a pointer plus a separate length, pass them directly (`ptr, len`) instead
of `SBUF`. Note also that `SBUF("literal")` includes the trailing NUL in the length;
that is usually what you want for a message but *not* what you want when comparing
against on-ledger bytes — see [`BUFFER_EQUAL_STR`](buffer-comparison.md#buffer_equal_str_guard--buffer_equal_str--buffer_equal) which subtracts 1.

## SVAR

```c
#define SVAR(x) &x, sizeof(x)
```

Like `SBUF` but for a scalar variable: yields its **address** and size. Expression.
Used to read/write a fixed-size value directly into an API buffer without declaring an
array.

```c
uint64_t counter;
state(SVAR(counter), SBUF("count"));   // read 8 bytes into `counter`
counter++;
state_set(SVAR(counter), SBUF("count"));
```

Because it takes `&x`, `x` must be an addressable lvalue. `sizeof` here is the type
size (e.g. 8 for a `uint64_t`), which is exactly what you want for scalar state values.

## CLEARBUF

```c
#define CLEARBUF(b)\
{\
    for (int x = 0; GUARD(sizeof(b)), x < sizeof(b); ++x)\
        b[x] = 0;\
}
```

Zero a buffer. **Statement** (contains a guarded loop). Because it uses `sizeof(b)`,
`b` must be an array — not a pointer. The internal loop is already guarded, so you do
not add your own guard.

```c
uint8_t key[32];
CLEARBUF(key);          // all 32 bytes set to 0
```

## BUFFER_SWAP

```c
#define BUFFER_SWAP(x,y)\
{\
    uint8_t* z = x;\
    x = y;\
    y = z;\
}
```

Swap two `uint8_t*` pointers. **Statement.** It swaps the *pointers*, not the buffer
contents, so `x` and `y` must be assignable pointer variables (not arrays). Handy for
double-buffering when repeatedly transforming an STO with
[`sto_emplace`](../api-reference/sto/sto_emplace.md)/[`sto_erase`](../api-reference/sto/sto_erase.md).

```c
uint8_t bufA[1024], bufB[1024];
uint8_t *in = bufA, *out = bufB;
// after building into `out`, swap so the result becomes the next input:
BUFFER_SWAP(in, out);
```
