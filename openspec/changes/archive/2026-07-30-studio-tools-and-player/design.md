<!-- antislop: allow-file all -->

## Context

`packages/studio` has shell/drafts, canvas, JSON view, and lifecycle
(publish/versions/migration planning); `packages/editor` still holds the only
Player and the only registry/CEL introspection UI. This change closes both
gaps and deletes `packages/editor`.

Two existing HTTP surfaces matter here:

- `src/http/studio-routes.ts` already receives the server's live `Registry`
  and `DataSourceRegistry` (both `Map<string, HandlerDef>`-shaped) as
  parameters, for `publishBody`'s registry-resolution check. No route
  currently reads them back out.
- `GET /instances/:id/record` (`src/http/routes.ts::handleInstanceRecord`)
  unconditionally calls `requireRole(actor, ADMIN_ROLE)` before invoking
  `getInstanceRecord` (`src/runtime/api.ts`), a pure, actor-unaware query
  over `history_entries`/`instance_events`. `openspec/specs/authorization`
  already has a tested scenario: a participant without `system:admin` gets
  403 reading the record of an instance they themselves started. Studio's
  Player needs the record of instances a `system:developer` creates through
  it, and that role holds neither `system:admin` nor any exception today.

`cancelInstance` (`src/runtime/api.ts`) already solves the same shape of
problem for a different role pair: it tries `CANCEL_ANY_ROLE` first, and on
`AuthorizationError` falls back to loading the instance and checking
`instance.startedBy === actor.id`, collapsing "doesn't exist" and "not mine"
into the same opaque 403 so a failed attempt leaks nothing.

## Goals / Non-Goals

**Goals:**
- A Tools screen showing the running server's registered action-handler and
  data-source type names, and a CEL scratchpad that parses/type-checks an
  expression against a chosen field catalog.
- A Player screen driving a real instance end-to-end (create, view, submit,
  claim, release), shown beside that instance's merged transition/event
  record.
- A `system:developer` caller can read the record of an instance they
  started through Player, without gaining `system:admin`.
- `packages/editor` deleted; every capability spec that described only its
  internals retired; every spec that enumerated it among several packages
  updated to drop it.

**Non-Goals:**
- No new plugin registry. Only the two that exist (action handlers, data
  sources) are surfaced; guards are CEL and field types are the schema's
  fixed union, neither is a registry.
- No CEL evaluation against live instance data in the scratchpad, matching
  the static-only scope `studio-lifecycle` already chose for orphan-key
  inspection. Parse/type-check only, against a field catalog.
- No change to `system:admin`'s existing access to any instance's record,
  and no change to the existing "a plain participant is refused, even for
  an instance they started" scenario — the new allowance is additive and
  scoped to `system:developer` plus `startedBy === actor.id`.
- No forced transitions or direct `data` edits from Tools or Player — same
  exclusion `admin-shell-and-ops` already made for the same reason (both
  would write instance state outside the engine's own paths).

## Decisions

**Registry view is a new `GET /registry` studio route, returning type names
only.** `studio-routes.ts` already holds the injected `Registry`/
`DataSourceRegistry`; the new handler returns
`{ actionTypes: [...registry.keys()], dataSourceTypes: [...dataSourceRegistry.keys()] }`.
Alternative considered: serialize each `HandlerDef.configSchema` (a
`z.ZodTypeAny`) to a display shape. Rejected: no `zod`-to-JSON-Schema
conversion exists anywhere in this repo, adding one is a new dependency for
a Tools screen, and `studio-lifecycle` already decided the equivalent
question for `MigrationSpec` the other way ("no field-by-field form exists,
the server already owns validation") — type names are what an author needs
to know a `{ type, config }` envelope's `type` can legally be; verifying a
`config`'s shape stays a publish-time server error, same as today.

**The CEL scratchpad is client-side only, reusing `workflow-engine/cel/check`
(already in `packages/studio`'s compile-time exports-map surface, the same
entry point live validation uses).** It fetches a chosen published version's
compiled body via the existing `GET /processes/:processId/versions/:version`
route (or reads the currently-open draft) for its field catalog, then parses
and type-checks the entered expression locally. No new HTTP endpoint. This
mirrors the architecture `studio-app`'s spec already commits to: validation
is a pure frontend feature with no endpoint behind it.

**Player is the carried-over `packages/editor` Player, not a rewrite.**
`packages/studio` already established, in `studio-shell-and-drafts`, that a
carried-over module (Draft model, panels, i18n, registry) is copied into
`packages/studio/src` and re-wired to studio's own routes/session, not
imported from `packages/editor` as a live dependency (confirmed: no such
workspace dependency exists). The Player module moves the same way, reusing
`packages/form-ui` for step forms exactly as `packages/editor`'s Player and
`packages/app` already do.

**`getInstanceRecord` gains an `actor` parameter and does its own
authorization, mirroring `cancelInstance`'s existing two-path shape exactly.**
`handleInstanceRecord` stops calling `requireRole(actor, ADMIN_ROLE)` itself
and instead passes `actor` through. Inside `getInstanceRecord`: try
`ADMIN_ROLE` first and proceed unchanged if it holds; otherwise load the
instance (the same private `loadInstanceForRead` helper `cancelInstance`
already uses, in the same file) and require both `DEVELOPER_ROLE` and
`instance.startedBy === actor.id`; any other case throws the same
`AuthorizationError` whether the instance exists or not, preserving the
existing opaque-403 guarantee. This is additive only: an `ADMIN_ROLE` caller
sees no behavior change, and a caller with neither role — the exact actor in
`authorization`'s existing "a participant cannot read a record, even for
an instance they started" scenario — still gets 403, since that scenario's
actor holds no `DEVELOPER_ROLE` either.

Alternative considered: a new, separate studio-only route at a different
path (leaving `GET /instances/:id/record` and `getInstanceRecord` completely
untouched). Rejected: it would duplicate the merged-record query and
pagination logic under a second path for no behavioral difference, and every
other studio-only HTTP addition so far has been a genuinely new capability
(drafts, migration plans, orphan keys) — this one already exists and only
needs a wider audience, which an authorization change expresses more
directly than a parallel route.

**`packages/editor` is `git rm -r`, not archived elsewhere.** Its
capabilities are either fully superseded (retired specs, no replacement) or
carried over as an independent copy already living in `packages/studio`
(confirmed via the proposal's Impact section: no workspace dependency, no
source import). Git history remains the record of what it contained.

## Risks / Trade-offs

- [Widening `getInstanceRecord`'s authorization touches a security-tested
  boundary] → Mitigation: the change is strictly additive (existing
  `authorization` scenarios keep passing unmodified; new scenarios are
  added, none rewritten), and it reuses `cancelInstance`'s already-reviewed
  opaque-403 shape instead of inventing a new one.
- [Deleting `packages/editor` misses a stray reference outside
  `openspec/specs` and the four docs already identified] → Mitigation: a
  full-repo grep for `packages/editor` immediately before deletion (beyond
  the proposal's Impact-section grep, which only checked `packages/studio`
  and package manifests), plus a green `bun run check` (typecheck + full
  `bun test` suite, `DATABASE_URL` set) via the pre-push hook before this
  change is considered mergeable.
- [The registry view could leak internal detail if ever extended to
  serialize `configSchema`] → Mitigation: this change exposes registered
  type names only; nothing about `HandlerDef`/`DataSourceHandlerDef` beyond
  the map keys crosses the HTTP boundary.

## Migration Plan

No data migration: no schema change, no new table. Deployment order:

1. Land the `getInstanceRecord`/`handleInstanceRecord` authorization change
   and its tests first, independent of the UI work — it is a pure additive
   behavior change, verifiable on its own.
2. Add the `GET /registry` route and the Tools/Player screens to
   `packages/studio`.
3. Delete `packages/editor` and update the twelve retired spec files plus
   the six lightly-modified ones, `CLAUDE.md`, `ROADMAP.md`, and
   `docs/current-state.md`, in one commit so the tree is never left with a
   half-deleted package referenced by stale docs.

Rollback: revert the commits. `packages/editor` is recoverable from git
history if ever needed; nothing here is a one-way data change.

## Open Questions

- Should the CEL scratchpad let a developer check an expression against
  an in-progress draft's catalog as well as a published version's, or only
  published versions? Leaning toward both, matching migration-plan
  authoring's existing flexibility, to confirm during the specs artifact.
- Does `packages/admin`'s existing instance-detail screen need anything to
  distinguish a Player-created instance from any other? Leaning no — the
  merged record already carries `startedBy`, no new field needed — to
  confirm during tasks.
