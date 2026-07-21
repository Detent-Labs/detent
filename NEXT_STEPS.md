# Next Steps

Guided backlog for the upcoming OpenSpec changes. Engine roadmap #1–3 is done and
archived; there is no active change in flight. Items are ordered by priority. Each
is its own OpenSpec change (`opsx:new`) unless marked trivial.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done.

---

## 1. Close the data-source gap (publish-error, not resolution) — ✅ DONE (change `forbid-cel-datasource-refs`)

The single real trap living in already-shipped code. `src/cel/check.ts` registers
each declared data source as a `dyn` variable, so an expression reading one
type-checks and **publishes** — but the engine resolves data sources **nowhere**
(`src/engine/` has no reference). Runtime consequence: a guard reading a data
source parks silently `false` forever; a mapping reading one throws inside outbox
delivery. This is the last check/eval scope drift.

Scope for this change: make a data-source reference a **publish error** until
resolution exists. Full resolution in the engine is a separate, larger change —
build it only when actually needed.

- [x] Boundary: reject any CEL Expression that references a declared data source
      (the declaration and `field.dataSource` binding stay legal). Implemented by
      stopping data-source registration in `check.ts::buildEnv` — an `unknown
      variable` publish error via the existing `validateProcessBody` path.
- [x] On the write path (`validateProcessBody` → `publishBody`), not a
      `definition.ts` Zod refinement — same placement as CEL/duration validation.
- [x] Located issues via the existing `CelIssue[]` (`unknown variable: <key>`).
- [x] Test flipped: `test/cel.test.ts` "a data source is not visible to a guard
      either" now asserts rejection; a declared-but-unread data source still
      publishes. Full suite green (399 pass, 0 fail, 0 skip), `tsc` clean.
- [x] CLAUDE.md updated: moved out of "Decided, not yet built"; publish-error
      boundary recorded as fact.

## 2. Move `resolveBody` inside the per-instance `try` in the workers — ✅ DONE (change `isolate-worker-poison-rows`, commit `1dbbac7`)

Finishes the poison-row isolation work. `src/engine/timers.ts::drainTimers` and
`src/engine/resolution.ts::drainResolutions` both now wrap `parseInstance` +
`resolveBody` (plus due-timer selection / the hash check) inside the per-instance
`try`; `src/engine/outbox.ts::drainOutbox` got the matching per-row boundary too.
A poison row is isolated (requeued / left `claimed` / skipped) instead of
starving the rest of the batch.

- [x] Move the `resolveBody` call inside the per-instance `try` in
      `src/engine/timers.ts`.
- [x] Same in `src/engine/resolution.ts`.
- [x] Confirm the failure of one instance's body resolve is isolated to that
      instance, not the batch (requeue / skip, not a faulted status — that flag
      stays out of scope, see below).
- [x] Test: one poison row in a batch does not starve the sibling due instances
      (`test/` — one per worker, resolution/timers/outbox).
- [x] CLAUDE.md: no "Decided, not yet built" entry existed for this one to
      remove; the roadmap section already reflects the isolation as done.

Deferred out of this change (recorded in its design.md, not lost): the stale
`next_timer_at` self-heal and an inert faulted `resolve_state` flag.

## 3. Editor — strategic fork (roadmap #4)

The big step forward: a separate package that produces definitions graphically
against the JSON/Zod contract. Needs its own brainstorming + proposal, not a
side-effect edit.

- [ ] Brainstorm scope and boundaries (`superpowers:brainstorming`).
- [ ] Promote the repo to workspaces (root `package.json` workspaces, `packages/`).
- [ ] Decide the shared-contract boundary: editor imports `src/schema/definition.ts`
      as the single source of truth (no re-typing).
- [ ] Write the proposal (`opsx:propose`).

---

## Explicitly NOT now (revisit only if metrics demand)

The context marks all four as "revisit only if proven common" — YAGNI until a real
signal appears. Listed so they are tracked, not lost.

- [ ] Reconcile in-flight action writebacks across a migration (today: skip with
      `pending-actions`). Needs six mechanisms correct at once — revisit only if
      `pending-actions` skips prove common.
- [ ] A `migration.transform-dropped` event kind (a raising `transforms` expression
      leaves its target unwritten silently). Deferred to keep the migration event
      surface to one new kind.
- [ ] `TimerState` provenance (reconciliation keys on timer id alone; a redeclared
      id with a changed duration keeps the stale `fireAt`). Needs a provenance field.
- [x] Orphan-key inspection tooling — ✅ DONE (change `orphan-key-inspection`).
      `src/engine/migration.ts::findOrphanKeys(processId, version, db, resolvers)`:
      a read-only, keyset-paginated scan reporting which instances pinned to a
      published version hold `data` keys absent from that version's field catalog
      (group ids included as never-valid), covering every instance status, with
      per-row fault isolation (`unreadable`) matching the three background drains.
      No pruning — visibility only. New capability spec
      `openspec/specs/orphan-key-inspection/spec.md`. Tests: `test/migration.test.ts`
      7.1–7.5. Full suite green (404 pass, 0 fail, 0 skip with `DATABASE_URL` set).
