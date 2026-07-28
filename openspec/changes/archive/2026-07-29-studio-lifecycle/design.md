## Context

Three engine capabilities this change exposes over HTTP for the first time
already exist and are fully engine-tested, per roadmap #1/#3/#11:
`publishBody` (`src/engine/definitions.ts`, reached today only via the
existing `POST /processes` route, called by the legacy `packages/editor`'s
export flow), and `registerMigrationPlan` / `resolveMigrationPlan` /
`findOrphanKeys` (`src/engine/migration.ts`, reached today only from engine
code and tests — no route exists at all). `process-drafts` already stores a
`base_version` column on `drafts` (`src/engine/drafts.ts`) that nothing has
ever written; it exists for exactly the "diff a draft against the version it
started from" use case this change adds a screen for.

`src/http/studio-routes.ts` is the established home for `system:developer`
-gated, unprefixed routes (`process-drafts`'s `/drafts` routes); `src/http/
routes.ts` is the participant-facing surface housing the existing `POST
/processes` (`system:publish`-gated) and `GET /processes/:processId/versions`
(open to any authenticated actor, metadata only, no role check) routes this
change extends.

## Goals / Non-Goals

**Goals:**
- A Studio developer can publish the draft they just saved without leaving
  Studio or hand-crafting a `POST /processes` call.
- A Studio developer can inspect any two published versions (or a draft
  against its base) as a JSON diff.
- A Studio developer can author and inspect a migration plan, and run a
  read-only orphan-key scan against a published version, entirely over HTTP.

**Non-Goals:**
- Executing a migration plan (`migrateInstances`) — stays `admin-migration-run`'s
  `POST /admin/migrations/run`, an operator action.
- Compiling or previewing an unsaved, in-browser draft edit before it's saved
  — publish always targets the last explicitly-saved draft, same as the
  existing save/discard model.
- Any change to `POST /processes` itself, or to who may call it
  (`system:publish` stays exactly as authorization already defined it).

## Decisions

**Publish is a new studio route, not a raw client-side `POST /processes`
call.** `POST /drafts/:processId/publish` (studio-routes.ts, requires both
`DEVELOPER_ROLE` and `PUBLISH_ROLE` — `process-drafts` already established
that `system:developer` "implies nothing else," so publishing from Studio
stays gated the same as publishing from anywhere else). The handler reads the
*persisted* draft server-side (`getDraft`), calls the existing `publishBody`
unchanged, and on success stamps `drafts.base_version = published.version` (a
new one-column `UPDATE`, not routed through `saveDraft`'s revision-checked
path, since it changes neither `body` nor `layout` and isn't part of that
optimistic-concurrency contract). Alternative considered: have the Studio
client itself `POST` its in-memory draft body straight to the existing route.
Rejected — it would publish whatever is currently in the editor, not what was
last saved (silently diverging from the save/discard/conflict model
`process-drafts` already built), and it gives no natural place to stamp
`base_version` atomically with the publish.

This is the first `studio-routes.ts` handler that needs `registry` and
`dataSourceRegistry` — every existing handler there (`handleListDrafts` etc.)
takes only `(processId, req, resolver, db)`; today only `routes.ts`'s
`handlePublish` receives those two, passed down from `startHttpServer`.
`server.ts`'s dispatcher already holds both in scope (it already threads them
into `handlePublish`), so wiring the new route is passing two already-available
values one handler further, not introducing a new dependency — but it's worth
naming since it's the first crack in "studio handlers only ever need
`resolver`/`db`."

**A published version's body gets a new route, nested under the existing
metadata route.** `GET /processes/:processId/versions/:version` — implemented
in `studio-routes.ts` alongside the other new handlers (URL prefix and
implementation file are independent; `admin-routes.ts` already sets that
precedent by being the only file behind `/admin`, which nothing else is), but
dispatched from `server.ts` under the existing `/processes` prefix since it's
a child resource of the existing versions route. Gated `DEVELOPER_ROLE` —
unlike its sibling listing route (open, metadata-only), a full body exposes
CEL expressions and action config, which is developer material, not
participant material. Returns the *compiled* body (what `resolveBody` already
stores and what instances actually execute), not a re-parse of anything
authored — see Risks for what that means for diffing against a draft.

**Migration-plan routes are a plan-keyed resource, orphan-keys a
version-keyed one.** `GET`/`PUT /migration-plans/:processId/:fromVersion/
:toVersion` map directly onto `resolveMigrationPlan`/`registerMigrationPlan`
(both already idempotent/upsert-safe — `registerMigrationPlan` free-edits an
unapplied plan and only rejects once `applied_at` is set, so `PUT` is the
right verb with no extra guard needed at the route layer). Orphan-keys is
`GET /processes/:processId/versions/:version/orphan-keys` — not
plan-shaped, since `findOrphanKeys` takes a single version (it scans a
version's *own* currently-pinned instances against its *own* catalog,
independent of any migration target); nesting it under `versions` instead of
`migration-plans` reflects that, even though the Studio screen surfaces it
alongside plan authoring for the `fromVersion` a developer is about to write
transforms against.

**`MigrationPlanError` gets one new mapping in `http/errors.ts`, not a
taxonomy split.** `registerMigrationPlan`/`findOrphanKeys` throw one error
class for several distinct causes (equal from/to versions, an unpublished
version, structural plan-vs-catalog mismatches, or a frozen/already-applied
plan). Splitting that into distinct subclasses so each gets its own status
would touch `migration.ts`'s existing, already-tested error surface for a
concern that's new only because nothing called it over HTTP before. Instead:
one `MESSAGE_ERRORS` entry, `{ ctor: MigrationPlanError, status: 409, type:
"migration-plan" }` — `message` stays the caller's disambiguation, same as
every other message-shaped mapping in that table.

## Risks / Trade-offs

[Diffing a compiled published body against an authored, uncompiled draft
shows injected-implementation noise — e.g. the compile-time cancel sink step
that's real in the compiled body but absent from what the developer typed] →
Accepted for this change: the Versions screen's headline case is
version-vs-version (both compiled, no noise); draft-vs-base is a secondary
view where a couple of always-present synthetic diff lines are a known,
explainable limitation rather than a correctness problem. Revisit only if it
proves confusing in practice.

[`MigrationPlanError`'s single 409 status conflates a genuine conflict
("already applied and frozen") with what are really 422-shaped request
problems ("fromVersion equals toVersion", structural validation failures)] →
Low risk: `message` always carries the specific reason, and the Studio UI
reads `message`, not `status`, to render the error. Revisit only if a
consumer other than Studio needs to branch on status.

[`findOrphanKeys` is already keyset-paginated (roadmap #3) but is still a full
scan of every instance pinned to a version — a version with a very large
running population makes the dry run slow] → No new mitigation added here;
this is the same cost the engine-level function already has today, just newly
reachable synchronously over HTTP. If it proves too slow in practice for a
large deployment, that's a follow-up (background job + poll), not something
to speculatively build now.

## Migration Plan

No schema change — `drafts` and `migration_plans` already exist (roadmap #11,
#3); this change only adds routes/handlers and one `http/errors.ts` mapping
entry. Deploy is a normal code release. Rollback is a normal revert: no data
was reshaped, and any `migration_plans` rows a developer creates via the new
`PUT` route are ordinary, already-supported engine rows (`registerMigrationPlan`
existed before this change) that stay valid whether or not the new routes
that created them are still deployed.

## Open Questions

- Should the Versions screen allow diffing any two arbitrary versions, or
  only adjacent ones (`v` vs `v-1`)? Arbitrary is more capable and no harder
  to implement (the new route takes any version number); defer the UI
  decision to implementation unless it turns out arbitrary diffing invites a
  confusing UX for large version histories.
- Should migration-plan authoring pre-fill `fieldMap` with same-key
  auto-matches between `fromVersion` and `toVersion`'s catalogs, or start
  blank? Blank is simpler and matches every other authoring surface in this
  codebase (no auto-suggestion exists elsewhere); revisit only if manual
  authoring proves tedious in practice.
