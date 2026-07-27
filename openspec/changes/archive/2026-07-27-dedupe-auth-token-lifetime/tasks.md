## 1. Single-source-of-truth constant

- [x] 1.1 `login.ts`: replace the two hand-written constants with
      `TOKEN_LIFETIME_HOURS = 8` plus `TOKEN_LIFETIME` and
      `TOKEN_LIFETIME_MS` derived from it, per `design.md`. Confirmed the
      derived `TOKEN_LIFETIME` string is exactly `"8h"` and
      `TOKEN_LIFETIME_MS` is exactly `28800000` (unchanged values).

## 2. Verification

- [x] 2.1 Ran `test/auth-login.test.ts` directly — 13/13 pass, including
      "a valid login returns 200 with a token, expiresAt ~8h ahead, and
      the actor".
- [x] 2.2 Run `bun run typecheck`. Passed (engine + editor).
- [x] 2.3 Run the full `bun test` suite with `DATABASE_URL` set (never a
      single-file rerun). 859 pass, 0 fail, 2286 expect() calls.
