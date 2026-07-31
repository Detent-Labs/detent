# Current State

What is built, per subsystem. The load-bearing rules an implementation must
uphold live in `CLAUDE.md`; this file is the descriptive counterpart.
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

  `packages/studio/src/draft/validation.ts::runValidation` catches
  `CompileValidationError` alongside the pre-existing `DurationValidationError`.
  It renders the caught issues under a new `"structural"` `IssueSource`.
  Without that catch, the error would propagate uncaught and crash Studio's
  live-validation panel. Known gap, documented on `runValidation` itself: the
  unknown-key check can never fire from Studio's live validation.
  `runValidation` first runs `authoredProcessBody.safeParse`. That Zod parse
  strips undeclared keys before `compileProcessBody` ever sees them. Only the
  real `POST /processes` publish call catches an unknown key, since it runs
  `compileProcessBody` on the raw, un-parsed body.
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
  see "Extensibility" in `CLAUDE.md`),
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
  `CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:5175`
  (`pin-frontend-dev-ports`): the three frontend dev servers, each pinned to
  its own port in its `vite.config.ts` (`app` 5173, `admin` 5174, `studio`
  5175, each with `strictPort: true` so a taken port fails
  startup instead of silently sliding to the next free one), so all three can
  run at once against one engine, in any start order, with no configuration
  edit.
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
  "Runtime record" in `CLAUDE.md`). `submitAndTransition` now enforces claimant-only
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
  built" in `CLAUDE.md`).
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
  strings checked directly, the same pattern as
  `Step.assignment.strategy.type`'s single `"static"` check. Deliberately
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
- Content-Security-Policy for the four SPAs
  (`packages/{app,admin,studio,editor}/vite.config.ts`,
  `harden-auth-configuration`): rides along in the same change, at the same
  blast radius. Every browser package's production build now emits a
  Content-Security-Policy meta tag (`script-src 'self'`, `object-src 'none'`,
  `base-uri 'none'`, `form-action 'self'`, `frame-ancestors 'none'`,
  `connect-src` derived from `VITE_API_URL`). A build-only Vite plugin
  injects it, so `bun run dev` keeps working as before. This is defense in
  depth for the bearer token in `localStorage`. Its 8-hour expiry means
  nothing can revoke it early. There is no known injection sink in the tree
  today.
- End-user app (`packages/app`, `packages/form-ui`, `add-end-user-app`): the
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
- Admin area (operations) (`packages/admin`, `src/engine/admin-queries.ts`,
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
  only a *live-claimed* row blocks migration. `packages/admin` mirrors
  `packages/app`'s shape (own `package.json`/`vite.config.ts`/`tsconfig.json`,
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
- Admin area (user administration) (`packages/admin`, `src/auth/users.ts`,
  `src/http/admin-routes.ts`, `admin-users`, `admin-user-management`): stage
  10's second of three changes, the one HTTP carve-out from
  `local-user-accounts`'s CLI-only administration. `src/auth/users.ts` gains
  `listUsers` (every `auth_users` row as `{userId, email, roles, disabled}`,
  never `password_hash`) and `setDisabled(userId, disabled, db)` — keyed by
  `userId`, unlike `setRoles`/`setPassword`'s `email`, since its caller is a
  row from a `listUsers` result rather than a human typing an address they
  know; it returns the updated row via `RETURNING`, or `undefined` for an
  unknown id, so the HTTP handler needs no follow-up query to answer 200/404.
  Three new `system:admin`-gated routes in `admin-routes.ts`: `GET
  /admin/users`, `POST /admin/users/:id/disable`, `POST
  /admin/users/:id/enable`. Creating a user, changing a password, or
  assigning roles remain CLI-only — this change adds no HTTP path for any of
  those three. Disabling takes effect on the user's *next* login attempt only;
  it does not revoke a JWT already issued to them, since token verification
  performs no per-request database lookup (proven by an end-to-end test:
  log in, disable via the new route, the pre-disable token still
  authenticates, a fresh login attempt then fails). `packages/admin` gains a
  `/users` screen — list plus a disable/enable toggle, the disable action
  behind a confirmation naming that caveat — with no create/password/role
  controls.
- Process Studio — shell and drafts (`packages/studio`, `src/engine/drafts.ts`,
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
  never the request body. `packages/studio` mirrors `packages/app`'s shape
  (own `package.json`/`vite.config.ts`/`tsconfig.json`, React 18 + Vite 6, a
  hand-written History-API routing hook, `session.ts` for the JWT under its
  own storage key) the way `packages/admin` does, plus `immer` and `zod`; no
  `form-ui`, `mermaid` or `@panzoom/panzoom` yet. Login and the
  role-gated-empty-state shell follow `packages/admin`'s pattern exactly
  (`system:developer` in place of `system:admin`) — presentational only, the
  server-side `requireRole` is the enforcement. The editor's `draft/`,
  `panels/`, `i18n/` and `registry/` were copied into `packages/studio/src`
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
  following `packages/app/src/screens/inboxLogic.ts`) merges
  `GET /processes` with `GET /drafts` into one row per process id — draft-only,
  published-only, or both — with new/open/discard actions; "New process"
  mints a `proc_`-prefixed id client-side and issues exactly one
  `PUT /drafts/:processId` at `revision = 0`, no server-side id allocation.
  (Since `seed-draft-from-published`, "Create draft" on a *published* row no
  longer writes an empty body — see the seeding entry at the end of this file.)
  Publishing, canvas editing, the JSON surface, and migration planning are not
  part of this change; the existing editor's export path plus `POST
  /processes` remains the only publish path until change 4.
- Process Studio — canvas (`packages/studio/src/canvas/`, `StepsPanel.tsx`,
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
  dragged, so an unrelated save doesn't invent layout rows. `@panzoom/panzoom`
  (already a dependency of `packages/editor`'s read-only graph view, before
  that package was deleted) drives pan/zoom and a "fit to view" control;
  every node and edge `<g>` carries
  Panzoom's own `panzoom-exclude` class — found live during implementation
  (a real browser check via `playwright-cli`, not just `bun:test`, which
  can't see DOM event ordering): without it, Panzoom's native down-handler,
  bound directly to the SVG element, wins the race against React's synthetic
  dispatch and silently turns every node drag and drag-to-connect into a
  canvas pan instead. `canvas/geometry.ts` (hit-testing, drag-delta) and
  `canvas/connection.ts` are pure and unit-tested alongside `layout.ts`; the
  SVG/React rendering and pointer wiring itself is not, per this repo's
  existing convention (`packages/app/src/screens/inboxLogic.ts`). The canvas
  introduces no operation the panels can't already do — deletion and every
  field edit remain panel-only.
- Process Studio — lifecycle (`src/http/studio-routes.ts`, `src/engine/drafts.ts`,
  `src/http/errors.ts`, `packages/studio/src/panels/DraftToolbar.tsx`,
  `packages/studio/src/screens/{VersionsScreen,MigrationPlanScreen}.tsx`,
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
  since it previously fell through to the generic 500. `packages/studio`
  gained: a Publish action on the edit screen, gated by a dirty-check pure
  module (`screens/publishGateLogic.ts::isDirty`, comparing the in-browser
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
  dry-run panel — no field-by-field form exists anywhere in the repo for
  `MigrationSpec`'s shape to extend, and the server already owns validation
  at `PUT /migration-plans/...`, so a bespoke widget-per-field UI would only
  duplicate it. Deliberately out of scope: *executing* a migration plan
  (stays `admin-migration-run`'s future `POST /admin/migrations/run`, an
  operator action) and the registry/CEL-scratchpad tools screen plus Player
  (`studio-tools-and-player`).
- Process Studio — JSON view (`packages/studio/src/panels/{JsonView,
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
  `packages/studio/src/draft/load-guard.ts` rather than reimplemented more
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
  `packages/studio/src/screens/{ToolsScreen,PlayerScreen}.tsx`,
  `packages/studio/src/screens/{toolsScratchpadLogic,playerLogic}.ts`,
  `packages/studio/src/api/{client,types}.ts`, `studio-tools-and-player`):
  stage 11's fifth and last change. Closes the stage's remaining gap and
  deletes `packages/editor` outright — every capability it alone provided
  is retired (no replacement); every capability it shared with
  `packages/studio` already had an independent copy there.

  Adds two screens. The **Tools** screen (`/tools`) shows the running
  server's registered plugin type names — action-handler types and
  data-source types, nothing more (no `configSchema`, no config values) —
  via a new `GET /registry` route (`DEVELOPER_ROLE`-gated, unprefixed like
  the other studio-only routes), and a static CEL scratchpad: an expression
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
  logged-in session for everything else, so `packages/app`'s
  `TaskScreen`/`api/client.ts` — which already calls the same routes over
  that same shared-session model — served as the template instead:
  `packages/studio/src/api/client.ts` gained `createInstance`,
  `getInstanceView`, `submitPath`, `claimStep`, `releaseClaim`, and
  `getInstanceRecord`, reusing the package's existing `request()`/
  `StudioClientError`, and `form-ui` became a new dependency of
  `packages/studio` (it had none before Player existed) — including the
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
  with no replacement (superseded by an existing `packages/studio`
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

- CI (`.githooks/pre-push`, `add-ci-and-dependency-hygiene`): no hosted
  service runs this repository, by the owner's decision. The gate is a
  `pre-push` hook, which runs `bun run check` (typecheck, then `bun test`)
  through `docker compose exec` in the dev container. A non-zero exit blocks
  the push. Running there closes the finding's real hazard: the container's
  environment already carries `DATABASE_URL`. So the 500+ database-backed
  test sites that make up most of the suite cannot skip silently and report a
  meaningless green. It also pins Bun to the Dockerfile's version, so no
  host-side drift.

- Two gaps the hook has and a hosted gate would not. `--no-verify` bypasses
  it. A clone arms it with `git config core.hooksPath .githooks` (README's
  Develop block); until then it is inert.
<!-- antislop: allow sentence-length -->
- Dependency-manifest fixes ride along in the same change. `zod` now lives in
  the root's `dependencies`, not `devDependencies` as before. Six modules
  under `src/` import it as a value, and the public schema export reaches
  it. `packages/app` now declares it as a dependency of its own.
  `packages/form-ui` declares it as a peer dependency, matching how it
  already declares react. `@marcbachmann/cel-js` now pins an exact version
  instead of a caret range — see `CLAUDE.md`'s one-CEL-library rule for why.

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
  `packages/studio/src/screens/processListLogic.ts`,
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
  Risks section. Registered unauthenticated in `server.ts`, alongside
  `/livez`/`/readyz`, ahead of every auth-dependent route.

  Returns `HttpBinaryResult`, not `HttpResult`. `server.ts`'s shared
  `toResponse` always `JSON.stringify`s an `HttpResult` body. That would
  corrupt exposition text, so `/metrics` reuses the same non-JSON
  response type attachment download already established. On a query
  failure the handler never throws. It reports 503 with an empty body
  instead, the same signal `/readyz` gives a failed DB ping. That beats a
  crash, and it beats a false all-zero 200 that would read as "healthy,
  nothing overdue".

<!-- antislop: allow sentence-length run-ons passive-voice -->
- Environment promotion (`packages/studio/src/screens/promotionExportLogic.ts`,
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
