# Workflow / BPM Engine — Project Context

## What this is
A headless, API-first workflow/BPM engine written in TypeScript. It executes
structured, form- and approval-driven business processes with explicit states.

The paradigm is a state-based finite-state machine: Steps (states) connected by
explicit Paths (transitions). This is NOT BPMN token flow.

Three roles share one artifact, the serialized JSON process definition:
- Engine: executes definitions (the executor).
- Editor: produces definitions graphically (`packages/editor`).
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
package.json               Bun workspace root (workspaces: packages/*); engine package's exports map
                            (./schema, ./cel/check, ./schema/compile, ./engine/registry, ./engine/registry-check)
tsconfig.json              strict; NodeNext ESM; covers src + test
src/schema/definition.ts   Zod schemas = the contract; TS types via z.infer; invariants included
src/engine/                executor: instance store, outbox, transitions, timers, subprocess
src/runtime/api.ts         Runtime API Layer: createProcessInstance / getInstanceView / submitAndTransition
examples/                  serialized example definitions
test/                      bun:test suites; tests run inside the container
packages/editor/           structural editor + read-only graph view (React + Vite; workspace package,
                            reaches the engine only through its exports map)
```

## The contract: load-bearing rules
JSON is the one artifact; the Zod schemas (with TS types derived via z.infer)
are the contract. All of the following are facts the engine and editor must
uphold, not open questions.

**Identity.** Every entity has an opaque `id` (UUIDv4 with a type prefix, e.g.
`step_...`, lowercase, immutable) which is the SOLE reference anchor. `key` is a
human-readable slug that references nothing and may change. `label` is display
text. Cross-references and persisted instance state use `id` only. Ids are unique
per entity kind per process. Runtime ids (instance `inst_`, history `hist_`, event
`evt_`) are minted by the engine via `crypto.randomUUID()` — UUIDv4, not v7. The
id schemas enforce the prefix only, not the UUID form. UUIDv7 was the original
intent (lexically time-sortable ids would let history and events order without
reading `at`); nothing depends on that ordering today, so it stays v4 until
something does. Do not restate v7 as a current fact. Because only the prefix is
enforced, the two subprocess examples deliberately use readable ids
(`proc_credit_check`, `step_...`) for legibility — that is a documentation
convenience, not the authoring convention; `expense-approval.json` shows the real
one.

**Hashing / versioning.** `definitionHash` is the JCS (canonical JSON) hash of
`ProcessBody` only; the versioned wrapper is not hashed, so identical bodies get
identical hashes and an identical re-publish is a no-op. Published versions are
immutable. Instances pin `{ processId, version, definitionHash }` and rehydrate
against exactly that frozen body. A version cannot be deleted while an instance
references it. Migration is explicit (pin-by-default); it applies as one rule to
all instances on a version, never per-instance editing.

**Expressions.** All conditions are CEL, carried as `{ lang: "cel", src }`. CEL
is pure, total, and has no `now()`; time lives only in timers. Guards read the
frozen context: `data`, `instance`, `actor`, plus `child.outcome`/`child.data`
inside a subprocess step. A declared data source is not a readable CEL namespace —
a CEL reference to one is a publish error (the engine resolves none). One extra namespace,
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

**Extensibility.** Custom actions, guards, data sources, and field types are
plugins behind a uniform envelope `{ type, config }`. The core validates only
the envelope; each plugin ships its own JSON Schema. (Assignment strategy is
not an extension point: `"static"` is the only supported
`Step.assignment.strategy.type`, checked directly — see "Current state".) The
registry maps `type -> { config schema }` (`registry.ts`,
`HandlerDef.configSchema`) and is validated at PUBLISH time:
`checkActionRegistry` (`src/engine/registry-check.ts`) resolves every action's
`type` against the injected `Registry` and, when the handler declares a
`configSchema`, parses the action's `config` against it — an unknown type or a
schema-violating config is a publish error (`RegistryValidationError`, carrying
every located issue), never a runtime one. Every action position is covered —
`onEntry`, `onExit`, `onCancel`, each path's `onPath`, each timer's
`onFire.actions` — the same five positions the CEL check visits. `publishBody`
now takes the process's `Registry` as a required argument; it is invoked
**before** CEL and cross-process validation, on the compiled body, after the
hash-hit no-op return — same placement rule as the other publish-time checks,
so a body published before a handler was registered (or before its
`configSchema` tightened) is not retroactively rejected on identical
re-publish. A handler with no declared `configSchema` accepts any `config`
(opt-in strictness). The reserved `core.` prefix (`SPAWN_ACTION_TYPE`/
`RETURN_ACTION_TYPE`) is exempt from the registry-resolution check — those
types are dispatched internally by `subprocess.ts`, never through this
author-facing registry, and are separately rejected in *authored* bodies by
the existing Zod refinement in `authoredProcessBody`. Data sources are never
inlined; fields bind to them by id and options resolve at runtime.

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
`at`. Eight kinds exist — `timer.fired` (a reminder fired: actions enqueued, no
transition), `timer.unarmed` (a declared timer produced no `fireAt` at entry, with
the reason), `migration.skipped` (an instance left on its source version, with the
reason), `subprocess.spawn-enqueued` (creation at a subprocess initial step
enqueued its spawn: actions enqueued, no transition),
`subprocess.outcome-unmatched` (a child returned an outcome no path on the parent's
subprocess step matched, so the parent stays parked),
`migration.transform-dropped` (a migration `transforms` entry raised, or its result
could not be made JSON-safe, so its target field went unwritten; the `version` it
carries is the TARGET version, since the `fieldId` it names is declared there),
`assignment.claimed` (an actor claimed an unclaimed, assignment-bearing step;
payload `{actorId}`), and `assignment.released` (the claimant released their
claim on the current step; payload `{actorId}`). The latter two are not
transition-shaped either — no step change, so no HistoryEntry and no
`transitionSeq` advance, the same reasoning as `migration.skipped`.
Kinds are added additively; the record shape is settled. A kind that enqueues
actions carries their `ActionOutcome`s — `timer.fired` and
`subprocess.spawn-enqueued` do, the other six enqueue nothing and so must not
invite a reader to expect outcomes.

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
- Every `LocalizedText` value anywhere in the body (process, steps, fields
  incl. nested `group` fields, field options) has a non-empty entry for
  `ProcessBody.baseLocale`; other locales are optional per entry.
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
  Kept out of definition.ts so the contract has no CEL dependency. **Invoked at
  PUBLISH** (`definitions.ts::publishBody`, throwing `CelValidationError` with every
  located issue), on the compiled body so the injected cancel sink is held to the
  same rule, and after the hash-hit lookup so an identical re-publish of a body
  stored before a tightening stays a no-op instead of stranding its pinned
  instances. Runtime is the wrong place to learn of a bad expression: a broken
  guard is total, so it is `false` forever and parks the instance on a wait-state
  nothing reports; a broken mapping throws inside outbox delivery, re-invoking the
  external handler on each retry before dead-lettering and parking the parent. CEL
  references fields by `key` (a `field_<uuid>` id is not a valid CEL identifier);
  scopes are enforced by which namespaces are registered. An **Action.output site
  registers `result` and nothing else** — not `data`/`instance`/`actor`/`child` —
  matching `eval.ts::buildOutputContext` exactly, because the writeback is
  evaluated post-commit an unbounded interval after the action was enqueued, so
  instance state there is a different state than the one that enqueued it. Every
  action position is covered, `onCancel` included. `child` is registered only in
  subprocess-step guards; a declared data source is registered at NO site, so a CEL
  reference to one is a publish error (`unknown variable: <key>`) — the engine
  resolves data sources nowhere, so a reference could only park a wait-state forever
  (a total guard) or throw in delivery (a mapping); `field.dataSource`
  options-binding is a separate, untouched path. `now()`/`timestamp()`/`duration()`
  are blocked. A `Site` may also
  declare an expected result type: the `deadline` site requires `string` (`dyn`
  passes, being unknowable), because a deadline yielding a non-instant is dropped
  at arming and an omitted timer is indistinguishable from an undeclared one. A
  deadline uniquely withholds `child` (no child exists at entry); data sources are
  withheld everywhere, not just here. Each is a publish error rather than a
  wait-state that silently loses its bound.
  `test/cel.test.ts` covers each rule (including all three `examples/`), and
  `test/definitions.test.ts` covers publish rejection. Known papercut:
  `number`->CEL `double`, so `data.count == 5` needs `== 5.0` — now a publish
  error rather than a guard that is silently `false` at runtime.
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
  The child sweep is fault-isolated and **repairable**: it is tracked by a
  `cancel_sweep_state` column (`pending` → `done`), so one child's OCC loss,
  resolver miss or crash does not stop its siblings and does not strand the rest.
  Re-invoking `cancelInstance` on an already-`cancelled` instance re-attempts a
  sweep still `pending` instead of no-opping outright — the one case where the
  non-running early return is not a plain no-op. That resume never re-commits the
  instance's own cancel transition (no HistoryEntry, no `transitionSeq` change);
  only the cascade resumes. A first call that omitted `resolveBody` therefore
  leaves a `pending` sweep a later call can finish.
- Subprocess execution (`src/engine/subprocess.ts`, `test/subprocess.test.ts`):
  makes a `subprocess` step live via two engine-internal outbox handlers (reserved
  `core.` type prefix, rejected in authored bodies; the two type constants are homed
  in `registry.ts`, a leaf both `store.ts` and `transition.ts` can import, and
  re-exported from `transition.ts`). Entering a subprocess step enqueues
  `core.spawnSubprocess`,
  which resolves the child body by `versionBinding` (`pinned` → `pinnedVersion`;
  `latest-at-spawn` → newest version whose `contractHash` equals `contractRef`, via
  `createDefinitionStore.resolveLatestByContract`), seeds it from `inputMapping`,
  and creates the linked child (idempotent on the deterministic `subprocessChildId`;
  no-op if the parent is not running, with a post-insert re-check that self-cancels
  a child orphaned by a racing parent cancel). Redelivery skips **only** the
  creation: the drive-to-rest and the cancel-orphan backstop run on every delivery,
  including one that finds the child already there. Gating them behind "did I
  create the row" would make redelivery skip precisely the repairs redelivery
  exists for — a crash between creation and either one would park the child on its
  automatic initial step forever, or leave it running under a cancelled parent.
  A child reaching a terminal step
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
  If no automatic path's guard matches `child.outcome`, the writeback stays
  committed and the delivery stays total, but the parent remains parked — the
  `child` namespace lives only for that one delivery, so no later re-resolution can
  ever recompute it and retry the match. That dead end is recorded as a
  `subprocess.outcome-unmatched` event rather than lost silently. Reachable in
  practice: an independently cancelled child returns the reserved `"cancelled"`
  outcome, which a parent is not obliged to guard.
  `child.data` exposes the child's full data (re-keyed fieldId→key) at runtime, not
  filtered to `contract.outputFields` — deliberately: only the CEL *surface* is
  confined to declared outputs (`checkSubprocessChildRefs`, roadmap #1), not the
  runtime value; see the `cross-process-validation` capability. Downward subprocess cancel propagation is
  DONE (see above). A `subprocess` step is also live as the *initial* step:
  `createInstance` enqueues the spawn at seq 0 inside the INSERT transaction,
  behind the same `RETURNING` guard as the seq-0 events (so a redelivered child
  creation enqueues nothing), and appends a `subprocess.spawn-enqueued`
  `InstanceEvent` whose id the outbox row carries as `event_id` — creation writes
  no `HistoryEntry`, so without that carrier the spawn's `ActionOutcome` would
  fall back to the transition record at `(instanceId, 0)`, match nothing, and be
  discarded. Nested initial-step chains compose through the outbox with no
  special casing.
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
  through here and so inherits nothing generically — each consequence it needs is
  reproduced there deliberately (the subprocess spawn is; the `HistoryEntry` and a
  `transitionSeq` advance are intrinsically absent from a creation). Run-to-rest is
  crash-safe: a commit that leaves a `running` instance sets `resolve_state =
  'pending'` in the *same statement* as the commit, so a crash between the commit
  and its cascade leaves a durable marker the resolution worker picks up, rather
  than an instance silently at rest on an all-automatic step. `outbox.ts`
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
  `registry.ts`, `registry-check.ts` (publish-time action-registry validation —
  see "Extensibility" above),
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
  is requeued forever. `publishBody` also parses through `authoredProcessBody`
  before compiling, so undeclared keys are stripped *before* hashing — returning
  the raw input instead would hash a key every read then strips back out, making
  the pin unreproducible and every instance on that version permanently
  unrehydratable. A `faulted` instance is a dead-end park: `executeManualTransition`
  and `fireTimer` both gate on `status !== "running"`, so it can be neither
  advanced manually nor moved by a timer (it also cannot be cancelled — the same
  gate).
- Runtime API Layer (`src/runtime/api.ts`, `test/runtime-api.test.ts`): the
  first library boundary a UI can call without touching engine internals —
  three operations, no HTTP transport, no auth/actor resolution (every
  function takes an explicit `actor: Actor`, trusted as given), no
  assignment/claim enforcement (`AssignmentState` is declared in the schema
  but unenforced everywhere, matching engine behavior). `createProcessInstance`
  validates seed `data` (skipping the required check — requiredness is a
  transition-time gate) then runs `store.ts::createInstance` + the
  create-then-run-to-rest cascade. `getInstanceView` resolves a step's `view`
  against the field catalog and current data into `ResolvedViewField[]` (a
  group-container's own field id is never a valid `data` key, so it is
  reported but excluded from required/readonly resolution) plus
  `availablePaths` (manual paths whose guard currently holds). `submitAndTransition`
  is the only write path for arbitrary user-submitted `data` anywhere in the
  system: it row-locks the instance (`SELECT ... FOR UPDATE`) for exactly one
  commit — guarding against a concurrent `Action.output` writeback being
  silently erased by jsonb's shallow top-level merge — validates the submission
  (field-set boundary, type, option membership, constraints, CEL
  `validation.rule`, required; every issue collected into one
  `SubmissionValidationError`, not fail-fast), then commits the merged `data`
  and the transition atomically via a new `commitManualTransition` split out
  of `executeManualTransition` (`transition.ts`; unchanged behavior for every
  existing caller that omits the new optional `dataPatch`). The subsequent
  automatic-path cascade (`resolveAutomatic`) runs separately, outside the
  lock, matching every other caller's transactional granularity.
  `createDefinitionStore` gained `resolveLatest(processId)` (newest published
  version) alongside `resolveBody`/`resolveLatestByContract`.
- Editor (`packages/editor`, a Bun workspace package that reaches the engine
  only through its `exports` map — no file moves, the boundary is `exports`,
  not directory layout): a structural editor plus an auto-layouted
  **read-only** graph view (`@xyflow/react` + `elkjs`); canvas editing
  (drag-to-connect) is out of scope. Panels (`src/panels/`) cover the field
  catalog, data sources, steps (incl. per-step view), paths, timers, actions,
  and the subprocess contract, editing an editor-owned **Draft model**
  (`src/draft/`) — a structural superset of `AuthoredProcessBody` (refs and
  required parts optional) so a mid-edit process has a representable state;
  the editor mints prefixed UUIDv4 ids, authors work only with `key`/`label`.
  Live validation reuses the engine's own publish-time validators unmodified
  (the `definition.ts` refinements, `validateProcessBody` CEL checks,
  `checkActionRegistry`, `validateDurations`), mapping located issues onto the
  owning panel/graph entity; a check needing external state a locally-loaded
  file can't supply (cross-process validation, registry) renders as "not
  checked" rather than a false pass. File-based draft I/O
  (`src/draft/file-io.ts`, `io.ts`) covers load/save of `.draft.json` and
  export of a validated authored `ProcessBody`, plus **Import**: accepts a
  published `DefinitionVersion` wrapper or a raw `ProcessBody` and converts it
  to a Draft (no provenance retained — a subsequent Export is a fresh,
  unpublished body). No server, no DB, no HTTP API, no `publishBody` call —
  publishing stays engine-side. UI-chrome i18n (`src/i18n/`) is a hand-rolled
  locale-state provider + `t()` catalog lookup (no i18next/Lingui), currently
  shipping one locale (`en`) with the switcher/plumbing built for more; it is
  deliberately independent of **content locale** — `ProcessBody`/`Step`/
  `FieldDef`/`FieldOption` `label`/`description` are `LocalizedText`
  (`Record<LocaleCode, string>`, **BREAKING** schema change from plain
  `string`), with a required `ProcessBody.baseLocale` and a structural
  invariant that every `LocalizedText` value has a non-empty base-locale
  entry; `resolveLocalizedText(value, locale, baseLocale)` is the pure
  fallback-to-base lookup, used by both `GraphView` node labels and the
  editor's `LocalizedTextInput` panels. `Path`/`Timer`/`Plugin` `description`
  stay plain `string` (authoring-facing, not participant-facing). The graph
  view (`src/graph/GraphView.tsx`, `layout.ts`, `useDraftGraphLayout.ts`)
  fixes node handles to `Right`/`Left` to match ELK's horizontal layout
  direction, routes edges as `smoothstep` with a directional `markerEnd`
  arrowhead (issue-flagged edges tint the marker to match their red stroke —
  watch for the `{ color: undefined, ...marker }` spread-clobber bug class
  when touching this: an explicit `color: undefined` key silently overrides
  `@xyflow/system`'s own fallback and renders the arrowhead invisible), and
  fits the view once ELK layout resolves (`isLayouted`) — including on a
  reload/import into an already-mounted session, tracked via a
  `loadGeneration` counter in `DraftProvider`'s reducer state, not only on
  first mount.
- HTTP wrapper (`src/http/`, `test/http.test.ts`, roadmap #5b): a thin REST/JSON
  adapter over the Runtime API Layer via `Bun.serve`. `createServer` returns a
  plain `fetch(req): Promise<Response>` (testable with `new Request(...)`, no
  real port); `startHttpServer` wires it to a port plus `startEngine`. Five
  routes — `POST /processes/:processId/instances`, `GET /instances/:instanceId`,
  `POST /instances/:instanceId/submit`, `POST /instances/:instanceId/claim`,
  `POST /instances/:instanceId/release` — each OPTIONS-preflighted with
  permissive CORS (`Access-Control-Allow-Origin: *`) so the editor's dev server
  can reach it. `routes.ts` handlers are framework-agnostic (`(parsed request) ->
  Runtime API call -> {status, body}`, never throwing) and resolve the caller's
  `Actor` via an injected `ActorResolver` before calling the Runtime API,
  replacing client-supplied actor trust. `errors.ts::mapError` maps each typed
  Runtime API error to a status (422 validation, 409 guard-refused/
  concurrency-conflict, 401 actor-resolution, 403 assignment/claim errors, 500
  fallback for `PinMismatch` and anything untyped — not-found deliberately stays
  500, see design.md). `handleSubmit` special-cases `AutomaticCascadeLoop`: the
  write already committed before it raised, so the route reports the resulting
  (now-`faulted`) view as a 200 instead of an error.
- Player/Preview UI (`packages/editor/src/player/`, roadmap #5c): lets a human
  drive a real process instance end-to-end through the browser, against the
  HTTP wrapper — a Structure/Player toggle in `App.tsx` switches between the
  existing read-only graph view and this screen. `client.ts` is a thin HTTP
  client (create instance / get view / submit) carrying `X-Actor-Id`/
  `X-Actor-Roles` headers per the dev resolver's convention. `store.tsx`
  (`PlayerProvider`) holds the connection (server URL + actor, persisted to
  `localStorage`) and drives the instance lifecycle; `editableFieldIds`/
  `filterToEditable` enforce client-side the same visible-non-readonly-
  non-group field-set boundary `submitAndTransition` enforces server-side, so a
  submission is pre-filtered rather than rejected. `FieldInput.tsx` renders a
  field by its resolved type; `PlayerView.tsx` composes view + submit +
  available paths into the screen.
- Auth/Actor-Resolution + Assignment/Claim-Enforcement (roadmap #5d): activates
  the previously-declared-but-inert `Step.assignment` field. `src/auth/resolve.ts`
  defines the `ActorResolver` extension point (`(credential) -> Promise<Actor>`)
  and ships one concrete, non-production implementation, `devHeaderResolver`
  (trusts `X-Actor-Id`/`X-Actor-Roles` headers) — no real identity provider
  (JWT/OIDC/session) ships in core; a deployment supplies its own resolver
  against the same extension point. Assignment strategy is not pluggable:
  `"static"` (`registry.ts::STATIC_ASSIGNMENT_STRATEGY_TYPE`) is the only
  supported `Step.assignment.strategy.type`, checked directly at PUBLISH
  (`registry-check.ts::checkAssignmentRegistry`, wired into
  `definitions.ts::publishBody`, throwing `AssignmentRegistryValidationError`)
  — a non-`"static"` type or a `config` failing `{ candidates: string[] }` is
  a publish error, never a runtime one. (A prior design registered assignment
  strategies in a `Map`-based registry parallel to the action registry; that
  was removed as a ponytail-audit cut — the strategy space never grew past
  one, so the indirection bought nothing. Reintroduce a registry only if a
  second strategy is ever authored.) A target step's declared `assignment`
  resolves to a fresh `Instance["assignment"]` (candidates, unclaimed) at step
  entry (`transition.ts::resolveStepAssignment`), except migration
  (`carryAssignment` carries `instance.assignment` forward byte-for-byte instead
  of re-resolving fresh candidates). `claimStep`/`releaseClaim`
  (`transition.ts`, exposed via the Runtime API and the two new HTTP routes) are
  exclusive-claim operations, not transitions (no step change, no
  `HistoryEntry`): claiming requires an unclaimed assignment and an eligible
  candidate (`AlreadyClaimedError`/`NotACandidateError`), releasing requires the
  caller to be the claimant (`NotClaimedError`/`NotClaimantError`), and each
  records an `assignment.claimed`/`assignment.released` `InstanceEvent` (see
  "Runtime record" above). `submitAndTransition` now enforces claimant-only
  submission before validation: a step with a declared assignment requires the
  submitting actor to be the current claimant (`NotClaimedError`/
  `NotClaimantError`); a step with no declared assignment is unaffected —
  identical to prior behavior.
- Generic `http.request` action handler (`src/handlers/http.ts`, roadmap #5e):
  the first real handler in the action registry — every action position
  previously validated only the config envelope at publish time; now one type
  actually executes. Vendor-neutral: an authored `{url, method, headers?,
  body?}` config (`GET` cannot carry a body), `PUBLISH`-validated by
  `httpConfigSchema`. The engine, not the author, sets the `Idempotency-Key`
  header on every attempt from `ctx.idempotencyKey` — authoring that header in
  `config.headers` is a publish error, since there's no sound precedence rule
  between an authored value and the engine's own. `Content-Type` defaults to
  `application/json` only when a body is present and the author didn't set one.
  A `429`/`5xx` response throws a plain `Error` (transient, outbox retries); a
  non-2xx otherwise throws `PermanentError` (dead-letters immediately, no
  retry) — matching the existing outbox retry semantics, not a new failure
  taxonomy. `createDefaultRegistry` (`src/engine/host.ts`, not `registry.ts`)
  registers it as `startEngine`'s new default `registry` argument — homed in
  `host.ts` specifically to avoid an import cycle, since the handler needs
  `PermanentError` from `outbox.ts` and `outbox.ts` already imports from
  `registry.ts`.

## Roadmap
See `ROADMAP.md` for stage-by-stage status (DONE/NOT STARTED) and what each stage covers.

## Open questions (still need a decision before building the relevant part)
- The formal expression context is pinned (`src/cel/check.ts`): `instance`
  `{id, status, transitionSeq, currentStepId}`, `actor` `{id, roles}`. Both are
  deliberately minimal; widen when the engine surfaces a concrete need.

## Decided, not yet built (each needs its own OpenSpec change)
- **Data-source resolution is unbuilt; references are a publish error until it exists.**
  The engine resolves data sources nowhere (no reference in `src/engine/`), so a CEL
  reference to one is now rejected at publish (`check.ts` registers a data source at no
  site — an `unknown variable` error), closing what was the last check/eval scope
  drift. The `field.dataSource` options-binding declaration still publishes but its
  runtime option resolution is likewise unbuilt (a visible presentation gap, not a
  silent FSM park). Building resolution — CEL-readable data-source results and/or
  runtime option lists — is the remaining feature; when it lands it re-introduces
  registration deliberately with its own site scoping.
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

## Codebase memory (knowledge graph)
The repo is indexed into codebase-memory-mcp (`full` mode, covering the engine,
the Runtime API Layer, and the editor package; `packages/editor/{dist,node_modules}`
excluded). Resolve the `project` arg via `list_projects` (match on root_path);
the slug is machine-specific, never hardcode it. Entry points: `search_graph`
(find symbols), `get_code_snippet` (read a body), `trace_path` (callers/callees,
`mode=calls|data_flow|cross_service` — useful for tracing across the
engine↔runtime↔editor boundary, e.g. `packages/editor` -> `workflow-engine`
exports -> `src/engine/`), `query_graph` (Cypher), `get_architecture`,
`search_code` (graph-augmented text search). Real call chains exist now — prefer
the graph over Read/grep for "who calls X" / "what does Y touch" questions that
span more than a file or two; Read/grep is still fine for a single known file.
The index goes stale as code changes: `detect_changes` shows impact since a ref;
re-run `index_repository` (full re-index, not incremental) after a substantial
change lands.

## Conventions
- TypeScript strict, ESM.
- Bun is the runtime, package manager, and test runner. Use `bun`, not npm/pnpm:
  `bun install`, `bun test`. Typechecking stays with `tsc --noEmit` (`bun run
  typecheck`) — Bun does not typecheck. The Bun version is pinned by `BUN_VERSION`
  in `.devcontainer/Dockerfile`. All tooling (Bun, tsc, tests, dev server, lint,
  and Claude Code itself) runs inside the dev container, never on the host — even
  when it technically works on the host too, since that's exactly how version
  drift and stray processes slip in silently (observed: host Bun at a newer
  version than the Dockerfile pin; a leftover host-side Vite process answering
  `localhost:5173` in parallel with the container's, making it ambiguous which
  one a browser check was actually hitting).
  - Without the `devcontainer` CLI, drive it via `docker compose`: `docker compose
    -f .devcontainer/docker-compose.yml up -d` (starts `app` + `db`; `app`'s
    default command is `sleep infinity`), then run every command through
    `docker compose -f .devcontainer/docker-compose.yml exec -w /workspace app
    <cmd>` — the `app` service's default container workdir is `/`, not
    `/workspace`, so `-w /workspace` is required every time.
  - On Windows Git Bash, prefix such commands with `MSYS_NO_PATHCONV=1` — Git
    Bash otherwise rewrites the Unix-style `/workspace` path into a Windows path
    before Docker sees it, producing `Cwd must be an absolute path` errors.
  - `DATABASE_URL` is already wired into the `app` service's environment
    (pointing at the `db` service by container name), so DB-backed tests need no
    extra setup once running through `exec`.
  - The compose file publishes no ports by default. To view a dev server from
    the host browser, add a local-only, gitignored
    `.devcontainer/docker-compose.override.yml` publishing the port (e.g.
    `5173:5173` under `services.app.ports`), bring services up with both `-f`
    flags, and bind the dev server to all interfaces (`bun run dev -- --host
    0.0.0.0`). Never add port publishing to the shared `docker-compose.yml` —
    that's a personal convenience, not a team-wide default.
- PostgreSQL is the datastore. The engine reaches it via Bun's native `Bun.sql`
  (no client dependency); `DATABASE_URL` is the connection convention, set by the
  devcontainer compose.
- **Run `bun test` with `DATABASE_URL` set, always.** The DB-backed suites are
  `test.skipIf(!DB)`, and they are the majority of the suite — well over half the
  declared tests. Without the variable they skip *silently* and the run reports a
  green that proves almost nothing. A green claimed without the variable is not
  evidence; check the skip count, not just the pass count. Outside the devcontainer,
  point it at a Postgres 16 with the compose credentials. (Exact counts are
  deliberately not recorded here — they went stale twice.)
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
