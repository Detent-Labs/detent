<!-- antislop: allow-file all -->

## Why

`packages/studio` (stage 11) is delivered by four of its five planned changes:
shell/drafts, canvas, JSON view, lifecycle (publish/versions/migration
planning). The last piece is a Tools screen (registry of the running server,
a static CEL scratchpad) and a Player driving a live instance beside the
merged transition/event record. Once Studio carries these, `packages/editor`
has nothing left it does not already do better, so it is retired. It was
built as a proof of concept for the editing half only, and every stage-11
change so far has said so.

## What Changes

- Add a **Tools** screen to `packages/studio`: a read-only view of a new
  `GET /registry` studio route (the running server's registered action-handler
  types from `Registry` and data-source types from `DataSourceRegistry` —
  the only two plugin registries the engine has; guards are CEL expressions
  and field types are the schema's fixed union, neither is a registry) and a
  static CEL scratchpad that parses and
  type-checks an expression against a chosen process version's field catalog
  (`src/cel/check.ts`, no live instance data — the same static-only scope
  `studio-lifecycle` chose for orphan-key inspection over evaluating CEL
  against running data).
- Add a **Player** screen to `packages/studio`: drives a real instance
  through the Runtime API Layer (create / view / submit / claim / release)
  the same way `packages/editor`'s Player and `packages/app` already do,
  reusing `packages/form-ui` for step forms, shown beside the merged
  transition/event record (`getInstanceRecord`) so a developer can watch a
  definition run and see its full audit trail in one screen — distinct from
  `packages/admin`'s instance detail, which is the operator's read/cancel
  view, not an authoring aid.
- **Delete `packages/editor`** in full: `src/`, `test/`, `package.json`, and
  its Playwright config. Every capability it alone provided is retired
  (below); every capability it shared with `packages/studio` already has an
  independent copy in `packages/studio/src` (confirmed: `packages/studio`
  has no workspace dependency on `packages/editor` and no import of it — see
  Impact), so deletion is safe at the build level.
- Update the six specs that enumerate `packages/editor` as one of several
  packages sharing a cross-cutting constraint (below): drop it from each
  enumeration since the constraint now covers three SPAs
  (`packages/admin`, `packages/studio`, `packages/app`) or two consumers
  (`form-ui`), not four/three.
- `studio-app`'s existing requirement that this change track SHALL NOT
  modify `packages/editor` no longer holds — this change deletes it. That
  sentence is removed from the requirement.
- `CLAUDE.md`'s repository-layout listing drops the `packages/editor/` row
  and its "deleted when studio-tools-and-player lands" annotations (in its
  own entry and in `packages/form-ui`'s). `ROADMAP.md`'s stage 11 entry marks
  `studio-tools-and-player` DONE and stage 11 fully DONE.
- **BREAKING**: `packages/editor` is removed from the workspace. Anyone
  running it directly (`bun run dev` inside `packages/editor`, its own test
  suite) loses that entry point; `packages/studio` is the replacement for
  every one of its capabilities.

## Capabilities

### New Capabilities

- `studio-tools`: the registry view and static CEL scratchpad in
  `packages/studio`.
- `studio-player`: the Player screen and merged-record view in
  `packages/studio`.

### Modified Capabilities

- `studio-app`: drops the "SHALL NOT modify `packages/editor`" clause from
  the workspace-boundary requirement, and gains a routing/shell requirement
  covering the two new screens (Tools, Player) alongside the five it already
  lists.
- `admin-app`: the isolation requirement ("SHALL NOT depend on `form-ui`, on
  `packages/app`, or on `packages/editor`") drops the now-nonexistent
  `packages/editor` from its enumeration.
- `development-toolchain`: the per-package typecheck requirement's example,
  the dev-port table's `packages/editor` row, and the CORS-origin
  requirement's package count all drop `packages/editor`.
- `form-ui`: the "depends on neither `packages/app` nor `packages/editor`"
  requirement and its scenario drop `packages/editor`; the requirement
  describing identical form rendering across "the editor's Player and the
  end-user app" is re-scoped to `packages/studio`'s Player (this change) and
  `packages/app`.
- `frontend-security-headers`: the four-SPA enumeration
  (`packages/app`, `packages/admin`, `packages/studio`, `packages/editor`),
  present in the requirement text itself, not only in the Purpose paragraph,
  drops `packages/editor`, covering three SPAs.
- `studio-canvas`: the pan/zoom requirement's present-tense cross-reference
  to "`packages/editor`'s read-only graph view" (the prior-art justification
  for reusing `@panzoom/panzoom`) is put in the past tense, since that
  package no longer exists to reference in the present.
- `authorization`: a new, additive requirement — a `system:developer` caller
  may read the record of an instance whose `startedBy` is their own actor
  id, mirroring the existing `startedBy === actor.id` exception `cancelInstance`
  already has for `system:cancel-any`. The existing requirement gating
  `GET /instances/:id/record` behind `system:admin` is untouched, and its
  scenario ("a participant without any reserved role is refused, even for
  an instance they started") stays true, since that actor holds no
  `system:developer` role either.

- `http-wrapper`: `GET /instances/:id/record`'s requirement is reworded from
  an unconditional `system:admin` gate ("no carve-out") to the same two-path
  check described above. `GET /registry` is not an `http-wrapper` change —
  it is documented under the new `studio-tools` capability, alongside every
  other unprefixed studio-only route (`process-drafts`,
  `studio-migration-planning`, etc.).

Four capabilities (`spa-accessibility`, `spa-error-reporting`, `form-ui`,
`frontend-security-headers`) name `packages/editor` in descriptive Purpose
prose beyond what their requirement-level deltas above already fix — no
further spec delta needed for that prose; every affected Purpose paragraph
gets a plain text edit during implementation (see Impact and tasks.md 5.2).

### Removed Capabilities

`packages/editor` is deleted, so every capability that describes only its
internals is retired in full (all requirements REMOVED, no replacement
requirement — each is either superseded by an existing `packages/studio`
capability that already covers the same ground, or was purely an
editor-internal engineering-hygiene constraint with no subject left once the
package is gone):

- `editor-workspace` — superseded by `studio-app`'s existing workspace-boundary
  requirement.
- `editor-draft-io` — file-based draft I/O has no counterpart in Studio by
  design; `process-drafts` (server-persisted drafts) is the replacement
  mechanism, already shipped in `studio-shell-and-drafts`.
- `editor-draft-model` — `packages/studio` already has its own, independent
  Draft model (carried over, not imported, in `studio-shell-and-drafts`);
  no separate spec ever existed for Studio's copy, so none is added here.
- `editor-graph-view` — superseded by `studio-canvas`, already shipped.
- `editor-i18n` — Studio never carried a locale-switcher forward (fixed
  English, per `2026-07-24-collapse-editor-i18n`); nothing replaces it.
- `editor-live-validation` — `packages/studio` already validates drafts
  live against the same unmodified engine validators; no separate spec ever
  existed for Studio's copy.
- `editor-player` — superseded by the new `studio-player` capability above.
- `editor-structural-panels` — `packages/studio` already carries the panels
  forward (`studio-shell-and-drafts`) as the inspector beside the canvas;
  no separate spec ever existed for Studio's copy.
- `array-crud-by-index-consolidation`, `draft-array-mutation-consolidation`,
  `player-store-consolidation`, `validation-issue-mapping-consolidation` —
  each is an engineering-hygiene constraint exclusively about
  `packages/editor`'s own internal call sites (per `PONYTAIL-AUDIT.md`);
  none mentions `packages/studio`. Retired with no replacement; Studio's own
  code was never brought under these constraints and this change does not
  newly impose them.

## Impact

- `packages/editor/`: deleted (`src/`, `test/`, config, Playwright setup).
- `packages/studio/`: two new screens (Tools, Player) and their routes; new
  `src/screens/ToolsScreen.tsx`/`PlayerScreen.tsx` (or equivalent), reusing
  `packages/form-ui` and the existing HTTP client/session/routing modules.
  Confirmed no workspace dependency on `packages/editor`
  (`packages/studio/package.json` `dependencies` lists `workflow-engine`,
  not `packages/editor`) and no source import of it (`grep` over
  `packages/studio/src` for `packages/editor` or an editor import: no hits).
- `src/http/studio-routes.ts`: one new route, `GET /registry`
  (`DEVELOPER_ROLE`-gated, unprefixed like the other studio-only routes),
  wrapping the running server's `Registry`/`DataSourceRegistry` maps with no
  new engine module. The CEL scratchpad calls the existing
  `GET /processes/:processId/versions/:version` route for its field catalog
  and checks the entered expression client-side via `src/cel/check.ts`
  (already in `packages/studio`'s compile-time `exports`-map surface, the
  same one live validation already uses), so it needs no new HTTP endpoint.
  Player reuses the existing Runtime API Layer routes, except for the record
  read below. `src/engine/`: no changes.
- `src/runtime/api.ts::getInstanceRecord`: gains an `actor` parameter and an
  additive authorization check (`system:admin`, or `system:developer` plus
  `startedBy === actor.id`), mirroring `cancelInstance`'s existing two-path
  shape in the same file. `src/http/routes.ts::handleInstanceRecord` drops
  its unconditional `requireRole(actor, ADMIN_ROLE)` and passes `actor`
  through instead.
- `openspec/specs/`: 12 capability spec files deleted (retired, no
  replacement), 5 modified (enumeration/wording only, no behavior change to
  the packages that remain: `admin-app`, `development-toolchain`, `form-ui`,
  `frontend-security-headers`, `studio-canvas`), 2 modified for the
  record-access change (`authorization`, `http-wrapper`), 1 modified for
  both the dropped constraint and new screens (`studio-app`), 2 added
  (`studio-tools`, `studio-player`) — 22 files total.
- `CLAUDE.md`, `ROADMAP.md`: repository layout and stage-11 status updated.
- `docs/current-state.md`: gains a "Process Studio — tools and Player" entry
  and drops the `packages/editor`-specific entries it superseded.
- Purpose-paragraph text only (no requirement change, so no spec delta):
  `spa-accessibility`, `spa-error-reporting`, `form-ui`, and
  `frontend-security-headers` drop `packages/editor` from their package
  enumerations; `authorization`'s Purpose paragraph gains a pointer to the
  new developer-record-read requirement, matching how it already points to
  the cancel exception.
