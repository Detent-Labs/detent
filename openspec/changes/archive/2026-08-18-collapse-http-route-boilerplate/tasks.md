## 1. Drop the db default (finding 43)

- [x] 1.1 Drop `= sql` from every `db: SQL` parameter in
      `src/http/routes.ts` (17 sites).
- [x] 1.2 Drop `= sql` from every `db: SQL` parameter in
      `src/http/admin-routes.ts` (25 sites).
- [x] 1.3 Drop `= sql` from every `db: SQL` parameter in
      `src/http/studio-routes.ts` (13 sites).
- [x] 1.4 Drop `= sql` from every `db: SQL` parameter in
      `src/http/reporting-routes.ts` (4 sites).
- [x] 1.5 Drop `= sql` from every `db: SQL` parameter in
      `src/http/account-routes.ts` (2 sites).
- [x] 1.6 Drop `= sql` from the single `db: SQL` parameter in each of
      `src/http/ui-strings-routes.ts`, `src/http/metrics.ts` and
      `src/http/health.ts`.
- [x] 1.6a Drop `= sql` from both `db: SQL = sql`-shaped defaults in
      `src/http/server.ts`: `createServer`'s own `processDb: SQL`
      parameter (line 477) and `startHttpServer`'s `db: SQL` parameter
      (line 770). `startHttpServer`'s own call to `createServer` (line 787)
      already passes `db` positionally where `processDb` sits, so that call
      site needs no change; task 1.8 covers confirming
      `startHttpServer`'s own bootstrap call site supplies `db` explicitly.
- [x] 1.7 Drop `= sql` from the single `db: SQL` parameter on
      `src/auth/login.ts`'s `handleLogin` (1 site). `server.ts`'s
      `POST /auth/login` route entry already supplies `db` explicitly, the
      same zero-risk shape as the sites above.
- [x] 1.7a In `test/auth-login.test.ts`, add an explicit third argument,
      `sql` (already imported at the top of the file from
      `../src/engine/store.js`), to each of the 28 `handleLogin(req,
      SECRET)` call sites that currently omit `db` and rely on the default
      task 1.7 drops. The file's five call sites that already pass `sql`
      and `address` explicitly (lines 431, 432, 436, 442 and 446, the
      credential-stuffing scenario) need no change. This is the compile-time
      break design.md's Risks section names.
- [x] 1.8 Run `bun run typecheck` and confirm every call site in the
      repository, including every `test/*.test.ts` suite, already supplies
      `db` explicitly. Task 1.7a fixes the one test file already known to
      need it; fix any other call site `tsc` flags, inside or outside
      `src/http/` and `src/auth/login.ts`, including `server.ts:815`'s
      `startHttpServer(...)` bootstrap call (add `sql` explicitly there
      too — it is `startHttpServer`'s own default, not a per-request
      handler's, but the same fix applies).

## 2. Add the shared route wrapper and notFound helper (findings 42, 45)

- [x] 2.1 Add `notFound(message: string): HttpResult` to `src/http/errors.ts`,
      returning `{ status: 404, body: { error: { type: "not-found", message
      } } }`.
- [x] 2.2 Add `route(req, resolver, db, gate, fn)` to `src/http/routes.ts`.
      Its body is one `guarded(req, ...)` call; that callback resolves the
      actor, then calls `gate(actor)`, then calls `fn(actor)`, per
      design.md's "Decisions" section.
- [x] 2.3 Export both from `routes.ts`/`errors.ts` for the sibling modules
      to import, matching this capability's existing shared-helper pattern.

## 3. Migrate call sites onto the shared wrapper and helper (findings 42, 45)

- [x] 3.1 In `src/http/routes.ts`, replace each `resolveActor` +
      `requireRole`/`requireStudioRead`/`requireAuthoring` preamble with a
      `route(...)` call, except handlers whose gate needs the request body
      (for example `handlePublish`), which keep their inline `resolveActor`
      call per design.md's carve-out. `handleListInstances` migrates too,
      via the shape design.md's "`handleListInstances`'s conditional gate"
      decision states: construct the `URL` before calling `route` (that
      alone never throws), but call `parseScope` from inside the `gate`
      closure passed to `route`, so an unknown `scope` value still throws
      inside `guarded`'s protection and still maps to the same `400` it
      maps to today, instead of escaping unprotected ahead of `route`. The
      `gate` closure assigns the parsed `scope` to a `let` declared in the
      handler's own outer scope; `fn` reads that `let`, relying on `route`
      always running `gate` before `fn` inside the same `guarded` call.
- [x] 3.2 Do the same migration in `src/http/admin-routes.ts`, including
      `handleAdminListDataLists` and `handleAdminGetDataList`. Both gate on
      the local `requireDataListRead(actor)` composite, which already has
      `route`'s `gate: (actor) => void` shape; pass the function itself as
      `gate`, per design.md's "The six `requireDataListRead`/
      `requirePermission` sites."
- [x] 3.3 Do the same migration in `src/http/studio-routes.ts`, including
      `handleGetMigrationPlan`, `handlePutMigrationPlan`,
      `handleGetOrphanKeys` and `handlePublishDraft`. Each gates on
      `requirePermission(actor, action, processId, db)` with a
      URL-derived `processId`, not the request body, so none needs the
      `POST /processes` carve-out. The first three pass a one-line closure,
      `(actor) => requirePermission(actor, "migrate", processId as
      ProcessId, db)`; `handlePutMigrationPlan` keeps its own request-body
      read (the migration spec) inside `fn`, after the gate runs.
      `handlePublishDraft` composes two checks in one closure,
      `requireAuthoring` first then `requirePermission(actor, "publish",
      processId as ProcessId, db)`, matching design.md's stated closure
      shape.
- [x] 3.4 Do the same migration in `src/http/reporting-routes.ts`.
- [x] 3.5 Replace each of the 16 hand-written `{ status: 404, body: {
      error: { type: "not-found", ... } } }` literals across
      `studio-routes.ts`, `admin-routes.ts`, `server.ts` and
      `reporting-routes.ts` with a call to `notFound(message)`.
- [x] 3.5a In `reporting-routes.ts`, delete the local `notFound(processId:
      string)` wrapper (line 40) and rewrite its single call site (line 74)
      to `notFound(`no such process: ${processId}`)`, using the imported
      shared helper and preserving the exact message text. This local
      wrapper's name collides with the shared `notFound(message: string)`
      import added in task 3.4/3.5; deleting it (rather than keeping both) is
      required for `tsc` to accept the duplicate-free import.
- [x] 3.5b In `admin-routes.ts`, delete the local `notFoundList(listKey:
      string)` wrapper (line 542) and rewrite its five call sites (lines
      595, 617, 638, 657, 682) to `notFound(`no data list: ${listKey}`)`,
      using the imported shared helper and preserving the exact message
      text. Unlike 3.5a's `notFound`, this wrapper's name does not collide
      with the import, so `tsc` accepts it unchanged if left in place;
      delete it anyway, per design.md's "Two local not-found wrappers get
      deleted, not one."
- [x] 3.6 Confirm no module other than `routes.ts`/`errors.ts` declares its
      own copy of the preamble, the 404 literal, or a wrapper function
      around the 404 literal (by name or by shape — task 3.5b's
      `notFoundList` shows a wrapper can carry a non-colliding name and
      still need deleting).

## 4. Delete ui-strings-routes.ts (finding 46)

- [x] 4.1 Move `handleGetUiStrings` from `src/http/ui-strings-routes.ts`
      into `src/http/admin-routes.ts`, beside `handleAdminListUiStrings`.
- [x] 4.2 Update `admin-routes.ts`'s header comment. It currently states
      "Each handler resolves the actor then requires `ADMIN_ROLE` before any
      read or write," which `handleGetUiStrings` does not do. Note that
      handler's exception: no actor resolution, no role check.
- [x] 4.3 Update `src/http/server.ts`'s route wiring to import
      `handleGetUiStrings` from `admin-routes.ts`.
- [x] 4.4 Confirm no `test/*.test.ts` file imports
      `src/http/ui-strings-routes.ts` or `handleGetUiStrings` directly
      (verified during review: none do; every `GET /ui-strings` test drives
      the route through `createServer`'s HTTP surface instead, covered by
      task 4.3's `server.ts` import update).
- [x] 4.5 Delete `src/http/ui-strings-routes.ts`.

## 5. Delete health.ts (finding 46)

- [x] 5.1 Move `checkDbReady`, `handleLivez` and `handleReadyz` from
      `src/http/health.ts` into `src/http/server.ts`, beside the
      special-cased `/livez` and `/readyz` branches that call them.
- [x] 5.2 Update `test/health.test.ts`'s import to
      `../src/http/server.js` (or the exact path the functions land at).
- [x] 5.3 Delete `src/http/health.ts`.
- [x] 5.4 Update `docs/current-state.md`'s three references to
      `ui-strings-routes.ts` and `health.ts` as separate, existing route
      modules, to reflect their merge into `admin-routes.ts` and
      `server.ts`: the "Shared server helpers" section's "Six route
      modules sit there today: ui-strings-routes.ts and account-routes.ts
      ..." sentence, the UI-strings section's "It has its own module, for
      the reason health.ts has one" sentence, and the "Personal profile
      page" section's "a sixth route module, beside routes.ts,
      admin-routes.ts, studio-routes.ts, reporting-routes.ts and
      ui-strings-routes.ts" sentence.

## 6. Cut history-narrating comments (finding 44)

- [x] 6.1 In `src/http/server.ts`, delete or rewrite comments that name a
      completed change instead of stating a present fact.
- [x] 6.2 Do the same in `src/http/admin-routes.ts`.
- [x] 6.3 Do the same in `src/auth/users.ts`.
- [x] 6.4 Do the same in `src/auth/authorize.ts`, taking care to keep every
      comment stating a current invariant, per design.md's "Risks /
      Trade-offs".
- [x] 6.5 Grep each of the four files for `before|after|used-to|previously|
      no-longer|formerly|stage \d+` and for any backtick-quoted name of a
      past change (e.g. an OpenSpec change slug). The `stage \d+` alternative
      catches a stage-numbered cross-reference like `admin-routes.ts`'s "cli.ts
      has written role strings unchecked since stage 7" and "the defect stage
      29 hit", and `authorize.ts`'s "ROADMAP.md stage 40 carries the design".
      For each match, confirm the sentence states a currently-true fact
      rather than a historical contrast; rewrite or delete any that does
      not. A stage cross-reference that states a still-true fact about
      present behavior (e.g. "unchecked since stage 7" describing a gap that
      remains open today) stays; one that narrates a completed change by
      name does not. Re-run the grep until it returns no history-narrating
      match in any of the four files.

## 7. Verification

- [x] 7.1 Run `bun run typecheck` and confirm zero errors.
- [x] 7.2 Run `bun run build` and confirm it succeeds.
- [x] 7.3 Run the full `bun test` suite with `DATABASE_URL` set. Confirm the
      skip count matches the pre-change baseline (no suite silently skips)
      and that every named test passes, including `test/health.test.ts` and
      any suite covering `GET /ui-strings`, the 404 responses, and every
      route this change touched.
- [x] 7.4 Run the antislop linter (`antislop` skill) over every Markdown
      file this change touched, plus every source-comment-bearing file from
      section 6, and resolve every finding.
- [x] 7.5 Run `git diff --check` over the changed files and confirm no
      trailing whitespace or blank-line-at-EOF findings.
