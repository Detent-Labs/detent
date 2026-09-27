---
paths:
  - "src/schema/**"
  - "src/engine/**"
  - "src/cel/**"
  - "src/runtime/**"
  - "src/handlers/**"
  - "src/validate.ts"
  - "packages/web/src/areas/studio/**"
  - "packages/form-ui/**"
  - "openspec/**"
  - "examples/**"
  - "docs/authoring-guide.md"
---

# The definition contract: load-bearing rules

JSON is the one artifact. The Zod schemas, with TS types derived via
`z.infer`, are the definition contract. `CLAUDE.md`'s "The definition
contract in brief" states the short form of every section below. This
file gives the full version. The word `contract` alone names the
`ProcessContract` a subprocess declares. That is the subject of the
"Subprocesses" section below, never this document's own subject.

**Identity.** Every entity has an opaque `id`: UUIDv4 with a type prefix
(for example `step_...`), lowercase, and immutable. The `key` is a
human-readable slug that references nothing and may change. The `label`
is display text. Cross-references and persisted instance state use `id`
only. Ids are unique per entity kind per process.

The engine mints runtime ids (instance `inst_`, history `hist_`, event
`evt_`) via `crypto.randomUUID()`, which produces UUIDv4. The id schema
checks only the prefix, so nothing constrains the UUID version
underneath. Because the schema checks only the prefix, the two
subprocess examples deliberately use readable ids (`proc_credit_check`,
`step_...`) for legibility. That is a documentation convenience rather
than the authoring convention. See `expense-approval.json` for the real
one.

**Hashing / versioning.** `CLAUDE.md`'s brief states `definitionHash`,
immutability, and the instance pin. See it for the short form. The JCS
hash covers `ProcessBody` only. Hashing skips the versioned wrapper, so
identical bodies get identical hashes and a re-publish of one is a no-op.
An instance rehydrates against exactly the frozen body its pin names.
Nothing deletes a published version.

A new optional `ProcessBody` key always uses `.optional()` instead of
`.default()`. The `canonicalize()` function drops an undefined key, so an
older body keeps its `definitionHash`. That rule does not reach a record
outside `ProcessBody`; the instance `kind` field, for example, still
defaults. Migration is explicit and pin-by-default: one rule applies to
every instance on a version, with no per-instance editing. A migration's
`transforms` entries read `data` from the source catalog and `instance`
only, and the environment withholds `result`, `child`, data sources, and
`actor`.

**Expressions.** `CLAUDE.md`'s brief covers CEL's shape, purity, and total
evaluation. This section states where each namespace is visible. Guards
read the frozen context: `data`, `instance`, `actor`, plus
`child.outcome`/`child.data` inside a subprocess step. A declared data
source is not a readable CEL namespace. A CEL reference to one is a
publish error, since the engine resolves none. One extra namespace,
`result` (a handler's structured return), is scoped only to an
`Action.output` mapping and stays invisible to guards. Use one CEL
library for both the studio (parse) and the engine (evaluate), so the two
cannot drift apart on semantics.

A raising guard means no match. It is never a throw, a park, or an error
surfaced to a participant. The most common cause is a field the instance
has not written yet. The instance then waits at that path, the wait-state
idiom, since nothing matched.

The library `@marcbachmann/cel-js` pins an exact version in
`package.json`, with no caret. An upgrade is a deliberate, reviewed
commit that re-runs `test/cel.test.ts`. An evaluation-semantics change in
the library must not silently reroute or park an already-published,
immutable body.

A subprocess `inputMapping`/`outputMapping` entry follows the same
total-evaluation rule. A raising entry leaves its target field unwritten.
It does not fail the spawn or the return; see "Runtime record" below,
`mapping.entry-dropped`. The `Action.output` map is the one exception: it
reads only `result`. A raise there means the handler's return does not
match the action's contract. That fails loudly rather than leaving an
optional field unset.

**Data vs presentation.** The catalog defines each field once,
process-wide. Each step carries a flat `view`. Its entries either
reference a catalog field or stand alone as a note. A field entry
overrides the field's per-step presentation: visible, required,
readonly, span, tab, validation, or validationMode.

The discriminant is `kind`. A note carries `kind: "note"` and adds
`text`, plus visible / span / group / tab. A note has no field
underneath. It takes no required, readonly, or validation key. A field
entry has no `kind` at all (`definition.ts:727-755`).

A field entry's `group` is not a per-step override. It must repeat the
catalog's own parent group. A field the catalog holds at the top level
leaves `group` empty.

There is no `order` key; the array position is the order, and
`FieldForm.tsx` renders in declaration order. The instance payload is a
flat object keyed by `fieldId`, stable across the whole lifecycle.
Requiredness lives only in the view, never in the catalog. The
`FieldDef.technical` flag refines that rule rather than breaching it: it
forces `required: false, readonly: true` on every step. A view entry
naming a technical field may declare neither key at all. Ordinary,
per-step requiredness stays exactly where it was.

**Redaction marker.** `FieldDef.redactable` marks a field's historical
values eligible for erasure. The instance audit log's redaction path
clears a redactable field across its whole history and leaves every
other field untouched. No other reader looks at the flag: not a CEL
type-check, not view resolution, and not another publish-time rule. A
`redactable` field must not be `type: "group"`, enforced as a write-path
check (`compile.ts::checkRedactableFields`). `redactable` and
`technical` are independent. A declared `redactable: false` is a key in
the canonical JSON, distinct from an absent key.

**Field semantics.** A `FieldDef` declares `type`, the value form. It may
add `format` (the semantics over that form) and `control` (the input
widget). The table `definition.ts::ALLOWED_BY_TYPE` lists every allowed
pair per type. The publish-time check reads it
(`compile.ts::checkFieldFormatControl`), the one reader of that table in
`src/`. A plugin envelope has no row there, so a plugin-typed field may
declare neither key.

The key `format` has readers beyond the publish check: `typeMatches`,
`celType`, and `src/runtime/fields.ts` (person options). The
`org.actor-from-field` check in `compile.ts` reads it too. The key
`control` has three readers: the form renderer, `definition.ts::fieldKindOf`,
and several studio files. Those studio files size a canvas card row,
label a field kind, and detect a kind change.

The studio has no format picker and no control picker. Its kind picker
(`FieldCatalogPanel.tsx::KindPicker`) writes whole `{type, format,
control}` triples from `definition.ts::FIELD_KINDS`. That table curates
sixteen of the twenty-five combinations `ALLOWED_BY_TYPE` admits.

The field `FieldDef.columnMapping` maps a data source column key onto
another catalog field. The engine resolves the picked option and checks
the attribute against the target's declared type. Its bounds live in
`compile.ts::checkColumnMapping`. The field needs a `dataSource` and
`type: "string"`. Each key matches the field-key grammar and length
bound. Each target resolves, and is neither a group nor the mapping
field itself.

No two keys name one target. Publishing reads no data list, so a key
naming no declared column publishes and writes nothing at runtime. A
mismatch between the resolved value and the target field's declared type
makes the engine drop it. The submission still succeeds, and
`datasource.attribute-dropped` records the drop.

**View layout.** `View.columns` and `ViewField.span` are layout only,
each `1` or `2`, absent meaning 1. Neither reaches a guard, a CEL context
or a submission check. The renderer clamps a span to
`min(span, columns)`. A span wider than the grid draws narrow, a
rendering rule rather than a publish error. Both keys are optional, per
the hash-stability rule under "Hashing / versioning" above.

The keys `View.tabs` and an entry's own `tab` are layout the same way.
`tabs` is an ordered array of `{ key, label }`. An entry's `tab` names
one member's `key`, exactly as `group` already names a group field's
`key`. Neither reaches a guard, a CEL context or a submission check, and
a required field stays required on every tab. Both keys are optional,
per the same hash-stability rule. Five rules in `definition.ts`'s `view`
superRefine hold the tab/field/group hierarchy together; see
`authoring-invariants.md`.

**View validation override.** A `ViewField` may override the catalog
field's `validation`, the same shape `FieldDef.validation` carries.
`validationMode` says how the two combine. `"merge"`, the default when
`validation` is present, overlays the step's keys on the catalog's.
`"replace"` drops the catalog value whole. A `validationMode` without
`validation`, and a `validation` with no key set, both fail to parse: two
Zod refinements on `viewField` itself.

**Actions and triggers.** Actions are declarative handler references
(`{ type, config }`), never inline code. Triggers run in order:
`onExit(source)`, then `onPath`, then `onEntry(target)`. `CLAUDE.md`'s
brief states the commit-then-dispatch outbox order; see it for the short
form. The default idempotency key is a deterministic UUIDv5 hash of
`instanceId + transitionSeq + actionId`. The `transitionSeq` counter is
monotonic per instance and doubles as the optimistic-concurrency token.

Action results write back into `data` via `Action.output`, keyed by
target `FieldId` and valued by a CEL expression over `result`. The
handler returns. The engine performs the write. Timers are first-class
on the step; the engine computes fire time at entry and persists it. A
timer-forced transition bypasses its target path's guard.

The flag `ActionOutcome.suppressed` marks a delivery whose whole
writeback the engine withheld. The instance was not running, or had
migrated, by the time the action's result arrived. Before an
`Action.output` value lands in `data`, the outbox separately checks each
entry against its target field's declared type, the same rule a
participant's own submission faces. The outbox drops a mismatching entry
rather than writing it, and names it in the `ActionOutcome`'s
`droppedTargets`. The delivery still counts as succeeded, since the side
effect already happened. The outbox's own deadline, derived from its
claim lease, bounds delivery itself, whatever the handler does. One hung
delivery cannot stop the worker.

**Paths.** A path has `trigger: manual | automatic` and an optional
`guard`. `authoring-invariants.md` states the all-manual-or-all-automatic
rule and the priority-uniqueness rule; this section states only their
runtime meaning. Among automatic paths, the lowest `priority` evaluates
first, and the first matching guard wins. A wait-state has no default:
no match means the instance waits, bounded by a timer. A gated side
effect takes the shape of a visible wait-state with result-driven
automatic paths, instead of hidden transaction semantics.

The key `Path.key` must be non-empty after trimming, for either trigger
kind. The label `Path.label` must also be non-empty after trimming. The
key stays format-free, unlike `FieldDef.key`'s CEL-identifier grammar:
nothing reads a path key as a CEL variable. The label is plain and
non-localized. A participant still sees it, though: `PathButtons.tsx`
uses it as a manual path's submit-button text.

**Cancellation.** `cancellable` is a flag on both the body and the step
(`definition.ts:920`, `:989`). A cancellation synthesizes a hidden cancel
path. Its `onPath` actions are the step's own `onCancel` actions. The
engine skips the step's `onExit` for this transition. `authoredProcessBody`
reserves the cancel-sink id, key, and outcome for the engine alone. The
`cancellation` spec covers the rest.

**Collaboration.** `comments` and `attachments` are flags on both the
body and the step. A step's own entry wins over the process's entry.
The process's entry wins over the default, `true` (`definition.ts:821-830`).

**Subprocesses.** Call-and-return happens through a `subprocess` step,
itself a wait-state. A process used as a subprocess declares a
`ProcessContract`: input fields, output fields, and an enumerated set of
`outcomes`. Terminal steps bind to an `outcome`. Callers guard on
`child.outcome`, never on the child's internal step id or key. The field
`SubprocessSpec.versionBinding` is required, `latest-at-spawn` or
`pinned`, with no default; the studio editor preselects `pinned`.

A `latest-at-spawn` binding pins by `contractRef`, a hash of the child
contract the parent validated against. A contract change starts a new
signature. Existing callers keep the newest matching child instead of
silently adopting the change. This pins the interface while the
implementation floats. A spawn refuses a child once the parent's own
nesting depth reaches 16 (`MAX_SUBPROCESS_DEPTH`,
`src/engine/subprocess.ts`). The cap backs up `validateSubprocessCycle`.

**Extensibility.** A field's own `type` may also be a `{ type, config }`
envelope, but no registry resolves it (`definition.ts:344`). A guard is
never a plugin envelope; it stays CEL-only.

Custom actions, data sources and assignment strategies are plugins
behind one envelope, `{ type, config }`. Three
registries resolve them: the action `Registry`, the `AssignmentRegistry`,
and the `DataSourceRegistry` (`registry.ts`). No action type is exempt
from registry resolution, `core.` included. The two internal subprocess
handlers register their own `configSchema` (`src/engine/subprocess.ts`).
A candidate resolver, a handler, and a data source each take a `db`
handle scoped to the instance's own tenant. A handle bound once at
registry-build time would resolve every tenant against one directory.

The function `publishBody` calls `validateReferences`
(`src/validate.ts`), which checks every action's `type` and `config` at
five positions: `onEntry`, `onExit`, `onCancel`, each path's `onPath`,
and each timer's `onFire.actions`. It resolves assignment strategies and
data sources the same way. The check runs after the hash-hit no-op
return. A body published before the handler's registration stays valid
on an identical re-publish. It throws the results in a fixed
order: action registry, assignment registry, data source registry, then
CEL (`definitions.ts:688-704`). The class
`DataSourceRegistryValidationError` also carries
`checkInstanceQueryValueFromField`'s issues.

An unresolved type or a schema-violating config throws one error class
per registry: `RegistryValidationError`, `AssignmentRegistryValidationError`,
or `DataSourceRegistryValidationError`, each carrying every located
error. A handler with no declared `configSchema` accepts any `config`.
An assignment strategy's own `configSchema` is a Zod schema too
(`registry.ts:68`); the studio descriptor converts it to JSON Schema
(`src/engine/config-descriptor.ts`). A field binds a data source by its
id, never inline, and its options resolve at runtime, never at publish.

The strategy `org.group-members`, one of three org-aware assignment
strategies, adds a third DB-resolving publish-time check beside
`validateCrossProcess` and `validateProcessChaining`. For every entry in
the body's own `allowedGroups`, `publishBody` confirms a group with that
id exists in the `groups` store (`src/auth/groups.ts`). It also confirms
the group's scope permits the publishing process. A violation throws
`GroupScopeValidationError`. It runs at the same placement as the other
two, after the hash-hit no-op return. An already-published body's
re-publish stays a no-op even after a referenced group's scope narrows
underneath it (`group-scope-validation`).

The function `publishBody` awaits seven DB-resolving checks in all, in
this order: `validateCrossProcess`, `validateSubprocessCycle`,
`validateProcessChaining`, `validateGroupScope`,
`validateInstanceQueryReferences`, `validateInstanceTransitionReferences`,
`validateCrossProcessReadGrant`. The two `instance*References` checks
also return the `PublishFinding`s the publish result carries. The check
`validateCrossProcessReadGrant` runs only when the caller supplies an
actor.

The cycle check, `validateSubprocessCycle`, walks the subprocess steps
of the published body and of each child they reach. Each reference
resolves the way `validateCrossProcess` resolves it. It throws
`CrossProcessValidationError` when the walk reaches the published
`processId` again, at any version. The message names the chain, for
example `subprocess cycle: A -> B -> A`. The comparison ignores version:
a pinned reference to an earlier, non-calling version of the same
process still closes a cycle. A `process.start` action takes no part in
the walk, since it is fire-and-forget rather than a wait-state
reference.

**Runtime record (the audit backbone).** The instance carries
assignment/claim state and persisted timer firings. Each `HistoryEntry`
is append-only. It records the definition `version` active at that
entry, so step/path ids resolve after a migration. It also records the
cause (`user`, `timer`, `automatic`, `migration`, or `cancel`) and
per-action `ActionOutcome`s, including the actually-resolved handler
build. Nobody can reconstruct these runtime facts later, so the engine
records them from v1.

A `HistoryEntry` is transition-shaped: it always carries a `toStepId`.
An event that has no step change instead gets a sibling record,
`InstanceEvent` (append-only, `evt_` ids). It is a discriminated union
over `kind`, defined in `definition.ts`'s `instanceEvent` (15 kinds
today). The `runtime-events` spec documents each one.

Four invariants hold across every kind. An event never advances
`transitionSeq`. Several may share one seq, and events order by `at`.
Only `timer.fired` and `subprocess.spawn-enqueued` enqueue actions and
carry `ActionOutcome`s; every other kind carries none. The kind
`instance.faulted` commits with the instance's status flip in one
transaction, under one OCC predicate, so a `faulted` instance cannot
exist without its event. A new kind adds to the union, and the record
shape stays as it is.

An `ActionOutcome` attaches to the record that enqueued the action. The
outbox row carries it instead of deriving it from
`(instanceId, transitionSeq)`. That derivation is exact for a transition
and wrong for an event. A reminder's outcomes would join the preceding
transition's entry instead of its own record. Creation enters at
sequence 0, where no entry exists yet. A derived write there would match
no row and discard the outcome silently.
