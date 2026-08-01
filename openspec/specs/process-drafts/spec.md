# process-drafts Specification

## Purpose

The server-side draft store for the developer's product (the studio area of `packages/web`):
a dedicated `drafts` table holding one mutable, pre-publish authored process
body per process, `src/engine/drafts.ts` (get/save/list/delete, with
revision-checked optimistic concurrency on save), and the
`system:developer`-gated `/drafts` routes (`src/http/studio-routes.ts`) that
expose it over HTTP. Deliberately separate from `definitions`, which holds
the immutable published bodies the resolution and timer workers rehydrate
running instances from — a draft is never a candidate for that table. See the
`authorization` capability for the `DEVELOPER_ROLE` these routes require and
`studio-app` for the frontend that consumes them.

## Requirements

### Requirement: A process has at most one mutable draft, stored in its own table

The engine SHALL persist process drafts in a dedicated `drafts` table created
by `src/engine/store.ts::initSchema`, keyed by `process_id` as its primary key,
so a process has at most one draft. The table SHALL carry the authored body
(`body jsonb`), a layout object (`layout jsonb`, default `'{}'`), a `revision
integer` starting at 0, a nullable `base_version integer`, `updated_by text`
and `updated_at timestamptz`.

Drafts SHALL NOT be stored as rows in `definitions`. `definitions` holds the
immutable published bodies that the resolution and timer workers rehydrate
running instances from; a mutable draft body in that table would make every
read site responsible for excluding it. The `"draft"` value declared by
`src/schema/definition.ts`'s status enum remains unwritten.

#### Scenario: The drafts table is created on schema init

- **WHEN** `initSchema` runs against an empty database
- **THEN** a `drafts` table exists with `process_id` as its primary key

#### Scenario: A second draft for the same process is impossible

- **WHEN** a draft is saved twice for the same `processId`
- **THEN** exactly one `drafts` row exists for that process

#### Scenario: Publishing still writes definitions, never drafts

- **WHEN** `publishBody` publishes a process body
- **THEN** a `definitions` row is written with `status = "published"` and no
  `drafts` row is created or modified by it

### Requirement: A draft body is stored as authored, with only its envelope validated

`saveDraft` SHALL store the body exactly as supplied — the **authored**,
uncompiled shape — and SHALL NOT parse it against `processBody`,
`authoredProcessBody`, or any structural refinement. A draft under
construction legitimately violates the authoring-time invariants (a step with
no exit, a path referencing a step not yet created, a `LocalizedText` whose
base-locale entry is still empty), and rejecting those at save would make the
draft unusable for its purpose.

The save path SHALL nonetheless validate the request envelope, since a `PUT`
is a trust boundary: `body` SHALL be a JSON object (not an array, scalar or
`null`), `layout` SHALL be an object, and `revision` SHALL be a non-negative
integer. A violation SHALL raise `RequestShapeError` (HTTP 400) and SHALL
leave any stored draft untouched.

The envelope check SHALL additionally bound the serialized size of `body` and
`layout` together, raising `RequestShapeError` when it is exceeded. The
previous rationale for having no draft-specific bound — that `POST /processes`
accepts an author-supplied body without one from the same class of role-gated
caller — no longer holds: the HTTP server now declares a
`maxRequestBodySize` that applies to both. The draft bound exists so that the
limit survives a caller that does not arrive over HTTP, since `drafts.ts` is a
module boundary in its own right.

The engine SHALL NOT cross-check a process id carried inside the body against
the route parameter — `ProcessBody` declares no `processId` field, so there is
nothing to compare.

Correctness SHALL be enforced where it already is: live in the studio's
editing surface against the engine's own validators, and unconditionally at
publish, which revalidates server-side regardless of what a client checked.
No engine path other than `drafts.ts` SHALL read `drafts.body`.

#### Scenario: A structurally invalid draft is stored

- **WHEN** `saveDraft` is called with a body whose only step has no outgoing
  path and no timer
- **THEN** the save succeeds and `getDraft` returns that body unchanged

#### Scenario: A draft body is not compiled on save

- **WHEN** a body is saved and read back
- **THEN** it is byte-equivalent JSON to what was supplied, with no
  compile-pass-injected content

#### Scenario: A non-object body is refused

- **WHEN** a save supplies `body` as an array, a string, a number or `null`
- **THEN** it raises `RequestShapeError` and no `drafts` row is written or
  modified

#### Scenario: A malformed revision is refused

- **WHEN** a save supplies `revision` as a negative number, a non-integer or a
  non-number
- **THEN** it raises `RequestShapeError` and the stored draft is unchanged

#### Scenario: An over-size draft is refused

- **WHEN** a save supplies a `body`/`layout` pair whose serialized size
  exceeds the declared bound
- **THEN** it raises `RequestShapeError` and the stored draft is unchanged

#### Scenario: A realistic draft is unaffected by the bound

- **WHEN** a draft of the size a real process definition reaches is saved
- **THEN** it is stored normally — the bound is sized to the largest
  plausible legitimate draft, not to typical ones

### Requirement: A save may declare the published version the draft derives from

`saveDraft` SHALL accept an optional `baseVersion` in its input, and
`PUT /drafts/:processId` SHALL accept the same field in its envelope. A save
that carries it SHALL store it in the draft's `base_version` column. A save
that omits it SHALL leave the stored `base_version` unchanged. An ordinary
editing save therefore does not clear a base that a seed or a publish
stamped.

`markDraftPublished` SHALL keep stamping `base_version` after a publish. The
two writers agree on the column's meaning: the published version this draft
was last identical to.

The envelope check SHALL treat `baseVersion` as it treats `revision`. It
SHALL be a positive integer when supplied, and a violation SHALL raise
`RequestShapeError` and SHALL leave any stored draft untouched.

`saveDraft` SHALL additionally reject a `baseVersion` that names no published
version of that process, with the same error and the same guarantee. A draft
body is opaque client state. A base version is a reference into
`definitions`. An unresolvable reference would leave the Versions screen
offering a comparison it cannot make. This check reads `definitions`. It does
not relax the rule that no engine path other than `drafts.ts` reads
`drafts.body`.

#### Scenario: A save declares its base version

- **WHEN** a draft is saved with `baseVersion` naming a published version
- **THEN** the stored `base_version` is that version, and `listDrafts`
  reports it

#### Scenario: A save without the field preserves the stored base

- **WHEN** a draft with a stamped `base_version` is saved again without
  `baseVersion`
- **THEN** the stored `base_version` is unchanged

#### Scenario: An unresolvable base version is refused

- **WHEN** a save supplies a `baseVersion` for which that process has no
  published version
- **THEN** it raises `RequestShapeError` and the stored draft is unchanged

#### Scenario: A malformed base version is refused

- **WHEN** a save supplies `baseVersion` as zero, a negative number, a
  non-integer or a non-number
- **THEN** it raises `RequestShapeError` and the stored draft is unchanged

#### Scenario: Publishing still stamps the base version

- **WHEN** a draft is published
- **THEN** `base_version` is the version the publish produced, whatever the
  draft carried before

### Requirement: Layout is stored beside the body and never affects the definition hash

The `layout` column SHALL hold per-step positions as `{ [stepId]: { x, y } }`
and SHALL NOT be part of the body, so it cannot enter the JCS hash
`definitionHash` derives from. Changing only the layout of a draft SHALL
therefore produce the same `definitionHash` at the next publish as the
unchanged body would.

A layout entry keyed by a step id absent from the body SHALL be tolerated on
save and ignored on read; the write path SHALL NOT reconcile layout against the
body's step set.

#### Scenario: A layout-only change does not mint a version

- **WHEN** a draft's body is passed to `publishBody`, the draft is then saved
  again with only `layout` changed, and the re-read body is passed to
  `publishBody` again
- **THEN** the second publish returns the same `definitionHash` and the same
  version number as the first, and no new `definitions` row is created

#### Scenario: A stale layout key is tolerated

- **WHEN** a draft is saved with a `layout` entry for a step id that the body
  does not declare
- **THEN** the save succeeds and the entry round-trips unchanged

### Requirement: Saving a draft uses revision-checked optimistic concurrency

`saveDraft` SHALL take the `revision` the caller last read and SHALL apply the
update only when the stored `revision` still matches, incrementing it by one
and recording `updated_by` and `updated_at`. When the stored revision differs,
the update SHALL affect zero rows, SHALL leave the stored draft entirely
untouched, and SHALL raise a distinct conflict error.

The conflict error SHALL be its own class exported from `src/engine/drafts.ts`,
not `ConcurrencyConflict` from `src/runtime/api.ts` — that error means an
instance `transitionSeq` mismatch to every existing client. The system SHALL
NOT merge divergent drafts.

Creating the first draft for a process SHALL be an insert at `revision = 0`; a
concurrent create that loses the primary-key race SHALL be reported as the same
conflict.

#### Scenario: A save with the current revision succeeds

- **WHEN** `saveDraft` is called with the revision `getDraft` last returned
- **THEN** body and layout are persisted and `revision` is incremented by one

#### Scenario: A stale save changes nothing

- **WHEN** two callers read revision 3, the first saves successfully, and the
  second then saves with revision 3
- **THEN** the second call raises the draft conflict error and the stored row
  still holds the first caller's body, layout and `revision` 4

#### Scenario: The saving actor is recorded

- **WHEN** a save succeeds
- **THEN** `updated_by` holds the id of the actor that made it and
  `updated_at` is advanced

### Requirement: The draft module exposes get, save, list and delete

`src/engine/drafts.ts` SHALL export `getDraft`, `saveDraft`, `listDrafts` and
`deleteDraft`, each taking `db: SQL = sql` as its last parameter to match the
other engine modules. `getDraft` SHALL return `undefined` for a process with no
draft. `listDrafts` SHALL return one summary per draft carrying at least the
process id, `revision`, `base_version`, `updated_by` and `updated_at`, without
the body. `deleteDraft` SHALL remove the row and SHALL NOT touch any
`definitions` row.

#### Scenario: An absent draft reads as undefined

- **WHEN** `getDraft` is called for a process that has never been drafted
- **THEN** it returns `undefined` rather than throwing

#### Scenario: The listing omits bodies

- **WHEN** `listDrafts` is called
- **THEN** each entry carries the process id, revision, base version and
  update metadata, and carries no body

#### Scenario: Discarding a draft leaves published versions intact

- **WHEN** `deleteDraft` is called for a process with published versions
- **THEN** the `drafts` row is gone and every `definitions` row for that
  process is unchanged

### Requirement: Draft routes are exposed behind the developer role

`src/http/studio-routes.ts` SHALL expose `GET /drafts`,
`GET /drafts/:processId`, `PUT /drafts/:processId` and
`DELETE /drafts/:processId`, dispatched from `src/http/server.ts` together
with their CORS preflight, and kept out of `src/http/routes.ts` so that file
stays the participant-facing surface.

Every one of these routes SHALL resolve the actor and then call
`requireRole(actor, DEVELOPER_ROLE)` directly, with no intervening policy
abstraction. An unresolvable credential SHALL yield 401 and a resolved actor
lacking the role SHALL yield 403, through the existing `src/http/errors.ts`
mapping. `GET /drafts/:processId` for an absent draft SHALL yield 404. A
`PUT` whose envelope is malformed SHALL yield 400 and one whose revision is
stale SHALL yield 409.

#### Scenario: A developer reads and writes a draft

- **WHEN** an actor holding `system:developer` PUTs a draft and then GETs it
- **THEN** both responses are 200 and the GET returns what was written

#### Scenario: An authenticated non-developer is refused

- **WHEN** an authenticated actor without `system:developer` calls any of the
  four draft routes
- **THEN** the response is 403

#### Scenario: An anonymous caller is refused

- **WHEN** a request without a resolvable credential reaches any draft route
- **THEN** the response is 401

#### Scenario: A stale revision is a conflict, not a 500

- **WHEN** a `PUT /drafts/:processId` carries a revision older than the stored
  one
- **THEN** the response is 409 and the stored draft is unchanged

#### Scenario: A malformed envelope is a 400

- **WHEN** a `PUT /drafts/:processId` carries a non-object `body`, a
  non-object `layout` or a non-integer `revision`
- **THEN** the response is 400 and no draft is written or modified

#### Scenario: An absent draft is a 404

- **WHEN** `GET /drafts/:processId` names a process with no draft
- **THEN** the response is 404
