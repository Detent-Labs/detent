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
src/engine/                executor: instance store, outbox, transitions, timers, subprocess, drafts,
                            definitions, migration, admin queries
src/runtime/api.ts         Runtime API Layer: createProcessInstance / getInstanceView / submitAndTransition
                            / claimStep / releaseClaim / cancelInstance / listInstances / getInstanceRecord
src/http/                  REST/JSON wrapper over Bun.serve (routes.ts, admin-routes.ts, studio-routes.ts)
src/auth/                  ActorResolver seam (dev-header + JWT), local accounts, login, roles, CLI
src/handlers/              action handlers; http.request is the only one shipped
examples/                  serialized example definitions
test/                      bun:test suites; tests run inside the container
docs/current-state.md      per-subsystem descriptive counterpart to this file
packages/studio/           Process Studio, the developer's product: server-persisted drafts, canvas
                            editing, panels-as-inspector, JSON surface, publish, versions+diff,
                            migration-plan authoring (React + Vite; HTTP wrapper + exports map)
packages/admin/            operator's product: instances, merged record, outbox, timers, users
                            (React + Vite; talks to the engine only over the HTTP wrapper)
packages/app/              end-user app: participant-facing Login/My-tasks/Task/Start-a-process screens
                            (React + Vite; workspace package, talks to the engine only over the HTTP wrapper)
packages/form-ui/          shared step-form renderer (source-only, no build step); consumed by both
                            packages/editor's Player and packages/app, so what an author previews is
                            what a participant gets
packages/editor/           the original structural editor + read-only Mermaid graph — a proof of concept
                            superseded by packages/studio; deleted when studio-tools-and-player lands
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

A guard is total: a runtime error is not a match, not a throw. The most
common cause is a field the instance has not written yet. The path is not
taken (the wait-state idiom). `@marcbachmann/cel-js` pins an exact version in
`package.json` (no caret). An evaluation-semantics change in the library
must not silently reroute or park an already-published, immutable body. An
upgrade is a deliberate, reviewed commit that re-runs `test/cel.test.ts`,
never an incidental `bun update`.

A subprocess `inputMapping`/`outputMapping` entry now agrees with that rule
instead of contradicting it. A raising entry leaves its target unwritten. It
does not fail the spawn or the return (see "Runtime record" below,
`mapping.entry-dropped`). `Action.output`'s own map is the one exception, on
purpose: it reads only `result`. A raise there means the handler's return
does not match the action's contract. That is worth failing loudly on, not
an unset optional field.

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

Before an `Action.output` value lands in `data`, the outbox checks it against
the target field's declared type — the same rule a participant's own
submission faces. A mismatching entry is dropped, not written, and named in
the `ActionOutcome`'s `droppedTargets`. The delivery still counts as
succeeded, since the side effect already happened. Delivery itself is
bounded by the outbox's own deadline, derived from its claim lease, no
matter what the handler does. One hung delivery cannot stop the worker.

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
`Step.assignment.strategy.type`, checked directly — see `docs/current-state.md`.) The
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
`at`. Ten kinds exist — `timer.fired` (a reminder fired: actions enqueued, no
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
payload `{actorId}`), `assignment.released` (the claimant released their
claim on the current step; payload `{actorId}`), `instance.faulted` (an
automatic cascade re-entered a step it already entered and was parked `faulted`;
payload `{stepId, reason}`, `stepId` the repeated step), and `mapping.entry-dropped`
(a subprocess `inputMapping`/`outputMapping` entry raised, or its result could not
be made JSON-safe, so its target field went unwritten; payload `{fieldId,
direction, reason}`, `direction` `"input"` or `"output"`; recorded on the PARENT,
since both mappings evaluate over its context, in the same transaction as the
spawn's or the return's own commit). The latter four are not
transition-shaped either — no step change, so no HistoryEntry and no
`transitionSeq` advance, the same reasoning as `migration.skipped`; the flip and
the event for `instance.faulted` commit in one transaction, guarded by the same
OCC predicate, so a `faulted` instance cannot exist without its event.
Kinds are added additively; the record shape is settled. A kind that enqueues
actions carries their `ActionOutcome`s — `timer.fired` and
`subprocess.spawn-enqueued` do, the other eight enqueue nothing and so must not
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
Per-subsystem detail lives in `docs/current-state.md`; stage-by-stage status in
`ROADMAP.md`. For "what does X do" prefer the knowledge graph (see "Codebase
memory" below) over either — the code is the source of truth, those files are
the map.

## Roadmap
See `ROADMAP.md` for stage-by-stage status (DONE/NOT STARTED) and what each stage covers.

## Open questions (still need a decision before building the relevant part)
- The formal expression context is pinned (`src/cel/check.ts`): `instance`
  `{id, status, transitionSeq, currentStepId}`, `actor` `{id, roles}`. Both are
  deliberately minimal; widen when the engine surfaces a concrete need.

## Decided, not yet built (each needs its own OpenSpec change)
- **CEL-readable data-source results.** Runtime option-list resolution for
  `field.dataSource` is DONE (see `docs/current-state.md`) — but `src/cel/check.ts`
  still registers a data source at no site (guards/output/transforms), so a CEL
  reference to one remains a publish error (`unknown variable`). Widening that is
  a separate, more consequential decision (an unresolvable reference there could
  only park a wait-state forever or throw mid-delivery); it stays deliberately
  out of scope until a concrete need for CEL-visible data-source values exists.
- **A second (dynamic/I/O-backed) data-source type.** The `DataSourceRegistry`
  mechanism holds more than one type, but only the built-in `"static"` handler
  ships. A live type (e.g. an HTTP-backed data source) is deferred until a
  concrete need exists — its timeout/cache/error semantics are open questions
  not worth deciding speculatively.

## Codebase memory (knowledge graph)
The repo is indexed into codebase-memory-mcp (`full` mode, covering the engine,
the Runtime API Layer, the HTTP/auth layers, and every frontend package
(`packages/studio`, `packages/admin`, `packages/app`, `packages/form-ui`,
`packages/editor`); `packages/*/{dist,node_modules}` excluded). Resolve the `project` arg via `list_projects` (match on root_path);
the slug is machine-specific, never hardcode it. Entry points: `search_graph`
(find symbols), `get_code_snippet` (read a body), `trace_path` (callers/callees,
`mode=calls|data_flow|cross_service` — useful for tracing across the
engine↔runtime↔editor/app boundary, e.g. `packages/editor` or `packages/app` ->
`workflow-engine` exports -> `src/engine/`), `query_graph` (Cypher), `get_architecture`,
`search_code` (graph-augmented text search). Real call chains exist now — prefer
the graph over Read/grep for "who calls X" / "what does Y touch" questions that
span more than a file or two; Read/grep is still fine for a single known file.
The index goes stale as code changes: `detect_changes` shows impact since a ref;
re-run `index_repository` (full re-index, not incremental) after a substantial
change lands.

## Conventions
- TypeScript strict, ESM.
- **UI work in `packages/editor`, `packages/app`, `packages/admin`,
  `packages/studio`, or `packages/form-ui` goes through the design skills
  first.** Before implementing or reshaping any screen or component, invoke
  `/frontend-design:frontend-design` for visual direction; for UI/UX work
  also pull in the installed Vercel skills (`web-design-guidelines`,
  `vercel-react-best-practices`, `vercel-composition-patterns`) — do not
  default to plain React/CSS choices. Prefer semantic HTML5 elements
  (`<nav>`, `<main>`, `<button>`, `<dialog>`, ...) over generic
  `<div>`/`<span>` soup.
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
  - Running commands inside the devcontainer without the `devcontainer` CLI
    (docker compose invocation, Windows Git Bash path fix, exposing a dev
    server port): see the `devcontainer-exec` skill.
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
- **Running `bun test` wipes whatever manual/demo state was in the devcontainer's
  Postgres** — the same `beforeEach` truncates that make DB suites reliable
  (`definitions`, `instances`, `history_entries`, `instance_events`, `outbox`,
  `auth_users`, ...) run against the one database the running dev server
  (`bun run serve`) also reads and writes when you're manually exercising the
  end-user app or editor Player in a browser. There is no separate database for
  manual/demo use. Observed twice in one session: a demo user (`auth_users`) and
  a demo process's instances were both silently wiped by a `bun test` run
  started for unrelated regression verification, mid-demo. If you need durable
  demo state alongside test runs, recreate it after the last `bun test` run, or
  set up a dedicated database for manual testing (not yet done — see the
  `pg-test` container pattern used for host-run tests in memory as a starting
  point, though that's for tests, not demo persistence).
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
