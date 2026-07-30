## Why

A participant or assignee working an instance today has no way to leave a
free-text note on it. Field data captures decisions, not the context around
them (e.g. "called the vendor about the amount"). Roadmap #23b closes this
gap. It is the second of three Extended Task Collaboration sub-projects; the
first, #23a task delegation, shipped already.

## What Changes

- New `instance_comments` table (`id` `comment_`-prefixed, `instanceId`,
  `actorId`, `text`, `createdAt`), append-only, deliberately outside the
  `HistoryEntry`/`InstanceEvent` audit backbone. See design.md for why.
- `postComment`/`listComments` in `src/runtime/api.ts`, beside
  `getInstanceView`. `postComment` reuses `getInstanceView`'s existing
  visibility rule (any actor who can already read the instance); no new
  permission tier. See design.md for why this rule, not
  `getInstanceRecord`'s narrower one.
- `POST /instances/:id/comments`: post a comment, body `{ text: string
  }`, capped at `MAX_COMMENT_LENGTH` (10,000 characters).
- `GET /instances/:id/comments`: list an instance's comments, paginated
  with the same `limit`/`cursor` shape `getInstanceRecord` already uses.
- `packages/app`'s Task screen gains a comment thread next to the field
  form. It is a list (oldest first, author actor id + timestamp) plus a
  text box and a submit button.
- No editing, deleting, threading, or read receipts. See design.md's
  Non-goals.

## Capabilities

### New Capabilities
There are none. This change extends three existing capabilities'
surface. It does not introduce a new one. #23a task delegation followed
this same shape for its own sibling change.

### Modified Capabilities
- `runtime-api`: adds `postComment`/`listComments`.
- `http-wrapper`: adds the two comment routes, their error mapping, and
  their CORS preflight handling.
- `persistence`: adds the `instance_comments` relation and its index.
- `end-user-app`: the Task screen gains a comment thread (list + post
  form) alongside the existing field form.

## Impact

- Schema: one new table, `instance_comments`
  (`src/engine/store.ts::initSchema`).
- Runtime API Layer: `postComment`/`listComments` in `src/runtime/api.ts`,
  beside `getInstanceView`. They reuse its existing visibility check.
- HTTP: two new routes in `src/http/routes.ts`.
- Frontend: `packages/app`'s `TaskScreen.tsx` and `api/client.ts`.
- Out of scope for this change: Roadmap #20's `redactInstance` does not
  exist yet. Its design is DONE but its implementation is NOT STARTED, so
  no coupling code lands here. The design's redaction-coupling note applies
  once #20 ships.
