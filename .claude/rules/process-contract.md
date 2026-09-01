---
paths:
  - "src/schema/**"
  - "src/engine/**"
  - "src/cel/**"
  - "src/runtime/**"
  - "src/handlers/**"
  - "packages/web/src/areas/studio/**"
  - "openspec/**"
  - "examples/**"
  - "docs/authoring-guide.md"
---

<!-- antislop: allow-file synonym-rotation em-dash passive-voice sentence-length run-ons paragraph-length -->
# The definition contract: load-bearing rules

JSON is the one artifact; the Zod schemas (with TS types derived via z.infer)
are the definition contract. All of the following are facts the engine and
studio must uphold, not open questions. The root `CLAUDE.md` carries the short
form. `contract` alone names the `ProcessContract` a subprocess declares, the
subject of the "Subprocesses" section below, never this document's subject.

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
mapping and is never visible to guards. Use ONE CEL library for both the studio
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
Each step carries a flat `view` whose entries either reference a catalog
field, overriding its per-step presentation (visible / required / readonly /
order / group), or stand alone as a note (`text`, plus visible / order /
group — no field underneath, so no required or readonly). The instance
payload is a flat object keyed by `fieldId`, stable across the whole
lifecycle. Requiredness lives only in the view, never in the catalog.
`FieldDef.technical` refines that rule rather than breaching it: it is a
catalog-level fact that forces `required: false, readonly: true` on every
step, and a view entry naming a technical field may declare neither key at
all. Ordinary, per-step requiredness stays exactly where it was.

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
result-driven automatic paths, not hidden transaction semantics. `Path.key`
must be non-empty after trimming, and `Path.label` is required and must be
non-empty after trimming, for a path of either trigger kind. `Path.key` stays
format-free, exempt from the CEL-identifier grammar `FieldDef.key` carries —
nothing reads a path key as a CEL variable. `Path.label` is a plain,
non-localized string, but it is rendered to a process participant:
`PathButtons.tsx` uses it as a manual path's submit-button text.

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
core validates only the envelope; each plugin ships its own JSON Schema.
`Step.assignment.strategy.type` resolves through its own `AssignmentRegistry`
(`registry.ts`), a third sibling beside the action `Registry` and the
`DataSourceRegistry`; `"static"` is a registered entry there — the type an
author gets by default; `org.manager-of-starter` and `org.group-members` also
ship — not a literal any engine code compares against. An entry declares a candidate resolver
(`(ctx) => Promise<string[]>`, async even for `static`, over the narrow context
`{ config, stepId, instance: { id, startedBy, data }, db }`) and may declare a
config schema. `db` is the instance's OWN database, and it is required: under
multi-tenancy a handle bound when the registry was built would resolve every
tenant's manager against one directory. The same rule holds for a handler
(`HandlerContext.db`) and a data source (`DataSourceContext.db`). The
registry maps `type -> { config schema }` (`registry.ts`,
`HandlerDef.configSchema`) and is validated at PUBLISH time: `publishBody`
calls `validateReferences` (`src/validate.ts`), which resolves every action's
`type` against a supplied `RegistryDescription` via `resolveType`, and, when
the caller supplies a live registry (only `publishBody` does), parses the
action's `config` against the handler's declared `configSchema` via
`checkConfigOnly` (both in `src/engine/registry-check.ts`) — an unknown type
or a schema-violating config is a publish error (`RegistryValidationError`,
carrying every located issue), never a runtime one. Every action position is
covered — `onEntry`, `onExit`, `onCancel`, each path's `onPath`, each timer's
`onFire.actions` — the same five positions the CEL check visits.
`validateReferences` is invoked **before** CEL and cross-process validation,
on the compiled body, after the hash-hit no-op return — same placement rule
as the other publish-time checks, so a body published before a handler was
registered (or before its `configSchema` tightened) is not retroactively
rejected on identical re-publish. `checkActionRegistry` still exists,
exported with its existing `(body, registry)` signature, as the combined
wrapper over both halves for a caller wanting one call — `publishBody` no
longer calls it directly. A handler with no declared `configSchema` accepts
any `config` (opt-in strictness). The reserved `core.` prefix
(`SPAWN_ACTION_TYPE`/`RETURN_ACTION_TYPE`) is exempt from the
registry-resolution check — those types are dispatched internally by
`subprocess.ts`, never through this author-facing registry, and are
separately rejected in *authored* bodies by the existing Zod refinement in
`authoredProcessBody`. That exemption does not extend to an assignment
strategy: no internal dispatch reaches one, so a `core.` type there is an
unknown type like any other. `checkAssignmentRegistry` and
`checkDataSourceRegistry` are the matching combined wrappers, each still
exported with its own existing signature; `publishBody` reaches the same
verdicts indirectly, through `validateReferences`'s own `resolveType`/
`checkConfigOnly` calls against each dimension's own registry, at the same
placement, throwing `AssignmentRegistryValidationError` /
`DataSourceRegistryValidationError`. Data sources are never
inlined; fields bind to them by id and options resolve at runtime.

`org.group-members`, one of the two org-aware assignment strategies, adds a
fourth, DB-resolving publish-time check beside `validateCrossProcess` and
`validateProcessChaining`: for every entry in the body's own `allowedGroups`,
`publishBody` confirms a group with that id exists in the `groups` store
(`src/auth/groups.ts`) and that its scope permits the publishing process,
throwing `GroupScopeValidationError` on any violation. It runs at the same
placement as the other two — after the hash-hit no-op return, so an
already-published body's re-publish stays a no-op even after a referenced
group's scope narrows underneath it (`group-scope-validation`).

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
`at`. Twelve kinds exist — `timer.fired` (a reminder fired: actions enqueued, no
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
claim on the current step; payload `{actorId}`), `assignment.delegated` (the
claimant delegated their claim to a named target actor, who does not join
`assignment.candidates`; payload `{fromActorId, toActorId}`), `instance.faulted` (an
automatic cascade re-entered a step it already entered and was parked `faulted`;
payload `{stepId, reason}`, `stepId` the repeated step), and `mapping.entry-dropped`
(an `inputMapping`/`outputMapping` entry raised, or its result could not be made
JSON-safe, so its target field went unwritten; payload `{fieldId, direction,
reason}`, `direction` `"input"` or `"output"`; a subprocess spawn or return
records it on the PARENT, and a `process.start` action records it on the ACTING
instance, since in each case that is whose context the mapping evaluated, in the
same transaction as the spawn's, the return's, or the chain-start's own commit),
and `assignment.unresolved` (a step entry
resolved its declared assignment to no candidate, because the resolver raised,
exceeded its deadline, or answered empty; payload `{stepId, reason}`, reason one
of `resolver-raised`/`timed-out`/`no-candidates`; resolution is total, so the
entry committed with empty candidates, and the event lands in that same
transaction). The latter six are not
transition-shaped either — no step change, so no HistoryEntry and no
`transitionSeq` advance, the same reasoning as `migration.skipped`; the flip and
the event for `instance.faulted` commit in one transaction, guarded by the same
OCC predicate, so a `faulted` instance cannot exist without its event.
Kinds are added additively; the record shape is settled. A kind that enqueues
actions carries their `ActionOutcome`s — `timer.fired` and
`subprocess.spawn-enqueued` do, the other ten enqueue nothing and so must not
invite a reader to expect outcomes.

An `ActionOutcome` attaches to the record that **enqueued** the action, carried on the
outbox row rather than derived from `(instanceId, transitionSeq)`. That derivation is
exact for a transition and wrong for an event: a reminder's outcomes would join the
preceding transition's entry, and on a step an instance was created on — sequence 0,
no entry exists — the update would match no row and discard the outcome silently.
