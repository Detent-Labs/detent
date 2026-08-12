## 1. Freeze the actor ids on the outbox row

- [x] 1.1 Add an idempotent `actors jsonb` column to `outbox` in `initSchema`,
  beside the five such statements already in `src/engine/store.ts`.
- [x] 1.2 Add an optional `OutboxActors` field to `ClaimedRow` in
  `src/engine/outbox.ts`.
- [x] 1.3 Add `actors` to the claim `UPDATE`'s `RETURNING` list in
  `drainOutbox`, parsing jsonb the way `parseAction` handles a string.
- [x] 1.4 Stamp the column at `store.ts`'s subprocess-spawn insert, from `inst`.
- [x] 1.5 Stamp it at `transition.ts::applyStepEntry`, from `next`.
- [x] 1.6 Stamp it at `transition.ts`'s timer-fire insert, from `instance`.
- [x] 1.7 Write one helper in `src/engine/registry.ts` that builds the stamp
  from an `Instance`, so the three sites cannot drift.

## 2. Widen the handler seam

- [x] 2.1 Add optional `actors` to `HandlerContext` in `src/engine/registry.ts`,
  documenting that a row predating the column carries none.
- [x] 2.2 Pass `row.actors` through `deliver` in `src/engine/outbox.ts`.
- [x] 2.3 Confirm `http.request` and the two `core.` handlers still compile
  untouched.

## 3. Resolve addresses from actor ids

- [x] 3.1 Add `emailsForUserIds(ids, db)` to `src/auth/users.ts`. One query,
  disabled rows excluded, empty input short-circuits.
- [x] 3.2 Write tests in `test/` for the four cases the `local-user-accounts`
  delta names.

## 4. Teach notification.email the new recipients

- [x] 4.1 Replace `notificationEmailConfigSchema` with the four-field object
  plus the both-lists-empty rule.
- [x] 4.2 Turn the def into `notificationEmailHandlerDef(db = sql)`, the shape
  `managerOfStarterStrategyDef` uses.
- [x] 4.2a Change every call site to the factory form. They are
  `src/engine/host.ts`, `test/definitions.test.ts` and about twenty in
  `test/handlers-notification-email.test.ts`.
- [x] 4.3 Resolve tokens to ids, ids to addresses, then dedupe. Order is `to`
  first, then candidate order.
- [x] 4.4 Add the `ponytail:` comment naming the uncapped candidate list.
- [x] 4.5 Short-circuit an empty resolved list: no socket, empty `recipients`,
  succeeded, one `log.warn`.
- [x] 4.6 Feed the resolved list to `runSession`, `buildMessage` and the
  `RCPT TO` loop, replacing every read of `config.to`.
- [x] 4.7 Give `createDefaultRegistry` a `db` parameter defaulting to `sql`,
  and pass it at `src/http/server.ts`.

## 5. Keep the studio's generated form

- [x] 5.1 Widen `describeStringArray` in `src/engine/config-descriptor.ts` to
  accept a `ZodEnum` element, which fills `enumValues`.
- [x] 5.2 Add a test asserting `notification.email` still yields a descriptor.
- [x] 5.2a Correct `test/config-descriptor.test.ts`'s `notification.email`
  expectation. `to` turns optional and loses `minItems`, and `toActors` joins.
- [x] 5.3 In `PluginEnvelopeEditor.tsx`, replace the `string-array` text area
  with one checkbox per value when `enumValues` exists.
- [x] 5.4 Route any new hint or `aria-label` through the studio catalog, as
  `plugin.arrayHint` already is.
- [x] 5.5 Reject a `string-array` entry outside `enumValues` in
  `validateField`, which guards the raw JSON path.

## 6. Tests

- [x] 6.1 Publish tests: an actor-only config passes, an unknown token fails,
  two empty lists fail.
- [x] 6.2 Outbox tests: each of the three enqueue sites stamps the actors.
- [x] 6.3 Outbox test: a later assignment change leaves a pending row alone.
- [x] 6.4 Handler tests: one candidate, several candidates, dedupe against
  `to`, disabled account, unknown id.
- [x] 6.5 Handler tests: claimant and starter tokens.
- [x] 6.6 Handler test: an empty resolved list opens no socket and succeeds.
- [x] 6.7 Handler test: a row carrying no actors still delivers its literal
  `to`.

## 7. Documentation

- [x] 7.1 Add the recipient forms to the Action section of
  `docs/authoring-guide.md`.
- [x] 7.2 Correct the notifications entry in `docs/current-state.md`. It still
  states that recipients are never resolved.
- [x] 7.3 Add the `emailsForUserIds` export to `docs/current-state.md`'s symbol
  list, which nothing keeps current for us.
- [x] 7.4 Change stage 16 in `ROADMAP.md` to `DONE (a–b)`, replacing the
  half-open paragraph and naming this change with its specs.
- [x] 7.5 Add the inspector walk to `docs/browser-checks.md`.
- [x] 7.6 Confirm `docs/openapi.yaml` needs no change. `http-api-documentation`
  keeps `registry` out of that file.

## 8. Verification

- [x] 8.1 Run `bun run typecheck`, then `bun run build`.
- [x] 8.2 Run the full `bun test` with `DATABASE_URL` set. Report pass, skip
  and fail counts.
- [x] 8.3 Run the antislop linter over every Markdown file this change touches.
- [x] 8.4 Run `git diff --check` and `git ls-files --eol`.
- [x] 8.5 Browser check: the picker renders, an existing literal config loads,
  the JSON view round-trips.
