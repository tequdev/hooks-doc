# util_keylet

**Summary.** Compute a 34-byte serialized keylet (2-byte ledger-object type + 32-byte
index) for a given `KEYLET_*` type. The resulting 34-byte buffer is exactly what
[`slot_set`](../slot/slot_set.md) and [`state`/`state_foreign`](../state/README.md)-style keylet
consumers expect. Because different ledger objects are keyed on different inputs
(an account, two accounts, an account + sequence, a 256-bit id, etc.), the six generic
arguments `a`..`f` are interpreted per keylet type.

**Signature.**

```c
int64_t util_keylet(
    uint32_t write_ptr,     // 34-byte output buffer
    uint32_t write_len,     // must be >= 34
    uint32_t keylet_type,   // one of the KEYLET_* constants
    uint32_t a, uint32_t b, // argument slot 1 (usually ptr, len)
    uint32_t c, uint32_t d, // argument slot 2
    uint32_t e, uint32_t f);// argument slot 3
```

**General rules.**
- `write_len` must be at least 34; on success exactly 34 bytes are written and `34`
  is returned.
- Arguments come in pairs. A pair usually means `(ptr, len)`, but for numeric inputs
  a pair can mean a 64-bit value split as `(high32, low32)`, or a single 32-bit value
  with its partner set to 0. Unused argument slots **must be 0** — passing a non-zero
  value in an unused slot returns `INVALID_ARGUMENT`.
- Buffer lengths are checked exactly (e.g. an AccountID pair must have `len == 20`).

**`KEYLET_*` type constants** (from `hook/hookapi.h`):

| Constant | Value | Constant | Value |
|---|---|---|---|
| `KEYLET_HOOK` | 1 | `KEYLET_DEPOSIT_PREAUTH` | 16 |
| `KEYLET_HOOK_STATE` | 2 | `KEYLET_UNCHECKED` | 17 |
| `KEYLET_ACCOUNT` | 3 | `KEYLET_OWNER_DIR` | 18 |
| `KEYLET_AMENDMENTS` | 4 | `KEYLET_PAGE` | 19 |
| `KEYLET_CHILD` | 5 | `KEYLET_ESCROW` | 20 |
| `KEYLET_SKIP` | 6 | `KEYLET_PAYCHAN` | 21 |
| `KEYLET_FEES` | 7 | `KEYLET_EMITTED` | 22 |
| `KEYLET_NEGATIVE_UNL` | 8 | `KEYLET_NFT_OFFER` | 23 |
| `KEYLET_LINE` | 9 | `KEYLET_HOOK_DEFINITION` | 24 |
| `KEYLET_OFFER` | 10 | `KEYLET_HOOK_STATE_DIR` | 25 |
| `KEYLET_QUALITY` | 11 | `KEYLET_CRON` | 26 |
| `KEYLET_EMITTED_DIR` | 12 | | |
| `KEYLET_TICKET` | 13 | | |
| `KEYLET_SIGNERS` | 14 | | |
| `KEYLET_CHECK` | 15 | | |

**Per-type argument requirements** (read from the `util_keylet` implementation). "acc"
= 20-byte AccountID buffer; "u256" = 32-byte buffer; "u32" = a bare 32-bit integer
value (its length partner must be 0); "u64" = a 64-bit value split as `(high, low)`.

| `keylet_type` | `a,b` | `c,d` | `e,f` | Amendment gate |
|---|---|---|---|---|
| `KEYLET_ACCOUNT` (3) | acc | 0,0 | 0,0 | — |
| `KEYLET_HOOK` (1) | acc | 0,0 | 0,0 | — |
| `KEYLET_SIGNERS` (14) | acc | 0,0 | 0,0 | — |
| `KEYLET_OWNER_DIR` (18) | acc | 0,0 | 0,0 | — |
| `KEYLET_DID` (31)* | acc | 0,0 | 0,0 | `featureDID` |
| `KEYLET_HOOK_DEFINITION` (24) | u256 (ptr,32) | 0,0 | 0,0 | — |
| `KEYLET_CHILD` (5) | u256 (ptr,32) | 0,0 | 0,0 | — |
| `KEYLET_EMITTED` (22) | u256 (ptr,32) | 0,0 | 0,0 | — |
| `KEYLET_UNCHECKED` (17) | u256 (ptr,32) | 0,0 | 0,0 | — |
| `KEYLET_QUALITY` (11) | dir keylet (ptr,34) | u64 (high,low) | 0,0 | — |
| `KEYLET_PAGE` (19) | u256 (ptr,32) | u64 index (high,low) | 0,0 | — |
| `KEYLET_ORACLE` (32)* | acc | oracle seq as u32 in `c` (`d=0`) | 0,0 | `featurePriceOracle` |
| `KEYLET_CRON` (26) | acc | seq as u32 in `c` (`d=0`) | 0,0 | `featureCron` |
| `KEYLET_OFFER` (10) | acc | seq: u32 in `c` if `d=0`, else `c`=ptr to u256, `d=32` | 0,0 | — |
| `KEYLET_CHECK` (15) | acc | seq (as OFFER) | 0,0 | — |
| `KEYLET_ESCROW` (20) | acc | seq (as OFFER) | 0,0 | — |
| `KEYLET_NFT_OFFER` (23) | acc | seq (as OFFER) | 0,0 | — |
| `KEYLET_DEPOSIT_PREAUTH` (16) | acc (owner) | acc (authorized) | 0,0 | — |
| `KEYLET_HOOK_STATE_DIR` (25) | acc | namespace u256 (ptr,32) | 0,0 | `featureHooksUpdate1` |
| `KEYLET_HOOK_STATE` (2) | acc | key u256 (ptr,32) | namespace u256 (ptr,32) | — |
| `KEYLET_LINE` (9) | acc | acc | currency (ptr,len) | — |
| `KEYLET_PAYCHAN` (21) | acc | acc | seq: u32 in `e` if `f=0`, else `e`=ptr to u256, `f=32` | — |
| `KEYLET_AMM` (27)* | asset A (ptr,40) | asset B (ptr,40) | 0,0 | `featureAMM` |
| `KEYLET_SKIP` (6) | optional u32 in `a`; set `b=1` to use it, `b=0` for the default skip list | 0,0 | 0,0 | — |
| `KEYLET_AMENDMENTS` (4) | 0,0 | 0,0 | 0,0 | — |
| `KEYLET_FEES` (7) | 0,0 | 0,0 | 0,0 | — |
| `KEYLET_NEGATIVE_UNL` (8) | 0,0 | 0,0 | 0,0 | — |
| `KEYLET_EMITTED_DIR` (12) | 0,0 | 0,0 | 0,0 | — |

Notes:
- `KEYLET_QUALITY` requires the `a,b` buffer to be a *directory* keylet (its first two
  bytes must be `00 64`); otherwise `INVALID_ARGUMENT`.
- For `KEYLET_AMM`, each 40-byte asset buffer is a 20-byte currency followed by a
  20-byte issuer AccountID.
- `KEYLET_LINE`'s currency argument accepts either the 3-character code or a 20-byte
  currency, as parsed by the server's currency parser.

**Header vs. server gap (important).** The server-side `keylet_code` enum defines
additional codes **27–36**:
<!-- include/xrpl/hook/Enum.h -->
`AMM=27, BRIDGE=28, XCHAIN_OWNED_CLAIM_ID=29,
XCHAIN_OWNED_CREATE_ACCOUNT_CLAIM_ID=30, DID=31, ORACLE=32,
MPTOKEN_ISSUANCE=33, MPTOKEN=34, CREDENTIAL=35, PERMISSIONED_DOMAIN=36`.
The developer header `hook/hookapi.h` only `#define`s `KEYLET_*` up to 26, so
**there is no `KEYLET_AMM`/`KEYLET_DID`/`KEYLET_ORACLE`/… constant shipped for hook
authors.** If you target those types you must define the numeric constant yourself,
as test hooks targeting these codes do.
<!-- SetHook_test.cpp -->
Of codes 27–36, only three are actually
implemented by `util_keylet`: `AMM` (27, gated on `featureAMM`), `DID` (31, gated on
`featureDID`), and `ORACLE` (32, gated on `featurePriceOracle`). The remaining codes
(`BRIDGE`, both `XCHAIN_*`, `MPTOKEN_ISSUANCE`, `MPTOKEN`, `CREDENTIAL`,
`PERMISSIONED_DOMAIN`) are present in the switch but return `INVALID_ARGUMENT` — they
are placeholders whose amendments are not yet supported.

Also note **`KEYLET_TICKET` (13) is `#define`d in `hook/hookapi.h` but has no case in
the `util_keylet` switch** — calling `util_keylet` with type 13 falls through to the
default and returns `INVALID_ARGUMENT`. Treat ticket keylets as unsupported here.

**Return value.**

| Code | Value | Cause |
|---|---|---|
| success | 34 | 34 bytes (type + index) written. |
| `TOO_SMALL` | -4 | `write_len < 34`. |
| `OUT_OF_BOUNDS` | -1 | Output or an input buffer is out of bounds. |
| `INVALID_ARGUMENT` | -7 | Wrong argument lengths, non-zero unused slots, unsupported/gated type, malformed input. |
| `NO_SUCH_KEYLET` | -21 | `KEYLET_QUALITY`: the supplied buffer did not deserialize to a keylet. |
| `INTERNAL_ERROR` | -2 | An exception was thrown while building the keylet. |

**Common failure patterns.**
- Leaving `c,d,e,f` non-zero for a single-account keylet like `KEYLET_ACCOUNT` →
  `INVALID_ARGUMENT`.
- Passing a 32-byte AccountID-sized buffer (`len=32`) where an acc (`len=20`) is
  required, or vice versa.
- Using a value ≥ 27 without defining the constant yourself, then being surprised
  that unimplemented types return `INVALID_ARGUMENT`.

**Caveats.** `util_keylet` computes an index; it does not check that the object
exists. Follow it with [`slot_set`](../slot/slot_set.md) to actually load the object,
which is where a missing object surfaces.

**Minimal example.** Compute the account keylet for the hook's own account:

```c
uint8_t accid[20];
hook_account(SBUF(accid));

uint8_t kl[34];
if (util_keylet(SBUF(kl), KEYLET_ACCOUNT, SBUF(accid), 0, 0, 0, 0) != 34)
    rollback(SBUF("keylet failed"), 1);
```

**Practical example.** Look up a trustline (LINE) between two accounts for a currency
and load it into a slot:

```c
uint8_t kl[34];
int64_t r = util_keylet(
    SBUF(kl),
    KEYLET_LINE,
    SBUF(acc_a),        // a,b : 20-byte account
    SBUF(acc_b),        // c,d : 20-byte account
    SBUF(currency20));  // e,f : currency
if (r == 34)
{
    int64_t slot_no = slot_set(SBUF(kl), 0);
    // inspect slot_no with slot_subfield / slot_float ...
}
```

**Related APIs.** [`slot_set`](../slot/slot_set.md),
[`ledger_keylet`](../ledger/ledger_keylet.md) (range enumeration),
[`state_foreign`](../state/state_foreign.md), [`util_accid`](util_accid.md).
