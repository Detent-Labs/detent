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
