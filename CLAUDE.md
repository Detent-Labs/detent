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
src/engine/                executor: instance store, outbox, transitions, timers (later)
examples/                  serialized example definitions
test/                      validate.test.ts (vitest); tests run inside the container
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
  `child` only in subprocess steps); `now()`/`timestamp()`/`duration()` are blocked.
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
  Runtime cancel semantics (skip onExit; onCancel→onEntry(sink); the cancel
  HistoryEntry; outbox + transitionSeq; downward-only subprocess propagation) are
  specified but belong to the engine (#3). Subprocess propagation is downward
  only in v1; no independent upward child cancel.
- No engine and no editor exist yet.

## Roadmap
1. Validation layer (Zod-first): DONE. definition.ts is Zod-sourced with TS types
   via z.infer and the structural invariants as refinements / superRefine; the
   vitest suite test/validate.test.ts exercises them. Remaining: add the
   cross-process invariants that need the child definition (a subprocess
   inputMapping's keys must be in the child contract's inputFields; a callable
   child must not require fields outside its inputFields) once a process registry
   exists to resolve the child.
2. CEL wiring: DONE (authoring-time). Library `@marcbachmann/cel-js`, formal
   expression context defined, every Expression parse- and type-checked against
   the field catalog (`src/cel/check.ts`). Remaining: engine-side evaluation of
   guards/paths and Action.output result-writeback (belongs to #3), and CEL checks
   for migration `transforms` once migration lands (they need the from-version
   catalog).
3. Engine skeleton: instance store, transactional outbox, transition executor
   (onExit/onPath/onEntry ordering), timer scheduler, crash recovery. Persists to
   PostgreSQL via Bun's native `Bun.sql` (no client dependency); connection via
   `DATABASE_URL`. Includes the runtime half of cancellation (contract half is
   done): the cancel transition, its HistoryEntry, and downward subprocess
   propagation, all specified in the `cancel-semantics` change.
4. Editor (likely a separate package; promote the repo to workspaces here).

## Open questions (still need a decision before building the relevant part)
- A dedicated audit event type for version migrations (the transition-shaped
  HistoryEntry fits step changes, not a pure version change).
- The formal expression context is pinned (`src/cel/check.ts`): `instance`
  `{id, status, transitionSeq, currentStepId}`, `actor` `{id, roles}`. Both are
  deliberately minimal; widen when the engine surfaces a concrete need.

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
- Comments state facts, not process history. Concise and technically precise.
- The JSON contract is the foundation. Change the schema (definition.ts / the
  Zod source) deliberately, never as a casual side effect of another task.
- Every invariant that lands ships with a test that rejects a violating input.
