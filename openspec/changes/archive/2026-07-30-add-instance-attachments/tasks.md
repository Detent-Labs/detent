## 1. Spike: verify Bun.sql's binary binding

- [x] 1.1 Before writing any of the feature below, confirm `Bun.sql` can
      round-trip binary data as a `bytea` column. Against a throwaway
      `CREATE TEMP TABLE spike_bytea (data bytea)` (not
      `instance_attachments`, which does not exist yet), insert one row
      with a small `Uint8Array`/`Buffer` value as the `data` parameter,
      select it back, and confirm the returned bytes match byte-for-byte.
      Drop the temp table afterward (or let the session end, since it is
      a `TEMP TABLE`). If the driver needs different binding than a
      direct `Uint8Array` parameter (for example an explicit cast or
      hex encoding), adjust tasks 2.1, 3.2, and 3.4 below accordingly
      before proceeding. See design.md's Risks/Trade-offs.

      Verified inside the devcontainer: a `Uint8Array` binds directly as
      an INSERT parameter against a `bytea` column, and `Bun.sql` returns
      it back as a `Buffer` (a `Uint8Array` subclass) with byte-for-byte
      equality. No special binding, cast, or encoding needed — tasks 2.1,
      3.2, and 3.4 proceed as designed.

## 2. Schema

- [x] 2.1 In `src/engine/store.ts::initSchema`, add `CREATE TABLE IF NOT
      EXISTS instance_attachments (id text PRIMARY KEY, instance_id text
      NOT NULL, actor_id text NOT NULL, filename text NOT NULL,
      content_type text NOT NULL, size_bytes integer NOT NULL, data bytea
      NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`, placed
      beside `instance_comments` (confirmed at lines ~110-117). Add a
      short comment on `size_bytes` noting its ~2.1 GB (32-bit) ceiling,
      per design.md's Risks/Trade-offs.
- [x] 2.2 Add `CREATE INDEX IF NOT EXISTS instance_attachments_instance_idx
      ON instance_attachments (instance_id, created_at, id)`.

## 3. Runtime API Layer

- [x] 3.1 In `src/runtime/api.ts`, add an `InstanceAttachment` type (metadata
      only, no `data`): `{ id: string; instanceId: InstanceId; actorId:
      string; filename: string; contentType: string; sizeBytes: number;
      createdAt: string }`.
- [x] 3.2 Add `uploadAttachment(instanceId, actor, { filename, contentType,
      data, sizeBytes }, db = sql): Promise<InstanceAttachment>`, beside
      `postComment` (confirmed at `src/runtime/api.ts:897`). Calls
      `loadInstanceForActor`, inserts a row with id `attachment_` +
      `crypto.randomUUID()`, and returns the created row's metadata.
      Performs no independent decoding or size check (see design.md).
- [x] 3.3 Add `listAttachments(instanceId, actor, page, db = sql):
      Promise<Page<InstanceAttachment>>`, beside `listComments`
      (confirmed at `src/runtime/api.ts:915`). Calls
      `loadInstanceForActor`, then keyset-paginates
      `instance_attachments` oldest-first by `(created_at, id)`, reusing
      the same `created_at::text` lossless-cursor approach
      `listComments` already uses. Never selects `data`.
- [x] 3.4 Add `getAttachment(instanceId, attachmentId, actor, db = sql):
      Promise<{ filename: string; contentType: string; data: Uint8Array
      }>`. Calls `loadInstanceForActor`, then selects one
      `instance_attachments` row filtered by BOTH `id = attachmentId` AND
      `instance_id = instanceId`, including `data`. If no row matches
      either predicate, throws `NotFoundError` — this is what stops an
      actor who may read instance A from downloading an attachment that
      actually belongs to instance B by guessing its id (see design.md).
- [x] 3.5 Add `test/attachments.runtime-api.test.ts`: an eligible
      candidate, the starter, and an admin can each upload, list, and
      download attachments; an unrelated actor gets `AuthorizationError`
      on all three; `listAttachments` never includes `data`; a full page
      returns a cursor; `getAttachment` throws `NotFoundError` for an
      unknown `attachmentId` and for one that belongs to a different
      instance.

## 4. HTTP wrapper

- [x] 4.1 In `src/http/routes.ts`, add `MAX_ATTACHMENT_BYTES =
      Number(process.env.MAX_ATTACHMENT_BYTES ?? 5 * 1024 * 1024)` —
      5 MB, not 10 MB: base64-encoded that stays near 6.7 MB, under
      `server.ts`'s existing `MAX_REQUEST_BODY_SIZE` (8 MiB). Add a
      comment noting that raising this value past roughly three-quarters
      of `MAX_REQUEST_BODY_SIZE` causes uploads to fail at the
      `Bun.serve` layer instead of with this route's own
      `RequestShapeError` (see design.md). Also add
      `attachmentBodySchema = z.object({ filename: z.string().min(1).max(255),
      contentType: z.string().min(1).max(255), dataBase64: z.string().min(1) })`,
      mirroring `commentBodySchema`'s pattern (confirmed at
      `src/http/routes.ts:55`-`57`).
- [x] 4.2 Add `handleUploadAttachment(instanceId, req, resolver, db)`:
      parse the body via `parseJsonBody`, decode `dataBase64` with
      `Buffer.from(dataBase64, "base64")`, throw `RequestShapeError` if
      the decoded length exceeds `MAX_ATTACHMENT_BYTES`, then call
      `uploadAttachment` and return 201 with the created metadata.
- [x] 4.3 Add `handleListAttachments(instanceId, req, resolver, db)`,
      following `handleListComments`'s `guarded(...)` shape.
- [x] 4.4 Widen `guarded`'s signature in `src/http/routes.ts:92` to
      `guarded<T>(req: Request, fn: () => Promise<T>): Promise<T |
      HttpResult>` (currently hardcoded to `Promise<HttpResult>`). Every
      existing call site still infers `T = HttpResult`, so no other
      handler's behavior changes. Add `handleGetAttachment(instanceId,
      attachmentId, req, resolver, db)`, instantiating `guarded` with
      `T` = a new `HttpBinaryResult = { status: number; contentType:
      string; data: Uint8Array }` type on success, or falling through to
      `guarded`'s `catch` branch (a plain `HttpResult`) on error. See
      design.md's "guarded becomes generic to return either shape".
- [x] 4.5 In `src/http/server.ts`, add the `GET
      /instances/:instanceId/attachments/:attachmentId` dispatch branch
      as its own case, not through the shared `toRes` (`server.ts:210`):
      call `handleGetAttachment`, check `"contentType" in result`, and
      build a raw `new Response(result.data, { status: result.status,
      headers: { "content-type": result.contentType,
      ...corsHeaders(allowedOrigins, origin) } })` when it does;
      otherwise call `toRes(result)`. See design.md's "server.ts's shared
      toRes cannot handle this one route unchanged".
- [x] 4.6 Wire `POST /instances/:instanceId/attachments`, `GET
      /instances/:instanceId/attachments`, `GET
      /instances/:instanceId/attachments/:attachmentId` (task 4.5's
      branch), and both collection- and item-level `OPTIONS` preflight in
      `src/http/server.ts`, alongside the existing `/comments` routes
      (confirmed at lines ~248-253, 340-351).
- [x] 4.7 Add cases to `test/http.test.ts`: a successful upload returns
      201 without `data` in the body; an oversized upload returns 400; an
      over-length `filename`/`contentType` returns 400; a successful list
      returns 200 with metadata only; a successful download returns 200
      with the raw bytes and the right `content-type`; a download for an
      `attachmentId` that belongs to a different instance returns 500; an
      unauthorized actor gets 403 on all three routes.

## 5. Frontend (packages/app)

- [x] 5.1 In `packages/app/src/api/client.ts`, add
      `uploadAttachment(instanceId, filename, contentType, dataBase64,
      token)`, `listAttachments(instanceId, token, cursor?)`, and
      `downloadAttachment(instanceId, attachmentId, token)` (the last
      returning a `Blob`), mirroring `postComment`/`listComments`'s
      `request(...)` pattern. Add `InstanceAttachment`/`AttachmentPage`
      to `api/types.ts`.
- [x] 5.2 In `packages/app/src/screens/TaskScreen.tsx`, add an attachment
      section: a file picker plus upload button that reads the file via
      `FileReader`, base64-encodes it, and calls `uploadAttachment`; a
      list of attachments fetched via `listAttachments` on load and
      after a successful upload; and a download action per attachment
      that calls `downloadAttachment`, creates a temporary
      `URL.createObjectURL` link, triggers the save dialog, and revokes
      the link.
- [x] 5.3 Add `task.attachmentsHeading`/`task.attachmentUploadLabel`/
      `task.attachmentDownloadLabel` to `packages/app/src/i18n/catalog.ts`'s
      `de` and `en` entries.
- [x] 5.4 Add layout rules for the new section to
      `packages/app/src/app.css`, beside the existing comment-thread
      section's style.

## 6. Verification

- [x] 6.1 Run `bun run typecheck` inside the devcontainer; fix any
      reported error.

      Clean: the engine and all four frontend packages (`form-ui`,
      `admin`, `app`, `studio`) exit 0.
- [x] 6.2 Run the full `bun test` suite inside the devcontainer with
      `DATABASE_URL` set (never a single-file rerun — see CLAUDE.md).
      Confirm zero failures and that the DB-backed suites did not skip.

      1318/1318 pass across 80 files, 0 fail, no skip line reported (the
      DB-backed suites, including the two new
      `test/attachments.runtime-api.test.ts` and the new attachment cases
      in `test/http.test.ts`, ran for real against the devcontainer's
      Postgres, not skipped).

## 7. Post-verification fixes

`/opsx:verify` found one WARNING and one SUGGESTION. This section fixes both.

- [x] 7.1 (WARNING) `docs/openapi.yaml` documented the sibling `delegate`
      and `comments` routes but had no entry for the three attachment
      routes this change adds — a real gap in the published customer
      contract, unscoped by this change's own artifacts. Added
      `/instances/{instanceId}/attachments` (`POST`/`GET`) and
      `/instances/{instanceId}/attachments/{attachmentId}` (`GET`,
      documented as a non-JSON, raw-bytes response), an `attachmentId`
      path parameter, and three schemas
      (`AttachmentUploadRequest`/`InstanceAttachment`/
      `InstanceAttachmentPage`), mirroring the existing comment routes'
      shape. Updated the top-level description's route summary to
      mention attaching a file. Verified the YAML parses and every new
      path/schema/parameter resolves.
- [x] 7.2 (SUGGESTION) `specs/http-wrapper/spec.md`'s "over-length
      filename or contentType" scenario was only exercised via
      `filename` in `test/http.test.ts`, not `contentType`, even though
      both go through the identical `attachmentBodySchema` constraint.
      Added a symmetric test, "POST .../attachments with an over-length
      contentType maps to 400 request-shape", beside the existing
      filename case. Full `test/http.test.ts` run: 146/146 pass (up from
      145).
