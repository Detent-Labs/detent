## 1. mapError table-driven rewrite

- [x] 1.1 `errors.ts`: add `ISSUES_ERRORS`/`MESSAGE_ERRORS` tables and
      rewrite `mapError` to use `.find()` against them, per `design.md`,
      keeping `ConcurrencyConflict` and the untyped fallback as explicit
      cases outside the tables.
- [x] 1.2 Diff every table entry's `[ctor, status, type]` against the
      original `if`-chain's corresponding branch to confirm no status/type
      transcription errors.

## 2. Shared route-handler wrapper

- [x] 2.1 `routes.ts`: add the `guarded(fn)` helper per `design.md`.
- [x] 2.2 Rewrite `handleCreateInstance`, `handleGetInstanceView`,
      `handleClaim`, `handleRelease`, `handleListInstances`,
      `handleInstanceRecord`, `handleCancel`, `handlePublish`,
      `handleListProcesses`, `handleListVersions` to delegate their bodies
      to `guarded`, with no change to the wrapped logic itself.
- [x] 2.3 Confirm `handleSubmit` is left with its own explicit try/catch
      (not routed through `guarded`), `AutomaticCascadeLoop` branch intact.

## 3. Credential extraction collapse

- [x] 3.1 `routes.ts`: delete `extractCredential`; inline `req.headers`
      into `resolveActor`, moving the existing doc comment onto
      `resolveActor`.
- [x] 3.2 Confirm all 11 `resolveActor` call sites are unchanged (same
      signature, same call shape).

## 4. Verification

- [x] 4.1 Run `test/http.test.ts` (covers `mapError` directly) and
      `test/handlers-http.test.ts` (covers the route handlers) and confirm
      all pass. 101/101 pass, 226 expect() calls.
- [x] 4.2 Run `bun run typecheck`. Passed (engine + editor).
- [x] 4.3 Run the full `bun test` suite with `DATABASE_URL` set (never a
      single-file rerun) and confirm 0 failures. First attempt showed 4
      unrelated graph-diagram-rendering failures from a stale Playwright
      Chromium cache after a container recreation (same issue documented in
      the archived `2026-07-27-dedupe-editor-player` change) — fixed via
      `playwright install --with-deps chromium`, confirmed unrelated to
      this change's files, then reran clean: 859 pass, 0 fail, 2286
      expect() calls.
