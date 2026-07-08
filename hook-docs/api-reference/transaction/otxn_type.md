# otxn_type

**Summary.** Return the transaction type (a `TxType` numeric code) of the originating
transaction.

**Signature.**

```c
int64_t otxn_type();
```

**Parameters.** None.

**Return value.** The transaction type as a non-negative integer — the same numeric codes
listed in `hook/tts.h`, for example `ttPAYMENT` (0), `ttESCROW_CREATE` (1), `ttHOOK_SET`
(22), `ttURITOKEN_MINT` (45), `ttINVOKE` (99). Does not return an error.

**Common failure patterns.**
- None — it is a pure accessor. If you compare against the wrong constant set, note the
  codes are the `tt*` values from `hook/tts.h`, not the SField `sfTransactionType` field
  code.

**Caveats / notes.**
- During a failed-emit callback the value comes from the emitted transaction's
  `sfTransactionType` (see [The originating transaction](README.md#the-originating-transaction)).
- Use the `tt*` constants from `hook/tts.h` rather than hard-coding integers where you can.

**Minimal example.**

```c
int64_t tt = otxn_type();   // e.g. 0 for a Payment
```

**Practical example (a payment filter, mirrors `control.md`'s `rollback` example).**

```c
#define ttPAYMENT 0
int64_t hook(uint32_t reserved)
{
    _g(1, 1);
    // Reject anything that is not a Payment.
    if (otxn_type() != ttPAYMENT)
        rollback(SBUF("only payments accepted"), __LINE__);
    accept(SBUF("payment ok"), 0);
}
```

**Related APIs.** [`otxn_field`](otxn_field.md), [`otxn_id`](otxn_id.md); tx-type constants in
`hook/tts.h`.
