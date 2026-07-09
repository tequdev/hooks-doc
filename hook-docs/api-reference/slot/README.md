---
sidebarTitle: "Slot APIs"
---

# Slot APIs

This page documents the seventeen **slot** Hook APIs: the *slot* family (an
efficient handle system for transaction and ledger-object data), the metadata/XPOP slot
loaders, and the *ledger info* family (sequence, times, hashes, nonces, and keylet
enumeration). The slot family is documented here; the ledger-info family has its own page,
[Ledger APIs](../ledger/README.md).

All signatures are copied verbatim from `hook/extern.h`. Return codes reference the shared
error table in [../../glossary.md](../../glossary.md); values come from <!-- include/xrpl/hook/Enum.h and -->
`hook/error.h`. The implementation is split between core lookup/read logic and the
WASM-facing wrappers that marshal arguments across the guest boundary.
<!-- core logic: `src/xrpld/app/hook/detail/HookAPI.cpp`; WASM-facing wrappers: `src/xrpld/app/hook/detail/applyHook.cpp` -->

---

## The slot system

Serialized ledger objects and transactions can be large. Rather than copy a whole object into
WASM memory to read one field, a hook loads the object into a **slot** — a numbered,
server-side handle — and then drills into it.

- A slot holds a parsed serialized object (an `STObject`, `STArray`, or a leaf field). There
  are at most `max_slots` = **255** slots per hook execution<!-- (Enum.h) -->. Requesting a slot
  when none are free returns `NO_FREE_SLOTS` (-6).
- Slot **0 is special as an argument**: passing `0` for a destination slot means "allocate any
  free slot for me", and the chosen slot number is returned. Passing a specific number targets
  that slot (overwriting whatever was there).
- Typical lifecycle:
  1. [`slot_set`](slot_set.md) loads an object from a **keylet** (34 bytes) or a **transaction
     id** (32 bytes) into a slot.
  2. [`slot_subfield`](slot_subfield.md) / [`slot_subarray`](slot_subarray.md) drill into that slot,
     placing a subfield or array element into another slot.
  3. [`slot`](slot.md), [`slot_size`](slot_size.md), [`slot_count`](slot_count.md),
     [`slot_type`](slot_type.md), and [`slot_float`](slot_float.md) read the slotted data.
  4. [`slot_clear`](slot_clear.md) frees a slot when you are done (or you simply let execution
     end).

Keylets for `slot_set` are usually built with [`util_keylet`](../utility/util_keylet.md), which
produces the 34-byte serialized keylet these functions expect.

---

## Index

| Function | Purpose |
|---|---|
| [`slot_set`](slot_set.md) | Load a ledger object or transaction into a slot. |
| [`slot`](slot.md) | Write a slot's serialized contents to memory (or return as `int64_t`). |
| [`slot_size`](slot_size.md) | Byte size of the data in a slot. |
| [`slot_clear`](slot_clear.md) | Free a slot. |
| [`slot_count`](slot_count.md) | Number of elements in a slotted array. |
| [`slot_subfield`](slot_subfield.md) | Expand a subfield of a slotted object into a new slot. |
| [`slot_subarray`](slot_subarray.md) | Expand an array element of a slotted array into a new slot. |
| [`slot_type`](slot_type.md) | Return the field type of a slot (and whether an amount is XAH). |
| [`slot_float`](slot_float.md) | Interpret a slotted amount as an XFL value. |
| [`meta_slot`](meta_slot.md) | Load the originating transaction's metadata into a slot. |
| [`xpop_slot`](xpop_slot.md) | Load an XPOP's inner transaction and metadata into two slots. |

## Related documents

- [../../README.md](../../README.md) — documentation index.
- [../../overview.md](../../overview.md) — hook execution model and lifecycle.
- [../../glossary.md](../../glossary.md) — full error-code and term reference.
- [../../macros.md](../../macros/README.md) — `SBUF`, `GUARD`, and buffer helpers.
- [../../best-practices.md](../../best-practices.md) — slot budgets and iterating ledger objects.
- [Ledger APIs](../ledger/README.md) — `fee_base`, `ledger_seq`, `ledger_nonce`, and the rest of the ledger-info family.
- [control.md](../control/README.md) — `hook_again` and the strong/weak execution model.
- [transaction.md](../transaction/README.md) — `otxn_slot`, `otxn_field`, and originating-txn access.
- [state.md](../state/README.md) — persistent state read/write.
- [emit-and-etxn.md](../emit/README.md) — `etxn_fee_base`, `etxn_nonce`, and emission.
- [float-and-amount.md](../float/README.md) — XFL math for `slot_float` values.
- [utility.md](../utility/README.md) — `util_keylet` for building the keylets `slot_set`/`ledger_keylet` consume.
- [../../examples/emitted-transaction.md](../../examples/emitted-transaction.md) — reading slots and emitting.
- [../../examples/memo-routing.md](../../examples/memo-routing.md) — drilling arrays and subfields.
