## Context

`packages/editor` keeps a process draft in a file on one machine
(`draft/file-io.ts`, the File System Access API with a download fallback).
That works for one person sketching one definition and for nothing else: a
second person cannot see the draft, a reopened browser has lost it, and the
publish/versions/migration half of a development environment has no artifact
to operate on. Stage 11's design
(`docs/superpowers/specs/2026-07-27-process-studio-design.md`) resolves this by
moving the draft into the database and opening a fourth product,
`packages/studio`, for the developer role.

This change is the first of five. It delivers the substrate — the table, the
engine module, the routes, the role, the package, the process list and
panel-based editing — and nothing that stands on it. Canvas, JSON surface,
publish/versions/migrations, and tools/Player are changes 2–5;
`packages/editor` is deleted only in change 5 and stays fully functional
until then.

Constraints inherited from the repo, none of them negotiable here:

- The serialized JSON definition is the contract. `definitionHash` is the JCS
  hash of `ProcessBody` — nothing cosmetic may enter it.
- Frontends reach the runtime through the HTTP wrapper only, never the
  database; compile-time imports go through the engine package's exports map.
- Roles are flat string constants checked directly at the call site. No policy
  engine (`authorization`).
- Optimistic concurrency, where it exists, is a conditional `UPDATE` with a
  monotonic column and a caller-supplied expected value (`transitionSeq`).

## Goals / Non-Goals

**Goals:**

- A process draft that lives in the system: reloadable, shared, attributable,
  and safe against two people overwriting each other.
- A studio package that can be grown by four additive changes without
  restructuring.
- `system:developer` as a fourth flat reserved role, gating every studio
  route.
- Zero change to the process-definition contract and zero change to
  `definitions` or any path a running instance touches.

**Non-Goals:**

- Publishing from studio (change 4). A draft saved by this change is edited and
  validated, not published — the existing editor's export plus `POST
  /processes` remains the publish path until then.
- Canvas editing and `layout` *authoring* (change 2). The column ships now
  because adding it later would mean a second `ALTER TABLE` for a value the
  save route already has to round-trip; nothing in this change writes a
  non-empty layout.
- Branches, named drafts, merge. One draft per process, conflicts reported not
  resolved.
- Any change to `packages/editor`, `packages/app`, `packages/form-ui`, or the
  participant-facing routes.

## Decisions

### A separate `drafts` table, not `definitions` with `status='draft'`

`src/schema/definition.ts` declares a `"draft"` status and
`src/engine/definitions.ts` hardcodes `"published"` on insert, so the status
exists but nothing writes it. Reusing the row is the smaller diff and the
worse design: `definitions` is the table `resolution.ts` and the timer worker
rehydrate *running instances* from, and its `(process_id, version)` primary
key encodes immutability. A mutable body in it makes every read site
responsible for excluding drafts, and one forgotten site runs a live instance
against a half-finished definition. A second table costs one `CREATE TABLE IF
NOT EXISTS` and makes that structurally impossible rather than merely
unlikely. The inert `"draft"` status is left alone — removing it is a contract
change and out of scope.

### The stored body is the authored one, and only its envelope is validated

`drafts.body` holds the **authored** `ProcessBody`, uncompiled: compilation is
a publish-time step (`compileProcessBody` inside `publishBody`), and a draft is
by definition pre-publish.

More consequentially, `saveDraft` SHALL NOT parse the body against
`processBody`. A draft under construction routinely violates the structural
refinements — a step with no exit yet, a path pointing at a step about to be
created, a `LocalizedText` with the base locale still empty. Rejecting those
at save would make the feature unusable for its actual purpose. The body is
stored as opaque `jsonb`; the only guarantee is that it is JSON. Correctness is
enforced where it matters and already is: live in the editing UI (the engine's
own validators through the exports map) and unconditionally at publish, which
revalidates server-side regardless of what the client did.

What *is* checked is the envelope, because a `PUT` is a trust boundary and
this is the part that costs nothing to get right: `body` must be a JSON
object (not an array, scalar or null), `layout` must be an object, `revision`
must be a non-negative integer. Anything else is a `RequestShapeError` → 400.
That catches a swapped or truncated payload without making any claim about the
definition inside it.

Two things deliberately not checked. A route-vs-body process id — `ProcessBody`
carries no `processId` at all (`publishBody` takes it as a separate argument),
so there is nothing to cross-check. And a payload size limit — `POST
/processes` already accepts an author-supplied body with none, from the same
kind of role-gated authenticated caller; inventing a number here alone would be
an inconsistency, not a defence.

The consequence is explicit and accepted: a `GET /drafts/:processId` response
may not parse as a `ProcessBody`. The studio loads it into the Draft model —
which already tolerates invalid state, that is what live validation is for —
and never hands it to an engine path that assumes validity.

### `layout` is a column beside the body, not a field inside it

`definitionHash` is the JCS hash of `ProcessBody`. Layout carried inside the
body would make dragging a box mint a new version and break the "identical
body ⇒ identical hash ⇒ re-publish is a no-op" property publishing rests on.
Adding a schema-level metadata field that the hash excludes was rejected: it
puts an exception into the one artifact whose value is that it has none. A
sibling column has no such interaction, and layout is per-process draft state
anyway — published versions render with the existing auto-layout, which is why
nothing is lost by not versioning it.

Shape is `{ [stepId]: { x, y } }`, default `'{}'`. Unknown keys (a step deleted
after its position was recorded) are tolerated and ignored on render rather
than reconciled on save — reconciliation would need the body's step set on the
write path for no benefit.

### Optimistic concurrency on `revision`, conflict reported not merged

`saveDraft(processId, {body, layout, revision, updatedBy})` issues

```sql
UPDATE drafts SET body = …, layout = …, revision = revision + 1,
       updated_by = …, updated_at = now()
 WHERE process_id = $1 AND revision = $2
```

and reports zero affected rows as a conflict, which `studio-routes.ts` maps to
HTTP 409. This is the exact pattern `transitionSeq` establishes, down to
"expected value supplied by the caller". A first save for a process with no row
yet is an `INSERT` with `revision = 0`; a losing race there hits the primary
key and is reported as the same conflict.

The UI resolves a 409 by offering a reload, discarding local edits. Merging two
divergent process graphs is not a thing a system can do correctly without a
human, and pretending otherwise is how silent corruption gets introduced.
Alternatives considered: last-write-wins (silently destroys work), and
per-entity locking (needs lock lifetime, takeover, and stale-lock rules — a
larger feature than the problem).

### A fourth flat role, and an ordering dependency on `admin-shell-and-ops`

`system:developer` follows `PUBLISH_ROLE` / `CANCEL_ANY_ROLE` / `ADMIN_ROLE`
exactly: a constant in `src/auth/authorize.ts` and a direct `requireRole` call
in each handler. No role implies another — a `system:developer` who must also
publish is granted `system:publish` as well (which change 4 will require;
nothing in this change publishes).

This change's `authorization` delta is written against the three-role spec that
`admin-shell-and-ops` produces, so **that change must archive first**. Both
deltas `MODIFIED` the same enumerating requirement, and the last archive wins:
this delta lists four roles (including `ADMIN_ROLE`), the admin delta lists
three. Archive admin first and the result is correct; archive it second and it
overwrites the merged requirement with its own three, silently dropping
`DEVELOPER_ROLE` from the main spec. The code has no such coupling — the two
constants are independent — only the spec deltas do. Stage 10 precedes stage
11 in the roadmap anyway (and `admin-migration-run` in turn depends on stage
11's `studio-lifecycle`), so this constrains nothing that was not already
sequenced.

### `studio-routes.ts` beside `routes.ts`, not inside it

Same reasoning as `admin-routes.ts`: `routes.ts` stays the participant-facing
surface. Handler shape, the `guarded` wrapper, actor resolution and error
mapping are reused unchanged; `src/http/server.ts` gains dispatch and CORS
preflight for four paths. `src/http/errors.ts` needs one addition — the draft
conflict error mapped to 409. It is modelled as its own error class exported
from `drafts.ts` rather than reusing `ConcurrencyConflict` from
`src/runtime/api.ts`, which is about instance `transitionSeq` and carries that
meaning to every existing client.

### `packages/studio` copies `packages/app`'s shape and carries the editor's code

Two different relationships, deliberately:

- **Shape** (package.json, vite config, `routing.ts`, `session.ts`,
  `api/client.ts` + `api/types.ts`, login, the role-aware shell) is *copied*
  from `packages/app` and adapted, exactly as `packages/admin` does. These
  files are ~50 lines each and diverge per product; a shared package would
  couple three frontends' routing to one another for no gain.
- **Editing code** (`draft/`, `panels/`, `i18n/`, `registry/`) is *moved in*
  from `packages/editor` — the same files, with file-based persistence
  (`file-io.ts`, `io.ts`'s save half, `load-guard.ts`,
  `file-system-access.d.ts`) replaced by the draft client and `FileToolbar`
  replaced by a save/discard toolbar. It is a copy in this change and becomes
  the only copy in change 5, when `packages/editor` is deleted.

The duplication window (changes 1–4) is accepted: keeping the editor working
while studio is built in four increments is worth more than avoiding a
temporary second copy of code that is on its way to deletion. Nothing depends
on the two staying in sync — the editor is frozen for the duration.

Live validation is unchanged and stays a pure frontend feature: the studio
imports `workflow-engine/schema`, `/schema/compile`, `/cel/check` and
`/engine/registry-check` at compile time through the exports map, as
`packages/editor/src/draft/validation.ts` already does. No endpoint behind it,
no server round-trip per keystroke.

### The unauthorized shell is an empty state, not a redirect

An authenticated actor without `system:developer` gets an explanatory screen,
same as `packages/admin`. A redirect to `/login` would tell someone with valid
credentials that their credentials are wrong. The role is read from the login
response, so the shell renders correctly before any studio route is called;
every route still checks server-side, since a frontend role check is a UX
affordance and never a control.

### Process identity for a new process

"New process" mints a `proc_` id client-side and `PUT /drafts/:processId` with
`revision = 0` creates the row. `draft/ids.ts` already mints
`${prefix}_${crypto.randomUUID()}` for every other entity kind by parsing
through the contract's own branded id schema; it gains a `process` minter over
`processId` beside the existing six.
`base_version` stays NULL until the first publish. Server-side id minting was
rejected: it would need a create-then-save two-step where one call does, and
the id is opaque, so nothing depends on who generated it.

## Risks / Trade-offs

- **A stored draft may be unparseable as a `ProcessBody`** → Accepted and
  designed for: the body is opaque `jsonb` and only ever reaches the Draft
  model, which tolerates invalid state. No engine path reads `drafts.body`.
  The envelope check keeps a swapped payload out; publish (change 4)
  revalidates the contents server-side unconditionally.
- **Two copies of the panel/draft code until change 5** → Bounded by the
  delivery plan; `packages/editor` is frozen (no change touches it before its
  deletion), so drift cannot accumulate.
- **The `authorization` delta must archive after `admin-shell-and-ops`** →
  Stated in the design, in the delta's own note, and as a precondition in
  `tasks.md`. If the order flips, the fix is to re-add `DEVELOPER_ROLE` to the
  merged requirement, not to reimplement anything.
- **A draft can be edited but not published in this change** → Intentional; the
  process list shows the draft and the latest published version, and the
  publish button arrives with change 4. The editor's export path still works
  in the meantime.
- **`layout` ships unused** → One `jsonb` column with a default; writing it is
  change 2's job. The alternative (a second `ALTER TABLE`) is strictly worse
  for a table that has no rows yet.
- **Discarding a draft is destructive and has no undo** → `deleteDraft`
  removes the row outright; published versions are untouched, so what is lost
  is only unpublished work. A confirmation in the UI is the mitigation; a
  trash/restore mechanism is out of proportion to a per-process single draft.

## Migration Plan

- `initSchema` gains one `CREATE TABLE IF NOT EXISTS drafts`, idempotent and
  additive; it runs on the existing startup path. No backfill — there are no
  drafts to migrate, since today's drafts are files on people's disks. An
  author with a file loads it through the editor and pastes/imports it into
  studio (change 3's JSON surface makes that a first-class action; before
  that, the panels are the path).
- No data migration, no change to `definitions`, `instances`, or any worker.
- Rollback is dropping the studio routes and the package; the `drafts` table
  is inert to every other code path and can be left in place.
- Operationally: grant `system:developer` to the accounts that need studio via
  the existing `src/auth/cli.ts set-roles`. No account loses access to
  anything — this change tightens nothing.
