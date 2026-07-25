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
  publishing stays engine-side. UI-chrome i18n (`src/i18n/catalog.ts`) is a
  plain `t(key)` lookup over a fixed English catalog — no locale state, no
  switcher, no persistence (collapsed from an earlier locale-provider +
  switcher design as a ponytail-audit cut: the locale space never grew past
  one). It is unrelated to **content locale** — `ProcessBody`/`Step`/
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
  `POST /instances/:instanceId/release` — each OPTIONS-preflighted, plus the
  read/query surface (see its own entry below). `routes.ts` handlers are
  framework-agnostic (`(parsed request) -> Runtime API call -> {status,
  body}`, never throwing) and resolve the caller's `Actor` via an injected
  `ActorResolver` before calling the Runtime API, replacing client-supplied
  actor trust. `errors.ts::mapError` maps each typed Runtime API error to a
  status (422 validation, 409 guard-refused/concurrency-conflict, 401
  actor-resolution, 403 assignment/claim errors, 500 fallback for
  `PinMismatch` and anything untyped — not-found deliberately stays 500, see
  design.md). `handleSubmit` special-cases `AutomaticCascadeLoop`: the write
  already committed before it raised, so the route reports the resulting
  (now-`faulted`) view as a 200 instead of an error.

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
  `CORS_ALLOWED_ORIGINS=http://localhost:5173` (the editor's Vite dev
  server) so the documented Player-against-engine workflow needs no extra
  reading.
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
  `definitions.ts`, `src/runtime/api.ts`, `src/http/`, `packages/editor/src/player/`):
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
  disjunction (claimed by that actor, OR unclaimed and that actor is an
  assignment candidate) rather than two filters a caller would have to
  combine correctly. `getInstanceRecord(instanceId, page, db)` merges an
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
  password-reset, MFA, refresh or revocation. Users are administered only from
  `src/auth/cli.ts` (`add-user` / `set-roles` / `set-password`) — no HTTP
  route creates, modifies or lists them. The resolver-credential seam changed
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
  is not; if neither is set `devHeaderResolver` stays the default, which is
  what keeps `test/http.test.ts` unchanged and green with no auth env set.
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
  actually send a bearer token cross-origin. The Player
  (`packages/editor/src/player/`) connection form is now a login form (server
  URL + email + password): `client.ts::login` calls `POST /auth/login` and
  `store.tsx` persists `{serverUrl, token}` to `localStorage` (replacing the
  old `{serverUrl, actorId, actorRoles}` shape) instead of actor fields, sends
  `Authorization: Bearer <token>` on every call, and treats any `401`
  (`PlayerClientError.status === 401`) as an invalid session — discarding the
  token and returning to the login screen, which is also how an 8-hour expiry
  surfaces, since the Player tracks no client-side lifetime. **Authorization
  is still out of scope**: every authenticated actor keeps today's
  permissions (any account can publish, cancel any instance, act as any actor
  id it is assigned) — the gap narrows from "anyone" to "anyone with an
  account", it does not close; that is the deliberate follow-up change.
  **Known operational gap, recorded not silently accepted:** `/auth/login`
  has no rate limit. The brake is `Bun.password`'s argon2id cost (~100ms per
  attempt); a correct limiter needs a store shared across processes, which
  this change deliberately does not build.
