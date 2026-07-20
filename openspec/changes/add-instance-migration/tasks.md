> **Prerequisites.** `commit-transition-synthesized-callers` is required by all of
> section 5 — it supplies the plan/apply seam, the derived status, the field patch, the
> events channel and the overrides. `harden-subprocess-return` is required only by the
> `subprocess-execution` delta and task 7.11; sections 1–4 and 6 do not depend on it.
> Implement in the order 1 → 2 → 3 regardless, since the first two touch the same block
> of `transition.ts`.

## 1. Schema: the contract additions

- [ ] 1.1 Add the `migration.skipped` arm to the `instanceEvent` union in
  `src/schema/definition.ts`: strict payload `{ fromVersion, toVersion, reason }` with a
  `migrationSkipReason` enum of `step-unmappable` and `pending-actions`. Do **not** add
  an unreadable-instance reason — an event envelope needs `instanceId`, `version` and
  `transitionSeq`, which a row failing `instance.parse` cannot supply; that case is
  reported as failed.
- [ ] 1.2 Add an injectivity refinement to `migrationSpec.fieldMap`.
- [ ] 1.3 Remove `fromVersion` from `migrationSpec` and `migration` from the
  `processVersion` wrapper. The plan key carries both. Both are on the unhashed
  wrapper — assert by test that no body's `definitionHash` changes.
- [ ] 1.4 Tests in `test/validate.test.ts`: a malformed `migration.skipped` payload is
  rejected; both reasons parse; a non-injective `fieldMap` is rejected.

## 2. CEL: the transform site

- [ ] 2.1 Add an `actor` flag to `buildEnv`'s options in `src/cel/check.ts`. Only the
  migration entry point sets it, and that entry point builds its own environment, so
  `validateProcessBody`'s cache is unaffected — assert ordinary sites still resolve
  `actor`.
- [ ] 2.2 Add `validateMigrationSpec(spec, fromBody, toBody): CelIssue[]`: environment
  from `fromBody` with `result`, `child`, `dataSources` and `actor` all off. Locate
  issues as `migration.transforms.<fieldId>`.
- [ ] 2.3 In the same pass, reject a `transforms` key absent from `toBody`'s catalog,
  and check each expression's inferred result type against the target field's declared
  type using the existing `Site.expect` machinery (`dyn` passes, as for `deadline`).
- [ ] 2.4 Add `buildTransformContext(fromBody, snapshot)` to `src/cel/eval.ts`: `data`
  re-keyed fieldId→key against the **source** catalog plus `instance` via
  `projectInstance`. Nothing else.
- [ ] 2.5 Add `evalTransforms(spec, fromBody, snapshot)`, total per entry. It **must**
  reuse `evalFieldMap`'s `coerceJson` — cel-js models CEL `int` as bigint, and a bigint
  in jsonb makes the instance fail `instance.parse` on its next read.
- [ ] 2.6 Tests in `test/cel.test.ts` for every scenario in the cel-expressions delta,
  including an integer-valued transform surviving a round-trip.

## 3. Persistence

- [ ] 3.1 `CREATE TABLE IF NOT EXISTS migration_plans (process_id, from_version,
  to_version, spec jsonb, applied_at timestamptz, PRIMARY KEY (process_id, from_version,
  to_version))` in `initSchema`. `definitions`, `outbox` and `publishBody` are **not**
  touched.
- [ ] 3.2 Add an index over the instance selection fields `{processId, version, status}`.
  They live inside the jsonb body, so without it every batch sequentially scans every
  instance in the system. Idempotent creation, like every other index there.

## 4. The migration plan store

- [ ] 4.1 `registerMigrationPlan(processId, fromVersion, toVersion, spec, db)`: resolve
  both bodies (refuse an unpublished version, refuse `from === to`), run 4.2–4.4, then
  upsert **under `WHERE applied_at IS NULL`** as one atomic statement. Zero rows on an
  existing key means applied → refuse. A read-then-write leaves a window in which one
  invocation migrates under spec A while spec B is stored.
- [ ] 4.2 Structural validation: `stepMap` keys in the source body and values in the
  target; `fieldMap` keys in the source catalog and values in the target; `transforms`
  keys in the target catalog; `unmappableStep` in the target body iff
  `onUnmappable === "route-to-step"`.
- [ ] 4.3 Reject `CANCEL_SINK_STEP_ID` as a `stepMap` value or as `unmappableStep`.
  `compileProcessBody` injects it into every body, so it passes a bare existence check
  while parking the instance on the cancellation terminal.
- [ ] 4.4 Type-compatibility validation: `celType` equality for every `fieldMap` pair,
  **and** for every field id declared by both catalogs with no `fieldMap` entry — the
  identity-carried case has no entry to hang a per-entry check on. Then delegate the
  `transforms` expressions to 2.2.
- [ ] 4.5 `resolveMigrationPlan(processId, fromVersion, toVersion)`.
- [ ] 4.6 Tests: every scenario in the plan-entity, freeze, validation and
  type-compatibility requirements — including that an invocation migrating nothing still
  freezes the plan.

## 5. The migration operation

- [ ] 5.1 New `src/engine/migration.ts`. `migrateInstances(processId, fromVersion,
  toVersion, db, resolvers)` → a result carrying the **instance ids** migrated, skipped,
  conflicted and failed. Refuse up front when no plan is registered.
- [ ] 5.2 Read the plan **once**, before processing anything, and stamp `applied_at`
  before the first instance — not on the first success, or an invocation that skips
  everything leaves the plan editable while it runs. Every instance uses that one spec.
- [ ] 5.3 Scan by **keyset pagination** on `instance_id`, selecting **identifiers only**
  (`WHERE instance_id > :last ORDER BY instance_id LIMIT 100`). A bare `LIMIT` over the
  source-version predicate does not terminate: skipped, conflicted, pending-actions and
  unreadable instances all stay on the source version and in the predicate.
- [ ] 5.4 Per instance, open a transaction and re-read the row `SELECT … FOR UPDATE`.
  Compute everything from that read, not from the scan. The concurrency token does not
  cover `data` — an action writeback modifies one field without advancing or checking it
  — so a payload computed from an earlier read would erase a concurrent writeback
  silently while the predicate still matched.
- [ ] 5.5 Wrap each instance in its own `try`, covering the row parse and body
  resolution as well as the commit. Report an unreadable instance as **failed**, with no
  event.
- [ ] 5.6 Skip an instance holding any outbox row that is not `delivered`, reason
  `pending-actions`, and record the event. Its `Action.output` is keyed by the source
  version's field ids; delivering it after a rename writes the key the migration
  vacated.
- [ ] 5.7 Resolve the target step: `stepMap` entry, else the same id if the target body
  declares it, else unmappable → apply `onUnmappable` (absent = `reject-and-pin`).
- [ ] 5.8 Remap data from a **snapshot**: compute all `fieldMap` renames against the
  locked read, overlay `evalTransforms` (also over that snapshot), apply as one patch.
  Unmapped keys retained, including ones the target catalog no longer declares.
- [ ] 5.9 Reconcile timers using the four-way partition from the timers delta —
  including the fired-and-still-declared case, which a three-way reading resurrects. Arm
  newly declared timers against the **target** body, the **post-remap** data and the
  **new** sequence, collecting `armStepTimers`' drops.
- [ ] 5.10 Compose the seam inside the transaction: `planStepEntry(instance, target,
  targetBody, { pathId: null, cause: "migration", actions, timers: reconciled,
  entryVersion: toVersion, suppressSpawn: stepUnchanged, events: drops })` then
  `applyStepEntry(tx, plan, { version, definitionHash, data })`. Do **not** derive
  `status`, reimplement the spawn or return enqueue, or write the instance row directly.
- [ ] 5.11 Action list: `[]` when the step id is unchanged, `target.onEntry` when the
  migration relocated the instance. `onExit` is never included.
- [ ] 5.12 In the same transaction: set `resolve_state = 'pending'`, and remap the
  `parent.stepId` of **all** children of this instance — not only running ones, since a
  terminal child is precisely the one whose return is in flight — when the step changed.
- [ ] 5.13 The skip path: append `migration.skipped` at the unchanged `transitionSeq`
  carrying the source version in the envelope and both versions plus the reason in the
  payload.
- [ ] 5.14 A lost OCC race is caught, the id recorded as conflicted, and the batch
  continues. Not retried within the run.

## 6. Tests for the operation

- [ ] 6.1 New `test/migration.test.ts` covering every scenario in the instance-migration
  spec. DB-backed, `test.skipIf(!DB)`.
- [ ] 6.2 The step-entry consequences, one named test each: migration onto a terminal
  step yields `completed`; a migrated child on a terminal step enqueues its return; an
  identity migration of a parked parent spawns **no** second child; a relocation onto a
  subprocess step does spawn; a migrated instance whose guard now matches is advanced to
  rest.
- [ ] 6.3 The row lock: land an action writeback concurrently with a migration of the
  same instance and assert the written value is not lost. This is the test that fails
  against a batch-read payload.
- [ ] 6.4 The audit shape: exactly one new `HistoryEntry` with `cause: "migration"`,
  `pathId: null`, target `version`; an identity migration still produces one; a skipped
  instance produces an event and no entry; an unreadable one produces neither.
- [ ] 6.5 The OCC race: read at seq N, commit an ordinary transition from N, migrate from
  the stale N — one winner, no partial write.
- [ ] 6.6 In-flight actions: an instance with a pending row is skipped with the right
  reason and migrates on a later invocation once delivered; an instance with only
  delivered rows migrates immediately.
- [ ] 6.7 Data remapping: a swap exchanges both values; a rename into an occupied field
  is deterministic; an orphan is retained; an integer transform round-trips.
- [ ] 6.8 Timer reconciliation: a surviving `fireAt` is byte-identical; a fired timer is
  neither resurrected nor dropped; a newly declared timer arms against the target
  catalog; a withdrawn timer is gone and `next_timer_at` fell back.
- [ ] 6.9 Termination: a full batch of skipped instances is followed by a *different*
  batch and the invocation ends. This is the test that fails against a bare `LIMIT`.
- [ ] 6.10 Fault isolation: one unreadable instance is reported failed and the rest still
  migrate.
- [ ] 6.11 Idempotency: a second full invocation appends no history; a skipped instance
  is re-evaluated and skipped again.
- [ ] 6.12 The status filter: completed, cancelled and faulted instances keep their pin
  and appear in no result category.
- [ ] 6.13 The parent-link repair for a **terminal** child: child reaches terminal first,
  parent migrates second, return delivered third — the parent is woken. Requires
  `harden-subprocess-return`.
- [ ] 6.14 Add the `migration.skipped` scenarios to the runtime-events suite and the
  timers delta's scenarios to `test/timers.test.ts` rather than duplicating them here.

## 7. Verification and documentation

- [ ] 7.1 `bun run typecheck` clean.
- [ ] 7.2 Full `bun test` with `DATABASE_URL` set — a single-file run is not the signal,
  and a green without the variable proves nothing.
- [ ] 7.3 Mutation-check **on a copy of the tree, never the shared working tree**: remove
  the seq advance → 6.5 fails by name; make timer reconciliation re-arm wholesale → 6.8
  fails by name; drop `suppressSpawn` → 6.2's duplicate-child test fails by name; replace
  keyset pagination with a bare `LIMIT` → 6.9 fails by name; compute the remap from the
  scan instead of the locked read → 6.3 fails by name.
- [ ] 7.4 Update `CLAUDE.md`: migration moves to done in roadmap #3; roadmap #2's CEL
  entry loses its transforms caveat; the current-state entries gain the plan store and
  the new event kind.
- [ ] 7.5 Update `README.md`'s status table.
- [ ] 7.6 Record in CLAUDE.md's "Decided, not yet built": reconciling in-flight action
  writebacks across a migration (deferred in favour of skipping, with the six mechanisms
  it would need); the deferred `migration.transform-dropped` event kind; the
  `TimerState` provenance gap; and orphan-key accumulation with no inspection tooling.
