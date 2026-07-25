# Roadmap

1. Validation layer (Zod-first): DONE. definition.ts is Zod-sourced with TS types
   via z.infer and the structural invariants as refinements / superRefine; the
   bun:test suite test/validate.test.ts exercises them. The cross-process invariants
   that need the child definition are now enforced at publish
   (`definitions.ts::validateCrossProcess`, `test/cross-process.test.ts`): a
   subprocess step's `inputMapping` targets must lie within the referenced child's
   `contract.inputFields`, and the child reference must resolve to a *contracted*
   published child (`pinned` → the version exists; `latest-at-spawn` → a published
   version's compiled-contract hash equals `contractRef`). This enforces child-first
   publish ordering. The originally-scoped "callable child requires no non-input
   field" invariant was dropped as unsound: a `required` view flag is satisfied by
   an interactive step's user, not the caller, so it does not encode "the caller
   must supply this field" (the expense-approval example legitimately requires a
   non-input field at its manual review step). A subprocess step's `outputMapping`
   values and automatic-path guards are now also checked at publish
   (`src/cel/check.ts::checkSubprocessChildRefs`, invoked from
   `validateCrossProcess`): `child.data.<key>` type-checks only for a `<key>` in
   the referenced child's `contract.outputFields` (resolved to the child's own
   field `key`), instead of the generic `dyn` every other CEL site sees for
   `child.data`. A violation throws `CelValidationError`, not
   `CrossProcessValidationError` — it is a CEL reference defect, not a wiring one.
   Runtime `child.data` stays the child's full data object; only the CEL surface
   is confined to the contract (see `cross-process-validation` spec).
2. CEL wiring: DONE. Authoring-time (`src/cel/check.ts`) and engine-side evaluation
   (`src/cel/eval.ts`): guards evaluated at runtime (total — a runtime error is
   `false`) and Action.output result-writeback. Migration `transforms` are the last
   wired site: `validateMigrationSpec` parse/type-checks them against the source
   catalog with the result type checked against the target field (`buildEnv` gained an
   `actor` flag so this one site can withhold it), and `evalTransforms` evaluates them
   at migration, total per entry, reusing `coerceJson`. `validateProcessBody` is wired
   into `publishBody` (an invalid expression is a publish error, not a runtime one),
   and the check/eval scopes were reconciled at the one site where they had drifted:
   `Action.output` registers `result` alone, and `onCancel` outputs — previously the
   one action position `collect()` never visited — are checked.
3. Engine skeleton: largely DONE. Instance store, transactional outbox (delivery +
   writeback + retry/dead-letter + reclaim), transition executor (manual/automatic/
   timer, onExit→onPath→onEntry ordering, run-to-rest), async re-resolution of
   wait-states after a writeback, timer arming + scheduler, and crash recovery
   (outbox/resolution reclaim, persisted `next_timer_at`). Persists to PostgreSQL
   via Bun's native `Bun.sql`; connection via `DATABASE_URL`. Single-instance runtime
   cancellation is DONE (`cancelInstance`: skip onExit, `[onCancel, sink.onEntry]`,
   cancel HistoryEntry, OCC, no-op on non-running). Subprocess execution is DONE
   (`subprocess.ts`: spawn on subprocess-step entry — by transition or at creation on
   an initial subprocess step — child-body resolution by
   `versionBinding`, `inputMapping` seed, return via `outputMapping` + direct parent
   advance, idempotent spawn) together with downward cancel propagation
   (`cancelInstance` cascades to active children by the `parent` link). `deadline`
   timers are DONE (`duration.ts`: `instantFromValue` + the deadline branch of
   `armStepTimers`; see the timers entry above). `TimerState` provenance is DONE
   (`armStepTimers` records what each timer was armed from — `{kind: "duration",
   duration}` or `{kind: "deadline", src}`, plus `armedAt` — on every armed
   `TimerState`; `migration.ts::reconcileTimers` compares a carried, unfired,
   still-declared timer's provenance against the target step's current
   declaration and re-arms on a mismatch instead of blindly keeping the old
   `fireAt`; a carried timer with no provenance — armed before this field
   existed — is trusted as unchanged, since reconciliation has no signal to
   compare it against). The runtime event log is DONE
   (`InstanceEvent`: a reminder fire, an unarmed timer, a skipped migration and a
   creation-enqueued subprocess spawn are recorded, and an
   `ActionOutcome` now attaches to the record that enqueued it). Instance migration is
   DONE (`src/engine/migration.ts`): a migration plan is a row keyed
   `(processId, fromVersion, toVersion)` in `migration_plans`, registered by
   `registerMigrationPlan` independently of publish, validated against both bodies
   (structural, type-compatibility incl. the identity-carried case, and the transform
   CEL check) and frozen by an atomic `WHERE applied_at IS NULL` upsert once the first
   instance migrates under it. `migrateInstances` reads the plan once, stamps it applied
   before the first instance, then keyset-paginates the running/source-version
   population selecting ids only and migrates each in its own row-locked transaction
   (`SELECT … FOR UPDATE`, since the OCC token does not cover `data`): remap step via
   `stepMap`/identity/`onUnmappable`, remap `data` losslessly from the locked snapshot
   (`fieldMap` + `transforms`, orphans retained), reconcile timers four-ways
   (carried+declared kept with `fireAt`, fired kept fired, newly-declared armed against
   the target body/post-remap data/new seq, withdrawn dropped), then commit through the
   shared `planStepEntry`/`applyStepEntry` seam with `entryVersion`, `suppressSpawn` on
   an identity step, the reconciled timer set and the pin/payload field patch — so
   status, the subprocess spawn/return and the `HistoryEntry` (`cause: "migration"`,
   `pathId: null`) are inherited, not reimplemented. An instance is skipped
   `pending-actions` only while it holds a `claimed` outbox row with an active lease
   (a worker plausibly mid-handler right now); a `pending` row, or a `claimed` row
   whose lease has expired, is instead remapped in place through the plan's
   `fieldMap` (with a `field_version` lamination stamp and a delivery-side version
   fold guarding the residual race — see `docs/current-state.md`) and the
   instance migrates immediately. An unmappable instance under `reject-and-pin` is
   skipped `step-unmappable`; both skip reasons are recorded as a `migration.skipped`
   `InstanceEvent`. The
   migrating parent repairs every child's `parent.stepId` (terminal children included).
   The operation is per-instance fault-isolated and reports instance ids grouped
   migrated/skipped/conflicted/failed. A subprocess step as the *initial* step spawns
   too (`createInstance` enqueues at seq 0 inside the INSERT transaction, carried by a
   `subprocess.spawn-enqueued` event). Publish-time cross-process
   validation (inputMapping ⊆ child inputFields, child reference resolvable → child-first
   ordering) is DONE (`definitions.ts`, roadmap #1). The production `resolveBody` backing
   (definition/version store) is DONE (`definitions.ts` + `host.ts`), so the
   resolution and timer workers are live. Orphan-key visibility is DONE
   (`migration.ts::findOrphanKeys(processId, version, db, resolvers)`): a read-only,
   keyset-paginated scan reporting which instances pinned to a published version hold
   a `data` key absent from that version's field catalog (a `group` field's own id is
   never a valid key regardless of catalog declaration), covering every instance
   status and isolating an unreadable row into a separate list rather than aborting —
   the same per-row fault isolation as the three background drains. Read-only: no
   pruning. A resolver miss throws `MigrationPlanError`, matching
   `registerMigrationPlan`/`migrateInstances`.
4. Editor: DONE for v1 scope. `packages/editor` — Bun workspace package,
   structural panels + Draft model + live validation (reusing the engine's
   unmodified publish-time validators) + read-only auto-layouted graph view +
   file-based draft I/O (load/save/import/export) + UI-chrome i18n +
   participant-facing content localization (`LocalizedText`/`baseLocale` on
   the schema). Out of scope for v1 and not yet built: canvas editing
   (drag-to-connect), an HTTP transport or server around the Runtime API
   Layer, auth/actor resolution, and assignment/claim enforcement — see the
   Runtime API Layer entry above for which of those it already deliberately
   excludes.
5. Post-v1: make the engine reachable. DONE (a–e all DONE).
   Planned stages, each depending on the previous one landing first:
   a. DONE. Validated the stack end-to-end with a throwaway script exercising
      `createProcessInstance` -> `getInstanceView` -> `submitAndTransition`
      against `examples/expense-approval.json` (`b27e18f`). Pure validation,
      no new capability, no OpenSpec change.
   b. DONE. HTTP wrapper around the Runtime API Layer (`src/http/`): a thin
      REST/JSON adapter over `Bun.serve` exposing the same three operations
      (plus claim/release from stage d) as REST/JSON routes, with
      typed-error-to-HTTP-status mapping. See the "HTTP wrapper" entry under
      `docs/current-state.md` for the full shape.
   c. DONE. Player/Preview UI in `packages/editor/src/player/`: a form screen
      that drives a real instance through (b), reachable via a Structure/Player
      toggle in `App.tsx` — distinct from the existing read-only structural
      graph view, which shows the FSM shape, not a running instance. See the
      "Player/Preview UI" entry under `docs/current-state.md`.
   d. DONE. Auth/actor resolution + assignment/claim enforcement
      (`src/auth/resolve.ts`, `transition.ts::claimStep`/`releaseClaim`,
      `registry.ts::AssignmentRegistry`). Activates the previously
      declared-but-inert `Step.assignment` field: a pluggable `ActorResolver`
      (one non-production dev header resolver shipped), registry-validated
      assignment strategies resolved at step entry, exclusive claim/release on
      `instance.assignment`, and claimant-only enforcement in
      `submitAndTransition`. See the "Auth/Actor-Resolution +
      Assignment/Claim-Enforcement" entry under `docs/current-state.md`.
   e. DONE. Generic `http.request` action handler (`src/handlers/http.ts`),
      registered by default in `createDefaultRegistry` (`src/engine/host.ts`).
      Vendor-neutral REST call: config validated at publish time, an
      `Idempotency-Key` dedup header on every attempt, a default `Content-Type`
      for JSON bodies, and response/failure classification into the outbox's
      existing permanent-vs-transient retry semantics. See the "Generic
      http.request action handler" entry under `docs/current-state.md`.
