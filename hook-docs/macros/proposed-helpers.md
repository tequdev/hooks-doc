---
sidebarTitle: "Proposed Helpers"
---

# Proposed helpers (not in the repository)

The following do **not** exist in `hook/macro.h`. They are suggestions consistent with
the actual API behavior; copy them into your own project if useful. Clearly nothing here
is guaranteed by the header.

- **`REQUIRE_LEN(expr, n, msg)`** — assert an API call returned exactly `n` bytes,
  otherwise rollback. Encodes the "check the byte count" habit from pattern 1/2:

  ```c
  #define REQUIRE_LEN(expr, n, msg)\
  {\
      if ((expr) != (n))\
          rollback(SBUF(msg), __LINE__);\
  }
  // usage: REQUIRE_LEN(otxn_field(SBUF(dst), sfDestination), 20, "bad destination");
  ```

- **`CHECK(expr)`** — evaluate an API call, and if it is negative, `return` that error
  code as a rollback. A terser form of the pattern-1 `if (x < 0) NOPE(...)`:

  ```c
  #define CHECK(expr)\
  {\
      int64_t _r = (expr);\
      if (_r < 0)\
          return rollback(0, 0, _r);\
  }
  ```

These mirror behavior of the real API (non-negative success / negative error) but are
**my own proposals**, not part of the shipped header. Prefer the in-repo macros
(`ASSERT`, `REQUIRE`, `NOPE`) unless you have a specific reason to extend them.
