<!-- antislop: allow-file synonym-rotation em-dash passive-voice sentence-length run-ons -->
# Decisions: open questions and deferrals

Forward-looking counterpart to `docs/current-state.md`, which describes what
exists. This file records what was decided and not yet built, and what still
needs a decision. `ROADMAP.md` carries stage-by-stage status.

## Open questions (still need a decision before building the relevant part)
- The formal expression context is pinned (`src/cel/check.ts`): `instance`
  `{id, status, transitionSeq, currentStepId}`, `actor` `{id, roles}`. Both are
  deliberately minimal; widen when the engine surfaces a concrete need.
- `TaskScreen.tsx`'s (app area) `InstanceView` carries no process
  `baseLocale` field, so a task field's `LocalizedText` label renders blank
  instead of falling back, whenever the participant's active locale has no
  entry. Pre-existing gap, not introduced by `studio-formui-ridealong-cuts`'s
  removal of `FieldForm`'s `baseLocale` prop. Fixing it needs an `InstanceView`
  API change plus a `TaskScreen.tsx` wiring change.
- `checkUnknownKeys` (`src/schema/compile.ts`) needs the raw authored body,
  and the studio holds only the Zod-stripped result of
  `authoredProcessBody.safeParse(draft).data`, so the studio's checks rail
  holds that check back for a draft's whole session (`unknownKeysHeldBack`,
  `validation-sequence-module`). A tolerant walk over the raw draft — one
  that survives an unknown key rather than stripping it before the walk ever
  runs — would close that gap and let the studio run the check live. No
  follow-up change tracks this yet.
- No NDJSON/JSONL export exists for the instance history and event audit
  trail, and none is built. `HistoryEntry` and `InstanceEvent` rows
  (`process-contract.md`'s "audit backbone") are already flat, independent
  per-instance records, one row per entry in the `history_entries` table —
  the shape NDJSON is built for, unlike the process definition itself, which
  stays one JCS-hashed document nested by `id` and never becomes NDJSON.
  `historyByInstance` and `selectInRange` (`src/engine/reporting.ts:108` and
  `:98`) fully materialize a date range into memory today before returning a
  JSON array. Worth building when stage 27's reporting-app (cycle time,
  bottlenecks, SLA) needs a downloadable or streamable export, or when a
  `selectInRange` result set gets large enough that the in-memory buffering
  is a measured problem, not speculatively before either happens. Needs its
  own `reporting-app` spec delta when it lands.

  The same buffer-then-return shape holds for `listOutbox`
  (`src/engine/admin-queries.ts:83`), an append-only delivery log the same
  way the history table is: one row per delivery attempt, no nested
  structure. An admin "download the outbox" debugging export is the same
  NDJSON shape as the history export above and would land in
  `admin-operations-api` when built, on the same trigger: a concrete
  downloadable-export ask, not a speculative one.

  `migrateInstances` (`src/engine/migration.ts:547`) is the weaker case.
  It already keyset-paginates instances and buffers outcomes into one
  in-memory `MigrationResult` (`migrated`/`skipped`/`conflicted`/`failed`
  id arrays), not a per-instance record stream, and nothing today asks for
  a per-instance migration report. If an admin-facing "why did instance X
  land in `failed`" report is ever requested, that reason string does not
  exist yet either: `migrateOne`'s catch block in `migrateInstances`
  classifies failures into the four buckets by id only, and a
  per-instance NDJSON report would need it to carry a reason alongside
  each id. Do not build this ahead of that ask.

## Decided, not yet built (each needs its own OpenSpec change)
- **Process-scoped permissions: the filter, the draft scope, and the
  `permissions` booleans.** A design pass on 2026-08-15 settled the shape;
  `ROADMAP.md` stage 40 carries it in full. The seam shipped 2026-08-15 as
  `process-scoped-permission-seam`, and the storage half shipped 2026-08-16
  as `process-scoped-permission-grants`. `can(actor, permission, processId,
  db)` and `requirePermission` sit in `src/auth/authorize.ts` over three
  permissions; `src/auth/grants.ts` holds the `permission_grants` table's SQL
  behind them, and three `system:admin`-gated routes administer a grant.
  Nobody was blocked by the seam alone, and no account gained or lost access
  the day storage landed: an installation that writes no grant row keeps
  every answer it had.

  Three pieces stayed open, each its own later OpenSpec change. Two still
  are.

  The `scope=all` filter and the reporting aggregates turn a gate into a
  query predicate. That reaches `instance-query`, not `authorization`.

  A draft-scoped `"author"` permission would let an installation limit who
  sees and edits which draft. `drafts.process_id` is scopeable — it is the
  table's own key, named from `PUT /drafts/:processId`'s first save — but
  every author reaches every draft today.

  The third piece closed 2026-08-19 as `scope-migration-plan-visibility`.
  The web areas reading `actor.roles` directly was framed as a gap across
  "the resource views," plural. An audit of every client-side role check in
  `packages/web` found it real in one place: the Studio Versions screen's
  "Plan migration" control. Publish and Cancel already rendered
  unconditionally and let the server's 403 carry the gate. `GET
  /drafts/:processId` now carries a `canPlanMigration` field, computed from
  the seam's own `can()`; the Versions screen reads it instead of a role.
  No general `permissions`-booleans framework landed — the audit found no
  second case that needed one.

  A directory group name is a principal, not a permission, and that decision
  is built, not pending: the identity provider is the authority on who
  someone is and which groups they hold, and the installation is the
  authority on what a group may do inside it. `claimToRoles`
  (`src/auth/jwt.ts:81`) passes an issuer's claim through verbatim, so
  `Actor.roles` needed no new shape. A grant maps a role string to a
  permission and a scope, `{ type: "process", config: { processId } }` the
  only type shipped. Encoding the scope into the grant's own name
  (`system:publish@proc_...`) was considered and dropped 2026-08-16: it would
  have inverted the split, making the directory admin the authority on this
  engine's own opaque ids, for an installation that never asked for it.
  `Actor.roles` stays a `string[]` of free text from either source;
  `auth_users.roles` stays a `TEXT[]`.

  `tmp/open-work-priority.md` tracks the three open pieces above.
- **CEL-readable data-source results.** Runtime option-list resolution for
  `field.dataSource` is DONE (see `docs/current-state.md`) — but `src/cel/check.ts`
  still registers a data source at no site (guards/output/transforms), so a CEL
  reference to one remains a publish error (`unknown variable`). Widening that is
  a separate, more consequential decision (an unresolvable reference there could
  only park a wait-state forever or throw mid-delivery); it stays deliberately
  out of scope until a concrete need for CEL-visible data-source values exists.

  Stage 29 tested that deferral and left it standing. `FieldDef.columnMapping`
  now writes a picked option's column attributes into ordinary catalog fields,
  before the transition commits, so a guard reads `data.<key>` as it always
  has. That is not a data source in the CEL context. The engine resolves the
  value, checks it against the target field's declared type, and writes it; CEL
  then reads a field, exactly as it does for a participant's own input. The
  unresolvable-reference hazard this row names never arises, because nothing
  CEL evaluates names a data source.
- **A data-source type whose resolution leaves the database.** Two types now
  ship: `"static"` and `"db.list"` (the latter reads two engine-owned tables,
  see `docs/current-state.md`). Neither leaves the engine's own Postgres, so
  neither exercises a resolution deadline of its own — `"db.list"` inherits the
  `Bun.sql` connection timeout, and `DataSourceHandlerDef.resolve` carries no
  deadline seam. The first type that reaches an outside service (e.g. an
  HTTP-backed data source) owns the timeout, cache and error semantics, which
  stay open questions not worth deciding speculatively. A deadline would widen
  `DataSourceContext`, the same additive move `heldValues` already made, so
  this is a deferral rather than a door that closes.
- **An assignment strategy whose resolution leaves the database.** Two
  strategies now ship: `"static"` and `"org.manager-of-starter"`, the latter
  reading `auth_users.manager_user_id` (see `docs/current-state.md`). Neither
  leaves the engine's own Postgres, so neither exercises a network failure mode.
  The resolution deadline (`ASSIGNMENT_RESOLUTION_TIMEOUT_MS`, default 5000),
  the failure classification and the `assignment.unresolved` event all exist
  and already bound EVERY strategy. The first one reaching an outside
  directory inherits them rather than owning them. What it owns is its own
  retry and cache semantics, and whether a per-strategy deadline earns the
  granularity. A deferral, not a door that closes.

  This change closes the subprocess-return row-lock question: bounded by the
  deadline, not hoisted above the lock. A hoist needs an optimistic pre-read
  plus a sequence re-check. That re-check must still fall back to resolving
  under the lock when it fails. Hoisting makes the unbounded hold rarer
  without making it impossible. It also costs a second read of the parent
  row on every return delivery. Do not re-propose the hoist without a
  measurement showing the bounded hold is itself the problem.
- **The editor dock.** The studio canvas edit screen leaves its lower band
  empty on a tall window. `.studio-canvas-layout` is a grid that grows with
  the viewport, so the canvas fills its middle column to the bottom edge. The
  two side columns do not. The 12rem `EditRail` holds seven entries, and the
  22rem `ChecksRail` holds one line when a draft is clean. A design pass on
  2026-08-15 settled a dock for that band.

  The dock is a collapsible strip below `.studio-canvas-layout`, full width,
  collapsed by default. It renders only in the canvas sub-state of the
  structure surface. The form editor and the panels screen each replace the
  canvas, so neither shows it. Open, it takes a bounded height, and
  `.studio-canvas-layout` keeps its 36rem floor.

  Three tabs ship, in this order. **Changes** repeats what
  `VersionsScreen.diffAgainstBase()` does. An author reads what a publish
  would change without leaving the canvas. `versionDiffLogic.ts` exports
  `diffJson` and `canDiff` already, and both are pure. **Field matrix** mounts
  `FieldMatrixPanel`, and its `/edit/panels/matrix` route stays.

  The change corrected two claims above. Only `diffJson` carries the Changes
  tab. `canDiff` guards the versions screen's two-version selection, and the
  dock compares a draft against one version, so its guard is
  `baseVersion !== null` instead.

  And `FieldMatrixPanel` is not read-only. It writes flags through `setFlag`
  and `mutate`. A second mount still costs nothing, for a different reason:
  the panel takes no props, reads `useDraft()`, and holds no state the two
  mounts must share.

  **Paths** is the one new view. It gives one row per path across the whole
  process. The columns are source step, trigger, priority, guard and target.
  A canvas hides the rules that govern paths, and a table shows them. The
  row-building function is pure over `draft.workflow.steps`, and it carries
  the test.

  The dock persists nothing. Open state and active tab live in `EditorArea`
  component state, so they survive a selection change and reset on a reload.
  The dock claims no key in `saveState.layout`. That blob is per-draft, so one
  author's open dock would open for every author of the draft. A later
  "remember my dock" requirement needs a per-author preference store, which no
  area has today. It does not need a different dock.

  Two failure modes appear at ten times the current scale. A 200-step process
  gives the Paths tab 400 rows and the Field matrix 200 columns, one per step.
  The band's height is bounded. Both tabs scroll their own overflow, and a
  filter is the first thing that scale demands. Neither tab earns a filter at
  four steps and three fields.

  The Player was rejected for this band and stays rejected. A step form needs
  height, and the dock's whole premise is that it takes little. Docking the
  Player would either squeeze the canvas below its floor or show one field at
  a time. `screens/PlayerScreen.tsx` keeps its own route. Do not re-propose it
  as a tab without a design that answers the height.

  Two candidate tabs are deferred, not rejected. A translation-coverage grid
  would map every `LocalizedText` against every locale and mark the gaps that
  the `baseLocale` invariant permits. A CEL scratchpad would evaluate an
  expression against the draft's field catalog through `cel/check`. Tabs are
  additive, so each one costs a single entry in a list once the dock exists.

  The OpenSpec change writes a delta against `studio-canvas`. It touches
  `screens/EditScreen.tsx`, `app.css`, one new panel component, the studio
  i18n catalog, and `.claude/rules/ui-glossary.md`. That glossary entry
  registers **dock** as the one word for this part, beside *edit rail* and
  *checks rail*. The new component needs a name distinct from
  `panels/PathsPanel.tsx`, which is the per-step inspector panel. A real
  browser check covers the collapse, the tab switch, and the canvas floor.

  Built 2026-08-15 under the OpenSpec change `studio-editor-dock`, which is
  neither applied nor archived yet. The strip lives in `dock/EditorDock.tsx`
  over the pure `dock/pathRows.ts`, and the glossary carries the noun. This
  entry leaves the section when that change archives; the decisions that
  outlive it are the Player rejection, the two deferred tabs and the
  no-persistence rule.
- **No "Long text" field type.** `field-catalog-redesign`'s type picker lists
  the ten `baseFieldType` values under friendly names and stops there. The
  contract has no multiline string variant, and `tmp/Field Catalog
  Redesign/`, the Claude Design template that change realizes, is direction
  rather than a contract proposal — it shows a "Long text" entry the
  definition contract cannot back. A future multiline type is a separate
  definition-contract change, gated on a real need: rendered behavior (a
  `<textarea>` versus a single-line `<input>`) that a `string` field cannot
  already express through the existing renderer.
- **`FieldDef.default` now seeds an instance's initial data.**
  `field-catalog-redesign` shipped no editor for it and no runtime reader,
  since building one before the engine read the value would have shipped UI
  with no visible effect. `field-catalog-editor-rework` landed both:
  `createProcessInstance` (`src/runtime/api.ts`) fills a field's still-open
  slot from its catalog `default` — a `Literal` directly, an `Expression`
  through `src/cel/eval.ts::evalFieldMap` over the same stub `Instance` the
  seeding-in-progress `data` builds — before `validateSubmissionData` runs.
  The Values tab's Default-value zone writes the key. `submitAndTransition`
  never applies or re-checks a default; it seeds a fresh instance's data
  once, at creation, same as any other explicitly submitted value from that
  point on.
