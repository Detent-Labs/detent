## Context

Roadmap #23c is the third and last Extended Task Collaboration
sub-project. #23a (task delegation) and #23b (instance comments) already
shipped. The source design is
`docs/superpowers/specs/2026-07-30-instance-attachments-design.md`,
approved 2026-07-30. It settled the storage question (Postgres `bytea`,
not object storage) and the route shape. This document works out the
implementation decisions the source design left open.
`add-instance-comments`'s own `design.md` set this same precedent for its
sibling change, #23b.

`#23b` already extracted the visibility rule this change reuses:
`loadInstanceForActor(instanceId, actor, db)` (`src/runtime/api.ts:556`).
It admits `ADMIN_ROLE`, the instance's `startedBy`, the current step's
`claimedBy`, or an `isEligibleCandidate` match. It collapses a
non-admin's load error into `AuthorizationError`. `postComment` and
`listComments` already call it. This change adds three more callers, and
no new helper.

## Goals / Non-Goals

**Goals:**
- Let any actor who can already read an instance under
  `loadInstanceForActor`'s rule upload, list, and download attachments on
  it.
- Keep attachment storage outside the `HistoryEntry`/`InstanceEvent`
  audit backbone, the same reasoning `instance_comments` already applies.
- Cap upload size so one request cannot write an unbounded row.
- Keep that cap's default compatible with the existing
  `MAX_REQUEST_BODY_SIZE` request-body limit, after base64 overhead.

**Non-Goals** (unchanged from the source design):
- Object storage as the initial backend.
- Virus or malware scanning.
- Previews or thumbnails.
- Attaching a file to one specific field.
- Wiring `redactInstance` to clear `instance_attachments`. Roadmap #20
  carries a DONE design and a NOT STARTED implementation. No
  `redactInstance` function exists yet to extend.

## Decisions

**Which capabilities this change touches.** No new capability. This
extends `persistence` (new table and index), `runtime-api`
(`uploadAttachment`/`listAttachments`/`getAttachment`), `http-wrapper`
(three routes), and `end-user-app` (the UI). `add-instance-comments` set
this exact precedent for its own sibling change. This change follows it.

**Table shape.** `instance_attachments`:
```
id           text PRIMARY KEY   -- 'attachment_' + crypto.randomUUID()
instance_id  text NOT NULL
actor_id     text NOT NULL
filename     text NOT NULL
content_type text NOT NULL
size_bytes   integer NOT NULL
data         bytea NOT NULL
created_at   timestamptz NOT NULL DEFAULT now()
```
One index, `instance_attachments_instance_idx`, sits on `(instance_id,
created_at, id)`. This mirrors `instance_comments_instance_idx`
(`src/engine/store.ts:117`) exactly. Listing follows the same
oldest-first keyset shape.

**Where the code lives.** `uploadAttachment`, `listAttachments`, and
`getAttachment` land in `src/runtime/api.ts`, beside `postComment` and
`listComments` (`src/runtime/api.ts:897`, `:915`). All three call
`loadInstanceForActor` before touching `instance_attachments`, the same
way the two comment functions already use it.

`listAttachments` never selects the `data` column. It keyset-paginates
`(created_at, id)` ascending. It reuses the same `created_at::text`
lossless-cursor fix `listComments` already applies
(`src/runtime/api.ts:925`-`932`). The identical millisecond-precision
bug would otherwise reappear here on a fresh table.

`getAttachment` selects one row by `id`, scoped to `instance_id =
instanceId` in the same query. Without that second predicate, an actor
who may read instance A could download an attachment belonging to
instance B. Guessing or observing its id would be enough.
`loadInstanceForActor` only checks that the actor may read instance A. It
never checks that the attachment belongs to instance A. The scoped query
closes that gap directly in SQL.

A row matching `id` but not `instance_id`, or matching neither, SHALL
raise `NotFoundError`. This mirrors `getInstanceRecord`'s own convention.
`errors.ts` maps `NotFoundError` to 500, not 404. A genuinely missing or
mismatched attachment then behaves the same way a missing instance
already does.

`getAttachment` returns `{ filename, contentType, data: Uint8Array }` to
the caller, not an `InstanceAttachment` (the metadata-only type
`uploadAttachment`/`listAttachments` use). That type deliberately
excludes `data`. A list response can then never carry file bytes by
accident.

**The HTTP boundary owns base64 decoding and the size cap.**
`postComment` already set this division of labour. It trusts `text` as
pre-validated and runs no check of its own.

The cap here needs one more step than a plain length check. The request
carries `dataBase64`, not raw bytes. `routes.ts` decodes it with
`Buffer.from(dataBase64, "base64")`. It then compares the decoded
`.length` against `MAX_ATTACHMENT_BYTES`. An overflow throws
`RequestShapeError`.

`uploadAttachment` receives an already-decoded `Uint8Array` and an
already-checked `sizeBytes`. It performs no decoding and no size check of
its own. This matches `postComment`'s trust boundary.

**`MAX_ATTACHMENT_BYTES` must stay under `MAX_REQUEST_BODY_SIZE`, not just
follow the `PORT` env-var pattern.** `src/http/server.ts:456`'s
`MAX_REQUEST_BODY_SIZE` (8 MiB) already bounds every request body
`Bun.serve` accepts, on every route. Base64 inflates a decoded file by
roughly a third once encoded into the JSON body. A 10 MB default would
produce a body near 13.3 MB. `Bun.serve` would reject that request
first. `uploadAttachment`'s own check would never run, and the caller
would see none of this change's `RequestShapeError` handling.

The default drops to 5 MB instead:
`Number(process.env.MAX_ATTACHMENT_BYTES ?? 5 * 1024 * 1024)`, still
shaped like `PORT`'s `Number(process.env.PORT ?? 3000)`
(`src/http/server.ts:478`). Five megabytes, base64-encoded, stays near
6.7 MB. That leaves comfortable headroom under the 8 MiB ceiling for the
JSON envelope's own small overhead.

Raising `MAX_ATTACHMENT_BYTES` past roughly three-quarters of
`MAX_REQUEST_BODY_SIZE` reintroduces the same silent rejection this
default avoids. This document adds no runtime check tying the two
together. `MAX_REQUEST_BODY_SIZE` is a shared constant. No
route-specific config reads it today. A comment beside
`MAX_ATTACHMENT_BYTES`'s own definition names the dependency instead.

**Naming.** `InstanceAttachment` matches the `InstanceComment`/
`InstanceSummary` family already in `src/runtime/api.ts`. No DOM-global
name collision exists for `Attachment`, unlike the reason
`InstanceComment` displaced a bare `Comment`.

**HTTP routes.**
- `POST /instances/:id/attachments`: body `{ filename, contentType,
  dataBase64 }`. A new `attachmentBodySchema` validates it: `filename`
  and `contentType` non-empty, capped at 255 characters each; `dataBase64`
  non-empty. This gives runtime user text an explicit cap, mirroring
  `commentBodySchema`'s own shape (`src/http/routes.ts:55`-`57`) and
  `MAX_COMMENT_LENGTH`'s rigor. It returns 201 with the created
  `InstanceAttachment`, never `data`.
- `GET /instances/:id/attachments`: `limit`/`cursor` query params,
  identical to `GET /instances/:id/comments`. It returns 200 with
  `Page<InstanceAttachment>`.
- `GET /instances/:id/attachments/:attachmentId`: returns the raw file
  bytes with `content-type` set to the stored `contentType`.

**The download route breaks the JSON-only response envelope.**
`toResponse` (`src/http/server.ts:89`-`94`) always JSON-encodes
`HttpResult.body`. A file download cannot use that path unchanged.

This change adds a second response shape, for a successful download
only:
```
HttpBinaryResult = { status: number; contentType: string; data: Uint8Array }
```
Only `handleGetAttachment` returns it.

**`guarded` becomes generic to return either shape.** `guarded`
(`src/http/routes.ts:92`) declares `Promise<HttpResult>` today.
`handleGetAttachment` cannot return `HttpBinaryResult` through it
unchanged. This document widens `guarded`'s signature to `guarded<T>(req:
Request, fn: () => Promise<T>): Promise<T | HttpResult>`. Every existing
call site still infers `T = HttpResult`. No other handler's behavior
changes. `handleGetAttachment` alone instantiates it with `T =
HttpBinaryResult`.

`handleGetAttachment` can still fail, for example with
`AuthorizationError`. `guarded`'s `catch` branch then returns a plain
`HttpResult` instead. `mapError` maps that the same way it maps every
other route's errors.

**`server.ts`'s shared `toRes` cannot handle this one route unchanged.**
`toRes` (`server.ts:210`) always calls `toResponse`, which always
JSON-encodes. The new route's dispatch branch checks the result's shape
first, instead of calling `toRes` directly:
```
const result = await handleGetAttachment(parts[1]!, parts[3]!, req, resolver, db);
if ("contentType" in result) {
  return new Response(result.data, { status: result.status, headers: { "content-type": result.contentType, ...corsHeaders(allowedOrigins, origin) } });
}
return toRes(result);
```
No other route's handler or dispatch branch changes.

**Frontend.** `packages/app`'s Task screen gains an upload control: a
file picker plus a submit button. The button reads the file via
`FileReader`. It base64-encodes the result client-side, then posts it.
The screen also lists attachments fetched via `GET`, each with a
download action.

A download cannot be a plain `<a href>`. The route needs the same
`Authorization` bearer token every other API call already sends. A
static anchor tag cannot carry a header.

The download action instead fetches the route with the existing auth
header. It reads the response as a `Blob`. It then creates a temporary
`URL.createObjectURL` link and triggers the browser's save dialog. It
revokes the link afterward.

JWT auth already forces this same pattern on every other authenticated
read in this SPA. No simpler option fits the existing auth model.

## Risks / Trade-offs

- [Unbounded attachment count on a long-running instance] → the same
  gap `instance_comments` already accepted. A later change wires Roadmap
  #20's redaction once it ships. `MAX_ATTACHMENT_BYTES` bounds one row's
  size; pagination bounds one request's cost. Neither bounds total row
  count.
- [Base64 inflates upload size by roughly a third over raw bytes] →
  accepted. This matches the JSON-envelope choice the source design
  already made. No multipart parser exists in `src/http/` today. Adding
  one for this single route costs more than the transfer overhead it
  would save.
- [Large files bloat the database over time] → the source design's own
  accepted trade-off for choosing `bytea` over object storage. Revisit
  only once real file volume makes it a measured cost, not a guessed one.
- [`Buffer.from(dataBase64, "base64")` does not reject malformed input] →
  Bun's base64 decoder silently drops characters outside the base64
  alphabet instead of throwing. A malformed `dataBase64` yields truncated
  or empty bytes, not a clear 400. This stays silent but not unsafe.
  Every caller in this system encodes through `FileReader`, which never
  produces malformed base64.
- [`size_bytes integer` caps at roughly 2.1 GB] → far above any sane
  `MAX_ATTACHMENT_BYTES` default. Worth a comment at the column
  definition. Raising `MAX_ATTACHMENT_BYTES` well past the default risks
  hitting this ceiling unnoticed.
- [No test in this repository verifies `Bun.sql`'s `bytea` binding for a
  `Uint8Array`] → no existing table stores or reads binary data through
  `Bun.sql` today. Mitigation: tasks.md's first task runs a small,
  throwaway insert/select round trip against a temporary table. This
  happens ahead of the feature itself. A driver-binding surprise then
  surfaces there, not deep inside the runtime API or HTTP layers.

## Migration Plan

Additive only: one new table, one new index, and three new routes. It
also adds one new environment variable, `MAX_ATTACHMENT_BYTES`, with a
safe default, and one new UI section. No existing table, route, or
schema changes. It deploys and rolls back like any other additive
change. A rollback that drops `instance_attachments` loses attachment
history. It touches no other state.

## Open Questions

None. The source design left one choice open: the oversized-upload
status code. This document settles it above: `RequestShapeError`, mapped
to 400, the same status `commentBodySchema`'s length violation already
returns. Not a distinct 413.
