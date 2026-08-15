# Current State

What is built, per subsystem. The load-bearing rules an implementation must
uphold live in `.claude/rules/process-contract.md` and
`.claude/rules/authoring-invariants.md`; this file is the descriptive
counterpart. Open questions and deferrals are in `docs/decisions.md`.
Stage-by-stage status is in `ROADMAP.md`.

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
- Publish-time structural checks (`src/schema/compile.ts`, harden-publish-validation;
  `test/compile-validation.test.ts`, `test/cancel.test.ts`). Six write-path checks
  run inside `compileProcessBody`. They run right after `validateDurations`.
  They run **before** the `publishedProcessBody`-valid idempotent early return.
  That placement makes a check unbypassable. A hand-written body cannot skip it
  by merely satisfying `publishedProcessBody`, which checks only the
  cancel-sink count.

  Each check returns a located `CompileIssue[]` (`{loc, value, message}`, the
  `DurationIssue` shape). `compileProcessBody` collects every issue and throws
  one `CompileValidationError` (mapped to 422 in `http/errors.ts`). The six:
  - The reserved `core.` action-prefix ban, now checked on both compile
    branches. It moved out of `authoredProcessBody`: a compiled body injects
    no action of this type, so the ban is safe to apply to every body. The
    cancel-sink id/key/outcome checks stay in `authoredProcessBody`, since a
    compiled body legitimately carries all three.
  - An unknown-key walk over the authored body, at every depth: process,
    contract, field (including nested group fields), data source, workflow,
    step, path, action, timer, view field, validation. It derives each
    object schema's known key set from Zod's `.shape` rather than a
    transcribed list. Record-typed positions (`localizedText`,
    `Action.output`, `SubprocessSpec.*Mapping`, `Plugin.config`) skip the
    check on their own keys, since those keys are data, not a fixed shape.
    The walk still checks Expression-shaped values found inside them.
  - Every catalog `FieldValidation.pattern` compiles with `new RegExp`; its
    source is also length-bounded.
  - `SubprocessSpec.outputMapping` keys and `ProcessContract.inputFields`/
    `outputFields` resolve against the process's own recursive field set
    (reusing `collectFieldsDeep`). This deliberately does NOT join the base
    `processBody` superRefine beside the sibling `Action.output` check:
    that would tighten the read schema and could strand an
    already-published body's running instances.
  - `FieldDef.key` must match `/^[a-z_][a-z0-9_]*$/` — the CEL identifier
    grammar `data.<key>` requires.
  - Length bounds (`MAX_KEY_LENGTH`/`MAX_PLUGIN_TYPE_LENGTH`/
    `MAX_DURATION_LENGTH`/`MAX_EXPRESSION_LENGTH`/`MAX_PATTERN_LENGTH`) on
    every authored `key`, `Plugin.type`, `duration`, `Expression.src` and
    `pattern` that reaches an interpreter or an index.

  Defense in depth backs the six checks above. `checkActionRegistry`
  (`registry-check.ts`) no longer filters out the reserved prefix. The compile
  pass now bans that prefix before any body reaches this check. The filter was
  dead code; removing it is the depth. The two internal subprocess handlers
  (`SPAWN_ACTION_TYPE`/`RETURN_ACTION_TYPE`,
  `subprocess.ts::registerSubprocessHandlers`) declare `configSchema`s
  (`{subprocessStepId, parentSeq}` / `{parentInstanceId, childOutcome}`). Both
  schemas reject a forged config on shape, even if a future path ever
  produced one.

  Two related fixes ride along. `src/runtime/api.ts::checkConstraints` skips
  `pattern` after a `minLength`/`maxLength` violation. It runs `pattern` only
  on a value that passed both. `WeakMap<ProcessBody, Map<string, RegExp>>`
  caches the compiled `RegExp` per immutable published body. This replaces
  one `RegExp` compile per submission. `Bun.serve` declares `maxRequestBodySize`
  (`src/http/server.ts`, 8 MiB) instead of inheriting Bun's 128 MiB default.
  `drafts.ts::checkEnvelope` gained a matching serialized-size bound on
  `body`+`layout` together: `drafts.ts` is a module boundary a non-HTTP caller
  could also reach.

  `packages/web/src/areas/studio/draft/validation.ts::runValidation` catches
  `CompileValidationError` alongside the pre-existing `DurationValidationError`.
  It renders the caught issues under a new `"structural"` `IssueSource`.
  Without that catch, the error would propagate uncaught and crash Studio's
  live-validation panel. Known gap, documented on `runValidation` itself: the
  unknown-key check can never fire from Studio's live validation.
  `runValidation` first runs `authoredProcessBody.safeParse`. That Zod parse
  strips undeclared keys before `compileProcessBody` ever sees them. Only the
  real `POST /processes` publish call catches an unknown key, since it runs
  `compileProcessBody` on the raw, un-parsed body.

  `draft/view-flags.ts` (stage 41's first half, `studio-view-flags-module`)
  holds the view-flag primitives the form editor and a later field matrix
  both need.

  `FLAG_DEFAULT` carries the engine's own three defaults.
  `effectiveFlag` resolves an absent value to that default.
  `setFlag` writes a departure from the default. It deletes the key on a
  return, and deletes `required`/`readonly` too when `visible` goes to
  literal `false`. `gatedKeys` names which controls that gate disables.

  `checkViewFlags`, in the same file, is the studio's own validation pass.
  It reports under a sixth, non-blocking `IssueSource`: `"view"`. Two states
  earn it. A required field can sit hidden by `visible: false`. A required,
  read-only field can sit unwritten. `runValidation` calls it beside
  `validateDurations`.
- Subprocess execution (`src/engine/subprocess.ts`, `test/subprocess.test.ts`):
  makes a `subprocess` step live via two engine-internal outbox handlers. The
  compile pass rejects the reserved `core.` type prefix at publish; see the
  structural-checks entry above. The two type constants are homed
  in `registry.ts`, a leaf both `store.ts` and `transition.ts` can import, and
  re-exported from `transition.ts`. Entering a subprocess step enqueues
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
  Both `inputMapping` and `outputMapping` evaluation (`evalFieldMap`,
  `src/cel/eval.ts`) is total per entry, matching migration `transforms`
  rather than throwing for the whole map: an entry whose expression raises —
  most often reading a parent field the instance never wrote, the ordinary
  shape for an optional field, since the field catalog has no notion of
  "always written" — or whose value cannot be made JSON-safe leaves its
  target unwritten while every other entry still applies, recorded as a
  `mapping.entry-dropped` event on the parent (both mappings evaluate over
  its context) in the same transaction as the spawn's or the return's own
  commit. `Action.output`'s own map evaluation (`evalOutput`) deliberately
  keeps the old fail-fast behavior instead: a raise there means the handler's
  actual return shape does not match what the action declared, closer to a
  bug than an unset optional field, and the outbox delivery already has its
  own separate drop mechanism for the adjacent case — a value that evaluates
  fine but does not fit its target field's declared type (below).
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
  running instance). Every claim, completed or abandoned, costs one delivery
  attempt: the tx1 claim UPDATE itself increments `attempts` (`RETURNING
  attempts` then IS the post-increment value), so a delivery that never
  reaches the tx2 mark (a killed worker, a lease-expiry reclaim) still moves
  the row toward its dead-letter cap. `drainOutbox` races `deliverFn` against
  a deadline derived from the claim lease (`Promise.race`, cleared on
  settlement) — a hung handler becomes an ordinary transient failure with
  backoff rather than stalling the pass (and, since the worker awaits the
  whole batch and `pollForever` awaits the whole tick, every row behind it and
  every future poll). The race does not cancel the handler; releasing the
  underlying resource is the handler's own job (`http.request`'s own timeout
  does this for the shipped handler). Before writing a patch entry, the
  worker resolves the target field's declared type (via an injected
  `resolveBody`, keyed off the row's `field_version`) and checks the value
  with the same `typeMatches` rule (`src/schema/definition.ts`, shared with
  the submission validator) a participant's own submission faces; a
  mismatching entry is dropped — not written, not retried, since the
  delivery itself already succeeded — and recorded in the `ActionOutcome`'s
  `droppedTargets`, distinct from `suppressed` (a whole-patch fact about
  instance state, not a per-entry one). `resolution.ts` (re-resolves
  automatic paths after an async writeback, so a parked wait-state takes its
  result-driven path; claim/CAS with a lease). A re-resolution failure — a
  parse error, a resolver miss or throw — leaves the row `claimed` rather
  than requeueing it to `pending`: an immediate requeue would make it
  selectable again on the next pass, a write loop at the poll interval;
  the claim's own lease-expiry predicate is the retry cadence instead, reused
  rather than duplicated. `timers.ts` + `duration.ts` (first-class timers: arm both `duration` and
  `deadline` timers at entry, `next_timer_at` poll scheduler, fire-once via OCC. A
  `deadline` is evaluated once at entry over the guard context with `SYSTEM_ACTOR`
  and parsed by `instantFromValue`, which accepts a strict ISO-8601 whitelist only —
  `new Date()` must never see anything else, since its legacy parser reads non-ISO
  forms host-locally and accepts strings denoting no date. The 4-digit year and the
  24-char output check keep `fireAt` lexically sortable, which `minFireAt` relies on.
  The deadline branch is total — an unresolvable or non-instant deadline omits that
  timer rather than failing the entry. The duration branch cannot fail the entry for a
  published body, since the grammar and the magnitude bound are enforced at publish.
  A scan-pass failure — a corrupt row, a resolver miss, a resolver throw — pushes
  that instance's `next_timer_at` out by a bounded interval (one minute), predicated
  on the value the pass itself observed so a concurrent re-arm is not clobbered
  (the predicated `UPDATE` matches zero rows when it fires). Without this a failing
  instance is re-selected every poll forever, and — since the scan is capped and
  ordered by `next_timer_at` — enough such rows starve every instance behind them.
  A "no due timer on this instance" outcome does not push; that is a normal result
  of the scan, not a failure).
  `registry.ts`, `registry-check.ts` (publish-time action-registry validation —
  see "Extensibility" in `.claude/rules/process-contract.md`),
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
  gate). The park itself (`markFaulted`, on a detected cascade loop) commits the
  status flip and an `instance.faulted` `InstanceEvent` — `{stepId, reason:
  "automatic-cascade-loop"}` — in one transaction guarded by the same
  `transitionSeq` OCC predicate, so the durable record and the thrown
  `AutomaticCascadeLoop` always agree on why the instance is parked.
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
  `availablePaths` (manual paths whose guard currently holds) plus
  `assignment` (the instance's claim state, in `InstanceSummary`'s shape;
  absent when the current step declares none, and reported for every status
  unlike `availablePaths`, since a caller cannot otherwise tell a claimable
  step from one with no assignment). `submitAndTransition`
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
- HTTP wrapper (`src/http/`, `test/http.test.ts`, roadmap #5b): a thin REST/JSON
  adapter over the Runtime API Layer via `Bun.serve`. `createServer` returns a
  plain `fetch(req): Promise<Response>` (testable with `new Request(...)`, no
  real port); `startHttpServer` wires it to a port plus `startEngine`. Five
  routes — `POST /processes/:processId/instances`, `GET /instances/:instanceId`,
  `POST /instances/:instanceId/submit`, `POST /instances/:instanceId/claim`,
  `POST /instances/:instanceId/release` — each OPTIONS-preflighted, plus the
  read/query surface (see its own entry below). `routes.ts` handlers are
  framework-agnostic (`(parsed request) -> Runtime API call -> {status,
  body}`, never throwing) and resolve the caller's `Actor` via an injected
  `ActorResolver` before calling the Runtime API, replacing client-supplied
  actor trust. `errors.ts::mapError` maps each typed Runtime API error to a
  status: 422 for validation, 409 for guard-refused/concurrency-conflict/
  instance-not-running, 401 for actor-resolution, 403 for assignment/claim
  errors, 500 for `PinMismatch` and the typed not-found case. Not-found
  deliberately stays 500 — see design.md and `correct-api-error-responses`
  below. Any *unrecognized* throw — a `Bun.sql` error, a plugin handler's own
  throw — falls back to 500 with a message-free body. That fallback also
  logs server-side. Its `console.error` call records the error and its
  stack. It also records the request's method and path (see the entry
  below for the full shape). Separately, `handleSubmit` special-cases
  `AutomaticCascadeLoop`. The write already committed before it raised. So
  the route reports the resulting (now-`faulted`) view as a 200, not an
  error.

  **Shutdown is orderly** (`graceful-shutdown`, `test/http-shutdown.test.ts`):
  `startHttpServer`'s returned `stop` is async. It awaits Bun's graceful
  `server.stop()`. That call refuses new connections at once. It resolves
  once in-flight requests finish, and only then does `stop` halt the engine
  pollers.

  The `import.meta.main` entrypoint registers SIGTERM and SIGINT against
  it. The handler closes the pool with `sql.end()` and exits 0. A boolean
  guard makes a second signal a no-op. The server holds ten Postgres
  connections. `pg_stat_activity` drops to zero after SIGTERM because
  `sql.end()` ran. Before, `scripts/dev-up.sh`'s `pkill` left that to the
  kernel.

  `docker/engine.Dockerfile` runs the engine as PID 1. Linux gives PID 1 no
  default SIGTERM disposition, so `docker stop` gains the most. It used to
  wait out its whole grace period, then send SIGKILL. Nothing awaits an
  in-flight poller tick, on purpose.
  The workers are lease-based and at-least-once. A tick cut short retries
  the way it does after a crash.

  **Response headers the wrapper sets for every caller**
  (`harden-http-response-boundary`): `toResponse` puts
  `Cache-Control: no-store` on every JSON envelope. That covers an error
  envelope as well as a success one. Every list this wrapper serves is
  actor-scoped, and an instance view holds data a participant supplied.
  No intermediary may keep a copy. No route opts out. A per-route list
  would drift, the way the hand-written preflight chain drifted before
  the route table replaced it.

  `toBinaryResponse` puts `X-Content-Type-Options: nosniff` on every
  binary response. It puts `Content-Disposition: attachment` only on a
  result carrying a `filename`. That is the attachment download alone.
  A download header on a metrics scrape would be wrong. The filename is
  percent-encoded. A stored one holds up to 255 characters of any kind,
  a quote and a CR among them.

  The upload route bounds what it will later echo. `contentType` must
  match one MIME type and subtype joined by `/`. Each half holds
  letters, digits and `.`, `+`, `-`, `_`. Parameters fail the match. So
  does a CR or an LF, which used to reach `new Response()` and turn a
  download into a 500. With the two headers, an uploaded HTML or SVG
  file saves instead of running as a document.

  `routes.ts::parseMaxAttachmentBytes` reads `MAX_ATTACHMENT_BYTES` once
  at module load. A value that is not a positive integer throws there
  instead of resolving to `NaN`. That `NaN` made every comparison false,
  and so discarded the limit an operator meant to tighten.

  **CORS is configuration, not a constant** (`configurable-cors-origins`):
  `createServer` takes an `allowedOrigins` parameter (`undefined` | `"*"` |
  `string[]`), and `startHttpServer` sources it from `CORS_ALLOWED_ORIGINS`
  — the same composition-root convention as `DATABASE_URL`/`PORT`. Three
  modes, one variable: unset (the default) emits no
  `Access-Control-Allow-Origin` header at all — CORS is browser-enforced on
  cross-origin requests only, so this is invisible to same-origin frontends,
  server-to-server callers, and the test suite calling `createServer`'s
  `fetch` directly; `*` reproduces the old always-permissive behavior as an
  explicit opt-in; a comma-separated origin list echoes the request's
  `Origin` back only when it matches, with `Vary: Origin` on every response
  whose header depends on the request (so a shared cache cannot leak one
  origin's response to another). A preflight from a disallowed origin still
  answers `204` with `Access-Control-Allow-Methods`/`-Headers` but omits the
  origin header — the browser blocks the real request on that, so there is
  no new error status to invent. `Access-Control-Allow-Credentials` is
  deliberately unimplemented: nothing sends cookies today (the Player's
  actor identity travels in headers), and `*` and credentialed CORS are
  mutually exclusive per spec — a future cookie/session-backed
  `ActorResolver` will need the allowlist mode this change built, not the
  wildcard, so it is that change's job to add the credentials header, not
  this one's. The devcontainer's `app` service sets
  `CORS_ALLOWED_ORIGINS=http://localhost:5173`
  (`pin-frontend-dev-ports`, narrowed by `consolidate-frontend-shell`). That
  origin is the one frontend dev server. Its `vite.config.ts` pins the port
  to 5173, with `strictPort: true`. A taken port then fails startup, rather
  than sliding to the next free one in silence. The list held three origins
  while `app`, `admin` and `studio` were separate packages.

  **Static assets fall through behind every API route** (`serve-web-assets`,
  roadmap #12 step 0): `src/http/static.ts::serveWebAsset` is called at
  `createServer`'s terminal 404, so no URL prefix is reserved for assets and a
  later API route needs no special case. `GET`/`HEAD` only; every other method
  keeps the JSON 404 envelope. It resolves no actor — a browser fetches the
  shell document before it holds a token — and adds no CORS headers, since
  these assets are same-origin to the API by construction. An existing regular
  file under the root is served with `Cache-Control: max-age=31536000,
  immutable` (safe because the build hashes asset filenames); `index.html` is
  the one exception and always carries `no-cache`, whether it answers as the
  History-API fallback for an unmatched path or as a direct `/index.html`
  request, because its name never changes and it names the current hashes.
  Anything that is not a regular file, including a directory, falls back to the
  shell; a root holding no `index.html` declines instead of masking the 404.
  Every answer this branch returns also carries four security headers
  (`static.ts::SECURITY_HEADERS`, `deliver-framing-and-sniffing-headers`):
  `Content-Security-Policy: frame-ancestors 'none'`, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`.
  `fileResponse` sets them in one place. The direct hit, the `index.html`
  fallback and the navigation answer therefore share them. A `HEAD` carries
  what its `GET` carries. They stay off the JSON envelope, which has its own
  exit.
  Containment is a whitelist: decode once, resolve with `node:path`, then serve
  only what stays under the root. Rejecting paths containing `..` would be a
  blacklist over `%2e%2e`, `%252e%252e` and every future encoding.
  `test/http-static.test.ts` drives all of it against
  `test/fixtures/web-root/`, with the traversal cases aimed at the repo's own
  `package.json` so they fail if containment is removed. `WEB_ROOT` names the
  directory; `startHttpServer` resolves it once via
  `static.ts::resolveWebRoot`, defaulting to `packages/web/dist` relative to
  `import.meta.dir`, and passes `undefined` when the path is absent, is not a
  directory, or is empty or whitespace-only. That last case is deliberate:
  `resolve("")` is the process working directory, so an empty variable would
  otherwise put the whole tree behind the static branch. Then `createServer`
  has no static branch at all and the engine
  runs unchanged with no built frontend, which stays supported because a
  reverse proxy may serve the assets instead. The default is inert until the
  unified shell produces that directory. One consequence of reserving no
  prefix: with a root configured, an unmatched `GET` under an API prefix
  (`/instances/a/b/c/d`) returns the shell document, not a JSON 404.
- Auth/Actor-Resolution + Assignment/Claim-Enforcement (roadmap #5d): activates
  the previously-declared-but-inert `Step.assignment` field. `src/auth/resolve.ts`
  defines the `ActorResolver` extension point (`(credential) -> Promise<Actor>`)
  and ships one concrete, non-production implementation, `devHeaderResolver`
  (trusts `X-Actor-Id`/`X-Actor-Roles` headers) — no real identity provider
  (JWT/OIDC/session) ships in core; a deployment supplies its own resolver
  against the same extension point. Assignment strategy is a plugin position
  too: `Step.assignment.strategy.type` resolves against an injected
  `AssignmentRegistry` (`registry.ts`), a `Map<string, AssignmentStrategyDef>`
  sibling to the action `Registry` and the `DataSourceRegistry`. An entry
  declares a resolver (`(ctx) => Promise<string[]>`) and may declare a config
  schema. `"static"` (`registry.ts::STATIC_ASSIGNMENT_STRATEGY_TYPE`,
  registered by `createDefaultAssignmentRegistry`) is the entry an author gets
  by default and the only one that ships; its schema is
  `{ candidates: string[] }` and its resolver returns that list verbatim. A
  second entry now ships beside it: `"org.manager-of-starter"`
  (`engine/assignment-strategies.ts::MANAGER_OF_STARTER_STRATEGY_TYPE`), whose
  config schema is a strict empty object. Its resolver returns the manager
  of `instance.startedBy` as the single candidate. ONE hop: never a chain, and
  never the manager of whoever acted last.

  It reads `auth_users.manager_user_id` through `auth/users.ts::getManagerOf`.
  That is why it lives in its own module rather than in leaf `registry.ts`:
  `store.ts` imports `registry.ts` back, so a database-reading entry there
  would close a cycle.
  `assignment-strategies.ts::createDefaultAssignmentRegistry(db)` returns the
  static entry plus this one, and deliberately shares the leaf factory's NAME.
  The three `src/http/*` modules therefore switch the whole HTTP surface onto
  it by changing which module the identifier comes from, with no
  default-parameter expression touched. Every in-engine default parameter still
  resolves to the static-only leaf factory. A test therefore asserts that the
  registry `serve` defaults to holds `org.manager-of-starter`. The
  type is checked at PUBLISH (`registry-check.ts::checkAssignmentRegistry`,
  through the same resolve-then-parse loop the action and data-source checks
  share, wired into `definitions.ts::publishBody`, throwing
  `AssignmentRegistryValidationError`) — an unregistered type or a `config` the
  entry's schema rejects is a publish error, never a runtime one; the reserved
  `core.` prefix is not exempt, since no internal dispatch reaches an assignment
  strategy. (An earlier design held such a registry and a ponytail audit cut it,
  on the condition that it return once a second strategy is authored. It
  returned one change ahead of that condition, so the seam and the first
  per-instance strategy could be reviewed as separate diffs — an empty refactor
  and an authorization change do not belong in one.) A target step's declared
  `assignment` resolves to a fresh `Instance["assignment"]` (candidates,
  unclaimed) at step entry via `registry.ts::resolveStepAssignment`, called by
  the step-entry CALLER — `commitTransition`, the subprocess spawn handler,
  `startInstance`, `api.ts::createProcessInstance` — never by `planStepEntry`
  (pure and synchronous, it takes the resolved set as a required
  `StepEntryOpts.assignment` field) and never by `createInstance`
  (persistence-only, it takes the set as an option). Required rather than
  optional so a missed caller fails to compile instead of silently unassigning
  the step. Migration passes `{ carry: true }` instead, carrying
  `instance.assignment` forward byte-for-byte and running no resolver at all.
  An unregistered type reaching step entry resolves to an empty candidate list
  rather than raising, and no fallback assignee is substituted. Resolution is
  TOTAL and DEADLINE-BOUNDED: `resolveStepAssignment` races every resolver
  against `ASSIGNMENT_RESOLUTION_TIMEOUT_MS` (default 5000) and returns
  `{ assignment, unresolved? }`, classifying the three no-candidate outcomes as
  `resolver-raised`, `timed-out` or `no-candidates`. None rolls back the entry.
  The state change that reached the step is real.

  The bound is what makes the subprocess return's carve-out safe. That one path
  resolves while holding the parent's row lock, since it derives the step it
  enters from the row it read `FOR UPDATE`. It is bounded rather than hoisted
  above the lock. A hoist would still fall back to resolving under the lock
  whenever its sequence re-check failed, which makes the unbounded hold rarer
  rather than impossible. `Promise.race` does not cancel the loser, and need
  not: the orphaned query holds a different pool connection. The caller
  therefore returns on time, its transaction commits and releases the lock, and
  a late answer is ignored.

  Each of the four step-entry callers records the reason as an
  `assignment.unresolved` `InstanceEvent`, payload `{ stepId, reason }`, the
  `instance.faulted` shape. It lands in the transaction that commits the entry:
  `commitTransition` through `StepEntryOpts.events`, and the three creation
  paths through `createInstance`'s own `events` option, at seq 0 where no
  `HistoryEntry` exists. A spawned child's event carries the CHILD's id, not
  the parent-scoped `mapping.entry-dropped` list's. The rule is uniform across
  every registered strategy, since no engine code branches on a strategy type.
  A `static` entry configured with an empty list therefore records
  `no-candidates` too. A step declaring no `assignment` records nothing.
  `claimStep`/`releaseClaim`
  (`transition.ts`, exposed via the Runtime API and the two new HTTP routes) are
  exclusive-claim operations, not transitions (no step change, no
  `HistoryEntry`): claiming requires an unclaimed assignment and an eligible
  candidate (`AlreadyClaimedError`/`NotACandidateError`), releasing requires the
  caller to be the claimant (`NotClaimedError`/`NotClaimantError`), and each
  records an `assignment.claimed`/`assignment.released` `InstanceEvent` (see
  "Runtime record" in `.claude/rules/process-contract.md`). `submitAndTransition`
  now enforces claimant-only
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
- `http.request`'s timeout now always applies (`bound-async-delivery`):
  `HTTP_DEFAULT_TIMEOUT_MS`, a module constant well under the outbox's
  `CLAIM_LEASE_MS`, applies when the action declares none. The default
  `fetch` is never unbounded. The abort now stays armed across the response
  body read too; previously the timer cleared in a `finally` around only the
  `fetch()` call, so a target that sent headers and then stalled could still
  hang the handler. The response is also read against a byte budget
  (`HTTP_MAX_RESPONSE_BYTES`). A declared `content-length` over the cap is
  refused before any read; an unlabelled body is refused once the running
  total crosses it; either is a `PermanentError`. The response lands in
  `instance.data` via `Action.output`, so an unbounded read is an unbounded
  write.
- `http.request` reaches only what the deployment permits
  (`restrict-http-action-egress`). `egressRefusal` in `src/handlers/http.ts`
  runs before the `fetch`. It answers why the policy refuses a target, or
  `undefined`. Two rules hold, both in the environment beside `DATABASE_URL`
  and the `SMTP_*` settings. No process body reaches either one.
  - `HTTP_ACTION_ALLOWED_HOSTS` is a comma-separated host list. An entry is a
    hostname with an optional port, the shape `URL.host` carries. The handler
    trims each entry and matches it without case. The match is exact and
    covers no subdomain the list omits. An empty or unset value refuses every
    target, the way an unset `CORS_ALLOWED_ORIGINS` permits no origin.
  - The scheme is `https:`, unless `HTTP_ACTION_ALLOW_INSECURE` is `1`.
  - Either refusal raises `PermanentError`. A retry meets the same policy.
    Only an operator changing the environment makes the target reachable, and
    the restart re-reads it.
  - The `fetch` carries `redirect: "manual"`, the load-bearing half. Following
    a hop would check the first host against the list and no other. An
    allowlisted host answering `302` to `169.254.169.254` would then reach it.
    Bun returns the real status there, not an opaque filtered response. A 3xx
    now reaches the existing non-2xx branch and dead-letters with its status.
  - The check runs at delivery, never at publish. Environment promotion moves
    a published body between environments as a file. A body that passes the
    development list would fail on import to production.
  - Out of scope on purpose: the handler resolves no hostname and refuses no
    private or link-local address. DNS rebinding stays open.
  - The devcontainer sets `HTTP_ACTION_ALLOWED_HOSTS=webhook-sink:8080`
    (`give-the-example-a-reachable-target`), the host of a service the
    devcontainer itself runs — see `webhook-sink` below. It also sets
    `HTTP_ACTION_ALLOW_INSECURE=1`. Closes the 2026-08-01 review's SEC-2.
  - `webhook-sink` (`.devcontainer/docker-compose.yml`,
    `scripts/dev-webhook-sink.ts`): a devcontainer-only service that answers
    every request with `200` and echoes the JSON body it received.
    `examples/expense-approval.json`'s `book` and `escalated_review` steps
    both target it, so `book`'s `Action.output` reads back the same
    `body.status` the action sent. Runs the image the `app` service already
    builds, plus one script — no third-party image joins the stack for it.
    Declares no `ports` entry, matching `db` and `mailpit`; a contributor
    reaches it via
    `docker compose logs webhook-sink`, which shows the method, the path, and
    the `Idempotency-Key` header of every request it receives.
- Notifications (`src/handlers/notification-email.ts`, roadmap #16): a second
  built-in handler, `notification.email`, registered by `createDefaultRegistry`
  next to `httpHandlerDef`. No schema change — the five existing action
  positions already carry it, so "notify on assignment" is a step's `onEntry`
  and "notify on reminder" a timer's `onFire.actions`. Config is static and
  publish-validated (`subject`; plain-text `body`; the two recipient lists
  below), the same discipline `httpConfigSchema` set.

  Recipients come two ways (roadmap #16b). `to` holds literal addresses.
  `toActors` holds role tokens: `candidate`, `claimant`, `starter`. The three
  map onto `assignment.candidates`, `assignment.claimedBy` and
  `Instance.startedBy`. An object-level refinement demands at least one entry
  across the two lists. It replaces `to`'s former `.min(1)`.

  Through `emailsForUserIds` (`src/auth/users.ts`) the handler turns a token
  into an address. That lookup drops an unknown id and a disabled account. The
  handler reads `ctx.db`, the handle each delivery carries, so one registry
  serves every tenant. `createDefaultRegistry()` takes no database. Stage 24
  replaced the brief factory this def carried between 16b and it. The same rule
  now holds for `org.manager-of-starter` and for the `db.list` data source: all
  three read their handle from the context.

  Every candidate gets the message, and addresses deduplicate with `to` first. A
  delivery resolving none opens no socket, returns `recipients: []`, succeeds,
  and logs one warning.

  The actor ids reach the handler frozen, never read at delivery. The stamp
  comes from `registry.ts::outboxActorsOf`. All three enqueue sites write it to
  `outbox.actors`, a jsonb column holding `NULL` on every pre-existing row and
  never backfilled. It rides on `ClaimedRow`, and `deliver` passes it as the
  optional `HandlerContext.actors`. Freezing is what makes it correct. The
  resolution worker cascades automatic steps without waiting for the outbox. A
  delivery-time read of `instances` would name whoever holds a later step.

  Transport is a hand-written SMTP client on `Bun.connect` plus
  `socket.upgradeTLS` (STARTTLS on the submission port), with no new npm
  dependency — the ladder `http.request` climbed with `fetch`. Connection
  details come from the environment (`SMTP_HOST`, `SMTP_PORT` default 587,
  `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`), never from the process body. An
  unset `SMTP_HOST` or `SMTP_FROM` is a `PermanentError` before any socket
  opens; no sender is substituted, since a synthesized address fails SPF at a
  real relay and turns a config error into a mid-delivery `5xx`. Credentials
  against a server advertising no `STARTTLS` are refused permanently rather
  than sent in the clear. `Message-ID` carries `ctx.idempotencyKey`, the
  counterpart of `http.request`'s `Idempotency-Key`.

  Two rules exist because SMTP, unlike a webhook, has no idempotency contract
  and a redelivery is a second real message. First, every `RCPT TO` is checked
  before `DATA`: one rejected address aborts with nothing sent, since
  delivering to the accepted ones would duplicate for them on the retry a
  `4xx` triggers. Second, the `250` on end-of-`DATA` is the point of no
  return — the result object is built before it, `QUIT` is written without
  awaiting a reply, and no later failure can fail the delivery. The handler
  returns `{messageId, recipients}` as the `result` an `Action.output` mapping
  reads; a shape that could not be read would throw a plain (transient) error
  from `evalOutput` after the mail was already out.

  `5xx` is permanent; a `4xx`, a connection failure and the session timeout
  (`SMTP_DEFAULT_TIMEOUT_MS`, under `CLAIM_LEASE_MS`) are transient. The
  timeout names the step it was waiting on (`... during TLS handshake`), so a
  stalled upgrade does not read as a bare deadline. The body's line endings
  are normalized to CRLF before base64, since the encoding carries a bare
  newline through unchanged and some readers then show a paragraph as one
  run-on line.

  `examples/expense-approval.json`'s `escalated_review` step carries one
  beside its existing `http.request`, so the escalation recipe (roadmap #17)
  shows both notifying handlers at the same action position. The
  devcontainer runs `mailpit` for real end-to-end tests, the same "real
  dependency, not a mock" pattern the DB suites use against `db`. The shared
  compose file publishes no host port for it, matching `db` and the rule that
  port publishing belongs in the gitignored `docker-compose.override.yml`; the
  end-to-end test reads messages back over Mailpit's HTTP API inside the
  compose network, so it never depends on a host binding.
- Reconcile in-flight action writebacks across a migration (`src/engine/migration.ts`,
  `src/engine/outbox.ts`): closes what was previously a "Decided, not yet built" gap.
  `migrateOne`'s in-flight-actions check now blocks only a `claimed` outbox row with
  an active lease (`claimed_at >= now() - CLAIM_LEASE_MS`) — a worker plausibly
  mid-handler right now, whose in-memory `ClaimedRow` snapshot already has the source
  version's field ids baked in, so nothing done to the stored row can fix it
  retroactively. A `pending` row, or a `claimed` row whose lease has expired, no
  longer blocks migration: `migrateOne` locks the instance's undelivered outbox rows
  before the instance row itself (matching `drainOutbox`'s own lock order, so the two
  cannot deadlock; new index `outbox_instance_idx`), then rewrites each such row's
  `Action.output` target field ids through the plan's `fieldMap` snapshot image —
  computed once from the full map, so an A↔B swap resolves correctly — retaining an
  unmapped id by identity, including onto a field the target catalog no longer
  declares (orphan write-through, matching `remapData`'s existing policy). New column
  `outbox.field_version`, stamped at enqueue to the instance's version at that moment
  (all three `INSERT INTO outbox` sites: `store.ts`'s creation-time spawn,
  `transition.ts`'s `applyStepEntry` general insert, and its timer-fire insert), is
  bumped to the target version whenever `migrateOne` remaps a row; under correct
  operation a row's `field_version` always equals the instance's own version, so a
  mismatch is a "should never happen" canary handled like the `definitionHash` pin
  mismatch — throw, land in `failed`, no event. `ClaimedRow` gains `field_version`,
  and `drainOutbox`'s writeback `UPDATE instances` predicate now also requires the
  instance's current version to still equal it — closing the residual race where a
  lease-expired-but-not-actually-dead worker's in-memory patch (computed from the
  pre-migration field ids) completes after a migration already moved the instance: the
  predicate fails, the writeback affects no row, and it folds into the existing
  suppression accounting rather than writing under a stale field id. No new
  `InstanceEvent` kind: a field-id remap is a pure, deterministic function of the
  plan's immutable, permanently-retained `fieldMap`, reconstructable from the existing
  `cause: "migration"` `HistoryEntry` plus that plan.
- Data-source resolution (`src/engine/registry.ts`, `registry-check.ts`,
  `definitions.ts`, `src/runtime/api.ts`, `src/http/`):
  closes the "Decided, not yet built" gap on `field.dataSource` — runtime
  resolution into an actual `FieldOption[]` list, consumed by both view
  rendering and submission validation. A new `DataSourceRegistry` (`type ->
  DataSourceHandlerDef`) mirrors the action `Registry`; `createDefaultDataSourceRegistry`
  (`host.ts`) ships one built-in `"static"` handler that echoes a configured
  option list. Publish-time validation mirrors the action-registry pattern:
  a new structural invariant in `definition.ts` (`FieldDef.dataSource` must
  resolve to an id in `body.dataSources`, including fields nested inside
  `group` fields) plus `checkDataSourceRegistry` (`registry-check.ts`,
  `DataSourceRegistryValidationError`), wired into `publishBody` in the same
  in-process slot `checkActionRegistry`/`checkAssignmentRegistry` occupy —
  after the hash-hit no-op return, so an identical re-publish of a body that
  predates a registered/tightened type stays a no-op. `resolveFields`
  (`src/runtime/api.ts`) is now async and takes a `registry: DataSourceRegistry`
  parameter: a `dataSource`-bound field's options are resolved via the
  registry, memoized by `DataSourceId` within one call (fields on the same
  step sharing a data source resolve it once). `ResolvedViewField` gained
  `options?: FieldOption[]` — populated from static `FieldDef.options`
  unchanged, or the resolved data-source result — the single place
  downstream code reads options from; `optionValuesValid` now validates
  against this resolved list instead of `FieldDef.options` directly, so
  submission validation actually enforces membership for `dataSource`-bound
  fields (previously any value was accepted). `createProcessInstance`,
  `getInstanceView`, and `submitAndTransition` each gained a required
  `registry` parameter, threaded down; a runtime registry-lookup miss
  despite passing publish-time validation is a plain-`Error` canary, not a
  typed `SubmissionValidationError` (same style as a `definitionHash` pin
  mismatch). The HTTP wrapper and the editor Player thread this through
  unchanged in shape: the Player's forced free-text fallback for
  `dataSource`-bound fields is gone, rendering a populated `select` from the
  resolved options like a static-`options` field. Only `"static"` ships in
  v1; the registry mechanism holds more without a built-in for each.
  CEL-readable data-source results remain untouched and out of scope — a CEL
  reference to a data source is still a publish error (see "Decided, not yet
  built" in `docs/decisions.md`).
- Read/query API (`src/runtime/api.ts`, `src/engine/definitions.ts`, `src/http/`,
  `test/runtime-api.test.ts`, `test/definitions.test.ts`, `test/http.test.ts`):
  closes the gap where the HTTP wrapper could only address a single instance by
  an id the caller already had. `instances` gains a `created_at timestamptz
  DEFAULT now()` column (runtime ids are UUIDv4, not time-sortable — see
  CLAUDE.md — so ordering needs its own column) plus three indexes: paging
  (`created_at DESC, instance_id DESC`), and two backing the assignment
  filter (`assignment->>claimedBy`, a GIN index on `assignment->candidates`).
  `listInstances(filter, page, db)` returns a keyset-paginated
  (`created_at`/`instance_id` cursor, base64url-encoded, opaque) page of
  `InstanceSummary` — lifecycle fields only, never `data`. Filters
  (`processId`, `status[]`, `currentStepId`, `startedBy`, `claimedBy`) combine
  conjunctively; `assignedTo` is one predicate expressing the inbox
  disjunction (claimed by that actor, OR unclaimed and that actor's id is an
  assignment candidate) rather than two filters a caller would have to
  combine correctly. `scope=mine` (the HTTP wrapper's derived filter, see
  `end-user-app`) additionally passes `assignedToRoles` — the resolved
  actor's roles — so the unclaimed half of the disjunction also matches a
  role-based candidate (`assignment.candidates ?| assignedToRoles`, a second
  GIN-backed predicate alongside the id one), mirroring the id-or-role
  eligibility `claimStep`/`isEligibleCandidate` already enforce. A bare
  `assignedTo=<id>` query has no role list and matches by id only. `getInstanceRecord(instanceId, page, db)` merges an
  instance's `HistoryEntry` and `InstanceEvent` rows into one
  chronologically ordered, discriminated (`{kind: "transition"|"event"}`)
  sequence via a single `UNION ALL` query, ordered `transitionSeq` then `at`
  in the database (the runtime record's own ordering rule, applied once here
  rather than exported to every caller); an unknown instance yields an empty
  sequence, not an error. `cancelInstance(instanceId, actor, db)` is a new
  thin Runtime API Layer wrapper loading the instance/body pair and
  delegating to the existing engine `cancelInstance`. `definitions.ts` gains
  `listProcesses()` (one entry per process, its newest version's metadata
  plus `key`/`label`/`baseLocale`, via `DISTINCT ON (process_id) ... ORDER BY
  process_id, version DESC`) and `listVersions(processId)` (every published
  version, oldest first); neither returns a body. The HTTP wrapper grows six
  routes: `GET /instances` (listing), `GET /instances/:instanceId/record`,
  `POST /instances/:instanceId/cancel`, `POST /processes` (publish — request
  body `{processId, body}`, since `processId` is not part of the hashed
  `ProcessBody`; validates against `createServer`'s own injected `Registry`,
  never a client-supplied one), `GET /processes`, `GET
  /processes/:processId/versions` — each OPTIONS-preflighted. `createServer`
  now takes `registry: Registry` as an explicit parameter (previously only
  `startEngine` saw it), so the publish check and the runtime dispatch agree
  by construction. `errors.ts::mapError` gained a `RequestShapeError` (400,
  for a malformed query parameter or request body) and 422 mappings for every
  publish-time validation family (`RegistryValidationError` and its
  assignment/data-source siblings, `CelValidationError`,
  `CrossProcessValidationError`, `DurationValidationError`, and a bare
  `ZodError` for an authored-schema violation). **Deliberately out of
  scope:** authentication. Publish and cancel resolve their actor through the
  same `ActorResolver` seam every other route uses, which in the shipped
  configuration is `devHeaderResolver` — under it, any caller may publish a
  process definition or cancel any instance. This is recorded as an explicit,
  known gap (see `openspec/changes/add-read-query-api`), not silently
  accepted; a real identity provider is a separate change.
- Authentication (`src/auth/{jwt,users,login,cli}.ts`, `add-authentication`):
  closes the gap the previous entry recorded. `jwtResolver` (`src/auth/jwt.ts`)
  is a second, production-capable `ActorResolver`: reads
  `Authorization: Bearer <jwt>`, dispatches on the token's `iss` claim
  (`"bps"` -> the local HS256 signing key; anything else -> that issuer's
  JWKS via `jose`'s `createRemoteJWKSet`, cached per URL), verifies
  signature/`exp`/`aud`, and maps `sub` -> `Actor.id` plus the issuer's
  configured `rolesClaim` -> `Actor.roles` (defaulting to `[]`). Both
  branches produce the same `Actor`, so a local account and an external IdP
  identity (e.g. Entra ID, added later as one `AUTH_ISSUERS` entry) are
  accepted simultaneously — no rewrite for a migration period. Project-local
  accounts live in a new `auth_users` table (`user_id` PK — the value used as
  `Actor.id` — `email` unique, `password_hash`, `roles text[]`, `disabled`),
  added to the existing `ensureSchema`/`initSchema` DDL in `src/engine/store.ts`.
  Three nullable columns came later: `manager_user_id`, `display_name` and
  `locale`. Each has its own `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. The
  helper `users.ts::resolveDisplayName` reads the stored `display_name`. It
  returns the `email` instead when that column is null. `locale` holds the
  account's own UI language. A null there leaves the browser's stored choice
  in charge.
  `src/auth/users.ts::createUser`/`verifyLogin` hash and verify passwords with
  `Bun.password` (argon2id, no new dependency); a wrong password, an unknown
  email and a `disabled` user all fail identically, so `verifyLogin`'s result
  (and `POST /auth/login`'s response) discloses nothing about which accounts
  exist. `src/auth/login.ts::handleLogin` is the one HTTP entry point: email +
  password in, an 8-hour `iss: "bps"` token out; there is no registration,
  password-reset, MFA, refresh or revocation. `src/auth/cli.ts` (`add-user` /
  `set-roles` / `set-password`) is the only path to create a user, assign its
  roles, or change its password. Listing users and disabling/enabling them
  moved to HTTP. See the "Admin area (user administration)" entry below. The
  resolver-credential seam changed
  shape: `ActorResolver`'s credential is now the request's `Headers` directly
  (`devHeaderResolver` reads `X-Actor-Id`/`X-Actor-Roles` off them itself),
  not a resolver-specific object `routes.ts::extractCredential` used to
  pre-extract; the removed `DevHeaderCredential` type is gone.
  `src/http/server.ts::resolveAuthResolver` selects the server's resolver from
  two environment variables, the same composition-root convention as
  `DATABASE_URL`/`CORS_ALLOWED_ORIGINS`: `AUTH_JWT_SECRET` (the local signing
  key) and `AUTH_ISSUERS` (a JSON array of `{iss, jwksUrl, audience,
  rolesClaim}`, parsed and shape-checked by `parseAuthIssuers` — a malformed
  value throws, failing startup loudly rather than silently disabling
  issuers). If either is set the JWT resolver is active and `devHeaderResolver`
  is not.
  **Updated by `harden-auth-configuration`:** if an operator configures
  neither variable, startup now fails. The operator must set
  `ALLOW_INSECURE_DEV_AUTH=1` to choose `devHeaderResolver` on purpose. Doing
  so also prints a startup warning naming the trusted headers. Selecting the
  unsigned-header resolver now always reflects an operator's explicit choice,
  never an omitted variable. `createServer`'s `resolver` parameter also lost
  its default, so no call site can reach `devHeaderResolver` by omission.
  Every test that wants it now passes `devHeaderResolver` explicitly.
  `AUTH_JWT_SECRET`, when set, must encode to at least 32 bytes — the
  HMAC-SHA-256 output size. A short key fails startup and names the variable.
  A one-character key is no longer a working HS256 deployment.
  `createServer` registers `POST /auth/login` only when a signing key is
  passed in — there is no state where the login route is reachable without
  one, and it is otherwise a plain `404`. **All four `add-read-query-api` list
  routes now also resolve the actor** (`handleListInstances`,
  `handleInstanceRecord`, `handleListProcesses`, `handleListVersions`): a
  code-review pass on this change found they had shipped with no
  `ActorResolver` call at all, so `GET /instances`, `GET
  /instances/:id/record`, `GET /processes` and `GET
  /processes/:processId/versions` stayed fully open even with
  `AUTH_JWT_SECRET` set — defeating the point of turning auth on. Fixed by
  threading `resolver` through the same `resolveActor(req, resolver)` call
  every other route already used; `test/http.test.ts`'s pre-existing
  unauthenticated calls to these four routes were updated to carry a
  credential accordingly (the dev resolver requires one now too, matching
  every other route — the "no auth env set" default behavior that stays
  unchanged is the *resolver selection*, not "these four routes need no
  actor"). The CORS preflight
  `Access-Control-Allow-Headers` list gained `Authorization` (alongside the
  existing `Content-Type, X-Actor-Id, X-Actor-Roles`) so a browser can
  actually send a bearer token cross-origin. Every frontend's session client
  treats any `401` as an invalid session — discarding the token and returning
  to its login screen, which is also how an 8-hour expiry surfaces, since no
  frontend tracks a client-side lifetime. **Authorization
  was still out of scope as of this change** — every authenticated actor kept
  today's permissions (any account could publish, cancel any instance) — see
  the next entry for the deliberate follow-up that closed it.
  **Known operational gap, recorded not silently accepted (at the time):**
  `/auth/login` had no rate limit beyond `Bun.password`'s argon2id cost
  (~100ms per attempt) — see the `add-login-rate-limit` entry below for the
  deliberate follow-up that closed it.
- Authorization (`src/auth/authorize.ts`, `add-authorization`): closes the gap
  the previous entry recorded. Two reserved roles on the already-resolved
  `Actor.roles` every `ActorResolver` populates — `PUBLISH_ROLE =
  "system:publish"` and `CANCEL_ANY_ROLE = "system:cancel-any"` — gate the two
  process-admin operations that previously had no permission check at all:
  `POST /processes` (`handlePublish`, checked immediately after actor
  resolution, before the request body is even parsed) and
  `POST /instances/:id/cancel` (`runtime/api.ts::cancelInstance`, checked
  before the target instance is loaded — a caller without the role is
  rejected whether or not the instance exists). `requireRole(actor, role)`
  throws a distinct `AuthorizationError`, mapped by `mapError` to `403`
  (`{error: {type: "authorization", message}}`) — separate from
  `ActorResolutionError`'s `401` (no valid identity vs. valid identity,
  insufficient permission). No policy engine, no role hierarchy: two fixed
  strings checked directly — unlike `Step.assignment.strategy.type`, which
  resolves against the injected `AssignmentRegistry`. Deliberately
  unrelated to assignment/claim enforcement — `submitAndTransition`,
  `claimStep`, `releaseClaim` are untouched, and an actor holding neither
  reserved role still fully participates in any process instance it is an
  assignment candidate for. Granting the roles needs no new tooling —
  `auth_users.roles` was already a free-form `string[]`, so the existing
  `cli.ts set-roles <email> system:publish,system:cancel-any` covers it.
  **BREAKING**: any account that published or cancelled instances before this
  change needs the relevant role granted, or it now gets `403`.
- Login rate limiting (`src/auth/login.ts`, `add-login-rate-limit`): closes
  the gap the `add-authentication` entry recorded. `handleLogin` tracks
  attempts per normalized email (`trim().toLowerCase()`) in an in-memory
  `Map`, checked and recorded synchronously — before `await verifyLogin` —
  so the check-and-increment is atomic against concurrent requests for the
  same email and no argon2id hash runs once an email is blocked. After
  `MAX_ATTEMPTS` (5) attempts within `WINDOW_MS` (15 minutes) a further
  request for that email gets `429` (`{error: {type: "rate-limited",
  message}}`); a successful login clears the entry. The normalized email is
  the tracking key only — `verifyLogin` still receives the request's
  original, unmodified email, since that lookup is case-sensitive and no
  stored email is normalized anywhere in this codebase. `MAX_TRACKED_EMAILS`
  (50,000) caps the map's size, failing open (untracked, not rejected) for a
  not-yet-tracked email once at capacity, so an attacker submitting unlimited
  distinct fake emails can't grow the map without bound. Per-process,
  in-memory, no new dependency: per-IP limiting and cross-process
  coordination are out of scope (single `Bun.serve` process today; see the
  change's design.md).
- Auth hardening, no-auth-configured fallback (`src/http/server.ts`,
  `harden-auth-configuration`): startup now fails if an operator configures
  neither `AUTH_JWT_SECRET` nor `AUTH_ISSUERS`. The operator must set
  `ALLOW_INSECURE_DEV_AUTH=1` to choose `devHeaderResolver` on purpose. That
  also prints a startup warning naming the trusted headers.
- Auth hardening, signing key length (`src/http/server.ts`,
  `harden-auth-configuration`): `AUTH_JWT_SECRET`, when set, must now encode
  to at least 32 bytes — the HMAC-SHA-256 output size. A shorter value fails
  startup and names the variable.
- Auth hardening, rate limiter (`src/auth/login.ts`,
  `harden-auth-configuration`): `checkAndRecordAttempt` now sweeps expired
  entries before it judges capacity. A not-yet-tracked email that still
  meets a full map after the sweep fails **closed**, with the same `429`. It
  no longer runs untracked. A full map used to disable rate limiting for
  every new email, permanently. Now it only delays a new email until its
  window expires.
- Auth hardening, login timing (`src/auth/users.ts`,
  `harden-auth-configuration`): `verifyLogin` now performs one password
  verification on every path, including the no-such-row path. The no-such-row
  path checks against a process-lifetime dummy hash. Its timing no longer
  discloses which emails have accounts.
- A disable now ends a live session (`src/auth/jwt.ts`,
  `src/auth/users.ts`, `src/http/server.ts`,
  `harden-local-account-sessions`): the two entries above no longer describe
  a disable. `jwtResolver`'s local-issuer branch takes an `isActiveAccount`
  callback. It calls that callback after the signature verifies.
  `isActiveUser` in `src/auth/users.ts` answers with one primary-key lookup
  on `auth_users`, selecting no column. A disabled account and a deleted one
  give the same answer. Either raises `ActorResolutionError`, so the request
  gets `401` on that account's next call. `resolveAuthResolver` takes the
  database handle and wires the callback. It is the one place this repository
  builds the production resolver.

  Nothing caches the answer. A cache with a lifetime would hold the gap open
  for that lifetime. A cache without one needs invalidation across processes.
  One alternative stays available: a `tokens_valid_after` column compared
  against the token's `iat`. It gives the same guarantee. It costs a
  migration and a second concept, and it still reads a row.

  Only `Actor.id` comes from that read. `roles` stays the token's own claim.
  A role grant therefore still reaches its actor at the next login, and not
  before. An externally issued token reads no directory entry at all. That
  issuer owns revocation. This engine holds no row for its subjects.
  `devHeaderResolver` reads no directory either, since it reads no token.
- Two login windows, and eviction over refusal (`src/auth/login.ts`,
  `src/http/server.ts`, `harden-local-account-sessions`): the per-email
  window the entry above describes now has a sibling. The sibling keys on the
  client address. It carries ten times the threshold and the same
  `WINDOW_MS`. A login passes both windows or gets the same `429`.

  The sibling bounds what one email at a time cannot see: one password tried
  against ten thousand accounts. Every email opens its own window there, so
  no counter ever trips.

  `handleLogin` checks the address window first. A caller past its threshold
  therefore never reaches the email map. A success clears that email's
  window and leaves the address's alone. Clearing it would let a caller
  holding one valid account reset that window at will.

  The address comes from `server.requestIP(req)`, which needed Bun's second
  fetch-handler argument. `createServer` returns `(req, server?)` now. It
  passes a client address to every route entry as a third argument. Only the
  login route reads it. `server` stays optional, because every existing test
  invokes that handler with a `Request` alone. Absent, the address
  window does not apply and the email one still does.

  `TRUST_PROXY=1` reads `X-Forwarded-For` instead, and only then: any caller
  can send that header. The LAST comma-separated entry is the one read. A
  proxy that appends rather than overwrites leaves what the caller sent in
  front of its own entry. Reading the first would hand the bucket key back to
  the attacker.

  `checkAndRecordAttempt` now evicts the earliest window at capacity, rather
  than refusing the request. The refusal had a reason. Admitting untracked
  requests at capacity let one caller disable the brute-force control for
  every account. The address window removes that premise, since 50,000
  distinct emails inside one window is no longer a free move.

  Refusal now costs the larger harm: every untracked account loses its login
  until the window rolls. Both maps carry the sweep, the capacity check and
  the eviction. This change therefore opens no second unbounded map.
- A delegation names a known account (`src/runtime/api.ts`,
  `src/engine/transition.ts`, `harden-local-account-sessions`):
  `delegateClaim` used to accept any `toActorId`. A typo parked the task on
  an identity that would never claim it. No error followed, and the
  `assignment.delegated` event read like a real delegation. It now
  raises `UnknownDelegateError`, which `src/http/errors.ts` maps to `422` and
  `"unknown-delegate"`.

  That check runs only where the delegating actor's own id resolves in
  `auth_users`. The engine cannot ask whether a deployment uses local
  accounts, since both resolvers can be active at once. It asks about this
  delegator instead. On an external identity provider the answer is no, and
  the target check does not run. One query answers both halves, so the two
  facts cannot disagree.

  The check travels into the engine as a `validateTarget` callback, rather
  than running in the wrapper first. `updateAssignment`'s `guard` may now
  return a promise, and the engine awaits it. It runs after the engine's own
  claimant check, under the same row lock. The other order would make a
  non-claimant's error depend on whether the target exists. That turns this
  route into a directory-enumeration oracle. Any actor holding any claim
  could read it. `toActorId` is still unchecked against
  `assignment.candidates`: the contract permits delegating outside that
  set.
- Content-Security-Policy for the four SPAs
  (`packages/{app,admin,studio,editor}/vite.config.ts`,
  `harden-auth-configuration`): rides along in the same change, at the same
  blast radius. Every browser package's production build now emits a
  Content-Security-Policy meta tag (`script-src 'self'`, `object-src 'none'`,
  `base-uri 'none'`, `form-action 'self'`,
  `connect-src` derived from `VITE_API_URL`). A build-only Vite plugin
  injects it, so `bun run dev` keeps working as before. This is defense in
  depth for the bearer token in `localStorage`. Its 8-hour expiry means
  nothing can revoke it early. There is no known injection sink in the tree
  today.
- Framing and sniffing headers (`src/http/static.ts`, `docker/nginx.conf`,
  `deliver-framing-and-sniffing-headers`): the meta policy above carries no
  `frame-ancestors`. A browser honors that directive only in a response
  header. It ignores `report-uri` and `sandbox` in a meta tag for the same
  reason. Both paths that serve the bundle now send four headers with every
  document and every asset. Those are `Content-Security-Policy:
  frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options:
  nosniff` and `Referrer-Policy: no-referrer`. The response header carries
  `frame-ancestors` alone, so the two policies restrict disjoint directives.
- End-user app (the app area of `packages/web`, `packages/form-ui`, `add-end-user-app`): the
  participant-facing frontend — Login, My-tasks (inbox), Task, Start-a-process,
  four screens over a small hand-written History-API routing hook, talking to
  the engine only through the HTTP wrapper. `packages/form-ui` is a new
  source-only, no-build package extracted from the editor's Player field
  renderer so both the editor's Player and the end-user app render step forms
  through the identical component tree — a fix to one benefits both, and what
  an author previews is what a participant gets. Only the end-user app
  currently imports `form-ui/form-ui.css`; the editor's Player does not, so
  its forms are presently unstyled (a known gap, not a design choice — see
  `form-ui`'s spec). Two small engine-side additions: `InstanceSummary` gained
  `processLabel`/`stepLabel`/`processBaseLocale` (resolved through the pinned
  version body) so the inbox can render without shipping whole process bodies
  to end-user browsers, and `POST /instances/:id/cancel` accepts
  `startedBy === actor.id` as an alternative to `system:cancel-any` (see
  `authorization`'s "An instance's starter may cancel it without the reserved
  role" entry) so an abandoned start doesn't strand an unassigned running
  instance. The my-tasks screen issues `GET /instances?scope=mine&limit=200`
  and never a client-supplied `assignedTo`, so the server alone decides what
  "mine" means. Read/query API's `assignedTo`/`assignedToRoles` role-matching
  fix (see that entry above) was found and closed in the same area, during a
  post-launch documentation audit of this stage.
- Admin area (operations) (the admin area of `packages/web`, `src/engine/admin-queries.ts`,
  `src/http/admin-routes.ts`, `admin-shell-and-ops`): the operator-facing
  frontend and its server surface — stage 10's first of three changes. A new
  reserved role `ADMIN_ROLE = "system:admin"` (`src/auth/authorize.ts`) gates
  every `/admin/*` route and, **BREAKING**, the two reads that previously
  carried no permission check at all: `GET /instances` now requires it for
  `scope=all` (an omitted `scope` resolves to `"all"`, same as before — the
  hole was the omitted case, not a new spelling of it; `scope=mine` stays open
  to every authenticated actor), and `GET /instances/:id/record` requires it
  unconditionally. `admin-queries.ts` adds the reads/repairs the engine had no
  API for: `listOutbox`/`countOutboxByStatus` (outbox rows by status, with
  their `last_error` — see below — but never the action's `config`, which may
  hold credentials), `listPendingTimers` (running instances with a due
  `next_timer_at`), and two pure outbox-row repairs, `requeueOutboxRow`
  (`status` back to `pending`, `attempts` reset to 0) and `discardOutboxRow`
  (`status` to `discarded` — never a `DELETE`, since `idempotency_key` is the
  dedup anchor). Both repairs are guarded by `WHERE status = 'dead-letter'`
  and report the updated row or `null`; `admin-routes.ts` maps `null` to 404
  (no such row) or 409 (present but not a dead letter) by a follow-up read.
  `outbox` gained a `last_error text` column (idempotent add, like
  `claimed_at`/`event_id`/`field_version`): `drainOutbox` stamps the failure
  message on both failure branches and clears it on success, so an outbox
  listing is self-sufficient without a jsonb scan across the runtime record.
  `discarded` is a fifth outbox status, inert to every existing consumer by
  construction — `drainOutbox`'s claim predicate is an explicit allowlist
  (`pending` due, or `claimed` with an expired lease) that never matches it,
  and `migrateInstances` locks and remaps every non-`delivered` row of an
  instance (including a `discarded` one) in `field_version` lock-step, since
  only a *live-claimed* row blocks migration. The admin area mirrored
  the app area's shape (own `package.json`/`vite.config.ts`/`tsconfig.json`,
  React 18 + Vite 6, a hand-written History-API routing hook, `session.ts` for
  the JWT) but not its code: no `form-ui` dependency (it renders records and
  system state, never step forms), no i18n. Login and session reuse are
  identical to the end-user app; the shell additionally reads `roles` off the
  login response and renders an explanatory empty state — presentational only,
  the server-side `requireRole` is the enforcement — when `system:admin` is
  absent. Four screens: `/instances` (all-instances list via `scope=all`, the
  `InstanceListFilter` filters, cursor paging — filter/paging state in a tested
  pure module, `screens/instancesLogic.ts`), `/instances/:id` (a header plus
  the merged transition/event timeline from `GET /instances/:id/record`, with
  cancel the only write action — no forced transition, no `data` edit;
  `transitionSeq` and claim state are derived from however much of the record
  has loaded, since neither has a single-instance read of its own, and
  `definitionHash` is looked up from `GET /processes/:id/versions` by the
  view's `version` — no new instance-detail route was added beyond the four
  the change actually ships), `/outbox` (per-status counts, retry/discard
  offered only on `dead-letter` rows, retry behind a confirmation naming the
  re-run risk), and `/timers` (overdue-first, with overdue classification in a
  tested pure module, `screens/timersLogic.ts`). Every screen refreshes on an
  explicit control plus refetch-on-window-focus; no polling, no websocket.
- Admin area (user administration) (the admin area of `packages/web`, `src/auth/users.ts`,
  `src/http/admin-routes.ts`, `admin-users`, `admin-user-management`): stage
  10's second of three changes, the one HTTP carve-out from
  `local-user-accounts`'s CLI-only administration. `src/auth/users.ts` gains
  `listUsers` (every `auth_users` row as
  `{userId, email, displayName, roles, disabled, managerUserId}`,
  never `password_hash`) and `setDisabled(userId, disabled, db)` — keyed by
  `userId`, unlike `setRoles`/`setPassword`'s `email`, since its caller is a
  row from a `listUsers` result rather than a human typing an address they
  know; it returns the updated row via `RETURNING`, or `undefined` for an
  unknown id, so the HTTP handler needs no follow-up query to answer 200/404.
  Eight `system:admin`-gated routes in `admin-routes.ts`: `GET
  /admin/users`, `POST /admin/users/:id/disable`, `POST
  /admin/users/:id/enable`, plus three added later (see the role-editing
  entry below), `PATCH /admin/users/:id/roles`, `PATCH
  /admin/users/:id/manager`, `PATCH /admin/users/:id/name`. The name route
  has no caller in `packages/web` today. The admin area's client
  (`packages/web/src/areas/admin/api/client.ts`) reaches the other seven and
  stops there. `admin-user-onboarding` added the create and password routes
  (see its own entry below). Disabling took
  effect on the user's *next* login attempt only, as this change left it;
  it revoked no JWT already issued to them, since token verification then
  performed no per-request database lookup (proven by an end-to-end test:
  log in, disable via the new route, the pre-disable token still
  authenticates, a fresh login attempt then fails). The
  admin area gained a
  `/users` screen — list plus a disable/enable toggle, the disable action
  behind a confirmation naming that caveat — with no create/password/role
  controls.

  SUPERSEDED by `harden-local-account-sessions`, below. The resolver now
  reads the account behind every locally issued token. A disable ends the
  open session on its next request. That test now asserts the opposite.
- Process Studio — shell and drafts (the studio area of `packages/web`, `src/engine/drafts.ts`,
  `src/http/studio-routes.ts`, `studio-shell-and-drafts`): the developer's
  substrate — stage 11's first of five changes; `packages/editor` stayed
  untouched and functional until `studio-tools-and-player`, the last of the
  five, deleted it. A new reserved role
  `DEVELOPER_ROLE = "system:developer"` (`src/auth/authorize.ts`) gates every
  studio route and implies nothing else — publishing still separately requires
  `system:publish`. A new table, `drafts` (`src/engine/store.ts::initSchema`):
  one mutable draft per process (`process_id` primary key), holding the
  **authored**, uncompiled body plus a `layout jsonb` column kept beside it
  (never inside it, so a moved box never changes `definitionHash`), a
  `revision integer` for optimistic concurrency, a nullable `base_version`,
  and `updated_by`/`updated_at`. Deliberately not `definitions` with the
  declared-but-inert `status='draft'` — that table is what `resolution.ts`
  and the timer worker rehydrate running instances from. `src/engine/drafts.ts`
  exports `getDraft`/`saveDraft`/`listDrafts`/`deleteDraft`; `saveDraft`
  validates only the request's envelope (`body`/`layout` are JSON objects,
  `revision` a non-negative integer, and an optional `baseVersion` a positive
  integer naming a published version — `RequestShapeError` otherwise, imported
  from the new leaf module `src/errors.ts` rather than `src/http/errors.ts`,
  which would have created an import cycle since `http/errors.ts` in turn
  imports `DraftConflictError` from `drafts.ts` for its own 409 mapping) and
  never parses the body against `processBody`: a draft under construction
  routinely violates the authoring-time invariants, and correctness is
  enforced live in the studio's editing UI and unconditionally at publish
  instead. Saving is `UPDATE … WHERE process_id = $1 AND revision = $2`
  (`revision = revision + 1` on a hit), the same "conditional update, caller
  supplies the expected value" pattern `transitionSeq` already establishes; a
  first save at `revision = 0` for a process with no row is an `INSERT`, and a
  lost create race or a stale `revision` both raise `DraftConflictError`
  (its own class, distinct from `runtime/api.ts::ConcurrencyConflict`, which
  means an instance `transitionSeq` mismatch to every existing client) — never
  merged. `src/http/studio-routes.ts` exposes `GET /drafts`,
  `GET /drafts/:processId` (404 when absent), `PUT /drafts/:processId` and
  `DELETE /drafts/:processId`, kept out of `routes.ts` the same way
  `admin-routes.ts` is; `updated_by` always comes from the resolved actor,
  never the request body. The studio area mirrored the app area's shape
  (own `package.json`/`vite.config.ts`/`tsconfig.json`, React 18 + Vite 6, a
  hand-written History-API routing hook, `session.ts` for the JWT under its
  own storage key) the way the admin area did, plus `immer` and `zod`; no
  `form-ui`, `mermaid` or `@panzoom/panzoom` yet. Login and the
  role-gated-empty-state shell follow the admin area's pattern exactly
  (`system:developer` in place of `system:admin`) — presentational only, the
  server-side `requireRole` is the enforcement. The editor's `draft/`,
  `panels/`, `i18n/` and `registry/` were copied into the studio area's source
  (`packages/editor` untouched at the time, a deliberate duplication window
  closed when `studio-tools-and-player`, change 5, deleted the editor): the
  file-persistence pieces
  (`file-io.ts`, `file-system-access.d.ts`, `load-guard.ts`,
  `panels/FileToolbar.tsx`, and `io.ts`'s Draft-round-trip/import functions,
  which depended on the dropped load guard) are removed, and `FileToolbar` is
  replaced by `panels/DraftToolbar.tsx` — explicit save/discard against the
  draft routes, with a save/conflict state machine (`screens/draftSaveLogic.ts`,
  unit-tested independent of any component) that on a 409 leaves the open
  Draft's in-memory state untouched and offers a reload, which replaces the
  Draft via the store's existing `replace()` and adopts the stored
  revision/layout — never a silent retry, never a merge. `draft/ids.ts` gained
  a seventh minter, `process`, over the contract's `processId` schema. Live
  validation is unchanged: the engine's own publish-time chain imported
  through the exports map at compile time, exactly as `packages/editor`'s own
  now-deleted `draft/validation.ts` already did, and it never blocks saving. The process list (`screens/processListLogic.ts`, a pure module
  following `packages/web/src/areas/app/screens/inboxLogic.ts`) merges
  `GET /processes` with `GET /drafts` into one row per process id — draft-only,
  published-only, or both — with new/open/discard actions; "New process"
  mints a `proc_`-prefixed id client-side and issues exactly one
  `PUT /drafts/:processId` at `revision = 0`, no server-side id allocation.
  (Since `seed-draft-from-published`, "Create draft" on a *published* row no
  longer writes an empty body — see the seeding entry at the end of this file.)
  Publishing, canvas editing, the JSON surface, and migration planning are not
  part of this change; the existing editor's export path plus `POST
  /processes` remains the only publish path until change 4.
- Process Studio — canvas (`packages/web/src/areas/studio/canvas/`, `StepsPanel.tsx`,
  `EditScreen.tsx`, `src/schema/definition.ts`, `studio-canvas`): stage 11's
  second of five changes. `/processes/:id/edit` becomes canvas-primary: a
  hand-rolled SVG canvas (`CanvasView.tsx`) replaces the stacked-panels-only
  column, deliberately not Mermaid (display-only, no drag affordance) and not
  a graph-editing library (the interaction surface — drag a node, drag from a
  handle — is small and fixed, and the domain graph has no parallelism to
  support). `StepsPanel` is mounted unconditionally as a fixed-width inspector
  beside the canvas — its `expanded` accordion state, previously internal
  `useState`, is now an optional controlled prop (`selectedStepId`/
  `onSelectStep`, uncontrolled when `onSelectStep` is omitted) so canvas
  selection can drive it without ever hiding the panel's own list or
  "+ Add step" action; selecting a path edge resolves to its *source* step
  and expands that step's row (no standalone `PathsPanel` mount — it is
  already nested there). `src/schema/definition.ts` gained
  `checkPathTriggerConsistency`, extracted from the step `superRefine`'s
  inline all-manual-or-all-automatic / unique-automatic-priority check (same
  behavior, same messages, one implementation now instead of duplicated
  logic) — the canvas's `canvas/connection.ts` wraps it to reject an
  inconsistent drag-to-connect inline, before a path is ever created, using
  the same rule the engine enforces at publish. Node position writes to
  `EditorArea`'s `saveState.layout` via a new `onMoveStep` callback — not
  `useDraft()`/`mutate()`, since layout was never part of the Draft model's
  body-mutation surface, it round-trips through `DraftToolbar`'s save call as
  its own state; a created path, by contrast, is a real schema entity and
  writes through `mutate()`/`updateInDraftArray`, the same call
  `PathsPanel`'s "add path" action makes. `canvas/layout.ts::autoPlaceSteps`
  gives a step absent from `layout` a deterministic position via a one-time
  client-side BFS-depth-from-`initialStep` traversal (depth → column, order →
  row) — rendered only, never written back until the step is actually
  dragged, so an unrelated save doesn't invent layout rows.
  <!-- antislop: allow paragraph-length -->
  <!-- This bullet already ran past the six-sentence limit before this
       edit; splitting the whole bullet into paragraphs is out of scope
       for a one-paragraph technical correction. -->
  `@panzoom/panzoom`
  (already a dependency of `packages/editor`'s read-only graph view, before
  that package was deleted) drives pan/zoom and a "fit to view" control.
  Panzoom's own pointerdown binding sits on `.canvas-wrap`, via the
  `canvas: true` option, not on the SVG element itself. This app's own
  `wheel` listener binds to that same `.canvas-wrap` element. `.canvas-wrap`
  never transforms, so its box always covers the full visible canvas at
  any pan or zoom state. The SVG element's own box does not
  (`fix-canvas-pan-dead-zone`). A real browser check via `playwright-cli`
  found this, the same way the check below found its own defect:
  `packages/web/test/studio-canvas-fit.test.ts` asserts scale/pan as
  numbers, and cannot see which DOM element a pointer or wheel event
  reaches. Every node and edge `<g>` carries
  Panzoom's own `panzoom-exclude` class. So does the toolbar now, since
  `.canvas-wrap` is both its ancestor and Panzoom's bind target. A real
  browser check via `playwright-cli` found this too, not just `bun:test`,
  which can't see DOM event ordering. Without the class, Panzoom's native
  down-handler wins the race against React's synthetic dispatch. It
  silently turns every node drag, drag-to-connect, or toolbar click into a
  canvas pan instead. `canvas/geometry.ts` (hit-testing, drag-delta) and
  `canvas/connection.ts` are pure and unit-tested alongside `layout.ts`; the
  SVG/React rendering and pointer wiring itself is not, per this repo's
  existing convention (`packages/web/src/areas/app/screens/inboxLogic.ts`). The canvas
  introduces no operation the panels can't already do — deletion and every
  field edit remain panel-only.
- Canvas grid snapping (`packages/web/src/areas/studio/canvas/geometry.ts`,
  `canvas/layout.ts`, `canvas/CanvasView.tsx`, `screens/EditScreen.tsx`,
  `areas/studio/app.css`): a step lands on the lattice the author can see.

  `GRID_STEP` is 20 and `snapToGrid` rounds to the nearest point. Three sites
  call it: a drag's release, the drag preview, and the palette drop. All three,
  because the preview never calls `onMoveStep`. Rounding at the write path
  alone would leave the preview unrounded, and the node would jump on release.

  `CLICK_THRESHOLD` and its comparison moved into `geometry.ts` as
  `exceedsClickThreshold`. The snap runs only past that line, so a click never
  rounds its own step onto the lattice.

  The grid tracks the transform. `CanvasView` subscribes to `panzoomchange`
  and writes `--canvas-grid-size`, `--canvas-grid-offset-x` and
  `--canvas-grid-offset-y` onto `.canvas-wrap`, reading the scale and pan from
  the event's own `detail`. The stylesheet reads all three, so the gradient and
  its colour role stay in CSS.

  The grid still sits on the wrap rather than the SVG, for the reason it always
  did: Panzoom transforms the SVG, so a grid drawn there shrinks with the zoom.
  The wrap holds still. What changed is that the still surface is now told what
  the moving one is doing.

  `ROW_HEIGHT` went 110 to 120 and `NODE_HEIGHT` 64 to 60, so all four layout
  constants sit on the lattice. An auto-placed step therefore does not shift on
  its first drag. No step size both matched the drawn dots and divided the old
  four.
- Canvas multi-select (`packages/web/src/areas/studio/canvas/selection.ts`,
  `canvas/CanvasView.tsx`, `screens/EditScreen.tsx`, `areas/studio/app.css`):
  the canvas selects a set of steps, not one.

  `EditorArea` holds `selectedStepIds: string[]`. A set of one drives the
  inspector exactly as the single id did. A set of several drives a summary
  instead — a count, a Remove steps control, and the same collapsed checks rail
  the inspector docks — because the inspector edits one step.

  `canvas/selection.ts` exports `toggleSelection`, `normalizeRect` and
  `nodesInRect`, all pure and covered by
  `packages/web/test/studio-canvas-selection.test.ts`. The marquee selects on
  overlap, not containment: at the fit scale a 180-by-60 node fills most of the
  visible canvas, so containment would be unusable.

  Three Panzoom facts shaped the gesture, and each one is load-bearing.

  Its down-handler binds to `.canvas-wrap` in the bubble phase and its default
  `handleStartEvent` calls `stopPropagation()`, while React binds at the root,
  an ancestor. A bubble-phase `onPointerDown` there never runs at all, so the
  marquee starts on `onPointerDownCapture`.

  Panzoom scales the SVG element, so at any zoom under 1 most of the visible
  canvas sits outside the SVG's own box. The gesture binds to `.canvas-wrap`
  for that reason, as `onPaletteDrop` already does, and the band draws as an
  HTML overlay there rather than as an SVG rect that would clip at the
  shrunken viewport.

  Panzoom binds `move` and `up` on `document`, so the marquee takes pointer
  capture and restores `disablePan` from `onLostPointerCapture` as well as
  `onPointerUp`. A release outside the canvas would otherwise leave it
  unpannable for the life of the screen.

  Panning dies through `panzoom.setOptions({ disablePan: true })`, not by
  cancelling the gesture. Panzoom's `constrainXY` reads that option off a fresh
  spread on every call, so setting it mid-gesture stops a pan that has already
  started.

  A group move rounds each member's own result rather than the shared delta,
  which is stage 37's rule applied unchanged. Every selection write stays at
  pointer-up; pointer-down only decides which steps the gesture moves.
- Canvas edge routing (`packages/web/src/areas/studio/canvas/geometry.ts`,
  `canvas/CanvasView.tsx`, `screens/EditScreen.tsx`, `areas/studio/app.css`): a
  path draws as an orthogonal route, under one canvas-wide style.

  `routeEdge` returns the route's corner points, and the count reads off both
  axes. A target ahead on the same row takes one segment, which is the common
  case: `autoPlaceSteps` puts a linear chain of steps on one row. A target
  ahead on another row takes three. A target that is not ahead takes five, and
  it dips below when both anchors share a row, since a shared row leaves no row
  between them to cross on.

  The gutter is `GRID_STEP`, not a constant of its own, so a turn sits a whole
  grid step clear of the node it leaves. That holds on the axis the anchor
  leaves on. An anchor sits at the node's vertical middle, so a turn's y
  follows it off the lattice.

  `routePath` renders the points. `step` joins them directly. `smoothstep`
  replaces each corner with a quarter-arc, whose radius clamps to half the
  shorter of the two segments it joins. A route with no corner carries no arc
  under either style.

  `midpointOfRoute` returns the half-way point AND the segment it falls on. The
  segment is not decoration: a guard label bounds its own width by the run it
  sits on, and a five-segment route puts that midpoint on a vertical run where
  the distance between the two anchors says nothing about the room available.

  The style is canvas-wide and persists at `layout.canvasEdgeStyle`. It shares
  the `layout` blob with node positions, and cannot collide with one: every
  step id carries a `step_` prefix, and `positionOf` admits only a point. An
  absent value renders as `step`, and so does a value this version does not
  know.

  The edge is a `<path>` now, not a `<line>`, and `.canvas-edge-hitarea` needed
  `fill: none` for that. A line cannot fill. A five-segment route encloses
  area, and SVG fills a path black by default, which would have painted a blob
  over the canvas and swallowed every pointer event inside it.

  No router ships, and an edge crosses a node in its way. `libavoid-js` was the
  candidate and the user declined it: a 813 KB beta WASM module against a
  712 KB bundle, buying obstacle avoidance alone. Stage 33's control points are
  the intended answer to a crossing edge.
- Process Studio — lifecycle (`src/http/studio-routes.ts`, `src/engine/drafts.ts`,
  `src/http/errors.ts`, `packages/web/src/areas/studio/panels/DraftToolbar.tsx`,
  `packages/web/src/areas/studio/screens/{VersionsScreen,MigrationPlanScreen}.tsx`,
  `studio-lifecycle`): stage 11's fourth of five changes. Closes the gap the
  prior two changes left open — a Studio draft could previously only be
  published via `packages/editor`'s export path plus a manual `POST /processes`
  call.
  `POST /drafts/:processId/publish` publishes the *persisted* draft
  server-side, never a client-supplied body, requiring both
  `DEVELOPER_ROLE` and `PUBLISH_ROLE` (neither implies the other); it is the
  first `studio-routes.ts` handler needing `registry`/`dataSourceRegistry`
  (every prior one took only `resolver`/`db`), now threaded through
  `src/http/server.ts`'s dispatcher the same way `handlePublish` already
  receives them. `publishBody` and the new `drafts.ts::markDraftPublished`
  (a plain `base_version` `UPDATE`, deliberately outside `saveDraft`'s
  revision-checked optimistic concurrency, since `base_version` carries no
  part of that contract) run inside one `withTransaction`
  (`src/engine/store.ts`), so a stamp failure rolls back the publish instead
  of leaving a published version un-stamped. Three more routes expose
  existing engine-only functions over HTTP for the first time — `GET
  /processes/:processId/versions/:version` (the compiled body `resolveBody`
  already resolves; `DEVELOPER_ROLE`-gated, unlike its metadata-only,
  no-role-required sibling `GET /processes/:processId/versions`), `GET`/`PUT
  /migration-plans/:processId/:fromVersion/:toVersion` (wrapping
  `registerMigrationPlan`/`resolveMigrationPlan` unchanged — `PUT` free-edits
  an unapplied plan and inherits the engine's existing frozen-plan rejection),
  and `GET /processes/:processId/versions/:version/orphan-keys` (wrapping
  `findOrphanKeys`; version-keyed rather than plan-keyed, since the scan is
  independent of any migration target) — all `DEVELOPER_ROLE`-gated and
  unprefixed (studio-only by role check, not by URL, the same convention
  `process-drafts`'s `/drafts` routes already established). `MigrationPlanError`
  gained one `errors.ts` mapping (409, `migration-plan`) shared by all three,
  since it previously fell through to the generic 500. The studio area
  gained: a Publish action on the edit screen, gated by a dirty-check pure
  module (`screens/draftToolbarState.ts::isDirty`, comparing the in-browser
  draft against the last-saved snapshot) — a `confirm()` prompt offers to
  save then publish when dirty, mirroring the existing discard-confirmation
  convention rather than silently chaining or hard-blocking; a Versions
  screen listing published versions and diffing any two (or a draft against
  its `base_version`) via a from-scratch JSON diff
  (`screens/versionDiffLogic.ts::diffJson`) — no diff library exists
  anywhere in the repo to reuse, and none was added, objects recurse
  key-by-key and everything else (including arrays) compares whole (since
  `seed-draft-from-published`, by canonical JSON rather than
  `JSON.stringify`, and the base body is stripped first — see the seeding
  entry at the end of this file); and a
  migration-plan authoring screen, a JSON-textarea editor over
  `MigrationSpec` (`screens/migrationPlanLogic.ts`) plus an orphan-key
  dry-run panel. Stage 27c added the field-mapping form beside that
  textarea (see the `studio-migration-plan-field-mapping` entry at the end
  of this file). The textarea stays as the escape hatch. Deliberately out
  of scope: *executing* a migration plan
  (stays `admin-migration-run`'s future `POST /admin/migrations/run`, an
  operator action) and the registry/CEL-scratchpad tools screen plus Player
  (`studio-tools-and-player`).
- Process Studio, the condition builder (`packages/web/src/areas/studio/panels/shared/{conditionLogic.ts,
  ConditionBuilder,ConditionInput,BooleanOrExpressionInput,overrideMode}.ts(x)`,
  `src/cel/check.ts`, `studio-condition-builder`, `cel-expressions`).
  Stage 27b. A row builder over CEL at the two condition sites. Those are the
  path guard in `PathsPanel` and the three view overrides in `ViewEditor`.

  `TimersPanel` and `FieldExpressionMapEditor` keep the plain
  `ExpressionInput`. A deadline must infer to `string`. An `Action.output` value
  reads `result` alone. Neither is a condition.

  Engine side, `src/cel/check.ts` gains two exports and no behavior. One is
  `parseAst`, the AST or null when the source does not parse. The other is an
  `export` on the already-present `ACTOR_SCHEMA`. `packages/web` reaches both
  over the existing `./cel/check` exports-map entry, so the exact
  `@marcbachmann/cel-js` pin stays single.

  Read-back is by parse, never a sidecar. Such a record cannot live in
  `ProcessBody`, because it would move `definitionHash`. Beside the draft it
  dies at publish, which leaves a published version uneditable in the builder.

  `fromCel` reads the top-level `&&` or `||` as the joiner. It flattens that
  operator's left-associative chain, then reads each conjunct as a comparison
  row. Anything it cannot represent slices out by the node's `range`. That
  becomes a **raw row** holding the exact substring. One macro therefore does
  not cost the whole guard.

  `toCel` reverses it. It writes the literal in the operand's declared CEL type,
  so a `number` field emits `1000.0`. That clears the documented `double`
  papercut for anyone authoring here. An incomplete row stays visible and
  marked, and `toCel` omits it. The draft saves continuously, so a half-written
  `data.amount > ` would put a parse error in the `IssueList` on every keystroke.

  Nothing persists the row model, so a later grouping level changes the reader
  and the writer alone. Two rules keep that open, and both are load-bearing.
  One: no sidecar. Two: `onChange` fires on a real authoring action only.
  Mounting,
  reading and switching mode never write, so a guard an author merely opens
  stands byte for byte.

  Verified in a browser against `expense-approval.json`. Its single-quoted
  guards survive an untouched visit, and they normalise to double quotes only on
  a real edit.

  The operand picker walks the draft catalog with `flattenDraftFields` and drops
  every `group` node. Both that helper and the contract's `collectFieldsDeep`
  push the group itself, and an instance's `data` is flat. The picker then reads
  `INSTANCE_SCHEMA` and `ACTOR_SCHEMA` mechanically, minus a four-entry
  deny-list: `instance.id`, `instance.currentStepId`, `instance.transitionSeq`
  and `actor.id`. None of the four can express a guard that means anything at a
  condition site. A later widening of the context therefore reaches the picker
  with no second list to maintain. The picker is a suggestion list, not a
  permission gate, and the CEL arm still reaches every registered variable.

  On a subprocess step whose child resolved, the picker adds `child.outcome`
  (the contract's `outcomes`) and `child.data.<key>` over `contract.outputFields`
  **alone**, matching what `contractFieldSchema` types at `check.ts:316`. Both
  condition sites get them, since `validateProcessBody` pushes guards and view
  overrides with the same `child = s.type === "subprocess"` flag
  (`check.ts:198`, `:222-224`).

  Browser testing found two state rules the plan missed. First, builder state
  re-seeds when the **operand signature** changes, not only when `src` does
  (`operandSignature`, path plus CEL type, deliberately not label). A child
  resolving mid-session leaves every guard's text untouched while turning
  `child.outcome == "approved"` from a raw row into a comparison row. Keying on
  `src` alone left it raw for the rest of the session.

  Second, `BooleanOrExpressionInput` now remembers the chosen arm instead of
  deriving it from the value (`overrideMode`). The builder writes `undefined`
  while its only row is incomplete. Reading that as "not an expression"
  collapsed the override to its checkbox on the author's first click. It took
  the row with it. Its `boolean`/`CEL` select stays the outer mode, and
  `ConditionInput` renders only the CEL arm. A view override therefore never
  shows two controls for one choice.

- Process Studio, the field validation editor
  (`packages/web/src/areas/studio/panels/shared/{fieldValidationLogic.ts,
  FieldValidationEditor.tsx}`, `studio-field-validation-form`). A collapsed
  section inside `FieldCatalogPanel`'s field row, offering the six keys
  `FieldValidation` declares: `min`, `max`, `minLength`, `maxLength`,
  `pattern` and `rule`. Previously only reachable through the JSON view.

  `offeredKeys` is a literal table over the field's declared type. It mirrors
  `checkConstraints` (`src/runtime/api.ts:503`). That function branches on the
  submitted value's JavaScript runtime type, not the declared one.

  `file` and a plugin (custom) type offer every key. `typeMatches`
  (`src/schema/definition.ts`) treats both as opaque. A key a hand-authored
  body carries outside its offered set stays visible and editable. The
  editor marks it as one the engine skips for that field type. It never
  drops it.

  `rule` uses its own row builder (`RuleBuilder`/`RuleInput`,
  `panels/shared/{ruleLogic,RuleBuilder,RuleInput}.ts(x)`,
  `studio-canvas-first-form-builder`), not the plain `ExpressionInput` and
  not `ConditionBuilder` reused. See that change's own entry below for the
  builder's own shape. The `pattern` control adds no check of its own. It
  reads this field's own `pattern` entries straight from the draft's own
  `validation.issues`. That is the same array `IssueList` already shows for
  the field. `compile.ts::checkPatterns` computes them once, never a second
  way.

  Clearing a key's control removes it. Clearing the last one patches
  `validation: undefined` rather than `{}`, since `definitionHash` (the JCS
  hash of the body) hashes those two shapes differently.

<!-- antislop: allow sentence-length -->
<!-- Why: a citation line naming several file paths and specs reads as one
     long "sentence" by word count, the same shape every other entry in
     this file's citation line takes. Splitting it would break the file's
     own `- Heading (paths, specs)` convention. -->
- Process Studio, the form editor
  (`packages/web/src/areas/studio/{screens/FormEditorScreen.tsx,
  draft/mintField.ts,panels/shared/{ruleLogic,RuleBuilder,RuleInput}.ts(x)}`,
  `studio-form-editor`, `studio-field-validation-form`, `studio-canvas`,
  `studio-canvas-first-form-builder`).

  The editor moved from a native `<dialog>` (`FormEditorDialog.tsx`,
  deleted) to a full-screen page. It is a `formStepId` sub-state of the
  existing `edit` route. It is not a new top-level route.
  `routing.ts`'s `edit` variant gains an optional `formStepId`. It
  matches `/processes/:id/edit/form/:stepId`. `EditorArea` branches on
  it. It renders `FormEditorScreen` in place of the canvas and
  inspector. Both sit inside the same mounted `DraftProvider`.

  A navigation away and back shows the same draft state a re-opened
  modal would have. The Draft never unmounts. `StepsPanel`'s view entry
  navigates there now. It no longer opens local dialog state. It carries
  no `aria-haspopup` any more. It is a navigation target now, not a
  disclosure or a dialog trigger.

  The palette gained a second section: "add a field to the process," by
  type. `draft/mintField.ts`'s `PALETTE_FIELD_KINDS` names five: text,
  choice, date, file, section. A drop mints a catalog field
  (`mintCatalogField`). It places that field on the view. Both happen in
  one `mutate()` call.

  A mid-mutation reader never sees one change without the other. A mint
  entry draws with a dashed border. That reuses the canvas card's own
  "not there yet" vocabulary (`.studio-form-card[data-conditional]`). It
  borrows no new color.

  `field.validation.rule`'s row builder (`RuleBuilder`/`RuleInput`,
  `panels/shared/ruleLogic.ts`) is a new component, not `ConditionBuilder`
  reused. It shares `ConditionBuilder`'s parse-back approach.
  `conditionLogic.ts` exports its AST-walk internals for that reuse:
  `CelNode`, `isCelNode`, `memberPath`, `literalOf`, `conjuncts`, `CMP_OPS`,
  `fieldOperand`. The CEL node type carries the `Cel` prefix because
  `packages/web` compiles with `"DOM"` in `lib`, so a bare `Node` shadows
  the global one in every consumer.

  A row's default operand is "this answer." That compiles to
  `data.<the field's own key>`. It is sugar, not a new CEL binding.
  `mergedData` already carries the field's own submitted value. That
  happens before `checkConstraints` runs.

  A row may compare against a literal, or another catalog field. The
  field picker filters to a matching `celType` (`fieldValueOperandsFor`).
  That reopens stage 27b's deferred field-against-field comparison,
  scoped to `validation.rule` alone. `ConditionBuilder` and its own two
  sites, path guards and view overrides, keep literal-only comparison.

  Rows join by "and" only, never "or." A "Developer view" disclosure
  holds the raw CEL text. It covers a fragment the builder cannot
  represent. It also covers an author who wants to write CEL directly.

  Two existing escape hatches also moved behind a collapsed-by-default
  "Developer view" `<details>`. One is the view-override strip's CEL
  fallback for `visible`/`required`/`readonly`. A plain checkbox stays
  outside it, always reachable. The other is the field-catalog panel's
  JSON textarea for a custom field type's plugin envelope.
- Process Studio — JSON view (`packages/web/src/areas/studio/panels/{JsonView,
  draftJsonLogic}.ts(x)`, `src/draft/load-guard.ts`, `screens/EditScreen.tsx`,
  `studio-json-view`): stage 11's third of five changes, entirely
  client-side — no engine, route or schema change. Adds the third of the edit
  screen's three surfaces alongside Canvas and Panels, switched by a
  `role="tablist"` Structure/JSON toggle in `EditorArea` (a `surface`
  `useState`, not a route). The two are **fully mutually exclusive**: every
  draft-body-mutating component (`ProcessHeader`, `FieldCatalogPanel`,
  `DataSourcesPanel`, `ContractPanel`, the canvas and everything nested under
  it) is grouped under "Structure" and unmounted while JSON is shown, so a
  stale textarea can never silently clobber a panel edit made while it was
  open — tightened during review, the change's first draft toggled only
  Canvas + `StepsPanel`. `DraftToolbar`, the registry selector and the
  content-locale switcher stay mounted on both surfaces, since none of them
  mutates the draft body. `JsonView` seeds its local `text` from the current
  draft **once, on mount** — no resync effect, and switching away unmounts it
  so switching back always remounts fresh — and writes only on an explicit
  Apply, through `parseDraftText` (`panels/draftJsonLogic.ts`, mirroring
  `screens/migrationPlanLogic.ts`'s parse/format shape): `JSON.parse`, then
  `checkDraftShape`, the editor's file-based Load guard ported verbatim to
  `packages/web/src/areas/studio/draft/load-guard.ts` rather than reimplemented more
  weakly — a `Draft` has no remote gate the way a `MigrationSpec` does
  (`replace()` writes straight into the client state every panel
  destructures), so the shape check has to happen here. A parse or shape
  failure leaves the draft untouched and shows the located issues inline;
  empty/whitespace text is a valid empty draft (`{}`), matching
  `parseSpecText`'s convention. Apply reuses the Draft model's existing
  `replace()` path — the one Load/Import already used — not a new mutation
  surface. `test/draftJsonLogic.test.ts` and `test/load-guard.test.ts` cover
  the pure modules; the textarea/toggle wiring is untested, per this repo's
  existing convention. Tools and Player, stage 11's last piece, are DONE — see
  the "Process Studio — tools and Player" entry below.
- Process Studio — tools and Player (`src/cel/check.ts`, `src/runtime/api.ts`,
  `src/http/routes.ts`, `src/http/studio-routes.ts`, `src/http/server.ts`,
  `packages/web/src/areas/studio/screens/{ToolsScreen,PlayerScreen}.tsx`,
  `packages/web/src/areas/studio/screens/{toolsScratchpadLogic,playerLogic}.ts`,
  `packages/web/src/areas/studio/api/{client,types}.ts`, `studio-tools-and-player`):
  stage 11's fifth and last change. Closes the stage's remaining gap and
  deletes `packages/editor` outright — every capability it alone provided
  is retired (no replacement); every capability it shared with
  the studio area already had an independent copy there.

  Adds two screens. The **Tools** screen (`/tools`) shows the running
  server's registered plugin type names: action-handler types,
  data-source types and assignment-strategy types. No `configSchema`
  internals, no config values, via a new `GET /registry` route
  (`DEVELOPER_ROLE`-gated, unprefixed like the other studio-only routes).
  That route's response widened (roadmap #27a): a config-schema
  description per type, for the plugin config form. The Tools screen
  itself still renders only the type names.
  The other screen is a static CEL scratchpad: an expression
  checked against a chosen field catalog (a published version, fetched via
  the existing version-body route, or the current draft), parsed and
  type-checked client-side through a new `workflow-engine/cel/check` export,
  `checkAgainstFields`. That export needed a small refactor first:
  `buildEnv` took a whole `ProcessBody` when it only ever read `.fields`, so
  it now takes `fields: FieldDef[]` directly, letting the scratchpad build an
  environment from a stand-alone catalog instead of a full body.

  The **Player** screen (`/processes/:processId/play`) drives a real
  instance through the Runtime API Layer (create, view, submit, claim,
  release), reusing `packages/form-ui` for step forms, and shows the
  instance's merged transition/event record beside it. This is not a
  file-for-file port of `packages/editor`'s Player, which had its own
  standalone server-URL-plus-login connection — a leftover from before
  Studio had any shared session at all. Studio already has one shared,
  logged-in session for everything else, so the app area's
  `TaskScreen`/`api/client.ts` — which already calls the same routes over
  that same shared-session model — served as the template instead:
  `packages/web/src/areas/studio/api/client.ts` gained `createInstance`,
  `getInstanceView`, `submitPath`, `claimStep`, `releaseClaim`, and
  `getInstanceRecord`, reusing the package's existing `request()`/
  `StudioClientError`, and `form-ui` became a new dependency of
  the studio area (it had none before Player existed) — including the
  `form-ui/form-ui.css` import at the Player's own entry point that
  `packages/editor`'s Player never had, leaving its forms unstyled; Studio's
  Player closes that gap rather than reproducing it.

  Showing the merged record beside Player needed an authorization change,
  not just a new route: `getInstanceRecord` (`src/runtime/api.ts`) gained an
  `actor` parameter and a second, additive access path mirroring
  `cancelInstance`'s existing starter bypass for `system:cancel-any` —
  `ADMIN_ROLE` tried first (no instance load needed, this query never joins
  on `instances`), and on `AuthorizationError` a fallback that loads the
  instance and permits the read only when the actor holds `DEVELOPER_ROLE`
  and `instance.startedBy` matches, collapsing "doesn't exist" and "not
  mine" into the same opaque `AuthorizationError`. `handleInstanceRecord`
  (`src/http/routes.ts`) dropped its own unconditional `requireRole(actor,
  ADMIN_ROLE)` and passes the resolved actor through instead. Strictly
  additive: an `ADMIN_ROLE` caller sees no change, and a plain participant
  with neither role still gets `403` even for an instance they started,
  unchanged.

  Verified end-to-end in a real browser (`playwright-cli`, not just
  `bun:test`): logged in as a `system:developer` test user, authored and
  published a process through Studio's own JSON view, drove the CEL
  scratchpad against a valid and an invalid expression, and drove Player
  through create → submit → completed, confirming the merged record
  renders and the new developer-record-read authorization holds against a
  live server.

  `packages/editor` (`src/`, `test/`, config, Playwright setup) is deleted.
  Twelve capability specs that described only its internals are retired
  with no replacement (superseded by an existing studio-area
  capability, or a pure engineering-hygiene constraint with no subject left
  once the package is gone). The devcontainer's `postCreateCommand` no
  longer installs Playwright — `packages/editor/test/graph-view-rendering.test.tsx`
  was the only consumer (`mermaid-isomorphic` needing a real headless
  Chromium for `SVGTextElement.getBBox()`), and `studio-canvas`'s own SVG
  rendering is deliberately untested per this repo's existing convention, so
  no remaining package needs it.
<!-- antislop: allow sentence-length run-ons -->
- Authorize the instance-read and assignment-less submit paths
  (`src/runtime/api.ts`, `authorize-instance-access`): closes the gap left by
  `admin-shell-and-ops`, which gated the instance **list** (`scope=all`,
  `GET /instances/:id/record`) but left the stronger single-instance read,
  `GET /instances/:id`, open to any authenticated caller holding the id.
  `getInstanceView` now authorizes `actor` against the loaded instance before
  resolving anything: `ADMIN_ROLE`, `instance.startedBy`, the current step's
  claimant, or an eligible candidate on the current step's assignment
  (`isEligibleCandidate`, imported from `engine/transition.ts` — the same
  predicate `claimStep` uses, so the read and claim predicates cannot drift).
  Access follows the *current* step, not history: a candidate on a step the
  instance has since left loses the read once it advances, mirroring
  `scope=mine`. Load-failure handling mirrors `cancelInstance`'s existing
  two-path shape: an `ADMIN_ROLE` caller loads directly, so a missing
  instance (or any other load failure, e.g. a pin mismatch) still surfaces as
  today's plain not-found/500; every other caller loads inside a `try` whose
  `catch` collapses into `AuthorizationError`, so a nonexistent instance and
  one the caller has no relationship to are indistinguishable (403,
  `type: "authorization"`) — this also means a non-admin caller no longer
  sees the raw 500 a corrupted pin previously produced; that fault now reads
  as 403 too. No HTTP-layer change: `handleGetInstanceView` already resolved
  the actor and passed it through, and `AuthorizationError` was already
  mapped to 403. **BREAKING** for any caller reading an instance it has no
  relationship to; the remedy is the same as `admin-shell-and-ops`'s —
  grant `system:admin` via `cli.ts set-roles`.

  `submitAndTransition` gained a floor for the assignment-less case:
  previously a step with no declared `Step.assignment` accepted a submission
  from any authenticated actor (`if (instance.assignment) { ... }` had no
  `else`). Now, when the current step declares no assignment, the actor must
  be `instance.startedBy` or carry `ADMIN_ROLE`, or the call throws
  `AuthorizationError` before any field validation runs — the same floor as
  the read side, deliberately weaker than the claimant rule since starter and
  operator are the only relationships an assignment-less step defines. A step
  that needs open-to-many submission should declare an `assignment` with a
  candidate list instead of relying on the previously-unenforced omission.

<!-- antislop: allow sentence-length -->
- Schema bootstrap and two missing indexes (`src/engine/store.ts`,
  `src/http/server.ts`, `src/auth/cli.ts`,
  `fix-schema-bootstrap-and-indexes`): `startHttpServer` now awaits
  `initSchema(db)` before `Bun.serve` starts accepting requests, and is now
  `async`. `bun run serve` against an empty Postgres now works, with no
  separate setup step. `src/auth/cli.ts` calls `initSchema()` the same way
  before dispatching a command. `add-user` now works against a fresh
  database too. The shared client is a `Proxy` that constructs the real
  client and throws, naming `DATABASE_URL`, on first use rather than at
  module load — module-scope imports of `sql`/`initSchema` stay safe without
  the variable set, which ~30 test files rely on. `initSchema` gained two
  indexes beside their siblings. `history_entries_instance_idx
  (instance_id, transition_seq)` mirrors the index `instance_events`
  already had; `outbox.ts::appendOutcome` and `api.ts::getInstanceRecord`
  read it. `instances_parent_idx ((body->'parent'->>'instanceId'))` is a
  B-tree expression index; `transition.ts::sweepCancelledChildren` and
  `migration.ts::migrateOne` read it. Both close a sequential-scan gap the
  function's other jsonb-nested predicates already had an index for.

- CI, local (`.githooks/pre-push`, `add-ci-and-dependency-hygiene`): a
  `pre-push` hook, which runs `bun run check` (typecheck, then the
  production build, then `bun test`) through `docker compose exec` in the
  dev container. A non-zero exit blocks the push. Running there closes
  the finding's real hazard: the container's environment already carries
  `DATABASE_URL`. So the 500+ database-backed test sites that make up
  most of the suite cannot skip silently and report a meaningless green.
  It also pins Bun to the Dockerfile's version, so no host-side drift.

- CI, hosted (`.github/workflows/check.yml`, `add-ci-workflow`): the same
  host gates, and the same `bun run check`, now also run on GitHub's own
  infrastructure. It runs on every push and every pull request. This
  reverses a decision the local gate above once recorded, on purpose.
  GitHub-hosted runners are free for a public repository.

- A self-hosted alternative, tried first in the same change, needed a
  runner and a persistent service. It also needed the organization to
  unblock a setting. GitHub-hosted needed none of that.

- `changed-markdown-prose` (`prose.sh`) skips on the hosted runner. A
  fresh VM carries no antislop install. That matches the fallback a
  contributor's own machine already gets without one.

- One gap the local hook alone has: `--no-verify` bypasses it. The hosted
  workflow does not depend on the hook running. A push still reaches it,
  even past `--no-verify`.

- The clone arms itself (`scripts/enable-hooks.sh`, `package.json`'s
  `prepare`, `document-deployment-and-self-enable-the-hook`). `bun install`
  points `core.hooksPath` at `.githooks`, so nobody types that `git config`
  line. That value covers the directory, so it arms `post-commit` beside
  `pre-push`. The same run arms an SSH keepalive on `core.sshCommand`
  (`self-enable-the-push-keepalive`). The connection to the remote then
  outlives the hook's own runtime, instead of dying mid-push.

- The script asks `git rev-parse --git-dir`, never `[ -d .git ]`. In a
  linked worktree `.git` is a file. This repository works in worktrees. Two
  other shapes exit 0: no repository, and no `git` on the path. So the
  install inside `docker/engine.Dockerfile` stays green. Three tests in
  `test/enable-hooks.test.ts` drive all three shapes.

- `.dockerignore` excludes by pattern shape, not by path
  (`fix-the-frontend-image-build-context`). Docker anchors a pattern with no
  slash and no `**` to the context root. A bare `node_modules` line therefore
  excluded the root `node_modules` only. `bun install` writes one into every
  workspace member too. BuildKit follows the symlinks those hold and reaches
  a target the root-only filter had already removed. Both
  `docker/engine.Dockerfile` and `docker/frontend.Dockerfile` failed on it,
  since both `COPY . .` the whole context.

- The recursive form now covers every depth: `**/node_modules`, `**/dist`,
  `**/.git`, `**/test` and `**/.env`. `.claude` and `.worktrees` join it as
  root-only entries. Each holds a full source copy per running agent. Keeping
  them made a context vary by machine, not by commit. On this working tree
  the context transferred fell from 838 MB, aborted mid-transfer, to 255 kB.
  A new test, `test/dockerignore.test.ts`, rejects a bare entry for any name
  that recurs in the tree. The same defect then fails `bun run check` before
  it reaches a build.

- Deployment configuration has one home (`docs/runbooks/deployment.md`, same
  change). It tables the twenty variables `src/` reads. Two more rows cover
  the `VITE_API_URL` build argument and the seed script's `SEED_ALLOW`. Each
  row gives the meaning, whether a deployment must set it, and the default.
  It marks an unsafe default and says what to set instead.

- The runbook also carries the proxy rule behind `TRUST_PROXY`, and the
  `bun audit` cadence. Two commands stay in `README.md`, the ones that build
  and run the images. It points at the runbook for the rest. So a change that
  adds a variable edits one file.
<!-- antislop: allow sentence-length -->
- Dependency-manifest fixes ride along in the same change. `zod` now lives in
  the root's `dependencies`, not `devDependencies` as before. Six modules
  under `src/` import it as a value, and the public schema export reaches
  it. `packages/web` declares it as a dependency of its own.
  `packages/form-ui` declares it as a peer dependency, matching how it
  already declares react. `@marcbachmann/cel-js` now pins an exact version
  instead of a caret range — see the one-CEL-library rule in
  `.claude/rules/process-contract.md` for why.

<!-- antislop: allow sentence-length -->
- Correct the HTTP boundary's error responses (`src/errors.ts`,
  `src/http/errors.ts`, `src/runtime/api.ts`, `src/pagination.ts`,
  `src/engine/admin-queries.ts`, `src/http/{routes,admin-routes,studio-routes}.ts`,
  `correct-api-error-responses`): closes four gaps at the boundary between a
  client mistake and an engine fault.

  The 500 fallback in `mapError` no longer reflects `err.message`. Its final
  branch now returns `{ error: { type: "internal" } }` with no `message` —
  the shape `ConcurrencyConflict` already used. That branch also logs the
  error server-side: its message, its stack, and the request's method and
  path, via `console.error`. An unrecognized throw is a `Bun.sql` error
  naming relations, columns or constraints, or a plugin handler's own throw.
  It stops leaking to the client. It starts leaving a server-side trace
  instead.

  Three route files thread their `req`'s method and path into
  `mapError`: `routes.ts`, `admin-routes.ts`, and `studio-routes.ts`. Each
  does it through its own (still-duplicated) `guarded` wrapper.

  Two new typed errors live in `src/errors.ts`. That leaf module is already
  home to `RequestShapeError`, for the same import-cycle reason. They carve
  out the two conditions that still need their own answer.

  `NotFoundError` replaces the Runtime API Layer's eight untyped not-found
  `Error` throws. Those are `api.ts`'s "instance not found", "no published
  body", and "no published version" sites. `NotFoundError` still maps to
  500 *with* a message. That behavior stays the same. It now pins the
  engine's intent, not the absence of a mapping.

  Four sites stay deliberately untyped. They go message-free under the
  fallback. Two are `toSummary`'s and `findStep`'s "current step not in
  body" — a structural mismatch, not a not-found condition. The other two
  are the "should never happen" data-source-registry lookups.

  Not-found stays 500, not 404. That choice is deliberate. This change's
  design.md records it as an open question, not a decision made here.

  `InstanceNotRunningError` (409, `instance-not-running`) carries the
  instance id and its observed status. It closes a silent-success gap.
  `submitAndTransition`, `claimStep` and `releaseClaim` used to reach a
  non-running no-op in their own engine functions. Both
  `commitManualTransition` and `updateAssignment` correctly keep that
  no-op, for internal idempotent re-entry. One example: a timer firing
  against an instance a cascade already completed.

  But those three wrappers used to hand back the untouched instance as an
  ordinary 200. A submission against a `cancelled`/`completed`/`faulted`
  instance used to discard its data forever, silently. In a race to leave
  a step, the response used to tell the loser it won.

  `submitAndTransition` now checks `instance.status` itself. It checks
  right after its own locked read. It checks before the claim check, and
  before any validation.

  But `claimStep`/`releaseClaim` are thin delegations with no locked read
  of their own. They instead detect the engine's no-op *after* the fact:
  claiming and releasing never change `status`. A returned instance whose
  status isn't `running` can only mean the no-op fired. It fired against
  the row the engine's own row lock read. The check is exact, not a second
  unlocked check racing it.

  `test/runtime-api.test.ts`'s two-concurrent-submissions test changed too.
  It used to assert both fulfilled. It now asserts one fulfilled, one
  `InstanceNotRunningError` — the prior assertion *was* the defect.

  Both previously-cast request bodies are now parsed. Now
  `handleCreateInstance` and `handleSubmit` run their `req.json()` result
  through a `zod` schema. The schemas are `{ version?: positive int, data?:
  record }` and `{ pathId: string, data: record, default {} }`,
  respectively, both via a shared `parseJsonBody` helper.

  That helper raises `RequestShapeError` (400) for invalid JSON. It also
  raises it for a shape mismatch. It never lets a bare `ZodError` through.
  `mapError` maps that to 422, the field-validation status, not this one.
  `data` stays deliberately loose (`z.record(z.unknown())`). Field-level
  validation is `validateSubmissionData`'s job, not the transport edge's.

  `api.ts` and `admin-queries.ts` used to duplicate `decodeCursor`/
  `encodeCursor` verbatim (`PONYTAIL-AUDIT.md` finding 9). Both now import
  them from the new `src/pagination.ts`. Now `decodeCursor` takes an
  `arity` parameter. Listing cursors are 2-tuples; `getInstanceRecord`'s is a
  3-tuple. It wraps the base64url-decode-then-`JSON.parse` step in a `try`.
  It then checks the result is an array of exactly `arity` strings, raising
  `RequestShapeError` otherwise.

  Validation stays shallow on purpose. A cursor's *values* can be stale, or
  point past the end of a result set. That is still a legitimate empty
  page, not an error. Only a cursor that could not have come from
  `encodeCursor` gets rejected.

- Seeding a draft from a published version (`seed-draft-from-published`,
  `packages/web/src/areas/studio/screens/processListLogic.ts`,
  `src/schema/strip-compiled.ts`, `src/schema/canonical-json.ts`,
  `src/engine/drafts.ts`): "Create draft" on a published row used to write
  `{ body: {}, layout: {}, revision: 0 }`, the same call `+ New process`
  makes. An author who wanted to change v1 landed on a blank canvas.

  The function `seededDraftInput(seedVersion, readBody)` now decides the
  body. Without a seed version it stays empty, the new-process case. With
  one it reads `GET /processes/:id/versions/:v` and strips the result.

  The strip exists because that route answers with the **compiled** body,
  and a draft holds the authored shape. The function `stripCompiledContent`
  (`src/schema/strip-compiled.ts`, in the package's `exports` map) inverts
  what `compileProcessBody` adds past its parse. That is the reserved
  cancel-sink step, plus the reserved cancel outcome on a contracted
  process. It sits beside `compile.ts`, so a reader meets the injection and
  its inverse together. The suite `test/strip-compiled.test.ts` round-trips
  every definition in `examples/`, so a further injection fails loudly.

  Seeding the compiled body instead would have flagged every seeded draft in
  `draft/validation.ts`, which parses through `authoredProcessBody`. It
  would also have let an author edit an engine-owned step into an
  unpublishable body.

  The write declares its origin. Both `saveDraft` and
  `PUT /drafts/:processId` take an optional `baseVersion`, checked against
  `definitions` on the write path. An omitted one leaves the stored column
  alone. An editing save therefore does not clear what a seed or a publish
  stamped.
  Without it a seeded draft carried no base, and the only
  draft-versus-version comparison in `VersionsScreen` stayed disabled.

  That comparison then had to agree with `definitionHash`. The function
  `canonicalize` moved out of `hash.ts` into `src/schema/canonical-json.ts`
  and into the `exports` map, since `hash.ts` imports `node:crypto` and
  cannot serve a browser bundle.

  Leaves in `diffJson` compare with it, so key order stops reading as a
  change. A draft read back from a `jsonb`
  column arrives in Postgres's normalized order, a published body in the
  read schema's order. Every array of objects used to read as changed.
  The call `diffAgainstBase` strips the base for the same reason the seed
  does. An unmodified seeded draft now diffs as "No differences", which
  agrees with publishing it returning the version it came from.

- The suite's own database (`bunfig.toml`, `test/preload-db.ts`,
  `make-db-suites-deterministic`): a `bun test` run used to share the
  devcontainer's one Postgres database with `bun run serve`, `bun run seed`
  and any browser session. That sharing was not benign.

  `src/http/server.ts:526` starts four background pollers through
  `startEngine` (`src/engine/host.ts:87`). One of them claims outbox rows
  every 500 ms. Another resolves parked instances, a third fires timers. A dev
  server left running therefore drove the same tables a test run drove. It
  took rows the suite was about to claim.

  Measured on one unchanged tree, twenty runs each: three red runs with a dev
  server up, zero with none. The runs yielded four captured assertions. Three
  of them read a state that had not advanced (`"running"` where the test expected
  `"cancelled"` or `"completed"`, `1` where it expected `2`). The fourth,
  `test/outbox.test.ts:745`, asserts over fully awaited `UPDATE` statements on
  instance-scoped rows after a `TRUNCATE`. Nothing inside that test can race
  it, which is what settled the diagnosis.

  A `[test] preload` in `bunfig.toml` now derives `<name>_test` from
  `DATABASE_URL`, creates it on demand, and prints the name it chose before
  the first suite. A preload rather than a wrapper script, so it applies to
  every `bun test` invocation and not only to `bun run test`. An unset
  `DATABASE_URL` stays unset, so the `test.skipIf(!DB)` suites keep skipping
  instead of failing on a derived name.

  The split holds in both directions. Demo state now survives a test run,
  which closes the older hazard recorded in CLAUDE.md. No existing engine or
  test file changed. The two new files under `test/` are the preload and its
  own suite: the failures were never in the suite.

- Observability (`src/log.ts`, `src/http/metrics.ts`, `add-observability`,
  roadmap #15): a structured-logging convention and a `GET /metrics`
  endpoint. Before this, an operator could see outbox backlog, timer lag,
  and faulted-instance rate only by hand. The admin area's Operations
  screens (roadmap #10) were the only way.

  `log.info`/`log.warn`/`log.error` each emit one JSON line
  (`{ts, level, msg, ...context}`) to stdout (`info`/`warn`) or stderr
  (`error`). A process-wide `LOG_LEVEL` threshold gates emission (`debug` <
  `info` < `warn` < `error`, default `info`), read once at module load. No
  dependency: the shape is a few lines, the repo's existing convention for
  something that size. Three existing `console.*` sites now convert:
  `errors.ts::mapError`'s unhandled-error fallback, `server.ts`'s startup
  banner, and its dev-resolver warning. Three new sites land at points an
  operator previously had to find by hand: `outbox.ts::drainOutbox`'s
  dead-letter branch, `transition.ts::markFaulted`, and
  `migration.ts::appendSkip`.

- Worker error boundaries (`src/engine/poll.ts`, `surface-worker-failures`):
  the four background workers discard no error without a line. Before this,
  every catch in that path was empty. A worker that failed on every tick
  produced no line and no metric. The only symptom was work that did not
  happen. The 2026-08-01 code review records it as ERR-1.

  Each worker has two boundaries. They behave differently. `pollForever` holds
  the tick boundary. It takes the worker name as its first argument
  (`pollForever(name, tick, intervalMs)`). That parameter takes no default, so
  the compiler finds all four call sites. The line reads `worker tick failed`.

  The four call sites pass `"outbox"`, `"resolution"`, `"timers"` and
  `"retention"`.

  The per-item boundary is the one that needed the work. Every drain holds one
  inside its loop: `outbox.ts:338`, `resolution.ts:107`, `timers.ts:84`,
  `retention.ts:72`. It catches inside the loop, so the drain returns normally
  and the tick never throws. The tick line does not cover this case at all.

  All four now call the shared `poll.ts::logSkippedItem`. It writes `worker
  skipped a failing item` with the worker name, the item's identifier and the
  error message. The identifier is an idempotency key for the outbox, an
  instance id elsewhere. One function, so the four cannot drift.

  No outcome changed. The outbox and resolution rows still stay claimed for
  lease reclaim. The timer row still leaves the scan. The retention sweep
  still steps to the next instance.

  One case logs below error level. A `ConcurrencyConflict` is what the OCC
  predicate produces when two workers reach one instance together, so it logs
  at debug. An error line per race would teach an operator to ignore the
  level.

  `GET /metrics` (`src/http/metrics.ts::handleMetrics`) returns Prometheus
  text-exposition format, computed fresh from the database on every
  scrape. That is the same no-in-process-aggregation principle
  `/readyz`'s DB ping already uses. It keeps the endpoint correct across
  multiple independently scraped server instances.

  Three gauges. `workflow_outbox_backlog{status}` reuses
  `countOutboxByStatus` unchanged. `workflow_timer_overdue_count` and
  `workflow_timer_lag_seconds` come from a new `getTimerLagStats`. It
  mirrors `listPendingTimers`'s running-instances filter, so it stays
  backed by `instances_timer_idx`. `workflow_instances_faulted` comes
  from a new, general-shaped `countInstancesByStatus`. No functional
  index covers its `GROUP BY`, so it scans the whole `instances` table on
  every call. Acceptable at today's scale; see the change's design.md
  Risks section.

  `server.ts` registers the branch alongside `/livez`/`/readyz`, ahead of
  every auth-dependent route, but behind `METRICS_TOKEN`
  (`harden-http-response-boundary`). Unset or empty leaves the branch
  unregistered. A default deployment then answers a scrape with the
  ordinary unmatched-path response.

  Set, the branch requires that value as a bearer token.
  `timingSafeEqual` compares the two. A length check precedes it, so a
  wrong-length token gets a 401 and not a `RangeError`. A missing or
  mismatched token runs no query. That token names no actor. A scraper
  carries no identity, and `system:admin` would put a full-permission
  credential in a scrape config.

  Returns `HttpBinaryResult`, not `HttpResult`. `server.ts`'s shared
  `toResponse` always `JSON.stringify`s an `HttpResult` body. That would
  corrupt exposition text, so `/metrics` reuses the same non-JSON
  response type attachment download already established. On a query
  failure the handler never throws. It reports 503 with an empty body
  instead, the same signal `/readyz` gives a failed DB ping. That beats a
  crash, and it beats a false all-zero 200 that would read as "healthy,
  nothing overdue".

<!-- antislop: allow sentence-length run-ons passive-voice -->
- Environment promotion (`packages/web/src/areas/studio/screens/promotionExportLogic.ts`,
  `promotionImportLogic.ts`, `add-environment-promotion`, roadmap #18): moves a
  published definition between environments as a file. Studio-only. No engine
  change, no new route, no schema change, no new dependency.

  The Versions screen exports one published version as
  `{processId, version, definitionHash, body}`, downloaded through `Blob` plus
  `URL.createObjectURL`. The process list imports such a file with a native
  `<input type="file">` and `FileReader`, shows a `<dialog>` preview, and
  publishes on confirm through the new
  `api/client.ts::publishProcess` and the unchanged `POST /processes`.

  `body` is the COMPILED body, exported and re-published verbatim. This is the
  load-bearing detail. `publishBody` always calls `compileProcessBody`. That
  pass returns an already-compiled body unchanged. The target therefore
  recomputes the source's own `definitionHash`, and a contracted child keeps
  its `contractRef`. `processListLogic.ts::seededDraftInput`, one function above
  the import action, does the opposite: a draft must be authored-shape, since
  the panels and `authoredProcessBody` both reject the injected cancel sink.
  The export module names that asymmetry in a `ponytail:` comment, because
  stripping here would still reach the same hash and so would fail no test.

  Import republishes under the source's exact `processId` and rewrites no
  reference, so a subprocess reference stays valid once its child is promoted.
  Order is manual and child-first, the order `scripts/seed.ts` already uses. A
  parent promoted first fails the unchanged `validateCrossProcess`.

  The preview warns when a DIFFERENT process in the target already publishes
  under the incoming `key`. Nothing enforces key uniqueness: `definitions` is
  keyed `(process_id, version)` and `key` lives in the jsonb body. Two
  processes can therefore share one key, and nothing deletes a published
  process. The warning never blocks, and reads the process list the screen
  already loaded, so it costs no request and compares against no remote
  environment.

  This change also taught Studio's client the six publish-time rejections.
  `src/http/errors.ts` maps registry, CEL, duration, compile, schema and
  cross-process errors to 422 with located detail, but
  `client.ts::parseErrorBody` handled none of them. All six fell through into
  `internal` and reached the developer as "The server hit an error. Try
  again.". Two new `ClientError` variants carry them now:
  `publish-validation` (the normalized `{loc, message}` issues five of them
  raise) and `cross-process-validation` (the sixth's message).
  `errors.ts::describeError` shows both. That is the one place it reads server
  text. These strings come from the publish chain's own validators, and they
  name a location in a body the reading developer supplied. The existing
  Publish action hit the identical wall and gains the same detail.

  A refused publish renders INSIDE the dialog, which stays open. `showModal()`
  puts the dialog in the browser's top layer. The browser dims everything on
  the screen behind it and takes it out of reach.

- `src/engine/reporting.ts`: the process-owner read surface — cycle time,
  per-step bottlenecks and SLA adherence for ONE process over a date range.
  Read-only; nothing here writes. Row selection runs in SQL (the in-range
  instances of one process, then their history entries), aggregation in
  TypeScript: a SQL window function over `history_entries` cannot see the
  initial step, since creation writes no HistoryEntry, so the walk would still
  need a per-version lookup grafted on in application code.

  The shared primitive is a per-instance timeline of `(stepId, enteredAt)`:
  the initial step at `startedAt`, then every `HistoryEntry.toStepId` at its
  `at` in `transitionSeq` order. Consecutive pairs yield traversals; the last
  entry yields none, and no duration is estimated against the wall clock.
  Traversals aggregate by step `id` across every published version.

  Three engine facts shape the walk. Each was confirmed against the code
  rather than assumed.

  `migrateOne` calls `planStepEntry` unconditionally. An instance migrated in
  place therefore gains a `HistoryEntry` whose `toStepId` is the step it
  already occupies. The walk drops that entry. The rule is scoped to the
  `migration` cause only: a self-loop path under `user`/`automatic`/`timer`
  re-arms the step's timers and is a real re-entry.

  `cancelInstance` writes a `HistoryEntry` to the cancel sink. The step held
  at cancellation therefore has a closing timestamp and yields a real
  traversal, which counts, since an abandoned wait is time spent. The sink
  itself yields none and appears in no view.

  `createInstance` sets `status: "completed"` when the initial step is
  terminal, and writes no HistoryEntry at all. Such an instance contributes
  no zero to the percentiles.

  Cycle-time reports p50/p90/p99 of total duration by nearest rank, plus the
  per-step average dwell. Both cover `completed` instances only. The response
  carries the sample size alongside, because a p99 over four instances must
  not read as authoritative.

  Bottleneck ranks by median dwell over every in-range instance whatever its
  status, and adds a date-unfiltered count of `running` instances parked in
  each step.

  SLA derives a per-step breach rate from BOTH forms in which the engine
  records a firing. A reminder timer writes a `timer.fired` event, matched to
  a traversal by equality on `transitionSeq` (an event carries the sequence in
  force and never advances it, so equality is exact and handles a revisited
  step). A transition timer writes no event at all: it writes a `HistoryEntry`
  with `cause: "timer"` whose `pathId` is the timer's `onFire.targetPath`.
  Recognising only the event form would report zero breaches over a full
  denominator, for exactly the steps whose SLA escalates.

  A step declaring no timer carries no threshold and is absent from the view.
  The view accepts no caller-supplied threshold. One breach per traversal,
  however many of the step's timers fired.

  `createDefinitionStore` is instantiated per call, so `resolveBody` is
  memoised for the request and nothing survives the response. An instance
  whose pinned version no longer resolves is counted into
  `skippedInstances` and reported, not swallowed.

- `src/http/reporting-routes.ts`: four `GET /reporting/*` routes — a process
  list (reusing `listProcesses` unchanged) and one per view. Kept out of
  `routes.ts` the same way `admin-routes.ts` and `studio-routes.ts` are. Every
  handler requires `REPORTS_ROLE` BEFORE resolving the process, so a caller
  without it gets 403 for a process id that does not exist and cannot probe
  which ids do. Both range bounds are required and must parse; an absent or
  malformed bound is 400, since the frontend always sends the range
  explicitly and the server keeps no default of its own.

- `src/auth/authorize.ts` gains `REPORTS_ROLE = "system:reports"`, the fifth
  reserved role. It implies nothing and nothing implies it. The seed script
  provisions one demo user per reserved role, now five;
  `test/seed-demo-users.test.ts` asserts the pairing, so a sixth role added
  without its demo user fails.

- Reporting (the reporting area of `packages/web`): the process owner's
  frontend. It arrived as the fourth SPA, same
  shape as the admin area (React 18, Vite 6, own build/typecheck, a
  hand-written History-API routing hook, `session.ts` under its own storage
  key), dev port 5176. It reaches the engine only over `/reporting/*` and
  `/auth/login`. It imports only the definition-contract types from
  `workflow-engine/schema`. It does not consume `packages/form-ui`, since it
  renders aggregated numbers and never a step form. Read-only: it presents no
  control that changes engine state.

  Its one visual device is `.rep-rule`, a hairline measuring rule whose fill
  length carries a quantity. All three views bind a different quantity to the
  same rule. Switching views therefore re-sorts and re-scales one picture
  rather than showing three unrelated ones. That is the honest picture, since
  cycle-time's per-step breakdown and bottleneck read the same traversals.
  Colour appears only in the SLA view, where it means breached, not large.
  No charting dependency. Every view states its own scope on screen, because
  the three deliberately differ. The pure view-model modules
  (`reportingLogic.ts`: duration formatting, the default range, the rule's
  scale, the ranking) carry the tests; components stay untested, per the
  existing convention.
- Unified shell (`packages/web`, `consolidate-frontend-shell`, roadmap #12
  steps 1-5): the four SPAs became one package. One `vite.config.ts`, one
  `index.html`, one `main.tsx`, one routing module, one session, one
  `LoginScreen`, one `ErrorBoundary`. `packages/app`, `packages/admin`,
  `packages/studio` and `packages/reporting` are deleted; `packages/form-ui`
  stays its own package, since both the app area and the studio area's Player
  import it.

  `src/shell/` owns what the four each owned a copy of. `session.ts` holds one
  key, `web.session`, carrying `{token, actorId, roles, expiresAt}`. The expiry
  is recorded and never consulted: `end-user-app` requires that the frontend
  run no client-side expiry check and treat a `401` as the sole end-of-session
  signal, so storing the value keeps that requirement intact. The four old keys
  are not read and not migrated. `areas.ts` is the one table of area to
  revealing role (app needs only a session, admin `system:admin`, studio
  `system:developer`, reporting `system:reports`), and it drives the switcher,
  the `/` redirect and the direct-hit guard alike, so they cannot disagree. The
  gate is display logic; the engine still answers 403.

  Routing is the load-bearing part. The shell splits the first path segment off
  as the area, hands only the remainder to that area's own `matchRoute`, and
  prepends the prefix to what that area's own `routePath` returns
  (`areaHref(area, "/")` is the bare prefix, never a trailing slash). Each
  area's pair therefore moved **verbatim**, minus its `login` case; ROADMAP.md
  item 12 had assumed all four would be rewritten, and Studio's
  `/studio/processes/:processId/migrate/:from/:to` needed no attention at all.
  `useAreaRoute(area, localPath, match, toPath, go)` binds an area's pair to
  the shell's one History-API hook.

  `src/api/` holds `API_BASE`, `AppClientError`, `parseErrorBody`, `request`,
  `login` and `errorText`, plus `ClientError`, `LoginResponse`, `Actor` and
  `PublishIssue`. `ClientError` is the union of **every** server error type,
  not a lowest common denominator: the four packages each mapped only the
  subset their own screens could provoke and collapsed the rest into
  `internal`, which is why they looked like one type wearing four names. A
  fetch that never reached the server is `network`, distinct from `internal`.
  Each area keeps its own describer with a `default` branch, and its own route
  functions and domain types, which stay per area because they are projections
  of different endpoints.

  `packages/web/test/boundaries.test.ts` enforces the one structural rule by
  scanning source: no file under `src/areas/<a>/` imports from
  `src/areas/<b>/`, and no class name is defined in two areas' stylesheets
  (measured before the merge: 153 classes, zero collisions, since each area
  already prefixes its own). Each area is a dynamic import, so the build emits
  one chunk per area and a participant loading `/app` never downloads the
  Studio canvas.

  One collision surfaced only against the real build: `/admin/outbox`,
  `/admin/timers` and `/admin/users` are each both an admin screen and a `GET`
  admin route, so `serve-web-assets`' "assets sit behind every API route" rule
  answered a reload of those three with `401` JSON. `src/http/server.ts` now
  offers a **navigation** request to the web root BEFORE route matching
  (`static.ts::isNavigationRequest`: `Sec-Fetch-Mode: navigate`, falling back to
  an `Accept` naming `text/html` when no `Sec-Fetch-*` is sent). A page's own
  `fetch` never carries that mode, so the area's request for `/admin/outbox`
  still reaches the admin route. An API caller that asks for HTML gets the
  shell; that is the deliberate cost.

  The engine serves the result from `WEB_ROOT`, whose default
  (`packages/web/dist`) stops being inert here. `docker/frontend.Dockerfile`
  survives as the nginx alternative, minus its `PACKAGE` build argument, since
  exactly one package now produces a bundle.

- Database-backed data lists (`src/engine/store.ts`, `src/engine/host.ts`,
  `src/engine/registry.ts`, `src/runtime/api.ts`, `src/http/admin-routes.ts`,
  `src/auth/authorize.ts`, the admin and studio areas of `packages/web`):
  a second data source type, `"db.list"`. Its option values live in two
  engine-owned tables instead of the process body. It closes the case
  `"static"` could not serve. That is a value list business staff own, where
  one changed entry cost a new published version plus a migration.

  `initSchema` creates `data_lists` (keyed by `list_key`) and
  `data_list_values` (keyed by `(list_key, value)`). The second references the
  first with `ON DELETE CASCADE`. Both sit outside the audit backbone. They
  hold configuration an operator changes, not a record of what an instance
  did, so no append-only rule applies.

  The declaration stays in the body. A `"db.list"` data source still carries
  `config: { listKey }`, and only the values move out. `definitionHash`
  therefore stays the same, and every published body stays valid. The
  table-shaped entry below added two optional keys to `definition.ts`. Neither
  moves a stored hash, because no body written before them declares one.

- Table-shaped data lists (`src/engine/host.ts`, `src/engine/store.ts`,
  `src/schema/definition.ts`, `src/schema/compile.ts`, `src/runtime/api.ts`,
  `src/engine/transition.ts`, `src/http/admin-routes.ts`,
  `packages/form-ui/src/FieldForm.tsx`, the admin area of `packages/web`):
  a data list row carries more than `value` and `label`.

  `data_lists` gains `columns jsonb NOT NULL DEFAULT '[]'`.
  `data_list_values` gains `attributes jsonb NOT NULL DEFAULT '{}'`. Both
  arrive through `ADD COLUMN IF NOT EXISTS` beside the create. An existing row
  therefore takes the empty case with no backfill.

  A column declares three things. `key` takes the field-key slug grammar.
  `label` is operator-facing text in one language. `type` is `string`, `number`
  or `boolean`. `MAX_DATA_LIST_COLUMNS` is 10.

  The declaration lives on the list, so making a list table-shaped needs no
  publish. `db.list`'s `configSchema` stays `{ listKey }` alone.

  `FieldOption` gains an optional `attributes` map of JSON scalars. A
  `"static"` source and an inline `options` array therefore carry them too.

  `db.list` builds that map by walking the list's `columns` declaration. It
  looks each key up in the stored object, never the reverse. Postgres
  normalizes a jsonb object's key order, so the stored order is not the
  operator's. An option of a list with no columns carries no `attributes` key
  at all.

  `parseJsonb` in `host.ts` normalizes what `Bun.sql` returns for a jsonb
  column. That is a parsed value for one written through an object parameter.
  It is raw text for one written through an explicit cast.

  `FieldDef` gains an optional `columnMapping`, column key to target `FieldId`.
  `compile.ts::checkColumnMapping` is the seventh structural write-path check.
  It requires a `dataSource` and a `select` type. It holds each key to the slug
  grammar and the length bound. It resolves every target in the recursive field
  set. It refuses a self-target, a group target, and two keys naming one
  target.

  It reads no data list. A key naming no declared column publishes, and writes
  nothing.

  `validateSubmissionData` now returns the `ResolvedViewField[]` it already
  built. `applyColumnMapping` walks that list. It carries the step's view
  order, not the request's own key order. The walk finds the picked option, and
  checks each mapped attribute against its target field's declared type.

  `submitAndTransition` and `createProcessInstance` call it after validation
  and before the commit. A guard on the outgoing path therefore reads a mapped
  value. At creation it runs before `resolveStepAssignment`, so a strategy on
  the initial step reads the final seed data.

  A mapped target takes the mapped value over a submitted one, and over the
  view's readonly and visibility rules. The list owns a mapped field.

  The engine drops a mismatching attribute rather than writing it, and the
  submission still succeeds. That is the rule `Action.output` already takes in
  the outbox.

  The drop records a `datasource.attribute-dropped` event, the twelfth
  `InstanceEvent` kind. Its payload is `{ fieldId, column, targetFieldId,
  reason }`. `commitManualTransition` and `executeManualTransition` gained one
  optional trailing `events` argument. It rides the `overrides.events` slot
  `assignment.unresolved` already uses, so the drop lands in the commit's own
  transaction.

  `FieldForm` folds an option's attribute values into its text, separated by
  `·`. It formats a number through the locale's own formatter, and a boolean
  as its literal value. A native `<option>` carries one text run, so that text
  is the accessible name. The keyboard behavior comes from the platform.

  The admin data list screen declares the columns and fills the attributes. It
  warns before a save that drops one, and names the published processes that
  map it. The studio gained no builder while stage 36 held the field catalog
  panel, so an author wrote a mapping as JSON. Stage 36 shipped, and item 12
  in the queue is that builder.

  `DataSourceContext` gains an optional `heldValues: string[]`.
  `resolveFields` supplies the values the instance holds for the field under
  resolution: none when unset, one for a `select`, the whole array for a
  `multiselect`. The handler's query returns active values plus any value
  `heldValues` names. A value an operator retires therefore stays visible to
  the instances that already hold it. Its label still renders, and
  `optionValuesValid` accepts it with no change of its own, since that
  function already read the resolved options. The memo key widened from
  `DataSourceId` to `DataSourceId` plus those values, sorted, because held
  values change the result. `"static"` ignores the field.

  `createDefaultDataSourceRegistry` now takes the database handle, and the
  handler closes over it. The alternative put a handle on
  `DataSourceContext`, which every other type would ignore.
  `MAX_DATA_LIST_VALUES` is 500, and it counts the ACTIVE values. The handler
  throws above it rather than resolving a short list. A truncated list would
  reject a value a participant legitimately holds.

  The `LIMIT` leaves room for the held rows on top of that bound. Counting
  rows instead would break the instances the retirement rule protects: 500
  offered values plus one retired value a holder names is 501 rows. The
  boundary carries two tests, one on each side of it.

  An unknown `listKey` throws the same plain `Error`, the engine's canary
  style. Publish-time validation checks the type and the config shape alone
  and never reads the tables, so an identical re-publish stays a no-op
  whatever they hold.

  Six routes maintain a list, behind a sixth reserved role,
  `DATALISTS_ROLE = "system:datalists"`. It implies none of the other five,
  and none of them implies it. Reads also accept `DEVELOPER_ROLE`, so the
  studio's `DataSourcesPanel` offers the existing keys as a choice through the
  same route. A draft naming a key the server does not report draws a warning,
  never a validation error, and publishing still works.
  `PUT /admin/data-lists/:listKey/values` replaces the whole set. A value the
  request omits becomes inactive, and a value it names again becomes active.
  No route deletes a value row. That is what keeps a running instance's held
  value resolvable. `DELETE /admin/data-lists/:listKey` refuses while a
  published body references the key. The detail route reports the same scan as
  its usage report, so the guard and the report cannot disagree. Both read
  every published body with no supporting index. Both are admin routes on no
  instance path.
  Each entry of that report names the column keys its own process maps
  (`mappedColumns`). They sort, because `columnMapping` sits inside the jsonb
  body and Postgres normalizes a jsonb object's key order. A key the list no
  longer declares reports too. `checkColumnMapping` never checks a key against
  a declaration. So a mapping outliving its column is what an operator reads
  the report to find. The guard pays one body read per referencing row and
  discards it. That buys the single `EXISTS` clause deciding what a reference
  is.

- Process templates (`src/engine/templates.ts`,
  `packages/web/src/areas/studio/screens/TemplatesScreen.tsx`): a `templates`
  table. It holds one authored body and its layout per flat `template_key`,
  plus `created_by` and `updated_at`. No version column and no definition
  hash. The engine never publishes a template and no instance pins one.
  Nothing here reaches the audit backbone.

  Its own table, for the reason `drafts` has one. A template row in
  `definitions` would make every reader of that table responsible for
  excluding it. One missed reader puts a template in the participant's start
  list.

  The store checks the envelope alone, reusing `drafts.ts`'s
  `MAX_DRAFT_ENVELOPE_BYTES`. It never parses the body. A template seeds a
  draft. The draft store accepts a body that violates the authoring-time
  invariants. A stricter check here would create a third class of body. An
  author could save it as a draft but not as a template.

  `saveTemplate` is an upsert with no revision check. A template faces none of
  the editing pressure a draft on a canvas does.

  Four routes maintain a template, behind a seventh reserved role,
  `TEMPLATES_ROLE = "system:templates"`. It implies none of the others, and
  none of them implies it. Reads also accept either authoring role, so the
  start picker offers the templates to every author.

  `GET /processes/:processId/versions/:version` accepts the same three roles. A
  curator creates a template from a published version. Refusing that body
  would leave the role able to write a template and unable to get one. A
  browser walk caught exactly that.

  A draft stays closed to the curator. A published body is the one every
  participant already runs. A draft holds unfinished work.

  The list route projects `label` and `description` out of the body. It
  carries no body, since a body may reach the envelope bound.

  Seeding introduces no route. The browser reads `GET /templates/:key`. It
  writes the body to the existing `PUT /drafts/:processId` at revision 0. The
  seeded draft claims no `baseVersion`, because a template is no published
  version.

  A template is a snapshot: nothing records which process came from which
  template. A later edit changes no draft already seeded from it. Deleting one
  strands nothing.

- Three-role studio area (`packages/web/src/shell/areas.ts`,
  `packages/web/src/areas/studio/routing.ts`): the studio entry lists
  `system:developer`, `system:author` and `system:templates`. The templates
  screen lives in the area while a curator must not hold `system:developer`.
  The authoring screens live in it too. An author must not hold that role
  either, since it also opens migration planning. Entry is therefore the weaker
  gate, so the area gained the `ROUTE_ROLE` map the admin area already had.

  That map carries a SET of roles per screen, unlike the admin area's one
  string per screen. Admin's two roles partition its screens cleanly. The two
  authoring roles do not, since both reach the same four screens. Those four
  are the process list, the editor, the versions screen and the player. The
  migration screen and the tools screen take `system:developer` alone, and the
  templates screen takes `system:templates`.

  The nav lists only what the actor's roles reach. A denied screen shows the
  area's explanatory state, naming every role that admits it. A curator who
  lands on the area's default route goes to the templates screen, rather than
  to a refusal. An author needs no such move, since the map admits that role to
  the default.

  The versions screen hides its migration-plan button for an actor lacking
  `system:developer`. The product then never offers a control it refuses. The
  server's role check on every studio route stays the enforcement.

- The `system:author` role (`src/auth/authorize.ts`,
  `src/http/studio-routes.ts`): an eighth reserved role, admitting the no-code
  authoring subset. Two named predicates in `studio-routes.ts` carry it.
  `requireAuthoring` (author OR developer) gates the four draft routes, the
  publish route beside `PUBLISH_ROLE`, and `GET /registry`. `requireStudioRead`
  (those two OR templates) gates the two template reads and the published
  version body.

  The two migration-plan routes and the orphan-key scan keep
  `requireRole(actor, DEVELOPER_ROLE)` alone. Those three rewrite the state of
  every running instance on a version.

  `GET /registry` widens while the Tools SCREEN does not. The route has two
  consumers. One is the Tools screen. The other is the inspector's
  plugin-config form, which turns a registered type's config schema into a
  form. An author refused the route falls back to raw JSON for every action
  config.

  Two routes outside the studio prefix widen with it, because studio screens
  call them. `GET /admin/data-lists` fills the `"db.list"` picker
  (`admin-routes.ts::requireDataListRead`). And `getInstanceRecord`'s starter
  fallback (`src/runtime/api.ts`) now admits either authoring role for an
  instance that actor started. The Player renders that record beside the form.

  Neither data list write moves, and the starter condition still bounds the
  record read.

  The role implies nothing and nothing implies it. It is a widening: every
  account holding `system:developer` reaches exactly what it reached before.

- Two-role admin area (`packages/web/src/shell/areas.ts`,
  `packages/web/src/areas/admin/`): the shell's area table now carries a set
  of roles per area rather than one, and an actor holding any of them enters.
  An empty set still means a session is enough. The admin area lists
  `system:admin` and `system:datalists`, because the data list screens live in
  it while their maintainers must not hold `system:admin`. Area entry is
  therefore the weaker gate. Each screen keeps its own role check, the tab bar
  lists only the tabs the actor's roles reach, and a screen the actor cannot
  read shows the area's explanatory empty state. The area sends a maintainer
  who lands on its default route to the data list overview, rather than
  leaving them on an explanation. The server's `requireRole` on every
  `/admin/*` route stays the enforcement.

- Studio plugin config form (`src/engine/config-descriptor.ts`,
  `src/http/studio-routes.ts`, `src/log.ts`, the studio area of
  `packages/web`, roadmap #27a, `studio-plugin-config-form`): the first
  piece of the no-code/low-code direction. Replaces free-text `type` entry
  for the action, data-source and assignment-strategy positions with a
  picker over `GET /registry`'s live type names. It also adds a generated
  form, for any type whose `configSchema` a new converter can represent.

  `describeConfigSchema` walks a `ZodObject`'s shape. It recognizes a
  string node (including `z.email()` and `z.string().email()`), a number
  node, `ZodBoolean`, `ZodEnum` and `ZodArray` of a string, each
  optionally wrapped in `ZodOptional` or `ZodDefault`. It also reads each
  field's own length and format checks: `minLength`/`maxLength`,
  `min`/`max`, `minItems`/`maxItems`, and an email format flag.

  It dispatches on the node's own type tag rather than on `instanceof`.
  Zod v4 gives a formatted string its own class. `z.email()` is a
  `ZodEmail`. It answers `instanceof z.ZodString` with false, and still
  reports `type: "string"`.

  Some constructs fail the whole type's conversion, not just one field: a
  nested object property, `z.unknown()`, or a non-email string format.
  Any other unsupported construct fails it too.
  `GET /registry` then omits a schema description
  for it. The studio area falls back to the raw JSON textarea for that
  type, unchanged from before this capability.

  A `.refine()`/`.superRefine()`-wrapped object does NOT fail it. Zod v4
  declares `refine` as returning `this`, so a refined object stays a
  `ZodObject` and reaches the per-property walk. Zod v3 wrapped it as a
  `ZodEffects`. The top-level check rejected that before it read one
  property.

  Such a type used to reach the raw JSON textarea, however ordinary its
  properties. The generated form describes per-field rules only. The
  cross-field rule the refinement carries still runs at publish, through
  `registry-check.ts`.

  This was a deliberate choice over two alternatives. One: a
  hand-written descriptor per registry entry, a second artifact beside
  `configSchema` a handler author must keep in sync by hand. Two: a
  generic Zod-to-JSON-Schema library, more than today's five schemas
  need, and still unable to express a `.refine()` predicate.

  A type either gets a fully generated form, or it keeps the fully raw
  JSON textarea. Never a mix within one envelope. An author can still
  switch a schema-backed type's form to raw JSON and back, pre-filled
  with the form's current value. `db.list`'s single `listKey` field is
  schema-representable. `DataSourcesPanel.tsx` deliberately excludes it
  from the generated form. That panel already has a dedicated `listKey`
  picker, backed by the real, live list of known keys. A generated
  form's plain text input for the same field would only duplicate it.

  The type picker also excludes the reserved
  `core.spawnSubprocess`/`core.returnSubprocess` action types from its
  options.

  `GET /registry` still lists them, since `subprocess.ts`
  registers them on the same `Registry` for internal dispatch. Without
  the exclusion, an author could select one and have it fail at publish.

  `ActionListEditor.tsx`'s `ActionRow` had its own separate, duplicate
  free-text-plus-JSON implementation, never built on
  `PluginEnvelopeEditor`. This change refactors it onto
  `PluginEnvelopeEditor`, so the type picker and generated form cover
  the action position too. That includes `onPath` (`PathsPanel.tsx`) and
  `onFire.actions` (`TimersPanel.tsx`), which also render
  `ActionListEditor`.

- Devcontainer preflight (`scripts/preflight.sh`, `scripts/preflight.ps1`,
  `.devcontainer/docker-compose.yml`, `scripts/dev-up.sh`,
  `scripts/dev-up.ps1`, `.githooks/pre-push`, `add-devcontainer-preflight`):
  names which of six ordered preconditions is missing. Before this, a
  developer met its symptom instead: a connection reset, a login 404, an
  empty screen. They then worked backwards to the cause.

  The six checks, in order:

  1. the Docker daemon answers
  2. every container reports healthy
  3. the HTTP server process carries `AUTH_JWT_SECRET`
  4. every published port answers on the host
  5. the database holds its schema and seed data
  6. no stale codebase-memory WAL file holds a lock

  The preflight stops at the first failure and prints the exact repair
  command.

  Two profiles split the checks. `core` covers the daemon, container
  health and the WAL lock. Those are the preconditions of any work in the
  container. That includes a test run. `serve` adds the secret, the ports
  and the seed. Those are the preconditions of a browser session.

  `.githooks/pre-push` runs `core` before `bun run check`. That replaces
  its own inline container check. `dev-up.sh` and `dev-up.ps1` run
  `serve` last. It runs as a closing confirmation after their own
  bring-up work, not before. On a fresh clone the containers, secret,
  seed and server do not exist yet. Calling it first would fail check 2
  before the script ever ran `compose up -d`.

  `.devcontainer/docker-compose.yml` gained a `healthcheck` per service, so
  check 2 has a health state to read. `mailpit`'s upstream image already
  shipped one (`CMD /mailpit readyz`); `db` and `app` did not.

  Check 6 warns rather than blocks. The index is per-machine local
  state, per `CLAUDE.md`. It also carries a Windows-specific detail. Git
  Bash's own MSYS/Cygwin file redirection does not see a Windows sharing
  violation. The preflight shells out to `powershell.exe` for this
  one check instead. It opens the file with a `FileShare.None` request
  that a plain redirection does not make.

  `scripts/preflight.ps1` held a second PowerShell implementation of all six
  checks until `one-source-gates-and-preflight`. It now runs
  `scripts/preflight.sh` and returns its exit code, so the two entry points
  agree by construction.

  Check 6 skips a WAL file of zero length before the probe reaches it.
  SQLite zeroes the WAL on a checkpoint. Such a file holds no
  unrecovered frame, and the database beside it is complete. That is the
  opposite of the stale WAL the check looks for.

  The narrower trigger earns its place. `codebase-memory-mcp` runs as a
  child of the editor and holds the index open. A live handle refuses
  the `FileShare.None` probe. Without the skip the check warned on every
  run, and a warning that always prints is one nobody reads.

- Admin role editing (`src/auth/users.ts`, `src/http/admin-routes.ts`,
  `src/http/server.ts`, the admin area of `packages/web`, roadmap #25a,
  `add-admin-role-editing`): `PATCH /admin/users/:id/roles` behind
  `system:admin`, the fourth `/admin/users*` route. Before this only
  `src/auth/cli.ts` wrote a user's roles, so every business role a process
  names reached a person through a server shell.

  `setRolesById(userId, roles, db)` mirrors `setDisabled`: it keys on
  `user_id` and returns the updated row, or `undefined` for an unknown id.
  `setRoles(email, ...)` stays untouched for the CLI. Both write the same
  column.

  The body is `{ roles: string[] }` and replaces the whole set, so an
  omitted role is a removed role. There is no `revision` column on
  `auth_users` and no optimistic concurrency: two operators editing one
  user in the same second is not a case a handful of admins produce.

  The route bounds and normalizes the array. It rejects a `roles` that is
  absent, is not an array, holds a non-string, holds an entry empty after
  trimming, holds an entry over 64 characters, or holds over 64 entries.
  Each is a 400 with no write. It then trims and deduplicates, first
  occurrence winning. It enforces no character set. The CLI has written
  role strings unchecked since stage 7, so a pattern would make an
  existing row unsavable through the screen this adds.

  One refusal is its own: the route returns 409 when the path's `:id` is
  the calling actor's own id and the submitted set omits `system:admin`.
  Otherwise the last admin could lock the area out of itself, with the
  server shell as the only recovery. That guard runs before the read, so
  an actor whose `sub` matches no `auth_users` row still gets the 409 —
  the rule governs the actor, not the row. It covers the caller alone:
  one admin may still strip another's role.

  Both non-2xx bodies are returned inline, the way the disable route
  returns its 404. No error class and no mapping entry was added to
  `errors.ts`.

  A role assignment reaches an already-issued JWT no more than a disable
  did when this change landed. Token verification performed no per-request
  database lookup, so a token kept its `roles` claim until its `exp`.

  Half of that still holds. `harden-local-account-sessions`, below, gave the
  resolver a per-request lookup. A disable now ends an open session at once.

  That lookup reads whether the account is live. It reads nothing else.
  `Actor.roles` therefore still comes from the token's own claim. A grant
  still waits for the next login.

  The admin area's `/users` screen edits the roles cell in place: a text
  input holding the comma-separated current roles, with save and cancel,
  Enter and Escape, and the six reserved `system:*` roles as chips that
  append to the input. The screen keeps the pending text across the
  window-focus refetch `useRefresh` fires unasked. A picker over known
  roles was rejected for now, since nothing knows which business roles
  exist until roadmap #25c gives them a source.

- Manager service (`src/engine/store.ts`, `src/auth/users.ts`,
  `src/auth/cli.ts`, `src/engine/assignment-strategies.ts`,
  `src/engine/registry.ts`, `src/schema/definition.ts`,
  `src/http/admin-routes.ts`, the admin area of `packages/web`, roadmap #25c,
  `add-manager-service`): the first per-instance assignment, and the first
  fallible resolver. The strategy, the deadline and the
  `assignment.unresolved` event all sit under "Assignment" above. What
  follows is the account side.

  <!-- antislop: allow synonym-rotation -->
  `auth_users` gains `manager_user_id text REFERENCES auth_users(user_id) ON
  DELETE SET NULL`. It is added by its own `ALTER TABLE ... ADD COLUMN IF NOT
  EXISTS`, because `CREATE TABLE IF NOT EXISTS` does not touch a table that
  already exists. One pointer to one other account: no department, no deputy,
  no matrix, and no second hop.

  The self-reference makes a pointer to no
  account unrepresentable. A cycle between two accounts stays representable
  and stays harmless, since nothing walks the pointer. A self-pointer is the
  one case refused, on the write path rather than in the schema. It would name
  an instance's starter as their own approver.

  `setManagerById(userId, managerUserId, db)` mirrors `setRolesById`.
  `setManagerByEmail` is the CLI's email-keyed sibling, behind
  `bun run src/auth/cli.ts set-manager <email> <manager-email|->`, where `-`
  clears. `getManagerOf(userId, db)` is what the strategy reads.

  `emailsForUserIds(userIds, db)` answers a set of ids with the address each
  holds, as a Map. One round trip whatever the size of the set: a caller holds a
  candidate list whose length it did not choose. An id matching no row is
  absent, and so is a disabled account. A message nobody may act on looks
  delivered and is not. The empty set short-circuits without a query.
  `notification.email`'s `toActors` resolution reads it.

  `PATCH /admin/users/:id/manager` is the fifth `/admin/users*` route, body
  `{ managerUserId: string | null }`. It answers 400 for a self-pointer
  (`SelfManagerError`) and for a target naming no account. The column's own
  foreign key reports the latter, rather than a pre-read. A concurrent
  delete therefore cannot slip between a check and the write. Bun's `PostgresError`
  carries the SQLSTATE on `errno`, not on `code`, which holds
  `ERR_POSTGRES_SERVER_ERROR` for every server error. The check therefore reads
  `errno` plus the constraint name.

  The `/users` screen gains a Manager column. Each row carries a select of the
  other listed accounts plus a clearing choice, never the account under edit.
  A manager is a pointer into a known set, not a free string. It therefore
  takes a select where roles take a text input. One editor is open per screen,
  so a row never shows two pending changes at once.

  A disabled account stays selectable. Disabling blocks a login, and it does
  not retire someone from an org chart. Hiding such an account would strand an
  existing pointer.

  The route needed its own `OPTIONS` preflight entry in `server.ts`. Without
  one the screen's save never left the browser, while every server-side test
  still passed. Found in a browser, and now covered by a test beside the roles
  route's. `http-route-table` since removed that failure mode. The preflight
  now reads the route table. One route entry is the whole change.

## Process Studio, migration-plan field mapping (`studio-migration-plan-field-mapping`)

ROADMAP stage 27c. Entirely in the browser. No route, no schema, no engine
code. The migration-plan screen gained a Mapping/JSON toggle. It uses
`role="tablist"`, the idiom the edit screen's Structure/JSON toggle already
uses.

The Mapping side is `panels/MigrationSpecEditor.tsx`, four sections over the
five `MigrationSpec` keys. The JSON side is the textarea stage 11 shipped,
unchanged.

`screens/MigrationPlanScreen.tsx` loads both version bodies beside the plan.
It uses `Promise.allSettled` over the `getVersionBody` call the versions
screen already makes. A body that fails to load costs the form, not the
screen. The toggle then forces the JSON side and names the reason.

The plan is one state. The textarea's text is the JSON side's own state, and
it converts back through `parseSpecText`. Text that is not a plan therefore
cannot leave that side.

`screens/migrationPlanLogic.ts` holds the conversion and the checks.
`readCatalog` reads an opaque body into pickable entries. Its field walk
mirrors `fieldTypeById` (`src/engine/migration.ts`). It recurses into a
`group` field and never registers the group itself. Labels resolve against
the body's own `baseLocale`, since this screen holds no draft.

`checkPlan` covers the three rules the browser can evaluate from those two
bodies:

- a non-injective `fieldMap`;
- a `fieldMap` pair whose CEL types disagree;
- the reserved cancel-sink as a `stepMap` value or as `unmappableStep`.

Type agreement imports `celType` from `workflow-engine/cel/check`, the
function `validatePlan` itself compares. Several declared types share one
CEL type. A check over the declared type would report an error the server
does not raise. Everything else stays on the server, including the
`transforms` expressions and the identity-carried type check. The form never
blocks a save on its own finding.

Two properties are load-bearing. A row whose id no catalog declares keeps
that id, shows as unresolved, and saves unchanged. Dropping it would lose
part of a plan the author never edited. And `route-to-step` selects a target
step at once, so the schema's presence-iff refinement cannot fail on the
form's own output.

Stage 27's read-back problem does not apply here. A `MigrationSpec` holds
structured data, not a language. The form therefore reads back what it wrote
by holding the same object. The one free-text position, a `transforms`
expression, stays a text input and round-trips as its own `src` string.
Stage 27b's CEL builder replaces that input, and nothing else.

## HTTP route table (`http-route-table`)

Ponytail audit finding 1, reported for five scans in a row.
`src/http/server.ts` stated every route twice. An `OPTIONS` preflight if-chain
restated the method and the path shape of each route. The handler chain below
it stated both again. 88 `req.method ===` comparisons across 690 lines.

`createServer` now builds one `Route[]` before it returns its `fetch`. An
entry carries a method, the path pattern already split into segments, and a
closure. That closure reads the dependencies its route needs. The handlers
share no signature, so a closure per route is what the table can hold.

Two helpers sit beside it. `seg(pattern)` splits a pattern once, at table
construction. `match(segments, parts)` returns the captured `:name` values in
pattern order, or `null`. No two patterns in the table overlap: any two differ
in segment count or in a literal segment.

The preflight reads that same table. An `OPTIONS` request matches by path
alone. The answer lists every method the table holds for the matched pattern,
in table order. Three patterns list `GET` before `POST`, so the join
reproduces the `"GET, POST"` the tests pin.

Three routes stay outside the table. `GET /livez`, `GET /readyz` and
`GET /metrics` answer a probe rather than a browser. None carries a CORS
header, and none answers a preflight. The `http-wrapper` spec named the first
two only. The third behaved the same way and the text did not say so.

The second chain drifted. That is why this landed as a change rather than a
cleanup. The four `/reporting/*` routes had a handler branch and no preflight
branch. `OPTIONS /reporting/processes` therefore fell through to the 404.
The spec required a `204`. Deriving the answer closed that gap without a line
naming reporting.

49 entries, one per route. The typecheck is the completeness check.
`noUnusedLocals` reports any handler import no entry names.

## Shared server helpers (`dedup-server-helpers`)

Ponytail audit findings 2, 5, 6, 14 and 15, landed together. All five were
duplication or dead code on the server side. None changed behavior.

Four modules answer HTTP routes. The three written after `routes.ts` copied
its plumbing. Each of `resolveActor`, `errorContext` and `guarded` stood in
four copies. `parseLimit` stood in two. Every copy carried a comment saying
so, in the form "Same shape as routes.ts::guarded".

`routes.ts` now exports all four, and the three siblings import them. The
generic `guarded<T>` covers what the fixed-to-`HttpResult` copies did, since
every sibling call site infers `T = HttpResult`. The cost of the choice is
that `routes.ts` is both a route module and the plumbing home. The
`http-route-handling-consolidation` spec records that, and `errors.ts` stays
the fallback home if the set grows.

The audit named three of the four. `errorContext` was the fourth, found while
reading the files.

`store.ts` gained `makeAssignmentUnresolvedEvent`. Three sites hand-built the
same seven-field event literal. Only `id` and `kind` were constant across the
three, which are the two fields a copy can drift on. The helper takes one
object rather than six positional arguments. Otherwise `instanceId`,
`stepId` and `reason` would sit in a row. Only the first two carry branded
types that a typecheck can tell apart.

`parseRoles` in `admin-routes.ts` lost its seen-`Set` and `push` loop for
`map` plus `[...new Set(roles)]`. A `Set` keeps first-insertion order, so the
result is the same array. The regression net is line 351 of
`test/http-admin.test.ts`, "trims and deduplicates, first occurrence
winning".

`buildTransformContext` and `makeSpawnHandler` lost an `export` keyword each.
Neither name appears outside its own file, and neither is in the engine
package's `exports` map.

`test/helpers/http-fixture.ts` is new. It holds `DB`, `initDb`, `authHeaders`
and `authedReq` for the three http suites. It registers no hook. Bun caches a
module across test files, so a `beforeAll` at its top level would register
once and skip two suites. The `beforeEach` truncate stays per suite. The three
truncate different tables, and each is one tagged-template line.

## One source for the gates and the preflight (`one-source-gates-and-preflight`)

Ponytail audit findings 3 and 4. The audit groups them, because both trace to
one missing shared source.

`scripts/gates/_lib.sh` is new. It holds `reject <rule>` and
`no_verify_note`, the two lines every rejecting gate prints around its own
findings. The header stood in 9 copies and the note in 8. Both are text a
contributor reads, not logic, and a copy that fell behind would have taught
the wrong thing.

Two primitives, not one combined `fail_rule`. The gates reject in different
shapes. `whitespace.sh` and `prose.sh` set a flag, keep checking and exit
later. `silent-green.sh` rejects at three separate points. Each gate sources
the library through `$(dirname "$0")`, so it still runs alone during a repair.

One sub-claim of finding 3 did not survive reading the code. The audit says
`prose.sh` and `whitespace.sh` hand-roll an identical changed-file loop,
differing only by a `-- '*.md'` pathspec. They do not. `prose.sh` runs
`git diff --name-status -M` and carries base and tip paths per range. It reads
a renamed file's baseline at the old path. `whitespace.sh` runs
`git diff --name-only` and needs neither. A shared collector would push rename
machinery onto the gate that never reads it.

`scripts/preflight.ps1` went from 133 lines to a delegator. It resolves
`bash`, runs `scripts/preflight.sh` with the same profile, and returns that
script's exit code. The six checks now have one source. One requirement says
both entry points run the same checks in the same order, and it now holds by
construction.

The delegator needs bash on the host, which `dev-up.ps1` did not before. Three
facts made that acceptable. `.githooks/pre-push` is a POSIX `sh` script
running `bash scripts/preflight.sh core`, so anyone who pushes needs bash. The
old `preflight.ps1` printed `bash scripts/dev-up.sh` as the repair for check 3
and check 4. Git for Windows ships Git Bash, and nobody clones without git.

A host with no `bash` gets a named message pointing at Git for Windows, not a
crash. Restoring the native PowerShell implementation is one `git revert`.

## Web logic-module simplifications (`simplify-web-logic-modules`)

Ponytail audit findings 7, 8, 9, 11, 12, 13, 16, 17 and 18, landed together.
All nine sit in `packages/web`. One of them is visible to a person.

Two came from one convention applied past its use. The studio-app spec asks
the studio to extract its testable logic from its components. That is right
where a decision has branches. One file was 13 lines, 9 of them comment,
around one `JSON.stringify` comparison. Another was 39 lines, 30 of them
comment, around one `structuredClone`.

The first of those two is gone. Its `isDirty` moved into
`draftToolbarState.ts`, which already held the other. Both state one
invariant: the body the server last confirmed. The reducer writes it, and
`isDirty` reads it.

The reducer's two-kind action union went at the same time. Both branches were
the same expression. The call sites already carry the names `doSave` and
`reload`, so the discriminant told a reader nothing the names did not.

The `structuredClone` stays, and so does its comment. The panels mutate the
draft object in place. Storing the reference would make `savedBody` follow
every later change, and turn the dirty gate permanently off.

The Versions screen lost `selectVersion`, inlined at its two call sites. It
wrapped one spread and carried its own exported type plus five test cases. Its
two siblings stay. `canDiff` states that a version does not diff against
itself, and `diffJson` walks two bodies.

The login form changed for a person, not only for a reader. Both inputs gained
`required`, and the submit button gates on `disabled={loading}` alone. A
disabled button states no reason. It leaves the pointer nothing to click, and
the screen reader nothing to announce.

The browser now names the empty field and moves focus to it. Chrome confirmed
that. No CSS changed, since `shell.css` styles no `:invalid` state, so an
untouched field carries no error styling. The `spa-accessibility` spec now
carries the rule.

Five one-line removals followed. The `?? catalog.en[key] ?? key` tail went
from `t()` in both catalogs. The catalog type gives every locale every key.
The compiler is not set to doubt an index either, since `tsconfig.json` leaves
`noUncheckedIndexedAccess` off. Elsewhere, `App.tsx` calls the now-exported
`browserStorage()` rather than writing its guard inline twice.

The flag `Operand.freeText` went too. Two sites wrote it, and `ValueEditor`
branches on `celType` and `options`, never on the flag. A module-level counter
behind `nextRowId` became `crypto.randomUUID()`, matching
`draft/ids.ts::mintId`. The `EVERY_KEY` alias went, and both sites return
`ALL_KEYS`.

Audit finding 10 did not survive reading the code. It says
`Intl.RelativeTimeFormat` covers `waitingLabel`'s buckets. It does not.

The function renders `"5m"`, `"3h"`, `"2d"` and `"just now"` into a compact
inbox badge. Five tests pin those strings. The narrow style of
`Intl.RelativeTimeFormat` renders `"5 min. ago"`, and no style renders `"5m"`.
Adopting it would change what a participant reads. It would also drop four
catalog keys in two locales and rewrite five tests. That is a redesign of the
badge.

## UI-chrome white-label overrides (`add-ui-chrome-white-label-overrides`)

A deployment renames its own buttons and headings. It needs no code change and
no redeploy. Roadmap stage 13b. The wording only. No logo, no color, no theme.

`initSchema` creates `ui_string_overrides`. The key is `(area, locale, key)`.
The row also holds `value`, `updated_by` and `updated_at`.

`area` is plain text, not a database enum. The later catalog retrofit for
`admin` and `reporting` then writes `area = 'admin'` rows against the same
schema.

A row exists only while it overrides something. Clearing a key deletes its row.
`data_list_values` deactivates instead, because a running instance may still
hold one of those values. No instance, draft or published body reads a UI
string. Nothing pins to a row here.

`src/engine/ui-strings.ts` holds three statements. One returns the whole table
as a nested `area -> locale -> key -> value` map. One counts the rows. One
upserts a row, or deletes it when `value` is `null`.

Three routes. `GET /ui-strings` needs no token and no role. It has its own
module, for the reason `health.ts` has one. Every handler in `admin-routes.ts`
states the opposite invariant. `GET /admin/ui-strings` and
`PUT /admin/ui-strings` sit behind `system:admin`. The `PUT` records the acting
actor.

The public read sits in `createServer`'s route table. It does not sit beside
`/livez` and `/readyz`. Those two carry no CORS header, on purpose. This one is
a browser fetch. `API_BASE` reads `VITE_API_URL`, so a deployment may serve the
bundle from a second origin. That table also decides the `OPTIONS` preflight
answer. A route outside it gets none.

No token gates the read. The write path therefore decides how large its answer
gets. `area`, `locale` and `key` each stay under `MAX_KEY_LENGTH`. `value` stays
under `MAX_OVERRIDE_VALUE_LENGTH`, 4096. The table stays under `MAX_OVERRIDES`,
2000 rows. Each breach raises a `RequestShapeError`. The route checks the row
bound only for a write that adds a row. An overwrite and a clear therefore stay
possible at the bound.

The route refuses an empty-string `value`. Clearing goes through `null`.
`resolveOverride(...) ?? builtin` does not fall back on `""`. A stored empty
string would render a blank label. Absence and emptiness stay distinct on both
sides of the wire.

`packages/web/src/i18n/overrides.ts` holds the fetched map in a module
variable. Each of the three `t()` functions gained one line that reads it
first.

React does not observe that variable. `main.tsx` therefore awaits
`loadUiStringOverrides()` before `createRoot(root).render(<App />)`. An effect
in `App.tsx` would run after the first render. That first render is the login
screen. `loadUiStringOverrides` drops every failure and leaves the map
empty. An unreachable engine still yields a login screen in its shipped
wording.

The three builtin catalogs moved up to `packages/web/src/i18n/catalogs/`, one
file per area, plus an `index.ts` keyed by area name. The admin screen needs
all three key lists, and `boundaries.test.ts` forbids an area importing another
area. Only that screen imports `index.ts`. Each area imports its own file, so
the per-area chunking survives. Each `catalog.ts` keeps its `t()` and its
exported key type at its old path. No call site moved.

The admin area gained `/ui-strings`. It sits behind `system:admin` in
`ROUTE_ROLE` and in the `TABS` list. The screen picks an area and a locale. It
lists that catalog's keys, each with the shipped wording beside an editable
input. It seeds each input from any stored override. A save writes the changed
rows, then re-reads the public map and installs it.

The public route returns wording, keyed by area, locale and catalog key. It
returns nothing actor-scoped. It reads one table, and that table holds no
account, instance, process or definition data. It reads that table whole, so
its answer never varies by caller. No request probes it for the presence of
anything.

`docs/openapi.yaml` carries the route beside the two health routes. The entry
states that it needs no role and no token. The two admin routes stay out, under
the `admin/*` exclusion.

## Browser verification checklist (`close-the-browser-verification-debt`)

`CLAUDE.md` requires a real browser for any UI change. Ten open browser
tasks from the 2026-08-06 merge of ten changes had no owner between
changes. Each one wrote its own list. The archive swallowed the list once
the change closed.

`development-toolchain` now carries the split rule. This repository already
produced the defect, and an assertion can observe it with no browser: the
check becomes a `bun:test` assertion. Otherwise it stays manual, in
`docs/browser-checks.md`. That file sits outside `openspec/`. No archive
step moves it.

Five assertions landed. `src/http/server.ts` exports `BINARY_ROUTES`, a
declared ledger of routes returning stored bytes rather than a JSON
envelope. `test/http-disposition.test.ts` drives every entry. It asserts
`Content-Disposition: attachment` on each one marked `filename: true`.

A case in `test/outbox.test.ts` drives an `http.request` action past the
egress allowlist. It asserts the dead-letter row names the refused host.
Two cases in `test/runtime-api.test.ts` close the untested half of
`InstanceView.columns`. An absent `view.columns` resolves to `1`. A
declared `columns: 2` survives, alongside a field's `span`.

A static rule in `packages/web/test/boundaries.test.ts` covers the studio
area. Every `LocalizedTextInput` render site there must sit beside a call
to `missingTranslationWarning`.

`packages/web/test/reporting-routing.test.ts` gives the reporting router
the match, round-trip and half-match coverage `admin-routing.test.ts`
already had. The studio and app routers each gained the one case they
lacked.

`docs/browser-checks.md` holds the four checks that stay manual. One is
`iframe` framing from a second origin. Another is the attachment
download's Save-not-render behavior. A third is the form editor's pointer
work. The fourth is the panels screen's own walk.

Each entry names the address rule, the frontend build step, and the
change that first asked for it. The address rule is `127.0.0.1`, not
`localhost`.

`.claude/skills/openspec-archive-change/SKILL.md` now refuses the ordinary
confirm-and-proceed path for an incomplete browser task. That task's
content must move into `docs/browser-checks.md` first. The archive step
created the 2026-08-06 debt. It now refuses the same class of debt.

## Personal profile page (`add-personal-profile-page`)

`src/http/account-routes.ts` is a third route module beside `admin-routes.ts`
and `studio-routes.ts`. It holds two routes, `GET /account/me` and `PATCH
/account/me`. Both read the caller's id off the resolved actor. Neither takes
an id in the path, and neither checks a role. Any resolvable session reaches
them. `admin-routes.ts` stays the operator's act-on-any-account surface.

`GET /account/me` answers a local account with `id`, `displayName`,
`storedDisplayName`, `email`, `roles`, `managerUserId`, `locale` and
`editable: true`. An actor whose id matches no `auth_users` row reads as
federated. That answer carries `id`, `roles` and `editable: false`, never a
404. A `"bps"` token guarantees a live local row, so the absence names an
externally issued identity.

The body carries two names because they answer two questions. The resolved
`displayName` is the value to print. The raw `storedDisplayName` is the value
the account set, and it is `null` where the account set none. The profile
page's editable name box seeds from the raw value. A box seeded from the
resolved value shows the email to an account that set no name. The next save
then stores that email.

`PATCH /account/me` writes `displayName` and `locale`, both optional. It
refuses an unknown body key, an out-of-bound `displayName` and an unsupported
locale with 400. It refuses a federated actor's write with 403. That refusal
reads off the update's own result, not off a separate existence check. The
bound on `displayName` comes from `validateDisplayName`, the helper
`PATCH /admin/users/:id/name` calls too. Two validators would drift.

`normalizeDisplayName` carries that same 200-character bound, and it throws
past it. Every write path runs it: `createUser`, both setters and
`updateAccount`. The CLI therefore cannot store a name either route would
refuse back. Both routes check the bound before they write, so each still
answers 400 and neither reaches the throw.

`SUPPORTED_LOCALES` restates the values `packages/web`'s `UiLocale` declares.
The engine carries no dependency on the web package, so the list cannot come
from an import. A locale added there without this list draws a 400.

The shell serves the page at `/profile`. The route table holds no entry for
that path. A browser navigation there reaches the bundle, not an API answer.

## Account creation and password reset over HTTP (`admin-user-onboarding`)

Two `system:admin`-gated routes close the last CLI-only writes on
`auth_users`. `POST /admin/users` wraps the existing `createUser` and answers
201. `POST /admin/users/:id/password` runs a new `setPasswordById` and answers
200, or 404 for an unknown id.

A duplicate email answers 409, read off `auth_users_email_key` rather than a
`SELECT` before the insert. A pre-read would race a concurrent create for the
same address, and the constraint decides either way. The check reads `errno`
and the constraint name, the shape `isManagerForeignKeyViolation` already
uses.

Neither route enforces a password rule. `src/auth/cli.ts`'s `set-password`
has never applied one, so a floor here alone would refuse a password the CLI
still accepts. A reset writes `password_hash` alone. No JWT claim derives
from the password, so a token issued before it keeps authenticating. Disable
stays the control that ends a session at once.

The create route stores no display name. `PATCH /admin/users/:id/name` is the
one route that writes that column. A created account's `displayName`
therefore resolves to its email.

`listUsers(page, db)` returns `Page<UserSummary>`, keyset-paged on
`(email, user_id)` ascending. It defaults to 50 rows and caps at
`MAX_LIST_LIMIT`. `GET /admin/users` reads `limit` and `cursor` through the
same `parseLimit` the outbox and timer routes use.

The admin Users screen follows that cursor to the end and shows every
account. It carries no "Load more" control. `managerChoices` and
`managerLabel` read the loaded array as the whole account directory. One page
would drop later accounts out of the manager dropdown, and print a `user_id`
where an email belongs. The bound belongs on the route; the screen walking it
in steps is a different read.

The screen's two new controls follow the register idiom the roles and manager
editors set. Creation is a row in the table's own columns, with the email and
password stacked in the identity cell. The reset is a row under the account
it belongs to, since a password matches no column. Each carries its caveat
line. The operator hands the password over out of band. A reset leaves an
open session running.

## Catalogs for the admin and reporting areas (`i18n-catalogs-admin-reporting`)

Both areas rendered their wording from literals until this change. Neither
carried a catalog. So an operator could override neither one, and a German
account read English screens under German chrome. Roadmap stage 13b named the
retrofit as its next step.

`i18n/catalogs/admin.ts` and `i18n/catalogs/reporting.ts` now sit beside the
three that shipped before them. Each carries an `en` map and a `de` map. Each
derives `CatalogKey` from `en`. `BUILTIN_CATALOGS` and `OVERRIDABLE_AREAS` list
five areas. `localesOf(area)` reads the first of those. The UI-strings screen
therefore offers `admin` and `reporting` without a change of its own.

`areas/admin/catalog.ts` and `areas/reporting/catalog.ts` export `t(locale,
key)` over `resolveOverride`, the shape `areas/app/catalog.ts` already had. The
studio's fixed-`en` `t(key)` stays as it is.

Each area also gained one substitution helper. `tFill(locale, key, values)` in
the admin area fills `{role}`, `{email}`, `{process}` and the rest.
`tCount(locale, key, n)` in the reporting area fills `{n}`. Each grammatical
form is one key holding a whole sentence. A translator therefore never
reassembles one. An unfilled placeholder stays visible rather than leaving a
gap.

Nine admin screens and four reporting screens now take a `locale` prop from
their area root. `DataListScreen` already had one. It named the content locale
an operator edits a value's label under. That prop now serves both purposes.

Five signatures changed. `describeError(error, locale, status?)` and
`describeCaughtError(err, locale)` in `areas/admin/errors.ts` return catalog
values from every switch arm. Neither reads `error.message`, as before.
`buildRunConfirmation(processId, from, to, locale)` and
`migrationBuckets(result, locale)` in `migrationsLogic.ts` take the locale.
`validateValues(rows, locale)` in `dataListsLogic.ts` takes it too.

`reportingLogic.ts` gained `describeError(error, locale)`. The reporting area
had never had one. `ErrorNote` printed the shared `api/client.ts::errorText`
before. That function ends in `return error.message`. The server sends that
string in English, and no catalog reaches it. The new map mirrors the admin
one. `errorText` itself stays as it was. The shell and the studio read it
too.

`formatDuration(ms, locale)` reads its unit suffixes from the catalog and
formats its number through `Intl.NumberFormat`. German prints `5,5 Std` where
English prints `5.5 h`; `d` is `T`. `formatPercent(rate, locale)` goes through
`Intl.NumberFormat` with `style: "percent"`, so German carries the space before
the sign. The `—` for a negative or non-finite duration stays a literal.

Every `new Date(x).toLocaleString()` in the admin area now passes the chosen
locale. The bare call took the browser's language, so an operator who picked
German still read English dates.

A machine value stayed out of both catalogs. That covers every id, definition
hash, version, `system:*` role name, data list key, outbox status token, filter
`value` attribute and CSS class.

`describeElement` in `InstanceScreen.tsx` stays locale-free for the same
reason. `transition` and `event` name the two record kinds. `actions` and
`attempts` name fields. The cause and the event kind are values the engine
stores.

Two placeholders stay literal on purpose. One is `finance:approver,
system:admin` in the roles input. The other is `cost_centres…` in the data list
key input. Each shows the grammar a stored value follows.

`test/i18n-catalog-parity.test.ts` asserts the key sets match in both
directions, per area. `CatalogKey` already rejects a missing `de` key at
compile time. It accepts a `de` key `en` never declared. That is what the test
catches. `test/i18n-substitution.test.ts` covers both helpers.

The German is a first pass, not a reviewed translation. The override mechanism
is the repair: a deployment corrects a word with no redeploy.

## Starter access to a started instance (`starter-instance-list`)

The access half already worked. `loadInstanceForActor` admits the starter. A
participant holding an instance id reads it, comments on it and cancels it.

A participant looking for it found nothing. `scope=all` demands
`system:admin`, and `scope=mine` matches a claim or a candidacy. The app area
carried no screen for the question either. Roadmap stage 35.

`parseScope` in `src/http/routes.ts` now recognizes a third value,
`"started"`. It needs no role. The wrapper derives `startedBy` from the
resolved actor and refuses an explicit `startedBy` beside it, the rule
`scope=mine` already carries for `assignedTo`.

An explicit `assignedTo` still narrows a started page conjunctively. It
reaches nothing outside what the caller started, so it needs no role either.

The scope applies no assignment predicate and no status predicate of its own.
A case another actor is working on lists, and so does a finished one. That is
the point. The inbox answers what waits on you. This answers what became of
what you sent.

`includeDegraded` stays off, as it does under `scope=mine`. Every row is the
caller's own instance, so a degraded item would leak nothing. The reason is
cost. The screen would need a second rendering path for a row with no
`processLabel`. Nothing deletes a version while an instance references it.

The engine changed nothing. `InstanceListFilter.startedBy` and its SQL
predicate both shipped already. `instance-query`'s spec already stated that
filter, so that capability carries no delta.

`packages/web/src/areas/app` gained `/app/started`, its `StartedScreen`, a
`startedLogic.ts` view model and a nav entry.

The screen is a register, not a second inbox. No filter, no sort, no
grouping, and therefore no load-more caveat about a sort it does not apply.
Each row is a stamp, an identity that is itself the control, and a
right-aligned date. A row opens `/app/tasks/:instanceId`, the screen that
already renders an instance for a non-claimant.

`app.css` gained three stamp tones beside the accent one it had. Together
they are four roles: open, settled, dormant, refusal. The admin area's badges
carry the same four. `design-language.md` fixes that set, and this adds no
fifth.

An area never styles another area's prefix. These rules therefore duplicate
the admin ones on purpose, rather than sharing them.

Nothing about who may read, comment on, cancel or write changed. A reader who
meets `scope=started` should infer no new permission tier from it.

- Multi-tenancy (`src/tenancy/`, roadmap #24): one database per tenant, behind
  `TENANT_CONTROL_PLANE_URL`. Unset, none of it runs. No control-plane
  connection opens. `initSchema` builds one schema. Every request and every
  worker tick gets the process handle.

  `store.ts` holds the control plane. It carries a `tenants` table (`id`, `key`,
  `name`, `database_url`) and nothing else. That table stays out of
  `initSchema`, so a tenant's own database cannot list its siblings.

  `connections.ts` maps a key to a handle. It opens a pool lazily and caches by
  key. Every tenant crosses this one surface. It carries the heaviest test here
  for that reason. `UnknownTenant` answers 401, the answer a bad token gets.
  `TenantUnreachable` answers 503. A deployment fault and a caller fault must
  not read alike.

  `provision.ts` lists the tenant LAST. A break part-way therefore leaves
  nothing a request can reach. `cli.ts` is the only way to create one.

  Three seams carry the tenant. `Route.handler` takes the database as a fourth
  parameter the dispatcher supplies. That follows the `clientAddress` pattern
  the type's own comment documents. `createServer`'s own parameter carries the
  name `processDb`. A closure that forgot to declare the new one is therefore a
  compile error. It is not a silent read of the wrong tenant.

  `ActorResolver` and `isActiveAccount` take the handle per call. The liveness
  check therefore reads the actor's own directory. `startEngine` takes a
  `TenantSource`, asked per tick. The worker count stays four whatever the
  tenant count. A tenant whose tick throws gets one warning and a skip. The
  rest are not starved.

  A locally-issued token carries a `tenant` claim. `LOCAL_ISSUER` is one
  constant every deployment shares. The issuer therefore cannot name a tenant.
  `tenantKeyOf` reads that claim before verification. That is safe: the claim
  sits inside the signed payload. `/auth/login` holds no token yet. It takes
  its tenant from the request host.

- Process Studio, the panels screen (`packages/web/src/areas/studio/screens/
  PanelsScreen.tsx`, `routing.ts`, `canvas/EditRail.tsx`, `studio-app`,
  `studio-checks-rail`): stage 36. The field catalog, the data sources and the
  contract sat behind one native `<dialog>`. It measured `min(72rem, 92vw)` by
  `88vh`. They sit on a routed screen now, at
  `/processes/:id/edit/panels/:view`.

  The overlay hid the checks rail. An author inside it edited field keys and
  data source keys. Those two produce most of what the rail reports. The rail
  entry showed a count per view, and that number stood in for a list behind
  the backdrop. The screen gives the rail its own column.

  `panel` rides the `edit` route as an optional field, beside `formStepId`.
  `matchRoute` tries the panels pattern before the plain edit pattern. An
  unrecognized view falls through to the plain match. A typo therefore lands
  on the canvas. `routePath` emits the form path when both fields arrive. One
  route object never yields two paths.

  All four views stay MOUNTED, and `hidden` shows one. Rendering the open view
  alone would drop `ContractPanel`'s half-typed outcome name. It would also
  refetch `DataSourcesPanel`'s list keys on every switch, and drop the field
  matrix's selected cell. The attribute keeps the subtree and takes it out of
  the accessibility tree, with no CSS.

  `panelEntityCounts` in `draft/panel-rail.ts` is the one source of the count
  beside each view's name. The canvas edit rail and the screen's index rail
  both read it. Each carried its own copy of the three expressions before, and
  the two did not agree. The canvas rail counted `draftFields`, which keeps a
  field carrying no id. The screen counted rail rows, which drop one.

  The screen carries no Save, the rule the overlay already had. Every panel
  writes into the in-browser draft, and the edit screen's toolbar persists it.
  A note beside the back control states that, so leaving never reads as a
  cancel.

- Process Studio, the field matrix (`packages/web/src/areas/studio/panels/
  FieldMatrixPanel.tsx`, `fieldMatrixLogic.ts`, `studio-app`,
  `spa-accessibility`): stage 41's second half. The panels screen's fourth
  view, at `/processes/:id/edit/panels/matrix`. Rows are the field catalog,
  `flattenRailFields`' own depth-first order. `line_item` heads its four
  children. Columns are `workflow.steps`, in array order.

  Three cell states. A step with no `view` at all hatches its whole column.
  A field absent from a view-bearing step's `fields` draws blank. A
  matching entry draws live. It carries a compact mono mark per flag that
  departs from `FLAG_DEFAULT`, boxed where the flag holds a CEL expression.

  Selecting a live cell opens one editor below the grid. Three
  `BooleanOrExpressionInput`s drive it, the same component the form
  editor's strip already wires to `setFlag`. `gatedKeys` disables
  `required`/`readonly` the same way there too. Escape, a different cell's
  activation, or a click outside the grid and the editor, closes it.

  The grid is `role="grid"` with a roving tabindex. It is one tab stop.
  Arrow keys move a tracked position inside it. `Home`/`End` jump within
  the row. `Ctrl+Home`/`Ctrl+End` jump within the grid. The
  `spa-accessibility` capability carries the pattern as its own
  requirement, since a two-dimensional data grid is generic.

  The rail badge needed a new counting function once
  `panelEntityCounts` gained a `matrix` key, the live-cell total. A
  `checkViewFlags` finding carries `entityType: "step"`, the type every
  other per-step issue carries too. `panel-rail.ts`'s
  `issueCountForSource` filters by `source` instead.

- Process Studio, the column-mapping editor
  (`packages/web/src/areas/studio/panels/columnMappingLogic.ts`,
  `FieldCatalogPanel.tsx`, `panels/shared/useDataLists.ts`,
  `studio-column-mapping-form`): stage 29's deferred builder. An author edited
  `FieldDef.columnMapping` as JSON until now.

  The editor shows one row per mapped column, under the `dataSource` picker
  that feeds it. The first control picks a key the bound list declares. The
  second picks a catalog field.

  It appears for a `select` field bound to a `"db.list"` source, and nowhere
  else. `checkColumnMapping` supplies two of those conditions. It refuses a
  mapping on a field carrying no `dataSource`, and on a field that is not a
  `select`. The `db.list` narrowing is the editor's own, because no other
  source type declares columns. Hiding the editor never deletes what the field
  carries, so switching a type back restores the rows.

  It validates nothing else. `draft/validation.ts` runs `compileProcessBody`,
  so all seven rules already reach the checks rail. A duplicate target reaches
  the rail rather than a disabled control, since an author passes through that
  state mid-edit. The target picker omits a group field and the mapping field
  itself, which is shape rather than validation.

  A key the list no longer declares keeps its row and takes a mark. The detail
  route reports the same key, so the two surfaces agree. Neither marks anything
  while the fetch has not resolved.

  `useDataLists` is the one read behind both pickers, the `"db.list"` key one
  and the column one. It takes the shape `useRegistry` beside it already had.
  `listDataLists` replaced `listDataListKeys`, which discarded the columns the
  route already returned.

- The shutdown suite's ports (`test/http-shutdown.test.ts`,
  `src/http/server.ts`, `development-toolchain`): the file spawned the real
  entrypoint on four hardcoded ports. A run that died abnormally left its child
  holding the bind. The next run then failed with `Is port 48232 in use?`, not
  with whatever orphaned the child.

  It reddened CI run 31835376765 on 2026-08-14, and reproduced locally three
  times running. One flake became two red runs. A Bun segfault in another suite
  orphaned a child, and the next run then failed on the port.

  Every server here now takes an OS-assigned port. `spawnServer` passes
  `PORT=0` and reads the number the child logs. No constant names a port.
  `startHttpServer` returns the port it bound, which it did not before. A
  caller passing `PORT=0` had no other way to learn the assignment.

  The startup log line replaced the `/livez` poll. `Bun.serve` has returned by
  the time the child writes that line. A child that logged it is listening, so
  the poll proved the same thing one round trip later.

  `spawnServer` pumps the child's stdout from the spawn. Finding the port means
  reading while the child lives, and a stream reads once. Its reader awaits the
  pump's end, because each test asserts on a line the child writes as it exits.

  Each test kills its child in a `finally`. A mutation run proved it. Three
  tests failed, and no child stayed alive. That covers a failed assertion, not
  a runner that dies abnormally, which runs no `finally`. The ephemeral port is
  what makes the second case survivable.

  `test/schema-bootstrap.test.ts` took the same treatment. It bound 48213 and
  48214 through `startHttpServer`, and carried the same comment about a
  distinct number not colliding. No test now names a port for a listener it
  starts.

  Finding that second file took a wider sweep than the first one. A search for
  `Bun.serve` misses a test that binds through `startHttpServer`. The sweep
  that finds both reads every file naming `process.env.PORT`, `startHttpServer`
  or `Bun.serve`.
