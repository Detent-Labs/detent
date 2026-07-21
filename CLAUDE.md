# Workflow / BPM Engine — Project Context

## What this is
A headless, API-first workflow/BPM engine written in TypeScript. It executes
structured, form- and approval-driven business processes with explicit states.

The paradigm is a state-based finite-state machine: Steps (states) connected by
explicit Paths (transitions). This is NOT BPMN token flow.

Three roles share one artifact, the serialized JSON process definition:
- Engine: executes definitions (the executor).
- Editor: produces definitions graphically (comes later).
- Hand-authoring: definitions written directly as JSON (rare).

The serialized JSON definition is the contract between engine and editor.
`src/schema/definition.ts` is that contract, expressed as TypeScript types.

### Hard v1 boundaries (do not cross without a deliberate decision)
- Exactly one active step per instance (single FSM). No parallelism, no
  AND-split/join, no multi-instance steps.
- Subprocesses are synchronous call-and-return only. No fan-out.
- Action execution is async (post-commit). `blocking` is reserved but not built.

## Change workflow (OpenSpec)
This repo is spec-driven via OpenSpec (`openspec/`). Every non-trivial change —
new capability, contract/schema change, tooling or infra switch — goes through an
OpenSpec change, not a direct edit: propose -> generate specs/tasks -> implement
-> verify -> archive. Start one with the `opsx:` skills (`opsx:new`, or
`opsx:propose` for a full proposal in one step); `opsx:apply` implements tasks and
`opsx:archive` closes it. Trivial fixes (typo, comment, one-liner) skip it. The
project context OpenSpec shows the AI when generating artifacts lives in
`openspec/config.yaml` (`context:`) — keep it current.

## Repository layout
```
.devcontainer/             Dockerfile + docker-compose.yml + devcontainer.json (Node 22 + Bun, Postgres 16, Claude Code)
package.json               Bun-managed; scripts and deps
tsconfig.json              strict; NodeNext ESM; covers src + test
src/schema/definition.ts   Zod schemas = the contract; TS types via z.infer; invariants included
src/engine/                executor: instance store, outbox, transitions, timers, subprocess
examples/                  serialized example definitions
test/                      bun:test suites; tests run inside the container
```

## The contract: load-bearing rules
JSON is the one artifact; the Zod schemas (with TS types derived via z.infer)
are the contract. All of the following are facts the engine and editor must
uphold, not open questions.

**Identity.** Every entity has an opaque `id` (UUIDv4 with a type prefix, e.g.
`step_...`, lowercase, immutable) which is the SOLE reference anchor. `key` is a
human-readable slug that references nothing and may change. `label` is display
text. Cross-references and persisted instance state use `id` only. Ids are unique
per entity kind per process. Runtime ids (instance, history) use UUIDv7.

**Hashing / versioning.** `definitionHash` is the JCS (canonical JSON) hash of
`ProcessBody` only; the versioned wrapper is not hashed, so identical bodies get
identical hashes and an identical re-publish is a no-op. Published versions are
immutable. Instances pin `{ processId, version, definitionHash }` and rehydrate
against exactly that frozen body. A version cannot be deleted while an instance
references it. Migration is explicit (pin-by-default); it applies as one rule to
all instances on a version, never per-instance editing.

**Expressions.** All conditions are CEL, carried as `{ lang: "cel", src }`. CEL
is pure, total, and has no `now()`; time lives only in timers. Guards read the
frozen context: `data`, `instance`, `actor`, named data-source results, plus
`child.outcome`/`child.data` inside a subprocess step. One extra namespace,
`result` (a handler's structured return), is scoped ONLY to an Action.output
mapping and is never visible to guards. Use ONE CEL library for both the editor
(parse) and the engine (evaluate) so there is no semantic drift.

**Data vs presentation.** Fields are defined once in a process-wide catalog.
Each step carries a flat `view` that references catalog fields and overrides
per-step presentation (visible / required / readonly / order / group). The
instance payload is a flat object keyed by `fieldId`, stable across the whole
lifecycle. Requiredness lives only in the view, never in the catalog.

**Actions and triggers.** Actions are declarative handler references
(`{ type, config }`), never inline code. Triggers are ordered: onExit(source),
then onPath, then onEntry(target). State is committed first, side effects
dispatched after via a transactional outbox (at-least-once). Idempotency +
at-least-once = effectively-once; the default idempotency key is a deterministic
(UUIDv5) hash of instanceId + transitionSeq + actionId. `transitionSeq` is
monotonic per instance and doubles as the optimistic-concurrency token. Action
results are written back into `data` via `Action.output` (keyed by target
FieldId, value CEL over `result`); the handler returns, the engine writes.
Timers are first-class on the step; fire time is computed at entry and persisted.
A timer-forced transition bypasses its target path's guard.

**Paths.** A path has `trigger: manual | automatic` and an optional `guard`.
A step's paths must be all-manual or all-automatic, never mixed. Among two or
more automatic paths, `priority` is required and unique (lower evaluated first,
first matching guard wins). A guardless automatic path is the default/else and
must have the highest priority; a wait-state has no default (no match = wait,
bounded by a timer). Gated side effects are modeled as a visible wait-state with
result-driven automatic paths, not hidden transaction semantics.

**Subprocesses.** Call-and-return via a `subprocess` step (a wait-state). A
process used as a subprocess declares a `ProcessContract` (input fields, output
fields, and an enumerated set of `outcomes`). Terminal steps bind to an
`outcome`; callers guard on `child.outcome`, never on the child's internal step
id or key. Default binding is `latest-at-spawn` pinned by `contractRef` (a hash
of the child contract the parent validated against): a contract change starts a
new signature, so existing callers keep the newest matching child and do not
silently adopt the change. This pins the interface while the implementation
floats.

**Extensibility.** Custom actions, guards, data sources, assignment strategies,
and field types are plugins behind a uniform envelope `{ type, config }`. The
core validates only the envelope; each plugin ships its own JSON Schema. The
registry maps `type -> { config schema, output schema }` and validates at
PUBLISH time (unknown type or invalid config is a publish error, not a runtime
error). Data sources are never inlined; fields bind to them by id and options
resolve at runtime.

**Runtime record (the audit backbone).** The instance carries assignment/claim
state and persisted timer firings. Each HistoryEntry is append-only and records
the definition `version` active at that entry (so step/path ids resolve after a
migration), the cause (user / timer / automatic / migration), and per-action
`ActionOutcome` including the actually-resolved handler build. These runtime
facts are not reconstructable later, so they are recorded from v1.

A HistoryEntry is transition-shaped — `toStepId` is required — so events that carry
no step change get a sibling record, `InstanceEvent` (append-only, `evt_` ids): a
discriminated union over `kind` with a kind-specific payload, carrying the instance,
the `version` and the `transitionSeq` **in force**. An event never advances the
sequence, so several may share one and share it with a transition; they order by
`at`. Two kinds exist — `timer.fired` (a reminder fired: actions enqueued, no
transition) and `timer.unarmed` (a declared timer produced no `fireAt` at entry, with
the reason). Migration adds its kind additively; the record shape is settled.

An `ActionOutcome` attaches to the record that **enqueued** the action, carried on the
outbox row rather than derived from `(instanceId, transitionSeq)`. That derivation is
exact for a transition and wrong for an event: a reminder's outcomes would join the
preceding transition's entry, and on a step an instance was created on — sequence 0,
no entry exists — the update would match no row and discard the outcome silently.

## Authoring-time invariants (the validation layer must enforce these)
The TS types cannot express these; they must be Zod refinements or a lint pass,
each with a test that rejects a violating definition.
- All `id` references resolve within the process; `initialStep` exists.
- Ids unique per kind; slugs/keys are not used as references anywhere.
- Every non-terminal step has at least one exit (a path, or a timer with a
  targetPath); terminal steps have no outgoing paths.
- A step's paths are all-manual or all-automatic. Among 2+ automatic paths,
  `priority` is present and unique; at most one guardless automatic path; if a
  default exists it has the highest priority.
- Field `options` XOR `dataSource`. Timer `duration` XOR `deadline`.
- `duration` values are ISO-8601 W/D/H/M/S (no calendar units, at least one
  component), and a `Timer.duration` is additionally bounded so `entryInstant +
  duration` stays in the four-digit-year window. Enforced at PUBLISH
  (`compile.ts::validateDurations`), never as a Zod refinement: `definition.ts` is
  also the deserializer for stored immutable bodies, so a tightened refinement would
  make an already-published definition throw on READ and its pinned instances
  unrehydratable. Validation that may tighten over time belongs on the write path —
  the same placement CEL checking and plugin-config validation take.
- `pinnedVersion` present iff `versionBinding === "pinned"`; `contractRef`
  present for a latest-at-spawn subprocess reference.
- A process referenced as a subprocess has a `contract`. In a contracted
  process every terminal step has an `outcome` in `contract.outcomes`; `outcome`
  only on terminal steps; every declared outcome is reachable by a terminal step.
- `inputMapping` keys are in the child contract's `inputFields`; a
  subprocess-callable child requires no fields outside its `inputFields`.
- `unmappableStep` present iff `onUnmappable === "route-to-step"`; migration
  maps reference valid ids.
- Every CEL Expression parses and type-checks against the field catalog. (This
  one is enforced in the CEL step below, not in definition.ts, since it needs the
  CEL library; all the structural invariants above are already in definition.ts.)

## Current state
- `src/schema/definition.ts`: the full definition and runtime model as Zod
  schemas, TS types derived via z.infer, so validation and types cannot drift.
  Compiles under `tsc --strict`. Includes local refinements and a process-level
  superRefine that enforce the structural invariants below. Ids are branded so a
  StepId is not interchangeable with a PathId. Literal and FieldDef are recursive,
  so those two types are hand-written and their schemas use z.lazy (the only place
  a type is not inferred).
- `examples/expense-approval.json`: a complete Capture -> Review -> Book example
  (booking wait-state, result-driven automatic paths, a reminder timer, a visible
  booking-error state, a declared contract). `processVersion.safeParse` accepts
  it; crafted violations are rejected.
- `test/validate.test.ts`: a bun:test suite that parses the example and asserts
  that each invariant rejects a violating variant, and that a label rename stays
  valid. Run with `bun test`.
- `src/cel/check.ts`: authoring-time CEL validation via `@marcbachmann/cel-js`
  (v8.0.0, the one library for both parse/check and the engine's later evaluate).
  `validateProcessBody(body)` parse- and type-checks every Expression against the
  field catalog and the formal expression context, returning located `CelIssue[]`.
  Kept out of definition.ts so the contract has no CEL dependency. CEL references
  fields by `key` (a `field_<uuid>` id is not a valid CEL identifier); scopes are
  enforced by which namespaces are registered (`result` only in Action.output,
  `child` only in subprocess steps, data sources everywhere except a timer
  `deadline`); `now()`/`timestamp()`/`duration()` are blocked. A `Site` may also
  declare an expected result type: the `deadline` site requires `string` (`dyn`
  passes, being unknowable), because a deadline yielding a non-instant is dropped
  at arming and an omitted timer is indistinguishable from an undeclared one. A
  deadline sees neither `child` (no child exists at entry) nor a data source
  (`buildGuardContext` does not resolve them, so it would throw at every arming) —
  both are publish errors rather than a wait-state that silently loses its bound.
  `test/cel.test.ts` covers each rule. Known papercut: `number`->CEL `double`, so
  `data.count == 5` needs `== 5.0`.
- `README.md`: public-facing overview (paradigm, the JSON/Zod contract, a status
  table, dev commands). Points here for the full invariant rules rather than
  duplicating them.
- Cancellation (contract layer, "Design A"): cancel is modeled as an
  engine-synthesized hidden path to a synthesized terminal cancel-sink, so it
  reuses the transition/history machinery instead of a nullable `toStepId`.
  `src/schema/definition.ts` adds an optional `onCancel: Action[]` step field
  (validated like onEntry/onExit outputs), the `cause` value `"cancel"`, the
  reserved cancellation identity (`CANCEL_SINK_STEP_ID`/`_KEY`/
  `RESERVED_CANCEL_OUTCOME`), and two derived bodies: `authoredProcessBody`
  (rejects a hand-authored reserved identity) and `publishedProcessBody` (exactly
  one cancel-sink). `src/schema/compile.ts` is the publish-time pass that injects
  the sink — plus the reserved outcome on a contracted process — before the hash,
  deterministically and idempotently. `test/cancel.test.ts` covers each rule.
  Runtime cancel is built for a single instance (`cancelInstance` in
  `transition.ts`, `test/cancel.runtime.test.ts`): a synthesized hidden-path
  transition to the sink that skips onExit, enqueues `[onCancel, sink.onEntry]`,
  records one HistoryEntry (`cause: "cancel"`, `pathId: null`), flips status to
  `cancelled`, and advances `transitionSeq` (OCC — a cancel racing a normal
  transition from the same seq resolves to one winner). It takes an
  already-rehydrated instance (like the other transition entry points) and no-ops
  on a non-running instance. Downward-only subprocess propagation is DONE (lands
  with subprocess execution below): passing `resolveBody` to `cancelInstance`
  recursively cancels active children by the `parent` link, depth-first for nested
  chains. Propagation is downward only in v1; no independent upward child cancel.
- Subprocess execution (`src/engine/subprocess.ts`, `test/subprocess.test.ts`):
  makes a `subprocess` step live via two engine-internal outbox handlers (reserved
  `core.` type prefix, rejected in authored bodies). Entering a subprocess step
  (via a transition — not as the initial step) enqueues `core.spawnSubprocess`,
  which resolves the child body by `versionBinding` (`pinned` → `pinnedVersion`;
  `latest-at-spawn` → newest version whose `contractHash` equals `contractRef`, via
  `createDefinitionStore.resolveLatestByContract`), seeds it from `inputMapping`,
  and creates the linked child (idempotent on the deterministic `subprocessChildId`;
  no-op if the parent is not running, with a post-insert re-check that self-cancels
  a child orphaned by a racing parent cancel). A child reaching a terminal step
  enqueues `core.returnSubprocess`, which evaluates the parent step's `outputMapping`
  over `child.outcome`/`child.data`, writes it into the parent's data, and drives
  the parent off the wait-state — selecting the first hop with the `child` namespace
  in context (the standard guard context omits `child`), then running to rest. Only
  a parent still parked at the subprocess step is advanced. *Which* step that is
  comes from the child's own `parent` link read at delivery, never from a step id
  frozen into the action config; the parked check, the writeback, and the advance
  are one transaction holding the parent row (`SELECT … FOR UPDATE`). Both are
  required: a frozen id is a snapshot of another instance read an unbounded interval
  later, and an unlocked re-check leaves a residual race — either one resolves to a
  silent success that marks the row delivered and parks the parent forever. The
  child row is read under that lock but not itself locked, which holds only because
  a link is repaired inside the migrating parent's own locked transaction.
  `child.data` exposes the child's full data (re-keyed fieldId→key); filtering to
  `contract.outputFields` is deferred. Downward subprocess cancel propagation is
  DONE (see above).
- Engine (`src/engine/`, PostgreSQL via `Bun.sql`, connection `DATABASE_URL`):
  executes definitions. `store.ts` (instance store + rehydrate, pinned to
  `{processId, version, definitionHash}`; arms the initial step's timers atomically
  in the INSERT). `transition.ts` (manual, automatic, and timer transitions with
  onExit→onPath→onEntry ordering, run-to-rest cascade, OCC on `transitionSeq`;
  `fireTimer` forces a guard-bypassing timer transition or a side-effect-only
  reminder). The commit itself is a plan/apply seam: `planStepEntry` (pure,
  no I/O — derives the next `Instance`, its `HistoryEntry`, events, and outbox
  rows from the target step alone) and `applyStepEntry` (writes a plan inside a
  caller-supplied transaction, plus an optional field patch merged under the same
  OCC predicate). `commitTransition` composes the two, opening its own
  transaction, and stays the ordinary entry point. A caller whose commit is not
  an authored hop (`cancelInstance` today) extends this seam — overriding
  `status`, the armed timer set, the recorded version, spawn suppression, or
  supplying extra events — rather than forking the commit, because forking
  silently drops whichever consequence it does not reproduce (the status
  derivation, the subprocess spawn, the subprocess return, the `HistoryEntry`).
  `createInstance` remains a separate step-entry path that does not route
  through here and does not inherit these consequences. `outbox.ts`
  (transactional outbox: at-least-once delivery, result
  writeback, retry/dead-letter, stale-claim reclaim; a writeback applies only to a
  running instance). `resolution.ts` (re-resolves automatic paths after an async
  writeback, so a parked wait-state takes its result-driven path; claim/CAS with a
  lease). `timers.ts` + `duration.ts` (first-class timers: arm both `duration` and
  `deadline` timers at entry, `next_timer_at` poll scheduler, fire-once via OCC. A
  `deadline` is evaluated once at entry over the guard context with `SYSTEM_ACTOR`
  and parsed by `instantFromValue`, which accepts a strict ISO-8601 whitelist only —
  `new Date()` must never see anything else, since its legacy parser reads non-ISO
  forms host-locally and accepts strings denoting no date. The 4-digit year and the
  24-char output check keep `fireAt` lexically sortable, which `minFireAt` relies on.
  The deadline branch is total — an unresolvable or non-instant deadline omits that
  timer rather than failing the entry. The duration branch cannot fail the entry for a
  published body, since the grammar and the magnitude bound are enforced at publish).
  `registry.ts`,
  `idempotency.ts`. `src/cel/eval.ts` evaluates guards at runtime (total: a runtime
  error such as an unwritten field is `false`, the wait-state idiom) and
  Action.output writeback. The resolution and timer workers take an injected
  `resolveBody` (`(processId, version) -> ProcessBody`, may be async). `definitions.ts`
  is the production backing: `publishBody` compiles + hashes + persists an
  immutable, monotonically-versioned row into a `definitions` table (identical
  re-publish is a hash-matched no-op); `createDefinitionStore` returns a DB-backed
  `resolveBody` with a process-local cache (immutable versions, so never stale).
  `host.ts` `startEngine(db, registry)` wires the store's resolver into all three
  workers, so re-resolution, timers, and outbox delivery are live, not inert. An
  instance MUST be created from the compiled body the store returns (its
  `definitionHash` matches the pin); an authored-body instance hash-mismatches and
  is requeued forever. No editor exists yet.

## Roadmap
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
   non-input field at its manual review step). Deferred: checking that
   `outputMapping` expressions read only child field keys / `contract.outputFields`
   (needs CEL identifier extraction).
2. CEL wiring: DONE. Authoring-time (`src/cel/check.ts`) and engine-side evaluation
   (`src/cel/eval.ts`): guards evaluated at runtime (total — a runtime error is
   `false`) and Action.output result-writeback. Migration `transforms` are the last
   wired site: `validateMigrationSpec` parse/type-checks them against the source
   catalog with the result type checked against the target field (`buildEnv` gained an
   `actor` flag so this one site can withhold it), and `evalTransforms` evaluates them
   at migration, total per entry, reusing `coerceJson`.
3. Engine skeleton: largely DONE. Instance store, transactional outbox (delivery +
   writeback + retry/dead-letter + reclaim), transition executor (manual/automatic/
   timer, onExit→onPath→onEntry ordering, run-to-rest), async re-resolution of
   wait-states after a writeback, timer arming + scheduler, and crash recovery
   (outbox/resolution reclaim, persisted `next_timer_at`). Persists to PostgreSQL
   via Bun's native `Bun.sql`; connection via `DATABASE_URL`. Single-instance runtime
   cancellation is DONE (`cancelInstance`: skip onExit, `[onCancel, sink.onEntry]`,
   cancel HistoryEntry, OCC, no-op on non-running). Subprocess execution is DONE
   (`subprocess.ts`: spawn on subprocess-step entry, child-body resolution by
   `versionBinding`, `inputMapping` seed, return via `outputMapping` + direct parent
   advance, idempotent spawn) together with downward cancel propagation
   (`cancelInstance` cascades to active children by the `parent` link). `deadline`
   timers are DONE (`duration.ts`: `instantFromValue` + the deadline branch of
   `armStepTimers`; see the timers entry above). The runtime event log is DONE
   (`InstanceEvent`: a reminder fire and an unarmed timer are recorded, and an
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
   `pathId: null`) are inherited, not reimplemented. An instance with undelivered outbox
   rows is skipped `pending-actions`; an unmappable one under `reject-and-pin` is skipped
   `step-unmappable`; both are recorded as a `migration.skipped` `InstanceEvent`. The
   migrating parent repairs every child's `parent.stepId` (terminal children included).
   The operation is per-instance fault-isolated and reports instance ids grouped
   migrated/skipped/conflicted/failed. Remaining: a subprocess step as the initial step
   does not spawn (must be entered via a transition). Publish-time cross-process
   validation (inputMapping ⊆ child inputFields, child reference resolvable → child-first
   ordering) is DONE (`definitions.ts`, roadmap #1). The production `resolveBody` backing
   (definition/version store) is DONE (`definitions.ts` + `host.ts`), so the
   resolution and timer workers are live.
4. Editor (likely a separate package; promote the repo to workspaces here).

## Open questions (still need a decision before building the relevant part)
- The formal expression context is pinned (`src/cel/check.ts`): `instance`
  `{id, status, transitionSeq, currentStepId}`, `actor` `{id, roles}`. Both are
  deliberately minimal; widen when the engine surfaces a concrete need.

## Decided, not yet built (each needs its own OpenSpec change)
- **Move `resolveBody` inside the per-instance try in the workers.** In
  `src/engine/timers.ts` the `resolveBody` call sits above `drainTimers`' per-instance
  `try`, and `src/engine/resolution.ts` has the same shape, so any read-path parse
  failure — a corrupt jsonb row, a hand-edited definition, a future schema tightening
  anywhere in ProcessBody — throws out of the whole pass and starves every other due
  instance in the batch. `harden-duration-timers` removed one trigger for this; the
  amplifier is still there and makes the next trigger just as damaging.
- **Reconcile in-flight action writebacks across a migration** (instead of skipping).
  Migration declines an instance with any undelivered outbox row (`pending-actions`),
  because `Action.output` is keyed by the enqueuing version's field ids and delivering
  it after a rename writes a vacated key. Reconciling would need six mechanisms all
  correct at once — a precise pending/claimed status partition (claimed means both "in
  flight" and "possibly abandoned"), snapshot semantics for key swaps, a stamp rule so a
  row that missed one migration is not laundered past the next, the version check folded
  into the writeback's existing predicate to avoid a TOCTOU, a new outbox index, and a
  defined lock order against the delivery transaction — to preserve a result a later
  invocation delivers anyway. Revisit only if `pending-actions` skips prove common.
- **A `migration.transform-dropped` event kind.** A `transforms` expression that raises
  leaves its target unwritten silently (total, like a guard). The `timer.unarmed`
  precedent says an omission should be queryable; deferred to keep the migration event
  surface to one new kind.
- **`TimerState` provenance.** Timer reconciliation keys on timer id alone, so a target
  step that redeclares a surviving id with a different duration, or flips it between
  `duration` and `deadline`, is indistinguishable from one that left it unchanged and the
  old `fireAt` is kept. Closing this needs a provenance field (declared duration /
  deadline source / arming instant) on `TimerState`.
- **Orphan-key inspection tooling.** Migration retains a value whose field the target
  catalog no longer declares (dropping it would destroy data; guard-context re-keying
  makes it unobservable and collision-free). Nothing surfaces accumulated orphans for an
  operator to prune.

## Codebase memory (knowledge graph)
The repo is indexed into codebase-memory-mcp. Resolve the `project` arg via
`list_projects` (match on root_path); the slug is machine-specific, never
hardcode it. Entry points: `search_graph` (find symbols), `get_code_snippet`
(read a body), `trace_path` (callers/callees). Payoff scales with the codebase:
it is schema-only today, so
Read/grep is usually faster now — reach for the graph once the engine lands and
real call chains exist.

## Conventions
- TypeScript strict, ESM.
- Bun is the runtime, package manager, and test runner. Use `bun`, not npm/pnpm:
  `bun install`, `bun test`. Typechecking stays with `tsc --noEmit` (`bun run
  typecheck`) — Bun does not typecheck. The Bun version is pinned by `BUN_VERSION`
  in `.devcontainer/Dockerfile`. All tooling (Bun, tsc, tests, and Claude Code
  itself) runs inside the dev container, never on the host.
- PostgreSQL is the datastore. The engine reaches it via Bun's native `Bun.sql`
  (no client dependency); `DATABASE_URL` is the connection convention, set by the
  devcontainer compose.
- **Run `bun test` with `DATABASE_URL` set, always.** The DB-backed suites are
  `test.skipIf(!DB)`, so without it roughly 80 of the ~230 tests skip *silently* and
  the run reports a green that proves almost nothing. A green claimed without the
  variable is not evidence. Outside the devcontainer, point it at a Postgres 16 with
  the compose credentials.
- **A full-suite run is the reliable signal; a single-file rerun is not.** The DB
  suites share one database and truncate in `beforeEach`, so back-to-back runs of one
  file contend and fail spuriously. Observed, not fully characterised: full runs have
  been stable across many consecutive passes while single-file reruns were not. Read
  a verdict off a *named* test failure, never off a pass count alone.
- **Never mutate, stash, or check out the shared working tree to test something.**
  Mutation testing (revert a line, confirm a named test fails) is the right technique
  and must happen on a copy — the tree usually holds uncommitted work, and a
  concurrent agent that stashes or leaves a mutation behind corrupts everyone else's
  results. This has happened twice: once as a vanishing stash mid-run, once as a
  `// MUTATION` marker left in `transition.ts` that three separate reviewers then
  reported as a critical defect.
- Comments state facts, not process history. Concise and technically precise.
- The JSON contract is the foundation. Change the schema (definition.ts / the
  Zod source) deliberately, never as a casual side effect of another task.
- Every invariant that lands ships with a test that rejects a violating input.
