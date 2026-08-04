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
- **CEL-readable data-source results.** Runtime option-list resolution for
  `field.dataSource` is DONE (see `docs/current-state.md`) — but `src/cel/check.ts`
  still registers a data source at no site (guards/output/transforms), so a CEL
  reference to one remains a publish error (`unknown variable`). Widening that is
  a separate, more consequential decision (an unresolvable reference there could
  only park a wait-state forever or throw mid-delivery); it stays deliberately
  out of scope until a concrete need for CEL-visible data-source values exists.
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
- **A publish-time warning for a step with no `assignment`.**
  `Step.assignment` is optional, and the studio leaves it empty by default.
  A whole process can therefore publish without one, as `Test-process` did.
  The starter can then walk their own case through every step, since the
  assignment-less floor is starter-or-`system:admin`
  (`api.ts::submitAndTransition`). The instance also reaches no inbox,
  because `scope=mine` filters on `assignedTo`/`assignedToRoles` alone
  (`api.ts::listInstances`). Keep it a warning in the studio, never an
  invariant: a self-service form legitimately has no assignment. The
  archived `2026-08-01-fix-claim-affordance/design.md` records two adjacent
  gaps, the studio Player and the inbox predicate.
