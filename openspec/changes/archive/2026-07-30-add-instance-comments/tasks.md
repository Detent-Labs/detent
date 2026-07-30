## 1. Schema

- [x] 1.1 In `src/engine/store.ts::initSchema`, add `CREATE TABLE IF NOT
      EXISTS instance_comments (id text PRIMARY KEY, instance_id text NOT
      NULL, actor_id text NOT NULL, text text NOT NULL, created_at
      timestamptz NOT NULL DEFAULT now())`, placed beside
      `instance_events` (confirmed at lines ~97-105).
- [x] 1.2 Add `CREATE INDEX IF NOT EXISTS instance_comments_instance_idx
      ON instance_comments (instance_id, created_at, id)`.

## 2. Runtime API Layer

- [x] 2.1 In `src/runtime/api.ts`, factor `getInstanceView`'s existing
      visibility check (confirmed at lines ~549-564: `ADMIN_ROLE`, or
      `startedBy === actor.id`, or `assignment?.claimedBy === actor.id`,
      or `isEligibleCandidate`) into a local helper, e.g.
      `assertCanReadInstance(instance, actor)`, throwing the same
      `AuthorizationError` message shape. Update `getInstanceView` to call
      it.

      Implemented as `loadInstanceForActor(instanceId, actor, db)` instead
      of a narrower `assertCanReadInstance(instance, actor)`: the
      not-found-vs-not-visible collapse (admin loads directly, everyone
      else's load failure collapses into `AuthorizationError`) is
      entangled with the load itself, not separable from it, so the
      shared helper has to own both.
- [x] 2.2 Add an `InstanceComment` type, not `Comment` (that name
      collides with the DOM's own `Comment` node interface, in scope in
      `packages/app`): `{ id: string; instanceId: InstanceId; actorId:
      string; text: string; createdAt: string }`.
- [x] 2.3 Add `postComment(instanceId, actor, text, db = sql):
      Promise<InstanceComment>`. Load the instance via
      `loadInstanceForRead`, run `assertCanReadInstance`, then insert a
      row with id `comment_` + `crypto.randomUUID()` and return it as an
      `InstanceComment`. `text` is trusted as already validated by the
      caller (see task 3.1) — `postComment` performs no independent
      length or emptiness check, the same division of labour
      `delegateClaim` already applies to `toActorId`.
- [x] 2.4 Add `listComments(instanceId, actor, page, db = sql):
      Promise<Page<InstanceComment>>`. Run `assertCanReadInstance`, then
      keyset-paginate `instance_comments` oldest-first by `(created_at,
      id)` ascending, reusing `encodeCursor`/`decodeCursor` and the same
      `limit` defaults `getInstanceRecord` uses
      (`DEFAULT_RECORD_LIMIT`/`MAX_RECORD_LIMIT`).
- [x] 2.5 Add `test/comments.runtime-api.test.ts`: an eligible candidate,
      the starter, and an admin can each post and list comments; an
      unrelated actor gets `AuthorizationError` on both; comments list
      oldest-first; a full page returns a cursor.

## 3. HTTP wrapper

- [x] 3.1 In `src/http/routes.ts`, add `const MAX_COMMENT_LENGTH =
      10_000` and `commentBodySchema = z.object({ text:
      z.string().trim().min(1).max(MAX_COMMENT_LENGTH) })` (mirroring
      `delegateBodySchema`'s pattern at line ~44), and
      `handlePostComment(instanceId, req, resolver, db)` /
      `handleListComments(instanceId, req, resolver, db)`, following
      `handleDelegate`/`handleInstanceRecord`'s `guarded(...)` shape.
- [x] 3.2 Wire `POST /instances/:instanceId/comments`, `GET
      /instances/:instanceId/comments`, and both routes' `OPTIONS`
      preflight in `src/http/server.ts`, alongside the existing
      `/delegate` and `/record` routes (confirmed at lines ~243-249,
      332-340).
- [x] 3.3 Confirm no new `errors.ts` mapping is needed: `parseJsonBody`
      already turns a `commentBodySchema` mismatch (empty or over-length
      text) into `RequestShapeError` → 400 (confirmed at lines ~52-63,
      the same path `/delegate`'s missing-`toActorId` case uses), and
      `AuthorizationError` → 403 is already mapped (confirmed at line
      73).
- [x] 3.4 Add cases to `test/http.test.ts`: a successful post returns
      201; an empty-text post and an over-`MAX_COMMENT_LENGTH` post both
      return 400; a successful list returns 200 with the posted comment;
      an unauthorized actor gets 403 on both routes.

## 4. Frontend (packages/app)

- [x] 4.1 In `packages/app/src/api/client.ts`, add `postComment(instanceId,
      text, token)` and `listComments(instanceId, token, cursor?)`,
      mirroring `delegate`'s `request(...)` pattern (confirmed at lines
      ~94-100). Also added `InstanceComment`/`CommentPage` to
      `api/types.ts`, matching the `InstanceSummary`/`InstancePage`
      convention there.
- [x] 4.2 In `packages/app/src/screens/TaskScreen.tsx`, add a comment
      thread section: fetch via `listComments` on load and after a
      successful post, render oldest-first with actor id and timestamp,
      and a text box plus submit button calling `postComment`, mirroring
      the existing Delegate-to control's state/handler shape (confirmed
      at lines ~23, ~112-116, ~194-203).
- [x] 4.3 Add `task.commentsHeading`/`task.commentPlaceholder`/
      `task.commentSubmit` to `packages/app/src/i18n/catalog.ts`'s `de`
      and `en` entries.
- [x] 4.4 Add layout rules for the new section to
      `packages/app/src/app.css`, beside `.app-task-delegate`'s existing
      style.

## 5. Verification

- [x] 5.1 Run `bun run typecheck` inside the devcontainer; fix any
      reported error. Clean on both the engine and all four frontend
      packages.
- [x] 5.2 Run the full `bun test` suite inside the devcontainer with
      `DATABASE_URL` set (never a single-file rerun — see CLAUDE.md).
      Confirm zero failures and that the DB-backed suites did not skip.

      First run: 1 failure, `test/comments.runtime-api.test.ts`'s cursor
      test. Root cause: Bun's Postgres driver returns a `timestamptz`
      column as a JS `Date` (millisecond precision). Building the
      pagination cursor from `new Date(last.created_at).toISOString()`
      (the same pattern `listInstances` already uses at
      `src/runtime/api.ts:801`) silently rounded the cursor to the
      millisecond, while the next query's `WHERE` clause still compared
      against the column's full microsecond precision — so the boundary
      row's genuinely-later sub-millisecond timestamp compared greater
      than its own rounded cursor and reappeared on the next page. Fixed
      in `listComments` by also selecting `created_at::text` and
      building the cursor from that lossless text instead of a `Date`
      round-trip; `postComment`'s and `listComments`' display-facing
      `createdAt` field still use `.toISOString()`, which is fine for
      display precision. Full suite: 1297/1297 pass after the fix.

      **Not fixed as part of this change** (out of scope, pre-existing):
      `listInstances` (`src/runtime/api.ts:801`) has the identical latent
      bug, undiscovered until this change's test happened to post
      several comments in tight succession. Flagged to the user; not
      touched here since it belongs to a different capability
      (`instance-query`) this change does not otherwise modify.
