# Example: Memo Routing

Transactions can carry a `Memos` array, and hooks can carry `HookParameters`.
Both let a caller pass instructions to a hook. This example reads the memos off
the originating transaction, drills into a memo entry, and branches on its
content. It closes with a section on debugging via `trace`.

## Purpose

- Load the originating transaction's `sfMemos` array and iterate it.
- Extract `sfMemoData` from a memo entry and route behavior on its value.
- Show the simpler `otxn_param` alternative for structured key/value input.
- Observe hook execution with `trace` / `trace_num` / `trace_float`.

## APIs used

| API | Purpose | Reference |
|---|---|---|
| `otxn_slot` | Load the whole originating transaction into a slot. | [transaction.md](../api-reference/transaction/otxn_slot.md) |
| `slot_subfield` | Narrow a slot to a subfield (`sfMemos`, `sfMemoData`). | [ledger-and-slot.md](../api-reference/slot/slot_subfield.md) |
| `slot_count` | Number of elements in a slotted array. | [ledger-and-slot.md](../api-reference/slot/slot_count.md) |
| `slot_subarray` | Expand one array element into its own slot. | [ledger-and-slot.md](../api-reference/slot/slot_subarray.md) |
| `slot` | Copy a slot's bytes into memory. | [ledger-and-slot.md](../api-reference/slot/slot.md) |
| `otxn_param` | Read a HookParameter by key (the simpler alternative). | [transaction.md](../api-reference/transaction/otxn_param.md) |
| `trace` / `trace_num` / `trace_float` | Emit debug output. | [utility.md](../api-reference/trace/README.md) |
| `accept` / `rollback` | Terminate the hook. | [control.md](../api-reference/control/README.md) |

Helper macros used: `SBUF`, `GUARD`, `BUFFER_EQUAL_STR_GUARD`, `TRACEHEX`,
`TRACEVAR` — see [macros.md](../macros/tracing.md).

## Processing flow

1. Guard the entry with `_g(1,1)`.
2. `otxn_slot(1)` — load the transaction into slot 1.
3. `slot_subfield(1, sfMemos, 2)` — narrow to the `Memos` array in slot 2. If the
   transaction has no memos this returns `DOESNT_EXIST (-5)`.
4. `slot_count(2)` — how many memo entries there are.
5. For each index `i`: `slot_subarray(2, i, 3)` expands entry `i` into slot 3,
   then `slot_subfield(3, sfMemoData, 4)` narrows to that entry's `MemoData`, and
   `slot(SBUF(buf), 4)` copies the bytes out.
6. Compare the memo bytes and branch (route). `accept` / `rollback` accordingly.

Note: a memo array element is a `Memo` object, and `slot_subfield` reads
`sfMemoData` directly from the element slot — the wrapper is handled for you.

## Complete code example

This hook looks for a memo whose `MemoData` is the ASCII string `PING` and
accepts only if it finds one; otherwise it rejects.

```c
#include "hookapi.h"

int64_t
hook(uint32_t reserved)
{
    _g(1, 1);

    // 1. Load the originating transaction, then narrow to its Memos array.
    if (otxn_slot(1) != 1)
        rollback(SBUF("memo: cannot slot txn"), 1);

    if (slot_subfield(1, sfMemos, 2) != 2)
        rollback(SBUF("memo: no memos"), 2);          // DOESNT_EXIST if absent

    int64_t count = slot_count(2);
    if (count < 0)
        rollback(SBUF("memo: not an array"), 3);      // NOT_AN_ARRAY on non-array

    // 2. Scan each memo entry for MemoData == "PING".
    int matched = 0;
    for (int i = 0; GUARD(256), i < count && i < 256; ++i)
    {
        // Expand entry i into slot 3.
        if (slot_subarray(2, i, 3) != 3)
            continue;

        // Narrow to this entry's MemoData; skip entries that lack it.
        if (slot_subfield(3, sfMemoData, 4) != 4)
            continue;

        uint8_t buf[16];
        int64_t len = slot(SBUF(buf), 4);
        if (len < 0)
            continue;

        // Compare the memo bytes to the literal "PING" (4 bytes, no NUL).
        int equal = 0;
        BUFFER_EQUAL_STR_GUARD(equal, buf, len, "PING", 256);
        if (equal)
        {
            matched = 1;
            break;
        }
    }

    if (!matched)
        rollback(SBUF("memo: no PING memo"), 4);

    accept(SBUF("memo: PING accepted"), 0);
    return 0;
}
```

The loop carries a guard (`GUARD(256)`), the count is bounded, every slot API
return is checked, and both outcomes terminate.

## The simpler alternative: `otxn_param`

If you control the caller, HookParameters are easier than memos: they are a
direct key/value store on the transaction, read in one call with no slot
plumbing.

```c
uint8_t val[32];
int64_t len = otxn_param(SBUF(val), "route", 5);  // key = "route"
if (len == DOESNT_EXIST)
    accept(SBUF("no route param"), 0);            // parameter absent
if (len < 0)
    rollback(SBUF("param read error"), 1);
// branch on val[0..len]
```

`otxn_param` returns the value length, or `DOESNT_EXIST (-5)` if the key is not
present. Prefer this over memos for machine-to-hook signaling; reserve memos for
data that must ride along with an ordinary payment.

## Variations

**Route to different actions.** Replace the single `"PING"` check with a switch
on the first memo byte (a one-byte opcode), or with several
`BUFFER_EQUAL_STR_GUARD` comparisons, each selecting a branch.

**Read `MemoType` / `MemoFormat` too.** The same pattern applies with
`sfMemoType` and `sfMemoFormat` — narrow the entry slot to each subfield in turn.

**First memo only.** If you only care about the first memo, skip `slot_count` and
the loop: `slot_subarray(2, 0, 3)` then read `sfMemoData` from slot 3.

## Debugging with trace

`trace`, `trace_num`, and `trace_float` write to the server's log at **trace**
log level, each line tagged `HookTrace[<account>]:`. They are no-ops unless the
server is running with trace logging enabled, so they cost nothing when the level
is higher.

| Call | Emits |
|---|---|
| `trace(SBUF("msg"), SBUF(buf), 1)` | A message plus `buf` rendered as hex (`as_hex = 1`); pass `0` to render as raw text. |
| `trace_num(SBUF("count"), count)` | A message plus a signed integer. |
| `trace_float(SBUF("amt"), xfl)` | A message plus an XFL value, formatted as a number. |

The `macro.h` wrappers are the ergonomic form and compile out when `NDEBUG` is
set (they are gated on the `DEBUG` flag):

```c
TRACEVAR(count);        // trace_num with "count" as the label
TRACEHEX(buf);          // trace buf as hex, labelled "buf"
TRACEXFL(amt);          // trace_float labelled "amt"
TRACESTR("reached A");  // trace a literal string
```

**Where to see it.** Run `xahaud` (for example in standalone mode) with the log
level set to `trace`; hook trace lines appear in the server log interleaved with
other trace output. In the unit-test harness the same output surfaces when the
test's log threshold includes trace. There is no on-ledger record of trace
output — it is purely a server-side diagnostic.

## Caveats

- Slots are a finite resource (255 max). Expanding many array elements without
  reusing a slot number exhausts them and later calls return `NO_FREE_SLOTS (-6)`;
  reuse a fixed destination slot inside the loop, as the example does with slot 3.
- `slot_subfield(..., sfMemos, ...)` returns `DOESNT_EXIST (-5)` when the
  transaction has no memos and `slot_count` returns `NOT_AN_ARRAY (-22)` on a
  non-array slot — handle both.
- Memo bytes are raw: what looks like text may be arbitrary binary. Compare with
  a length-checked helper (`BUFFER_EQUAL_STR_GUARD`), not a NUL-terminated
  string function.

## Common mistakes

- **Reading `sfMemoData` off the array slot instead of an element slot.** You
  must `slot_subarray` to an element first, then `slot_subfield(sfMemoData)` on
  that element. Applying `slot_subfield` to the array slot does not work.
- **Looping without a guard.** Iterating memo entries with an unguarded `for`
  fails validation (`GUARD_MISSING`) or trips `GUARD_VIOLATION (-16)` at runtime.
  Put `GUARD(n)` in the loop and bound the index.
- **Assuming memos exist.** Not every transaction carries memos; branch on the
  `DOESNT_EXIST` return from `slot_subfield(sfMemos)` rather than proceeding.
- **Leaving heavy `trace` calls in a production hook.** Trace output is a
  debugging aid; while it is a no-op when trace logging is off, dead trace code
  still adds WASM size and instructions. Strip it or rely on the `DEBUG`-gated
  macros for release builds.
- **Confusing memos with parameters.** `sfMemos` is read via slots; HookParameters
  are read with `otxn_param`. They are different mechanisms — pick one per field.

## Related documents

- [overview.md](../overview.md)
- [glossary.md](../glossary.md)
- [macros.md](../macros/README.md)
- [best-practices.md](../best-practices.md)
- [api-reference/transaction.md](../api-reference/transaction/README.md)
- [api-reference/ledger-and-slot.md](../api-reference/slot/README.md)
- [api-reference/utility.md](../api-reference/trace/README.md)
- [api-reference/control.md](../api-reference/control/README.md)
- [examples/payment-filter.md](payment-filter.md)
- [examples/emitted-transaction.md](emitted-transaction.md)
