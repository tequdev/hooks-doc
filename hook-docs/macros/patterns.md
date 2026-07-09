---
sidebarTitle: "Recommended patterns"
---

# Recommended patterns

The macros above are building blocks; these are the idioms that combine them safely.
Most are lifted directly from the xahaud test hooks.
<!-- src/test/app/SetHook_test.cpp -->

## 1. Always check return values (negative = error)

Every API function returns a **non-negative** result or a **negative**
[error code](../glossary.md). Test `< 0` before trusting a value, and turn a failure into
a `rollback`:

```c
int64_t len = otxn_field(SBUF(buf), sfAmount);
if (len < 0)
    NOPE("could not read amount");      // rollback with a message + line number
```

For terse invariant checks (especially in tests) the same idea reads as an `ASSERT`
against the *expected* value, which captures both "call failed" and "call returned the
wrong thing":

```c
ASSERT(hook_account(SBUF(acc)) == 20);
ASSERT(state_set(SVAR(counter), SBUF("count")) == sizeof(counter));
```

Do **not** compare against `SUCCESS` (0) blindly: many calls return a positive
byte-count on success (e.g. 20, 32, 34), so `== 0` would be wrong. Match the specific
expected count, or test `>= 0`/`> 0`.

## 2. Size output buffers, and check what was written

APIs that write into a buffer return the number of bytes written (or `TOO_SMALL` if the
buffer was too small). Declare the buffer at the documented maximum and use the return
value as the true length:

```c
uint8_t raddr[50];                              // r-addresses fit in ~35 bytes
int64_t rlen = util_raddr(SBUF(raddr), SBUF(acc));
if (rlen < 0)
    NOPE("raddr failed");
// use raddr[0 .. rlen)
```

When reading a value whose size you expect exactly (an AccountID, a uint256), assert the
length before using it, so a short/absent field cannot make you read stale bytes:

```c
if (sto_subfield(SBUF(sto), sfAccount) is 20 bytes) { ... }  // check SUB_LENGTH == 20
```

## 3. Building a 32-byte state key from a short label

State keys are 32-byte (uint256) buffers, but you usually key on something shorter (a
counter name, an account id). The test hooks build a fixed 32-byte key by starting from
a zeroed buffer and writing the meaningful bytes into it — the rest stays zero, giving a
stable, collision-free key:

```c
uint8_t key[32];
CLEARBUF(key);                       // 32 zero bytes
// place a 20-byte account id at the end of the key:
BYTES20_TO_BUF(key + 12, some_accid);
// or tag a numeric key:
UINT32_TO_BUF(key + 28, item_id);

uint8_t val[8];
if (state(SBUF(val), SBUF(key)) < 0)
    CLEARBUF(val);                   // treat "missing" as zero
```

Two things make this safe: `CLEARBUF` guarantees deterministic padding (never
uninitialized stack bytes, which would make the key unreproducible), and writing the
distinguishing bytes at a fixed position keeps different logical keys from colliding.
Note `state`/`state_set` accept keys shorter than 32 bytes too, but a full, explicitly
padded 32-byte key is the least surprising.

## 4. Early-exit ("done") style for the common path

A hook that only cares about certain transactions should exit early on everything else
rather than nesting the whole body in an `if`. `DONE*` accepts (transaction proceeds)
and `NOPE`/`REQUIRE` rejects:

```c
int64_t hook(uint32_t reserved)
{
    if (otxn_type() != ttPAYMENT)
        DONEEMPTY();                 // not our concern: accept unchanged

    REQUIRE(otxn_field(SBUF(dst), sfDestination) == 20, "no destination");

    // ... main logic for payments only ...

    DONEMSG("payment handled");
}
```

This keeps the interesting logic un-indented and makes each exit's reason (and source
line) obvious.

## 5. Trace-based debugging

Because a WASM hook has no stdout, `trace*` (via the `TRACE*` macros) is the debugger.
Sprinkle labelled traces around the value you are unsure of; they compile away under
`-DNDEBUG` so there is no cost in a release build:

```c
TRACEVAR(drops);          // "drops: 1000000"
TRACEHEX(dst);            // "dst: <hex account id>"
TRACEXFL(price_xfl);      // "price_xfl: Float 12345*10^(-2)"
```

Remember the caveats from [`trace`](../api-reference/trace/trace.md): output only appears
at the server's trace log level (so it is typically inert on validators), and labels/data
are truncated. Traces never affect the transaction outcome — they are purely diagnostic.
