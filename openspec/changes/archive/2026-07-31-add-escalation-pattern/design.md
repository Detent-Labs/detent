## Context

See proposal.md for motivation. This section covers only what shapes the
approach.

`examples/expense-approval.json` already has a `review` step (assignment
`finance-approver`) with a non-forcing reminder timer
(`timer_dddd4444-0001...`, `onFire.actions`, 7 days). Six test files load
this fixture by array index: `test/validate.test.ts`,
`test/compile-validation.test.ts`, `test/cel.test.ts`,
`test/cancel.test.ts`, `test/http.test.ts`, `test/runtime-api.test.ts`.
Any change that reorders or removes an existing element breaks them.

`test/validate.test.ts` asserts the stored `raw.definitionHash` equals
`definitionHash(compileProcessBody(raw.definition))`. A body change without
a recomputed hash fails that assertion.

The full technical shape (exact JSON to add) was already worked out and
approved: `docs/superpowers/specs/2026-07-30-escalation-pattern-design.md`.
This design references it rather than repeating it.

## Goals / Non-Goals

**Goals:**
- A concrete, tested escalation instance in `examples/expense-approval.json`
  that a customer can read as a template.
- Zero engine or schema changes; the pattern composes only what already
  ships (timers, `assignment`, the action registry).
- All six index-dependent test files keep passing unmodified.

**Non-Goals:**
- Chained, multi-tier escalation. Out of scope for this change; the shape
  repeats on the escalation step itself if a customer needs it.
- Resolving the notification recipient to the actual assignee. Recipients
  stay static config, matching the Stage 16 (Notifications) decision.
- A generic, reusable escalation subprocess. Considered and rejected during
  brainstorming in favor of a concrete in-process example.

## Decisions

**Append-only change to `expense-approval.json`.** The new timer, path,
and step each go at the end of their array. Alternative considered:
insert the escalation path next to the existing approve/reject paths for
readability. Rejected: an insert shifts every later index. That breaks the
six dependent test files' index-based lookups.

**Escalation timer forces a transition (`onFire.targetPath`), not a
reminder.** The engine's existing timer-forced-transition behavior already
bypasses the target path's guard. This change adds no new engine
capability. The target path is `trigger: "manual"`, matching `review`'s
other two
paths. This follows the existing schema invariant: a step's paths must be
all-manual or all-automatic.

**`escalated_review` is an ordinary step, not a new step type.** It
mirrors `review`'s view (readonly) and its approve/reject paths. It
carries a different `assignment` (`finance-manager` role) and its own
`onEntry` notify action. Alternative considered: a subprocess-packaged
escalation tier. Rejected as a Non-Goal, see above.

**Notify action uses `http.request`, not `review`'s existing
`notify.email`.** `review`'s existing reminder action already uses type
`notify.email`. That type is absent from `createDefaultRegistry()`
(`src/engine/host.ts`). It only runs where a caller registers a stub for
it by hand. Three callers do: tests, `scripts/seed.ts`, the demo script.
`http.request`
already ships in the default registry (Roadmap #5e). The new escalation
notify action works out of the box, with no such caller-side setup. Stage
16 (`notification.email`) has not shipped yet. `http.request` occupies
the same action position (`onEntry`/`onFire.actions`), so the pattern
needs no change once Stage 16 lands. See Risks / Trade-offs for the gap
this leaves in the *existing* reminder action, which this change does not
touch.

## Risks / Trade-offs

- **Hash drift.** A body change without a recomputed `definitionHash`
  fails `test/validate.test.ts`. Mitigation: recompute the hash in the
  devcontainer immediately after the change, per this repo's tooling
  convention. Run the full suite only after that.
- **Silent index breakage.** A future editor could still reorder
  `review.timers`/`review.paths`/`steps` without noticing the dependent
  test files. Mitigation: none beyond the existing convention (append-only
  changes). This is a pre-existing risk the design inherits, not one this
  change introduces.
- **Pre-existing gap in the copyable example, left open on purpose.**
  `review`'s existing reminder action uses `notify.email`, a type absent
  from `createDefaultRegistry()`. A customer who copies
  `expense-approval.json` into a stock deployment hits an
  unregistered-type publish error. That error comes from the pre-existing
  action, not from anything this change adds. Fixing it would swap an
  already-shipped action's type in a change scoped to documentation and
  example content. That widens scope beyond Stage 17. A review of this
  design raised the gap; the deliberate choice is to leave it for a
  future change.

## Migration Plan

No deployed instance runs `expense-approval.json` in production yet. It is
an example/seed fixture, not a customer-authored process. No running
instance needs migration. `bun run seed` re-publishes the changed body
under its existing `processId`, which mints a new version. No existing
published version changes, since published versions are immutable.

## Open Questions

None. The concrete JSON shape, the role name (`finance-manager`), and the
notify handler choice (`http.request`) are all settled already. See the
approved design this document references.
