# xpop_slot

**Summary.** Load the inner transaction and metadata of an XPOP (cross-chain proof) into two
slots. Only valid while processing an `Import` (`ttIMPORT`) transaction.

Requires the **`featureHooksUpdate1`** amendment (`hook_api.macro`).

**Signature.**

```c
int64_t xpop_slot(uint32_t slot_no_tx, uint32_t slot_no_meta);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `slot_no_tx` | `uint32_t` | Destination slot for the inner transaction, or `0` to allocate. |
| `slot_no_meta` | `uint32_t` | Destination slot for the inner metadata, or `0` to allocate. |

**Return value.** Returns `(slot_no_tx << 16) | slot_no_meta` — both chosen slot numbers
packed into one `int64_t` — on success. Errors: `PREREQUISITE_NOT_MET` (-9) if the originating
transaction is not an `Import`; `INVALID_ARGUMENT` (-7) if either slot exceeds `max_slots`, or
if both are the same non-zero slot (a collision); `NO_FREE_SLOTS` (-6) if not enough slots are
free for the auto-allocation requested; `INVALID_TXN` (-37) if the XPOP's inner transaction or
metadata cannot be extracted.

**Common failure patterns.**
- Calling it outside `Import` processing → `PREREQUISITE_NOT_MET`.
- Passing the same non-zero slot for both txn and meta → `INVALID_ARGUMENT`.

**Caveats / notes.**
- Unpack the result: `tx_slot = ret >> 16`, `meta_slot = ret & 0xFFFF`.
- Requires `featureHooksUpdate1`; on a network without it the function is not registered and
  calling it traps.

**Minimal example.**

```c
int64_t r = xpop_slot(0, 0);       // auto-allocate both
uint32_t tx_slot   = (r >> 16) & 0xFFFF;
uint32_t meta_slot = r & 0xFFFF;
```

**Related APIs.** [`meta_slot`](meta_slot.md), [`slot_subfield`](slot_subfield.md).
