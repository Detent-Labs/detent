## 1. Share the four route helpers

- [x] 1.1 Read all four copies of `resolveActor`, `errorContext` and
  `guarded`. Read both copies of `parseLimit`. Confirm each body matches the
  one in `routes.ts` before deleting it.
- [x] 1.2 Add `export` to `resolveActor`, `errorContext`, `guarded` and
  `parseLimit` in `src/http/routes.ts`. Change no body.
- [x] 1.3 Delete `resolveActor`, `errorContext`, `guarded` and `parseLimit`
  from `src/http/admin-routes.ts`. Import all four from `./routes.js`.
- [x] 1.4 Delete the same three from `src/http/studio-routes.ts`. Import them
  from `./routes.js`.
- [x] 1.5 Delete the same three from `src/http/reporting-routes.ts`. Import
  them from `./routes.js`.
- [x] 1.6 Drop any import each of the three no longer needs, for example
  `mapError` or `ErrorContext`. `noUnusedLocals` reports these.

## 2. Simplify parseRoles

- [x] 2.1 Rewrite `parseRoles` in `src/http/admin-routes.ts` over `map` and
  `[...new Set(roles)]`. Keep the four `RequestShapeError` messages, the
  `MAX_ROLES` bound and the `MAX_ROLE_LENGTH` bound word for word.
- [x] 2.2 Confirm two named tests in `test/http-admin.test.ts` still pass.
  Line 334 refuses each malformed body with 400 and no write. Line 351 trims
  and deduplicates, first occurrence winning. The second is the regression
  net for the `Set` spread.

## 3. One assignment.unresolved event helper

- [x] 3.1 Add `makeAssignmentUnresolvedEvent(opts)` to `src/engine/store.ts`,
  beside `newInstanceEventId`. It takes `instanceId`, `transitionSeq`,
  `version`, `stepId`, `reason` and `at`. It returns an `InstanceEvent`.
- [x] 3.2 Replace the literal in `src/engine/transition.ts::commitTransition`
  with a call.
- [x] 3.3 Replace the literal in `src/engine/transition.ts`'s creation path
  with a call.
- [x] 3.4 Replace the literal in `src/engine/subprocess.ts`'s child spawn
  with a call.
- [x] 3.5 Confirm `test/assignment-unresolved-event.test.ts` still passes. It
  is the named regression net for all three sites.

## 4. Drop the two dead export keywords

- [x] 4.1 Drop `export` from `buildTransformContext` in `src/cel/eval.ts`.
  Its only reader is `evalMapTotal`'s caller in the same file.
- [x] 4.2 Drop `export` from `makeSpawnHandler` in
  `src/engine/subprocess.ts`. Its only reader is the registration in the same
  file.
- [x] 4.3 Confirm neither name appears in the engine package's `exports` map
  in `package.json`.

## 5. One http test fixture

- [x] 5.1 Add `test/helpers/http-fixture.ts`. Export `DB`,
  `authHeaders(actor)`, `authedReq(url, method, actor, body?)`, `initDb()`
  and `truncate(tables)`. Register no hook inside the helper. Bun caches the
  module across test files, so a module-scope `beforeAll` would register
  once and skip two suites.
- [x] 5.2 Convert `test/http.test.ts` to import from it. Keep its own
  registries, its own `fetch`, its own truncate list and its own two hooks.
- [x] 5.3 Convert `test/http-admin.test.ts` the same way.
- [x] 5.4 Convert `test/http-studio.test.ts` the same way.
- [x] 5.5 Compare each suite's truncate list against its list before this
  change. Studio alone truncates `drafts`, and admin alone truncates
  `auth_users`.

## 6. Documentation

- [x] 6.1 Note in each of the four helper doc comments in
  `src/http/routes.ts` that the sibling route modules import it. The design's
  stated cost is that `routes.ts` becomes two things; the code should say so.
- [x] 6.2 Rewrite the header comment of `src/http/admin-routes.ts`,
  `src/http/studio-routes.ts` and `src/http/reporting-routes.ts`. Each says
  it holds the "same shape" as `routes.ts`. Say that it imports the helpers.
- [x] 6.3 Append a `## Shared server helpers (\`dedup-server-helpers\`)`
  section to `docs/current-state.md`, following the one-section-per-change
  convention.

## 7. Verification

- [x] 7.1 Run `bun run typecheck`. Report what it printed.
- [x] 7.2 Run the FULL `bun test` with `DATABASE_URL` set, inside the
  devcontainer. Report the pass count AND the skip count. A single-file rerun
  is not the signal.
- [x] 7.3 Run the antislop linter over `proposal.md`, `design.md`,
  `tasks.md`, the spec delta and `docs/current-state.md`.
- [x] 7.4 Run `git diff --check`.
- [x] 7.5 Run `git ls-files --eol`. Read the `w/` column for CRLF.
- [x] 7.6 Confirm each touched Markdown file's antislop finding count did not
  rise against its count at `HEAD`. The push gate compares those two.
