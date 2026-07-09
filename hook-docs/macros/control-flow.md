---
sidebarTitle: "Control Flow"
---

# Control flow: accept / rollback / assert

These wrap [`accept`](../api-reference/control/accept.md) and
[`rollback`](../api-reference/control/rollback.md), the two ways a hook terminates. Recall
that `accept` lets the originating transaction apply and `rollback` rejects it; both
take a message pointer/length and an `int64_t` error/return code. Most of these macros
use `__LINE__` as that code, so a trace or a `tem`/`tec` diagnostic points back at the
exact source line that ended the hook.

## DONEEMPTY

```c
#define DONEEMPTY()\
    accept(0,0,__LINE__)
```

Accept with no message. Expression (it *is* an `accept` call, which does not return).
Use when you want the transaction to succeed and have nothing to say. The return code
is the source line number.

```c
if (otxn_type() != ttPAYMENT)
    DONEEMPTY();   // not a payment: accept unchanged
```

## DONEMSG

```c
#define DONEMSG(msg)\
    accept(msg, sizeof(msg),__LINE__)
```

Accept with a static string message. Expression. **`sizeof` pitfall:** `msg` must be a
string literal or `char[]` array — `DONEMSG("ok")` works, `DONEMSG(some_char_ptr)`
sends only 4 bytes. Note it includes the trailing NUL in the length (`sizeof("ok")`
is 3).

```c
DONEMSG("payment accepted");
```

## DONE

```c
#define DONE(x)\
    accept(SVAR(x),(uint32_t)__LINE__);
```

Accept and return the *bytes of a variable* `x` as the message (via
[`SVAR`](buffer-helpers.md#svar) = `&x, sizeof(x)`). Expression, but note the definition ends in a `;`
of its own — do not add a second semicolon. Useful to surface a numeric result to a
trace. Because it uses `SVAR`, `x` must be an addressable lvalue, not a literal.

```c
int64_t result = compute();
DONE(result)   // returns the 8 raw bytes of `result`; no trailing ';'
```

## ASSERT

```c
#define ASSERT(x)\
{\
    if (!(x))\
        rollback(0,0,__LINE__);\
}
```

Rollback (no message) if the condition is false. **Statement** (a `{}` block). This is
the workhorse of the test hooks: nearly every API call in `SetHook_test.cpp` is wrapped
as `ASSERT(some_api(...) == expected);`. The rollback code is the failing line, which
makes it easy to see which assertion tripped.

```c
ASSERT(hook_account(SBUF(acc)) == 20);   // rolls back at this line if not 20
ASSERT(state_set(SBUF(val), SBUF(key)) == sizeof(val));
```

Caveat: because it expands to a bare block, avoid `ASSERT(x) else ...`. Put each
`ASSERT` on its own statement.

## NOPE

```c
#define NOPE(x)\
{\
    return rollback((x), sizeof(x), __LINE__);\
}
```

Rollback with a static string and `return`. **Statement** that contains a `return`, so
it exits the enclosing function (`hook`/`cbak`). **`sizeof` pitfall** again: `x` should
be a string literal. Prefer this over a bare `rollback(...)` when you want the message
length filled in automatically.

```c
if (amount < minimum)
    NOPE("amount below minimum");
```

## REQUIRE

```c
#define REQUIRE(cond, str)\
{\
    if (!(cond))\
        rollback(SBUF(str), __LINE__);\
}
```

Combines a guard condition with a descriptive rollback message — the readable form of
`ASSERT`. **Statement.** Uses [`SBUF`](buffer-helpers.md#sbuf) on `str`, so `str` must be a string
literal/array. Unlike `NOPE`, it does not itself `return` — it calls `rollback`
(which does not return anyway), so the effect is the same for the terminating case.

```c
REQUIRE(otxn_type() == ttPAYMENT, "only payments accepted");
REQUIRE(len == 20, "expected a 20-byte account id");
```

**When to use which:** `ASSERT` for terse invariant checks in tests; `REQUIRE`/`NOPE`
in production hooks where the rollback message is user-facing; `DONE*` when the hook
should *succeed* and optionally report something.
