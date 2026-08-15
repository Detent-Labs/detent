<!-- antislop: allow-file synonym-rotation em-dash passive-voice sentence-length run-ons -->
# Decisions: open questions and deferrals

Forward-looking counterpart to `docs/current-state.md`, which describes what
exists. This file records what was decided and not yet built, and what still
needs a decision. `ROADMAP.md` carries stage-by-stage status.

## Open questions (still need a decision before building the relevant part)
- The formal expression context is pinned (`src/cel/check.ts`): `instance`
  `{id, status, transitionSeq, currentStepId}`, `actor` `{id, roles}`. Both are
  deliberately minimal; widen when the engine surfaces a concrete need.

## Decided, not yet built (each needs its own OpenSpec change)
- **Process-scoped permissions.** Every role in `src/auth/authorize.ts` is
  global today, so `system:publish` publishes every process and
  `system:cancel-any` stops any instance of any process. A design pass on
  2026-08-15 settled the shape; `ROADMAP.md` stage 40 carries it in full. Four
  decisions matter beyond that stage.

  The eight `system:*` roles keep their exact meaning, for the cases that are
  genuinely installation-wide. A scoped grant sits beside them and never
  replaces one, so no migration rewrites a grant anybody already holds.

  A directory group name is a principal, not a permission. The identity
  provider is the authority on who someone is and which groups they hold; the
  installation is the authority on what a group may do inside it. That split is
  what keeps an Active Directory or Entra ID sync out of the design: the grant
  maps a role string to a permission and a scope, and lives here. Encoding the
  scope into the grant's own name (`system:publish@proc_...`) inverts the
  split, and makes the directory admin the authority on this engine's
  permissions, expressed in this engine's opaque ids. That form stays a
  documented fallback for an installation that wants it, behind the same check.

  A scope follows `{type, config}`, the shape `plugin` already gives actions,
  data sources and assignment strategies. `{ type: "process" }` is the only
  type a first version ships.

  `Actor.roles` keeps its current shape, a `string[]` of free text from either
  source. That is deliberate and load-bearing: `actor.roles` sits in the CEL
  context (`src/cel/eval.ts:83`), `claimToRoles` (`src/auth/jwt.ts:81`) passes
  an issuer's claim through verbatim, and `auth_users.roles` is a `TEXT[]` the
  admin area edits. None of the three moves.

  Nobody is blocked by the current model, so nothing is queued.
  `tmp/open-work-priority.md` carries the trigger. The one piece worth landing
  ahead of a need is the seam: `can(actor, permission, processId)` at the call
  sites that hold a process, with today's global-role check as its whole body.
  Behind that function, the storage question stops being one a later change can
  get wrong.
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

  Shipped 2026-08-15 as `studio-editor-dock`. The strip lives in
  `dock/EditorDock.tsx` over the pure `dock/pathRows.ts`, and the glossary
  carries the noun.
