# etxn_reserve

**Summary.** Declare the number of transactions this hook execution will emit. Must be called
before the emission APIs that require a reservation, such as `etxn_burden`, `etxn_details`,
`etxn_fee_base`, `emit`, and `prepare`. `etxn_generation` and `etxn_nonce` do not require a reservation.
<!-- evidence: `HookAPI::etxn_burden`, `HookAPI::etxn_details`, `HookAPI::etxn_fee_base`, and
`HookAPI::emit` reject an unset `expected_etxn_count` (as does `HookAPI::prepare`, `HookAPI.cpp:387-388`), while `HookAPI::etxn_generation` and
`HookAPI::etxn_nonce` do not check it (xahaud `src/xrpld/app/hook/detail/HookAPI.cpp:475-476,
813-816, 827-834, 858-863, 932-947, 949-979`; wrappers in
`src/xrpld/app/hook/detail/applyHook.cpp:1834-1839, 2765-2795`). -->

**Signature.**

```c
int64_t etxn_reserve(uint32_t count);
```

**Parameters.**

| Name | Type | Description |
|---|---|---|
| `count` | `uint32_t` | Number of transactions the hook intends to emit this execution; `1..255`. |

**Return value.** Returns `count` on success. Errors: `ALREADY_SET` (-8) if a reservation was
already made this execution; `TOO_SMALL` (-4) if `count < 1`; `TOO_BIG` (-3) if
`count > 255` (`max_emit`).

**Common failure patterns.**
- Calling it twice in one execution → `ALREADY_SET`.
- Reserving `0`, or more than `255` → `TOO_SMALL` / `TOO_BIG`.
- Forgetting it entirely: reservation-dependent emission APIs then return
  `PREREQUISITE_NOT_MET` (-9).

**Caveats / notes.**
- `etxn_generation` and `etxn_nonce` can be called before `etxn_reserve`; the reservation is
  required when calculating emission burden/details or pricing and submitting an emitted
  transaction.
- The reservation is per-execution. A `cbak` execution (or a weak re-execution) starts fresh
  and must reserve again before emitting.
- You must actually emit no *more* than `count` transactions; the `count+1`-th `emit` returns
  `TOO_MANY_EMITTED_TXN` (-13). Reserving more than you emit is allowed.
- Both `etxn_burden` and `etxn_details` fold `count` into the burden calculation, so reserve
  the true number you will emit.

**Minimal example.**

```c
etxn_reserve(1);   // this hook will emit exactly one transaction
```

**Practical example.**
<!-- adapted from `SetHook_test.cpp`, "Test etxn_reserve" -->

```c
int64_t hook(uint32_t r)
{
    _g(1, 1);
    // cannot reserve zero, cannot reserve more than the max
    ASSERT(etxn_reserve(0)   == TOO_SMALL);
    ASSERT(etxn_reserve(256) == TOO_BIG);
    // a valid reservation returns the count
    ASSERT(etxn_reserve(1)   == 1);
    // and it may only be set once
    ASSERT(etxn_reserve(1)   == ALREADY_SET);
    accept(0, 0, 0);
}
```

**Related APIs.** [`emit`](emit.md), [`etxn_burden`](etxn_burden.md), [`etxn_details`](etxn_details.md).
