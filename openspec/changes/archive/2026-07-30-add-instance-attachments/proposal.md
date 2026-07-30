## Why

A participant working an instance today has no way to attach a file to it.
Examples: a receipt image at an expense-approval step, a signed document, a
scan. Roadmap #23c closes this gap. It is the third and last of the
Extended Task Collaboration sub-projects. The first two, #23a task
delegation and #23b instance comments, already shipped.

## What Changes

- New `instance_attachments` table (`id` `attachment_`-prefixed,
  `instanceId`, `actorId`, `filename`, `contentType`, `sizeBytes`, `data`
  `bytea`, `createdAt`), deliberately outside the `HistoryEntry`/
  `InstanceEvent` audit backbone. Same reasoning `instance-comments-design`
  already applies to comment text.
- `uploadAttachment`/`listAttachments`/`getAttachment` in
  `src/runtime/api.ts`, reusing the same `loadInstanceForActor` visibility
  helper `postComment`/`listComments` already introduced; no new permission
  tier.
- `POST /instances/:id/attachments`: body `{ filename, contentType,
  dataBase64 }`, a JSON envelope (no multipart parsing exists in
  `src/http/` today). Rejects a decoded payload over
  `MAX_ATTACHMENT_BYTES` (environment-configured, default 5 MB). That
  default accounts for base64 overhead against the existing
  `MAX_REQUEST_BODY_SIZE` request cap. `filename`/`contentType` each cap
  at 255 characters.
- `GET /instances/:id/attachments`: lists metadata only (never `data`),
  paginated the same way `getInstanceRecord`/`listComments` already are.
- `GET /instances/:id/attachments/:attachmentId`: returns the raw bytes
  with `contentType` set on the response.
- `packages/app`'s Task screen gains an "Attach a file" control. It offers
  a file picker, an upload button, and a list of already-attached files,
  each with a download link.
- No previews/thumbnails, no virus scanning, no field-scoped attachments,
  no object-storage backend. See design.md's Non-goals.

## Capabilities

### New Capabilities
There are none. This change extends existing capabilities' surface,
the same shape #23a and #23b already used.

### Modified Capabilities
- `runtime-api`: adds `uploadAttachment`/`listAttachments`/`getAttachment`.
- `http-wrapper`: adds the three attachment routes, their error mapping,
  and their CORS preflight handling.
- `persistence`: adds the `instance_attachments` relation and its index.
- `end-user-app`: the Task screen gains an attachment section (upload
  control + file list) alongside the existing field form and comment
  thread.

## Impact

- Schema: one new table, `instance_attachments`
  (`src/engine/store.ts::initSchema`).
- Runtime API Layer: `uploadAttachment`/`listAttachments`/`getAttachment`
  in `src/runtime/api.ts`, beside `postComment`/`listComments`, reusing
  `loadInstanceForActor`.
- HTTP: three new routes in `src/http/routes.ts`, plus one new
  environment variable, `MAX_ATTACHMENT_BYTES`.
- Frontend: `packages/app`'s `TaskScreen.tsx` and `api/client.ts`.
- Out of scope for this change: Roadmap #20's `redactInstance` does not
  exist yet. Roadmap #20 carries a DONE design and a NOT STARTED
  implementation, so no coupling code lands here. The design's
  redaction-coupling note applies once #20 ships, and must then also cover
  this change's table (both `instance_comments` and
  `instance_attachments`).
