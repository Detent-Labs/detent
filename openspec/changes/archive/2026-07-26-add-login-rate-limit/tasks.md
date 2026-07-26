## 1. Rate limiter implementation

- [x] 1.1 In `src/auth/login.ts`, add module-level constants `MAX_ATTEMPTS = 5`,
      `WINDOW_MS = 15 * 60 * 1000`, `MAX_TRACKED_EMAILS = 50_000`, and a
      module-level `Map<string, { count: number; windowStart: number }>` for
      failed-attempt state, with a `ponytail:` comment noting it is
      single-process/in-memory (no cross-instance coordination) and naming
      the shared-store upgrade path.
- [x] 1.2 Add an exported function (e.g. `checkAndRecordAttempt(map, email,
      now: () => number = Date.now): "ok" | "limited"`) that, given the
      *normalized* email (`trim().toLowerCase()` — computed by the caller,
      not this function's concern): rolls the window over if
      `now() - entry.windowStart > WINDOW_MS`; returns `"limited"` without
      mutating the map if `entry.count >= MAX_ATTEMPTS`; otherwise, if the key
      is new AND the map is already at `MAX_TRACKED_EMAILS`, returns `"ok"`
      without adding an entry (fail open on capacity); otherwise increments
      `count` (creating the entry with `windowStart = now()` if absent) and
      returns `"ok"`. The entire function body MUST be synchronous (no
      `await`) — this is what makes the check-and-increment atomic against
      concurrent requests for the same email; a code comment at the call site
      should say so, since a later edit that awaits something in between
      would silently reintroduce a race.
- [x] 1.3 In `handleLogin`, after body-shape validation: compute the
      normalized email and call `checkAndRecordAttempt` *before* `await
      verifyLogin(...)` (not after) — if it returns `"limited"`, return `429`
      with `{ error: { type: "rate-limited", message } }` immediately,
      without calling `verifyLogin`. Otherwise proceed to `await
      verifyLogin(body.email, body.password, db)`, passing the **original,
      unmodified** `body.email` — never the normalized/lowercased value —
      since `verifyLogin`'s `WHERE email = ${email}` lookup is case-sensitive
      and nothing else in this codebase normalizes a stored email.
- [x] 1.4 On a successful `verifyLogin`, delete the normalized email's entry
      from the map before returning the token response (this also undoes the
      pre-emptive increment from 1.3, along with any earlier failed attempts
      in the current window).

## 2. Tests

- [x] 2.1 Unit-test `checkAndRecordAttempt` directly (not through the HTTP
      handler) with an injected fake `now`: under-limit attempts return
      `"ok"` each time; the `(MAX_ATTEMPTS + 1)`th attempt within the window
      returns `"limited"`; advancing the fake clock past `WINDOW_MS` makes
      the next call return `"ok"` again and starts a fresh window; a
      not-yet-tracked email is not added once the map already holds
      `MAX_TRACKED_EMAILS` entries (construct a map at that size directly —
      it's a plain `Map`, no HTTP layer needed) and that call still returns
      `"ok"`.
- [x] 2.2 In `test/auth-login.test.ts`: an email under `MAX_ATTEMPTS` failed
      attempts still returns the existing generic `401` on each call.
- [x] 2.3 An email that reaches `MAX_ATTEMPTS` failed attempts returns `429`
      with `{ error: { type: "rate-limited", ... } }` on the next call, using
      a correct-password login for that email to confirm `verifyLogin` is
      genuinely bypassed (login still fails with `429`, not `200`).
- [x] 2.4 A successful login after some failed attempts (but under the limit)
      clears the counter — a subsequent wrong password is treated as attempt 1
      of a new window, not a continuation.
- [x] 2.5 Two different emails each get their own independent counter — one
      reaching the limit does not affect login attempts for the other.
- [x] 2.6 Case/whitespace variation on an already-limited email (e.g.
      ` Foo@Bar.com` vs the tracked `foo@bar.com`) is still rejected with
      `429` — and, separately, confirm an existing account whose stored
      email contains uppercase characters can still log in successfully with
      exact casing after this change (guards against the normalization bug
      this review caught: passing the lowercased email to `verifyLogin`).
- [x] 2.7 Rate limiting is keyed by email regardless of any per-request
      source information — confirm the existing test setup (no IP-specific
      headers) already exercises this; no new test infrastructure needed.

## 3. Verification

- [x] 3.1 Run `bun run typecheck` and confirm it passes with no new errors.
- [x] 3.2 Run the full `bun test` suite with `DATABASE_URL` set (per
      CLAUDE.md — never rely on a single-file rerun) and confirm a clean
      green run, checking the skip count is unchanged (DB-backed suites must
      not silently skip). Result: 854 pass / 4 fail / 858 total, all 13
      `test/auth-login.test.ts` tests passing. The 4 failures are in
      `packages/editor/test/graph-view-rendering.test.tsx` (missing
      Playwright Chromium binary for mermaid-isomorphic rendering) —
      pre-existing, unrelated to this change (a different package, a
      browser-launch environment issue, no auth/login code involved).

## 4. Verification follow-up

- [x] 4.1 Tightened the spec wording ("track failed attempts" ->
      "attempts are recorded optimistically... only unsuccessful attempts
      ever persist") to match the actual pre-emptive-increment-then-reset
      mechanism, per `/openspec-verify-change`'s SUGGESTION 1.
- [x] 4.2 SUGGESTION 2 (window-rollover scenario tested at the
      `checkAndRecordAttempt` unit level, not through `handleLogin`) reviewed
      and accepted as-is: already explained by `design.md`'s "Testability
      needs a clock seam" decision; no spec/code change needed (a prior
      attempt to add an inline note under the scenario in spec.md was
      reverted — this repo's specs keep scenarios to plain WHEN/THEN, with
      rationale living in design.md instead).
- [x] 4.3 Added a `rate-limited` `ClientError` variant (`types.ts`), mapped
      it in `parseErrorBody` (`client.ts`), widened the Player's `LoginForm`
      error ternary (`PlayerView.tsx`) so the message still renders (it would
      otherwise have silently fallen back to "log in failed" once the type
      stopped being "internal"), and added a matching mapping test in
      `player-client.test.ts`, per SUGGESTION 3.
