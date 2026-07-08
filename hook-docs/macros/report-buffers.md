# Report-buffer builders

These construct a human-readable C-string containing a label and a base-10 integer —
useful for `trace` output or for a message passed to `accept`/`rollback`.

## RBUF / RBUF2

```c
#define RBUF(buf, out_len, str, num) /* declares `buf` and `out_len`, fills them */
#define RBUF2(buff, out_len, str, num, str2, num2) /* two label+number pairs */
```

Both are **statement/declaration macros**: they *declare* the named buffer and an
`int out_len` for you and then populate them, so use them at the point you want those
variables to come into scope — not inside an expression, and not with a name that
already exists. `RBUF` emits `str` followed by the decimal form of `num`; `RBUF2`
appends a second `str2`+`num2`. Negative numbers get a leading `-`. The buffer is sized
`sizeof(str) + 21` (a 64-bit integer is at most 20 digits plus sign), and NUL
terminated; `out_len` is the string length excluding the NUL. Their internal digit
loops are guarded with `GUARDM`.

```c
// declares `msg` (a char array) and `msg_len`:
RBUF(msg, msg_len, "ledger seq = ", ledger_seq());
trace(SBUF("info"), msg, msg_len, 0);   // -> "ledger seq = 1234567"

RBUF2(rep, rep_len, "in=", incoming, " out=", outgoing);
accept(rep, rep_len, 0);
```

Caveat: because they declare variables, you cannot call `RBUF(x, n, ...)` twice with
the same `x`/`n` in the same scope. Pick fresh names or open a new block.
