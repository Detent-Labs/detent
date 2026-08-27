# definition-contract

## Purpose

Defines the structural and identity authoring-time invariants enforced directly
by the `src/schema/definition.ts` Zod schemas: coupling between a step's `type`
and its type-specific spec, shape rules for steps and paths, and id/key
uniqueness and resolution scope across the whole field tree (including fields
nested inside `group` fields). These invariants make a statically detectable
authoring error fail to parse — at authoring time and on every later read,
since `definition.ts` is also the deserializer for stored bodies — rather than
surfacing only at runtime as an instance parked forever with no diagnostic.
## Requirements
### Requirement: A step's `type` and its `subprocess` spec presence agree

A step SHALL declare a `subprocess` spec if and only if its `type` is
`"subprocess"`. A step of `type: "subprocess"` with no `subprocess` spec, or
a step of any other `type` carrying a `subprocess` spec, SHALL fail to
parse.

#### Scenario: A subprocess-typed step with no subprocess spec is rejected
- **WHEN** a step has `type: "subprocess"` and no `subprocess` field
- **THEN** the process body fails to parse

#### Scenario: A non-subprocess step carrying a subprocess spec is rejected
- **WHEN** a step has `type: "task"` and a `subprocess` field
- **THEN** the process body fails to parse

#### Scenario: A subprocess-typed step with a subprocess spec parses
- **WHEN** a step has `type: "subprocess"` and a well-formed `subprocess` field
- **THEN** the process body parses successfully (subject to every other invariant)

### Requirement: A subprocess step's paths are all-automatic

A step of `type: "subprocess"` SHALL have only automatic paths (or none). A
manual path on a subprocess step SHALL fail to parse, since it would let an
actor advance the parent while its spawned child is still running,
orphaning it — the subprocess step is a wait-state, per the
`subprocess-execution` capability's existing requirement that the parent
parks until the child returns.

#### Scenario: A manual path on a subprocess step is rejected
- **WHEN** a step has `type: "subprocess"` and at least one path with `trigger: "manual"`
- **THEN** the process body fails to parse

#### Scenario: A subprocess step with only automatic paths parses
- **WHEN** a step has `type: "subprocess"` and every path has `trigger: "automatic"`
- **THEN** the process body parses successfully (subject to every other invariant)

### Requirement: Every identifier is unique within its kind across the whole body

For each id kind — path, action, timer, and data source — no two entities
of that kind within the same process body SHALL share an id. Field ids
SHALL be unique across the full field tree, including fields nested at any
depth inside a `group` field's `fields`, not only at the top level. A body
containing a duplicate SHALL fail to parse.

This closes the gap left by the two pre-existing checks (step id and
top-level field id uniqueness): a duplicate **action** id reachable within
one transition collides on the deterministic idempotency key; a duplicate
**timer** id breaks migration's id-keyed timer reconciliation; a duplicate
**field** id nested inside a `group` silently shadows another field across
the whole expression layer, since CEL flattens `group` sub-fields into the
same `data` namespace as top-level fields.

#### Scenario: Duplicate path ids across different steps are rejected
- **WHEN** two paths on different steps share one `path_` id
- **THEN** the process body fails to parse

#### Scenario: Duplicate action ids are rejected
- **WHEN** two actions anywhere in the body (onEntry, onExit, onPath, onCancel, or a timer's onFire) share one `action_` id
- **THEN** the process body fails to parse

#### Scenario: Duplicate timer ids are rejected
- **WHEN** two timers on different steps share one `timer_` id
- **THEN** the process body fails to parse

#### Scenario: Duplicate data source ids are rejected
- **WHEN** two entries in `dataSources` share one `ds_` id
- **THEN** the process body fails to parse

#### Scenario: A field id nested inside a group collides with a top-level field id
- **WHEN** a top-level field and a field nested inside a `group` field share one `field_` id
- **THEN** the process body fails to parse

#### Scenario: Two fields nested inside different groups share an id
- **WHEN** two fields nested inside two different `group` fields share one `field_` id
- **THEN** the process body fails to parse

### Requirement: Every field key and data source key is unique, and no data source key shadows a reserved CEL namespace

Field `key`s SHALL be unique across the full field tree (including fields
nested at any depth inside `group` fields), since CEL addresses fields by
`key` in the flat `data` namespace and a duplicate key is unresolvable
ambiguity, not merely redundant metadata. Data source `key`s SHALL be
unique among themselves, and SHALL NOT equal any of the reserved top-level
CEL namespace names (`data`, `instance`, `actor`, `child`, `result`): a data
source key is reserved as a top-level CEL identifier (registered only once
data-source resolution exists), so a collision with a reserved namespace name
would silently rewire expression scoping. The reservation holds now even though a
CEL reference to a data source is currently a publish error.

#### Scenario: Duplicate field keys are rejected
- **WHEN** two fields anywhere in the tree, including one nested inside a `group`, share one `key`
- **THEN** the process body fails to parse

#### Scenario: Duplicate data source keys are rejected
- **WHEN** two entries in `dataSources` share one `key`
- **THEN** the process body fails to parse

#### Scenario: A data source keyed as a reserved namespace name is rejected
- **WHEN** a `dataSources` entry has `key: "child"` (or `"data"`, `"instance"`, `"actor"`, `"result"`)
- **THEN** the process body fails to parse

### Requirement: View field references resolve against the full recursive field set

A `view.fields[].ref` SHALL resolve against every field id in the body,
including fields nested at any depth inside a `group` field, matching the
field set the CEL layer already type-checks expressions against. A
`view.fields[].ref` naming a nested field id SHALL NOT be rejected, and one
naming no field at any depth SHALL fail to parse.

#### Scenario: A view referencing a nested group field's id resolves
- **WHEN** a step's `view.fields` includes an entry whose `ref` names a field id declared inside a `group` field's `fields`
- **THEN** the process body parses successfully (subject to every other invariant)

#### Scenario: A view reference to an unknown field id is still rejected
- **WHEN** a step's `view.fields` includes an entry whose `ref` names no field id at any depth
- **THEN** the process body fails to parse

### Requirement: A step's view field may override the catalog field's validation

A `view.fields[]` entry SHALL accept an optional `validation`, carrying the
same keys the catalog `FieldDef.validation` carries: `min`, `max`,
`minLength`, `maxLength`, `pattern`, `rule`. The entry SHALL also accept an
optional `validationMode`, either `"merge"` or `"replace"`.

An absent `validationMode` reads as `"merge"`. Under `merge`, the keys the
step declares overlay the catalog field's. Every key the step leaves out keeps
its catalog value. Under `replace`, the catalog field's validation does not
apply in that step at all. Only the keys the step declares are in force.

The `rule` key is one key like any other. A step that declares `rule` under
`merge` supersedes the catalog `rule` rather than adding a second one.

A step may loosen a bound as well as tighten it. Nothing requires an override
to be narrower than the catalog value.

Both keys are optional, so a body written before this requirement parses
unchanged and its `definitionHash` does not move.

#### Scenario: A step narrows a catalog bound

- **WHEN** a catalog field declares `max: 10000` and a step's view field
  declares `validation: { max: 1000 }` with no `validationMode`
- **THEN** the body parses, and `max` is 1000 in that step and 10000 in every
  step that declares no override

#### Scenario: A step widens a catalog bound

- **WHEN** a catalog field declares `max: 10000` and a step's view field
  declares `validation: { max: 20000 }`
- **THEN** the body parses and the wider bound is in force in that step

#### Scenario: Merge keeps the keys the step leaves out

- **WHEN** a catalog field declares `min: 0` and `pattern`, and a step's view
  field declares `validation: { max: 1000 }` under `merge`
- **THEN** `min` and `pattern` keep their catalog values in that step

#### Scenario: Replace drops the keys the step leaves out

- **WHEN** a catalog field declares `min: 0` and `pattern`, and a step's view
  field declares `validation: { max: 1000 }` with `validationMode: "replace"`
- **THEN** only `max` is in force in that step, and the catalog `min` and
  `pattern` do not apply there

#### Scenario: A body without any override parses as before

- **WHEN** a view field declares neither `validation` nor `validationMode`
- **THEN** the body parses and the catalog field's validation is the one in
  force, as it was before this requirement

### Requirement: A view field's validation override is well-formed

A `view.fields[]` entry declaring `validationMode` without `validation` SHALL
fail to parse. A mode selects between overlaying and discarding. Neither means
anything with nothing to overlay or discard.

A `view.fields[]` entry declaring `validation` with no key set SHALL fail to
parse. An empty object is indistinguishable from an absent one under `merge`.
Under `replace` it silently discards every catalog bound. An author who means
that can express it by naming the keys they want.

#### Scenario: A mode without an override fails to parse

- **WHEN** a view field declares `validationMode: "replace"` and no
  `validation`
- **THEN** the process body fails to parse

#### Scenario: An empty override fails to parse

- **WHEN** a view field declares `validation: {}`
- **THEN** the process body fails to parse

#### Scenario: An unknown mode fails to parse

- **WHEN** a view field declares `validationMode: "override"`
- **THEN** the process body fails to parse

### Requirement: Action.output targets resolve against the full recursive field set, from every action position

An `Action.output` target key SHALL resolve against every field id in the
body, including fields nested at any depth inside a `group` field — matching
the field set `view.fields[].ref` already resolves against and the field set
the CEL layer already type-checks `Action.output` expressions against. This
SHALL be checked from every action position an `Action` can appear in: a
step's `onEntry`, `onExit`, and `onCancel`; a path's `onPath`; and a timer's
`onFire.actions`. A body where any `Action.output` in any of these five
positions targets a field id absent from the catalog SHALL fail to parse.

#### Scenario: An onEntry action output targeting an unknown field is rejected
- **WHEN** a step's `onEntry` includes an action whose `output` targets a field id absent from the catalog
- **THEN** the process body fails to parse

#### Scenario: An onExit action output targeting an unknown field is rejected
- **WHEN** a step's `onExit` includes an action whose `output` targets a field id absent from the catalog
- **THEN** the process body fails to parse

#### Scenario: An onCancel action output targeting an unknown field is rejected
- **WHEN** a step's `onCancel` includes an action whose `output` targets a field id absent from the catalog
- **THEN** the process body fails to parse

#### Scenario: An onPath action output targeting an unknown field is rejected
- **WHEN** a path's `onPath` includes an action whose `output` targets a field id absent from the catalog
- **THEN** the process body fails to parse

#### Scenario: A timer onFire action output targeting an unknown field is rejected
- **WHEN** a timer's `onFire.actions` includes an action whose `output` targets a field id absent from the catalog
- **THEN** the process body fails to parse

#### Scenario: An output target resolving to a nested group field is accepted, from every position
- **WHEN** an `Action.output` in any of the five positions targets a field id declared inside a `group` field's `fields`
- **THEN** the process body parses successfully (subject to every other invariant)

### Requirement: A step's assignment, when present, follows the plugin-envelope shape

A `Step` MAY declare an optional `assignment: { strategy: { type: string;
config: unknown; description?: string } }` field. A step with no
`assignment` field SHALL be unrestricted — every existing published body,
example, and test that predates enforcement continues to parse and behave
identically. This field introduces no structural coupling to a step's
`type`: a step of any type MAY declare `assignment`. (`strategy.type`/
`strategy.config` resolution against a registry happens at publish, per the
`assignment-registry-validation` capability, not at parse.)

#### Scenario: A step with no assignment field parses unchanged
- **WHEN** a step declares no `assignment` field
- **THEN** the process body parses successfully and the step is
  unrestricted, identical to pre-existing behavior

#### Scenario: A step with a well-formed assignment envelope parses
- **WHEN** a step declares `assignment: { strategy: { type: "static",
  config: { candidates: ["role_a"] } } }`
- **THEN** the process body parses successfully (subject to every other
  invariant)

#### Scenario: An assignment envelope missing its strategy type is rejected
- **WHEN** a step declares an `assignment.strategy` object with no `type`
  string
- **THEN** the process body fails to parse

### Requirement: A process declares which groups its steps may reference

`ProcessBody` SHALL carry an optional `allowedGroups` field, typed
`string[]`. It lists the group ids this process's steps may reference in
any assignment config. A body declaring no `allowedGroups` SHALL parse
successfully, with `allowedGroups` reading as `undefined`. The field is
optional, not defaulted, so a body predating it keeps its existing
`definitionHash` (see design.md's "`.optional()`, not `.default()`"
decision). Every reader of the compiled body treats an absent
`allowedGroups` as an empty list, via `?? []`. No reader treats a present
but empty `allowedGroups` any differently from an absent one.

`allowedGroups` names groups the `group-administration` capability's store
holds. The schema layer resolves no external store. The definition
contract itself SHALL NOT validate an entry against that store at parse
time. `group-scope-validation`'s publish-time check (a separate capability)
is where that resolution happens.

#### Scenario: A process with no allowedGroups parses successfully

- **WHEN** a process body declares no `allowedGroups` field
- **THEN** the process body parses successfully, and its `allowedGroups`
  reads as `undefined`

#### Scenario: A process declaring allowedGroups parses

- **WHEN** a process body declares `"allowedGroups": ["group_finance",
  "group_ops"]`
- **THEN** the process body parses successfully (subject to every other
  invariant)

### Requirement: A step's org.group-members reference resolves within the process's own allowedGroups

The compile pass SHALL reject a step whose `assignment.strategy.type` is
`org.group-members` when that step's `config.groupId` is absent from the
process's own `allowedGroups`. The rejection SHALL name the step and the
missing group id.

This check takes the write-path placement under this capability's
placement rule. A hand-written body could satisfy `publishedProcessBody`
while carrying a step whose group reference is not declared in
`allowedGroups`. The invariant is therefore one a hand-written body must
not bypass. It runs alongside the compile pass's other id-resolution
checks, with no database involved. It compares two lists already present
in the body.

#### Scenario: A declared group reference publishes

- **WHEN** a process declares `"allowedGroups": ["group_finance"]`, and a
  step declares `{ "type": "org.group-members", "config": { "groupId":
  "group_finance" } }`
- **THEN** the publish succeeds (subject to every other invariant)

#### Scenario: An undeclared group reference fails the publish

- **WHEN** a step declares `{ "type": "org.group-members", "config": {
  "groupId": "group_finance" } }`, and the process's `allowedGroups` does
  not include `"group_finance"`
- **THEN** the publish fails with a validation error naming that step and
  `"group_finance"`

### Requirement: A field's dataSource reference resolves to a declared data source

A `FieldDef.dataSource` value SHALL resolve to an id present in
`body.dataSources`. A body where any field's `dataSource` names an id absent
from `body.dataSources` SHALL fail to parse. This is checked in the same
`superRefine` block that already checks duplicate data source ids/keys,
closing an authoring gap that previously let a typo'd or deleted data-source
id publish silently — the field would then have no way to resolve options at
runtime.

#### Scenario: A field's dataSource resolving to a declared data source parses
- **WHEN** a `FieldDef.dataSource` names an id present in `body.dataSources`
- **THEN** the process body parses successfully (subject to every other
  invariant)

#### Scenario: A field's dataSource naming an unknown id is rejected
- **WHEN** a `FieldDef.dataSource` names an id absent from `body.dataSources`
- **THEN** the process body fails to parse

#### Scenario: A field's dataSource nested inside a group is checked the same way
- **WHEN** a field nested inside a `group` field's `fields` declares a
  `dataSource` naming an id absent from `body.dataSources`
- **THEN** the process body fails to parse, matching the check applied to a
  top-level field


### Requirement: An authoring invariant argues its own placement

An authoring invariant SHALL live either in the `definition.ts` schema or on the
publish path in `compile.ts`. Neither placement is the default. A change that
adds an invariant SHALL state the placement it takes and the reason.

The read path SHALL NOT settle that question on its own. `definition.ts`
deserializes stored bodies. A tightened refinement there makes a body published
before it fail to parse. That outcome parks the instances pinned to that body.

It stops no worker. Every body-resolving worker resolves a body inside its own
per-item error boundary. One unparseable body therefore never ends a pass. The
read-path cost stays small. It is a cost to weigh, never a veto.

Two criteria SHALL decide the placement:

- An invariant that a hand-written body must not bypass SHALL live on the
  publish path. `publishedProcessBody` checks only the cancel-sink count. A
  schema refinement alone therefore lets a body of that shape through.
- An invariant whose violation cannot exist in an already-published body MAY
  live in the schema. A key introduced together with its invariant has no such
  body behind it.

#### Scenario: A tightened schema refinement parks only its own instances

- **WHEN** a refinement in `definition.ts` tightens, and a body published
  earlier no longer parses
- **THEN** each worker resolving that body skips the affected instance, and
  every other instance in the same pass proceeds

#### Scenario: A publish-path check rejects a body the published schema accepts

- **WHEN** a hand-written body satisfies `publishedProcessBody` and breaks an
  invariant placed on the publish path
- **THEN** publishing rejects it with a located error

#### Scenario: A change states the placement it takes

- **WHEN** a change adds an authoring invariant
- **THEN** its spec names the placement and the criterion that decided it

### Requirement: Write-path structural checks run in the compile pass, ahead of its idempotent return

Every authoring-time check that is not expressible as a Zod refinement on the
shared read schema SHALL run inside `compileProcessBody`, **before** the
idempotent early return that a `publishedProcessBody`-valid body takes. Two
properties follow, and both are required:

- A stored, already-published body is never re-validated against a rule that
  did not exist when it was published, so it stays readable and its pinned
  instances stay rehydratable. This is the placement rule
  `compile.ts:54-67` already states for durations, CEL and plugin configs.
- A check cannot be skipped by a hand-written body that satisfies
  `publishedProcessBody` — which constrains only the cancel-sink count — and
  so takes the early return.

Each such check SHALL collect **every** located issue rather than throwing on
the first, in the located shape `validateDurations` already uses (`loc`,
`value`, `message`), so one rejection is fixable in one pass and maps to a
422 with issues intact.

#### Scenario: A check applies on the compiled branch too

- **WHEN** a hand-written body that already satisfies `publishedProcessBody`
  (for example by declaring a step with the cancel-sink id) is published, and
  it violates any write-path check
- **THEN** publishing fails with that check's located issue — taking the
  idempotent return does not exempt a body from any write-path check

#### Scenario: An already-published body stays readable

- **WHEN** a body published before a write-path check existed is read back to
  rehydrate an instance
- **THEN** it parses and the instance rehydrates; the new check applies to
  publishing, never to reading

#### Scenario: All issues are reported at once

- **WHEN** a body violates several write-path checks
- **THEN** the failure carries a located issue for each violation, not only
  the first one found

### Requirement: No body may carry an action type with the engine-reserved prefix

No body reaching the compile pass SHALL contain an action whose `type` starts
with the reserved `core.` prefix, in any of the five action positions
(`onEntry`, `onExit`, `onCancel`, a path's `onPath`, a timer's
`onFire.actions`) — regardless of which compile branch it takes.

The reserved prefix names the engine-internal subprocess spawn and return
handlers, which are synthesized at runtime and never stored in a body. An
authored `core.*` action would reach that dispatch with author-chosen config
and could drive an outcome, and an `outputMapping` writeback, into an instance
of a different process.

The cancel-sink's reserved **identity** checks (its step id, its step key, and
the reserved `cancelled` outcome) SHALL remain authored-body-only: a compiled
body legitimately contains all three, so generalizing them to every body would
reject every compiled body on sight.

#### Scenario: A reserved action type in an authored body is rejected

- **WHEN** a body declares an action of type `core.returnSubprocess` in any
  action position
- **THEN** publishing fails with a located issue naming the reserved prefix

#### Scenario: The reserved-identity collision path cannot smuggle one through

- **WHEN** a body adds a well-formed terminal step carrying the reserved
  cancel-sink id — so that `publishedProcessBody` accepts it — and also
  declares a `core.*` action
- **THEN** publishing fails; the additive shape that satisfies
  `publishedProcessBody` no longer bypasses the ban

#### Scenario: A compiled body still round-trips

- **WHEN** a legitimately compiled body — containing the engine-injected
  cancel-sink step and, for a contracted process, its reserved outcome — is
  re-published unchanged
- **THEN** it is accepted as the no-op it is today

### Requirement: Authored bodies reject unknown keys instead of dropping them

Publishing a body SHALL fail when it carries any key the contract does not
declare. This applies at any depth: process, step, path, action, timer,
field, view field, validation, subprocess spec, contract, data source.
Publishing SHALL then report a located issue per offending key.

Stripping an unknown key is not a safe default on the write path. A path
authored with `gaurd` compiles to a path with **no guard**, reproduced by
execution. That turns a conditional transition into an unconditional
default. The same mechanism deletes misspelled action lists. It turns a
misspelled `terminal` into a non-terminal step. Process Studio's JSON
surface is a first-class authoring path, so hand-written JSON is ordinary
input.

Reading a stored body SHALL continue to strip. Its `definitionHash` covers
the parse output, so a stored body cannot contain an undeclared key. The
read schema stays permissive by design.

Detection SHALL NOT depend on the rest of the body already being
schema-valid. An author mid-edit routinely has more than one thing wrong at
once. The unknown-key issue often explains the others: a misspelled key
reads as a missing required field one level up. A detection method that
only runs once the whole body parses cleanly would go silent on that body.
It would report only the unrelated issue instead.

<!-- antislop: allow passive-voice: exact scenario name from the current spec, required unchanged for openspec archive. -->
#### Scenario: A misspelled guard is rejected

- **WHEN** a body declares a path with a `gaurd` key
- **THEN** publishing fails with a located issue naming the unknown key and
  its path, rather than publishing a guardless path

<!-- antislop: allow passive-voice (exact existing scenario name, see note above) -->
#### Scenario: Every unknown key is reported

- **WHEN** a body carries unknown keys in more than one place
- **THEN** the rejection names each of them

#### Scenario: The check is not bypassable by the compiled branch

- **WHEN** a body carrying an unknown key also satisfies
  `publishedProcessBody`
- **THEN** publishing still fails

<!-- antislop: allow passive-voice (exact existing scenario name, see note above) -->
#### Scenario: Reading a stored body is unaffected

- **WHEN** a client reads a previously published body
- **THEN** it parses under the ordinary stripping read schema, with no
  unknown-key check applied

#### Scenario: An unknown key is still located when the rest of the body is not yet valid

- **WHEN** a body carries an unknown key on an object that is also missing a
  required field the contract declares
- **THEN** publishing fails with a located issue naming the unknown key,
  not only an issue about the missing required field

### Requirement: Every catalog validation pattern compiles at publish

Every `FieldValidation.pattern` in the field catalog, at any depth of the
recursive field tree, SHALL be compiled at publish. A pattern that does not
compile SHALL be a located publish issue, and a pattern whose source exceeds
the declared maximum length SHALL be rejected the same way.

Publishing an uncompilable pattern is unrecoverable in the way that matters:
published versions are immutable, so every submission touching that field
throws for the life of the version, and the only remedy is publishing a
replacement and migrating every pinned instance.

#### Scenario: An uncompilable pattern is rejected

- **WHEN** a body declares `validation.pattern` of `"("`
- **THEN** publishing fails with a located issue naming the field and the
  pattern

#### Scenario: A valid pattern publishes unchanged

- **WHEN** a body declares a well-formed pattern
- **THEN** publishing succeeds and submission-time behavior is unchanged

#### Scenario: An over-long pattern source is rejected

- **WHEN** a declared pattern's source exceeds the maximum pattern length
- **THEN** publishing fails with a located issue

### Requirement: Every step-level validation pattern compiles at publish

Publish SHALL compile every `pattern` declared on a `view.fields[].validation`.
A pattern whose source exceeds the declared maximum length SHALL fail. Both
hold on the same terms the catalog field tree is already held to. A pattern
that does not compile SHALL be a located publish issue naming the step and
the field.

The reason is the reason the catalog check exists. Published versions are
immutable. An uncompilable pattern throws for every submission touching that
field in that step, for the life of the version. The only remedy is publishing
a replacement and migrating every pinned instance.

#### Scenario: An uncompilable step-level pattern fails to compile

- **WHEN** a step's view field declares `validation.pattern` of `"("`
- **THEN** publishing fails with a located issue naming the step and the field

#### Scenario: An over-long step-level pattern source fails to publish

- **WHEN** a step-level pattern's source exceeds the maximum pattern length
- **THEN** publishing fails with a located issue

#### Scenario: A valid step-level pattern publishes unchanged

- **WHEN** a step's view field declares a well-formed pattern
- **THEN** publishing succeeds

### Requirement: A field key is a CEL-referenceable identifier

`FieldDef.key` SHALL match `/^[a-z_][a-z0-9_]*$/`. The key is exactly the
name registered as a CEL variable and the key instance data is re-keyed onto
for guard evaluation, so a key outside that grammar produces a field that
cannot be referenced at all: `data.my-field` is a parse error, and the failure
surfaces on some unrelated expression rather than on the field that caused it.

`Step.key` and `Path.key` are NOT constrained by this requirement — nothing
reads them as identifiers.

#### Scenario: A non-identifier field key is rejected

- **WHEN** a body declares a field with key `""`, `"my-field"` or `"2fa"`
- **THEN** publishing fails with a located issue naming the field

#### Scenario: An identifier key publishes

- **WHEN** a body declares a field with key `total_amount`
- **THEN** publishing succeeds

### Requirement: A path carries a non-empty key and a non-empty label

`Path.key` SHALL be a non-empty string after trimming leading and trailing
whitespace. `Path.label` SHALL be present. It SHALL also be a non-empty
string after trimming. Both rules apply to a path of either trigger kind,
manual or automatic. Neither is a format constraint.

`Path.key` stays exempt from the CEL-identifier grammar. The base
requirement `A field key is a CEL-referenceable identifier` states that
grammar. Nothing reads a path key as a CEL variable.

#### Scenario: Publishing rejects an empty path key

- **WHEN** a process definition declares a path whose `key` is `""`
- **THEN** publishing fails, naming that path

#### Scenario: Publishing rejects a whitespace-only path key

- **WHEN** a process definition declares a path whose `key` is `"   "`
- **THEN** publishing fails, naming that path

#### Scenario: Publishing rejects a missing path label

- **WHEN** a process definition declares a path with no `label`
- **THEN** publishing fails, naming that path

#### Scenario: Publishing rejects an empty path label

- **WHEN** a process definition declares a path whose `label` is `""`
- **THEN** publishing fails, naming that path

#### Scenario: Publishing rejects a whitespace-only path label

- **WHEN** a process definition declares a path whose `label` is `"   "`
- **THEN** publishing fails, naming that path

#### Scenario: Publishing rejects a missing label on an automatic path too

- **WHEN** a process definition declares an automatic path with no `label`
- **THEN** publishing fails, naming that path
- **AND** the rejection matches what a manual path would get

#### Scenario: Publishing accepts a path with a non-empty key and label

- **WHEN** a process definition declares a path whose `key` and `label` are
  both non-empty after trimming
- **THEN** publishing succeeds

### Requirement: Subprocess output mappings and contract field lists resolve against the catalog

Publishing SHALL fail with a located issue when:

- a key of `SubprocessSpec.outputMapping` — a **parent** `FieldId` — resolves
  to no field in the publishing process's own recursive field set; or
- an entry of `ProcessContract.inputFields` or `ProcessContract.outputFields`
  resolves to no field in that same set.

Both positions are covered by the contract's stated invariant that "all `id`
references resolve within the process", and neither is checked today. An
unresolvable `outputMapping` key makes the parent write its patch under an id
no field declares — invisible to every view and every guard, so the parent's
outcome-driven paths never see the value. A bogus id in `contract.outputFields`
shrinks the child-data schema, turning a legitimate `child.data.<key>`
reference into an "unknown field" error attributed to the parent.

#### Scenario: An unresolvable outputMapping target is rejected

- **WHEN** a subprocess step declares `outputMapping` keyed by a field id the
  process does not declare
- **THEN** publishing fails with a located issue naming the step and the id

#### Scenario: An unresolvable contract field is rejected

- **WHEN** `contract.inputFields` or `contract.outputFields` names a field id
  the process does not declare
- **THEN** publishing fails with a located issue naming the contract position
  and the id

#### Scenario: Nested fields resolve

- **WHEN** an `outputMapping` key or a contract field id names a field nested
  inside a `group` field
- **THEN** it resolves, using the same full recursive field set the sibling
  `Action.output` check uses

### Requirement: Authored strings that reach an interpreter or an index are length-bounded

The compile pass SHALL reject an authored body whose `FieldDef.key`,
`FieldValidation.pattern`, `Plugin.type`, any `duration`, or any
`Expression.src` exceeds a declared maximum length, with a located issue
naming the position and the limit.

The bounds exist because nothing between an HTTP request and a persisted
definition limits size today, and because each of these values is handed to
something that does real work with it — a CEL parser, a regex engine, a
registry lookup, a duration parser. They are set generously, to the largest
plausible legitimate value rather than the smallest workable one, and live on
the write path only.

#### Scenario: An over-long expression is rejected

- **WHEN** a body declares an `Expression.src` longer than the declared limit
- **THEN** publishing fails with a located issue naming the expression's
  position

#### Scenario: Ordinary authored values are unaffected

- **WHEN** a realistic definition — the repo's examples — is published
- **THEN** no length issue is raised

### Requirement: A field option may carry attributes

`FieldOption` SHALL gain an optional `attributes` map. A key of that map SHALL
be a string. A value SHALL be a JSON scalar: a string, a number or a boolean.

The key is optional everywhere `FieldOption` appears. An inline
`FieldDef.options` array carries it, a `"static"` data source config carries
it, and a resolved `"db.list"` option carries it. One type serves all three.

An existing body declares the key nowhere, so its `definitionHash` SHALL stay
what it is. The read path SHALL keep parsing a stored body unchanged.

#### Scenario: An option with no attributes hashes as before
- **WHEN** the engine hashes a body carrying inline options with no `attributes`
- **THEN** the hash equals the hash that body produced before this change

#### Scenario: A static data source declares attributes
- **WHEN** an author declares a `"static"` data source whose option carries
  `attributes`
- **THEN** the config passes its schema and the option resolves with them

#### Scenario: The schema refuses a non-scalar attribute value
- **WHEN** an author declares an option whose attribute value is an object
- **THEN** the body fails to parse

### Requirement: A field may map data source columns onto other fields

`FieldDef` SHALL gain an optional `columnMapping`, an object whose key is a
column key and whose value is a `FieldId`.

The compile pass SHALL enforce every rule below, and SHALL reject a body that
breaks one. These are publish-path checks. An unbypassable check is the reason,
per the placement requirement above.

- A field declaring `columnMapping` SHALL declare `dataSource`. A mapping over
  inline options names a column no list declares.
- A field declaring `columnMapping` SHALL have `type` `"select"`. A
  `multiselect` picks several rows, and one target field cannot take several
  values.
- Each key SHALL match `/^[a-z_][a-z0-9_]*$/` and stay within `MAX_KEY_LENGTH`.
- Each target SHALL resolve against the body's recursive field set.
- A target SHALL NOT be the mapping field itself.
- A target SHALL NOT be a `group` field. A group holds fields and takes no
  value.
- Two keys SHALL NOT name one target. Two columns writing one field give the
  write no order.

The compile pass SHALL NOT check a key against any data list. Publishing stays
independent of the state of the data, exactly as `db-data-source-type` already
requires. A key naming no declared column writes nothing at runtime.

#### Scenario: A valid mapping publishes
- **WHEN** an author publishes a `select` field bound to a data source, mapping
  `price` onto a `number` field of the catalog
- **THEN** the publish succeeds

#### Scenario: A mapping without a data source fails the publish
- **WHEN** a field declares `columnMapping` and inline `options`
- **THEN** the publish fails with a validation error naming that field

#### Scenario: A mapping on a multiselect fails the publish
- **WHEN** a `multiselect` field declares `columnMapping`
- **THEN** the publish fails with a validation error naming that field

#### Scenario: An unresolvable target fails the publish
- **WHEN** a `columnMapping` value names a `FieldId` the body does not declare
- **THEN** the publish fails with a validation error naming that field

#### Scenario: A self-target fails the publish
- **WHEN** a `columnMapping` value names the mapping field itself
- **THEN** the publish fails with a validation error naming that field

#### Scenario: A group target fails the publish
- **WHEN** a `columnMapping` value names a field whose type is `"group"`
- **THEN** the publish fails with a validation error naming that field

#### Scenario: Two columns onto one target fail the publish
- **WHEN** two `columnMapping` keys name one `FieldId`
- **THEN** the publish fails with a validation error naming that field

#### Scenario: A key naming no declared column still publishes
- **WHEN** an author maps a column key that the bound list does not declare
- **THEN** the publish succeeds, because publishing reads no data list

### Requirement: An author may declare a field technical, never directly editable by a participant

`FieldDef` SHALL gain an optional `technical: boolean`. A `technical` field
SHALL NOT carry `type: "group"`. The compile pass SHALL reject a body that
declares `technical: true` on a group field. A group holds fields and
carries no value of its own to mark technical.

An existing body declares the key nowhere. `definitionHash` SHALL
therefore stay what it is for every stored body. The read path SHALL
keep parsing a stored body unchanged.

The schema SHALL accept `technical: false` and SHALL store it unchanged.
Every rule in this capability and in `runtime-api` SHALL read "technical"
as `technical === true` alone. A view entry naming a field declaring
`technical: false` therefore still carries `required` and `readonly`
freely, and `resolveFields` treats that field as ordinary.

That parity covers the two compile checks and `resolveFields`. It does
not extend to `definitionHash`: a declared `technical: false` is a key
JCS hashes, the same way a declared `required: false` already is. The
studio never writes one. The Technical control writes `true` on check,
and deletes the key on uncheck.

#### Scenario: A body with no technical key hashes as before

- **WHEN** the engine hashes a body declaring no field's `technical`
- **THEN** the hash equals the hash that body produced before this change

#### Scenario: A technical field publishes

- **WHEN** an author publishes a field declaring `technical: true`, of a
  non-group type
- **THEN** the publish succeeds

#### Scenario: A technical group field fails the publish

- **WHEN** an author publishes a field of `type: "group"` declaring
  `technical: true`
- **THEN** the publish fails with a validation error naming that field

#### Scenario: A technical:false field stays ordinary

- **WHEN** a step's view entry names a field declaring `technical: false`
  and declares `required: true`
- **THEN** the publish succeeds

#### Scenario: An explicit technical:false hashes differently from an absent key

- **WHEN** the engine hashes two bodies alike except that one declares
  `technical: false` on a field and the other omits the key
- **THEN** the two hashes differ, and both bodies resolve that field
  identically

### Requirement: A view field naming a technical field declares neither `required` nor `readonly`

The compile pass SHALL reject a `view.fields[]` entry whose `ref` names a
`technical` field, when that entry declares `required` or `readonly` at
all. This holds for a literal `true`, a literal `false`, and a CEL
expression alike. This is a publish-path check. An unbypassable check is
the reason, per the placement requirement above.

The rule follows the shape the definition contract already applies to
`options`/`dataSource` and to `duration`/`deadline`. Two facts cannot both
hold, so the compile pass rejects the pair. It never resolves one key over
the other. A display-only key, such as `order` or `group`, still passes on
a technical field's view entry.

#### Scenario: A required key on a technical field's entry fails the publish

- **WHEN** a step's view entry names a `technical` field and declares
  `required: true`
- **THEN** the publish fails with a validation error naming that field and
  step

#### Scenario: A literal readonly:false on a technical field's entry fails the publish

- **WHEN** a step's view entry names a `technical` field and declares
  `readonly: false`
- **THEN** the publish fails with a validation error naming that field and
  step

#### Scenario: A redundant readonly:true on a technical field's entry fails the publish

- **WHEN** a step's view entry names a `technical` field and declares
  `readonly: true`
- **THEN** the publish fails with a validation error naming that field and
  step

#### Scenario: A CEL required on a technical field's entry fails the publish

- **WHEN** a step's view entry names a `technical` field and declares
  `required` as a CEL expression
- **THEN** the publish fails with a validation error naming that field and
  step

#### Scenario: A display-only entry on a technical field publishes

- **WHEN** a step's view entry names a `technical` field and declares
  `order` alone, with neither `required` nor `readonly`
- **THEN** the publish succeeds

### Requirement: An author may declare a field redactable, eligible for future erasure of its historical values

`FieldDef` SHALL gain an optional `redactable: boolean`. It is a pure
authoring-time signal, read only by the instance audit log's redaction
path (`instance-audit-log`). It carries no runtime behavior of its own. It
changes no CEL type-check, no view resolution, and no other publish-time
rule.

A field declaring `redactable: true` on a `group` field type SHALL fail
the publish. A group holds fields, not a value of its own. Redacting it
is meaningless, for the same reason `technical` already excludes `group`.

`redactable` SHALL place no restriction on `technical`. A field may
declare both, or either alone. A `technical` field's value is
engine-written, not participant-written. It can still hold data an
author wants erasable. For example, a `columnMapping` might copy in an
attribute from another process's instance.

The schema SHALL accept `redactable: false` and SHALL store it unchanged.
Every rule in this capability and in `instance-audit-log` SHALL read
"redactable" as `redactable === true` alone. This flag's presence or
absence SHALL affect `definitionHash`. A declared `redactable: false` is a
key present in the canonical JSON. That is distinct from the key's
absence, the same rule `technical` already carries.

#### Scenario: A body with no redactable key hashes as before

- **WHEN** the engine hashes a body declaring no field's `redactable`
- **THEN** the hash equals the hash of the same body from before this
  capability existed

#### Scenario: A redactable field publishes

- **WHEN** an author publishes a field declaring `redactable: true`, of
  any non-group field type
- **THEN** publish succeeds and the field is redactable

#### Scenario: A redactable group field fails the publish

- **WHEN** an author publishes a field declaring `type: "group"` and
  `redactable: true`
- **THEN** publish fails, naming the field

#### Scenario: A technical field may also be redactable

- **WHEN** an author publishes a field declaring both `technical: true`
  and `redactable: true`
- **THEN** publish succeeds and the field is both technical and
  redactable

#### Scenario: An explicit redactable:false hashes differently from an absent key

- **WHEN** one body declares `redactable: false` on a field and another
  omits the key entirely
- **THEN** the two hash differently

### Requirement: A view entry declaring literal `required: true` and literal `readonly: true` names a field some source writes

The compile pass SHALL reject a `view.fields[]` entry declaring literal
`required: true` and literal `readonly: true`. The rejection SHALL apply
only where no source in the body writes the field that entry names. That
write SHALL happen before the participant submits the entry's own step.

An entry the rule rejects strands the instance. The participant cannot type
into a readonly field. The required check then refuses to advance the
step. Nobody can clear the result.

A step D **dominates** a step S when every path from `initialStep` to S
passes through D. The walk follows `Path` edges: both `manual` and
`automatic` triggers count as edges. A guard's outcome at runtime does not
change which edges exist. A step reachable from `initialStep` dominates
itself.

No existing check guarantees every declared step is reachable from
`initialStep`. An authored body may legally contain a step nothing points
to. Such an orphan still satisfies "all `id` references resolve" and
"every non-terminal step has at least one exit".

For such an unreachable step S, every step in the body vacuously dominates
S. No path from `initialStep` to S exists, so no step can fail to lie on
it. So a required+readonly pair on an unreachable step's manual-path view
entry always finds a dominating writer. That holds whenever the body
carries any writer for that field at all. This matches today's behavior.
It is the intended outcome for an unreachable step, not an oversight.

A source writes a field, guaranteed before the entry's own step S, when the
body carries one of these:

- an action's `output` naming the field, where the action sits on a step
  that dominates S. That position can be any of `onEntry`, `onExit`,
  `onPath`, `onCancel`, or a timer's `onFire`, target-path or reminder
  alike. It also counts when the action sits on S's own step, only at
  `onEntry`. It counts too on S's own step's timer `onFire` declaring a
  `targetPath`. An action on S's own step at `onExit`, `onPath`, or
  `onCancel` never counts, even if the step dominates itself. Those actions
  fire only after the submission gate they cannot help
- a step's `subprocess.outputMapping` naming the field, where the step
  dominates S
- a `columnMapping` target naming the field. Some step that dominates S,
  other than S itself, must carry the mapping field in an editable view
  entry. That entry declares neither `visible: false` nor `readonly: true`.
  If the field is editable only on S's own step, the write-back runs late.
  It runs after that step's own submission gate, the same as an own-step
  action
- a `contract.inputFields` entry naming the field
- a field's catalog `default` declaring a literal. The engine seeds it into
  `instance.data` at creation (`applyFieldDefaults`). A CEL `default` may
  raise at creation and leave the field unwritten, so it counts for nothing.
- a view entry naming the field that declares neither `visible: false` nor
  `readonly: true`, on a step that dominates S, other than S itself

That set SHALL match the studio's `writtenFieldCounts`: the structural
sources, the editable-entry rule, and the dominance test. The studio
computes it in `packages/web/src/areas/studio/draft/view-flags.ts`, with two
documented engine refinements. The engine excludes an action output on the
entry's own step at `onExit`/`onPath`/`onCancel`. It also excludes a
`columnMapping` target whose mapping field is editable only on the entry's
own step. It excludes one that appears in no editable view entry on any
step dominating the entry's own step too.

The studio counts the target regardless of where, or whether, the caller
places the mapping field. That holds past the dominance test too, which
both share. The engine counts a literal catalog `default` too, which the
studio does not. The change record's design.md (Decisions) carries the
reasoning for both, and for the dominance test's shared placement.

The rule SHALL read `=== true` on both flags. An entry carrying a CEL expression
on either flag SHALL publish. Nobody can read an expression's value without an
instance.

An entry declaring literal `visible: false` SHALL publish. A hidden field never
joins the required set, so no instance strands on it. An entry whose `visible`
is not literal `false` reads as visible, so a CEL `visible` does not rescue an
unwritten pair.

The check SHALL skip three kinds of entry. A `group` field: a group holds
fields and takes no value, and the engine resolves its view flags false.
A `technical` field: the technical-field rule already rejects its flags. An
entry carrying no `ref`: such an entry names no field, and the Zod gate
rejects it anyway.

The rejection SHALL apply only to an entry on a step that carries a manual
path. The required check runs only at a manual submission. So a pair on an
all-automatic step or a terminal step never strands, and SHALL publish. The
studio's `checkViewFlags` still warns on every step, so its warning fires
on this now-legal pair. A companion studio change can scope it the same
way.

This check takes the write-path placement under the base spec's placement
rule. A hand-written body can satisfy `publishedProcessBody` while
carrying the pair, so the invariant is one a hand-written body must not
bypass. The compile pass is where its siblings sit.

#### Scenario: An unwritten required and readonly entry fails the publish

- **WHEN** a step carrying a manual path's view entry declares
  `required: true` and `readonly: true`
- **AND** no source in the body writes the field it names
- **THEN** the publish fails with a validation error naming that field and step

#### Scenario: A pre-gate action output makes the entry publishable

- **WHEN** a step's view entry declares `required: true` and `readonly: true`
- **AND** an action declares an `output` naming the same field. That
  action sits on a step that dominates the entry's own step, at any
  position. It may also sit on the entry's own step's `onEntry`, or on its
  timer `onFire` declaring a `targetPath`.
- **THEN** the publish succeeds

#### Scenario: An action output on a non-dominating step does not make the entry publishable

- **WHEN** a step carrying a manual path's view entry declares
  `required: true` and `readonly: true`
- **AND** the only source naming the field is an action's `output`. That
  output sits on a step that does NOT dominate the entry's own step. That
  step is reachable only after it, or only via a different branch.
- **THEN** the publish fails with a validation error naming that field and step

#### Scenario: A timer's onFire output on a non-dominating step does not make the entry publishable

- **WHEN** a step carrying a manual path's view entry declares
  `required: true` and `readonly: true`
- **AND** the only source naming the field is a timer's `onFire` action's
  `output`. That output sits on a step that does NOT dominate the entry's
  own step. That step is reachable only after it, or only via a different
  branch.
- **THEN** the publish fails with a validation error naming that field and step

#### Scenario: An own-step post-gate output does not make the entry publishable

- **WHEN** a step carrying a manual path's view entry declares
  `required: true` and `readonly: true`
- **AND** the only source naming the field is an action on the entry's own
  step at `onPath`, `onExit`, or `onCancel`
- **THEN** the publish fails with a validation error naming that field and step

#### Scenario: A target-path timer's output makes the entry publishable

- **WHEN** a step carrying a manual path's view entry declares
  `required: true` and `readonly: true`
- **AND** the only source naming the field is an `onFire` action on the
  entry's own step's timer declaring a `targetPath`
- **THEN** the publish succeeds

#### Scenario: An own-step reminder timer's output does not make the entry publishable

- **WHEN** a step carrying a manual path's view entry declares
  `required: true` and `readonly: true`
- **AND** the only source naming the field is an `onFire` action on the
  entry's own step's timer. That timer declares no `targetPath`.
- **THEN** the publish fails with a validation error naming that field and step

#### Scenario: A same-step column mapping does not make the entry publishable

- **WHEN** a step carrying a manual path's view entry declares
  `required: true` and `readonly: true`
- **AND** the only source naming the field is a `columnMapping` target.
  Its mapping field is editable only on the entry's own step.
- **THEN** the publish fails with a validation error naming that field and step

#### Scenario: A literal default makes the entry publishable

- **WHEN** a step's view entry declares `required: true` and `readonly: true`
- **AND** the field's catalog entry declares a literal `default`
- **THEN** the publish succeeds

#### Scenario: A CEL default does not make the entry publishable

- **WHEN** a step carrying a manual path's view entry declares
  `required: true` and `readonly: true`
- **AND** the only source naming the field is the field's catalog `default`
  carrying a CEL expression
- **THEN** the publish fails with a validation error naming that field and step

#### Scenario: A subprocess output mapping makes the entry publishable

- **WHEN** a step's view entry declares `required: true` and `readonly: true`
- **AND** a step that dominates the entry's own step carries a
  `subprocess.outputMapping` naming the same field
- **THEN** the publish succeeds

#### Scenario: A column mapping makes the entry publishable

- **WHEN** a step's view entry declares `required: true` and `readonly: true`
- **AND** a `columnMapping` target names the field
- **AND** a step that dominates the entry's own step, other than the
  entry's own, carries the mapping field. It does so in an editable view
  entry.
- **THEN** the publish succeeds

#### Scenario: A contract input field makes the entry publishable

- **WHEN** a step's view entry declares `required: true` and `readonly: true`
- **AND** a `contract.inputFields` entry names the same field
- **THEN** the publish succeeds

#### Scenario: An editable entry on another step makes the entry publishable

- **WHEN** a step S's view entry declares `required: true` and `readonly: true`
- **AND** another step that dominates S names the field as neither hidden
  nor readonly in its own view entry
- **THEN** the publish succeeds

#### Scenario: An editable entry on a later step does not make the entry publishable

- **WHEN** the process's `initialStep` view entry declares `required: true`
  and `readonly: true` for a field
- **AND** the only source naming the field is an editable view entry on a
  step reachable only by first leaving `initialStep`. So `initialStep`
  cannot dominate that step, and that step cannot dominate `initialStep`.
- **THEN** the publish fails with a validation error naming that field and step

#### Scenario: An editable entry on a sibling branch step does not make the entry publishable

- **WHEN** a step S's view entry declares `required: true` and `readonly: true`
  for a field
- **AND** the only source naming the field is an editable view entry on a
  step. That step is reachable from `initialStep` only via a path that
  never passes through S. That step is a branch sibling, not an ancestor.
- **THEN** the publish fails with a validation error naming that field and step

#### Scenario: A CEL readonly publishes

- **WHEN** a step's view entry declares `required: true` and carries `readonly`
  as a CEL expression
- **AND** no other source in the body writes the field
- **THEN** the publish succeeds

#### Scenario: A CEL required publishes

- **WHEN** a step's view entry declares `readonly: true` and carries `required`
  as a CEL expression
- **AND** no source in the body writes the field
- **THEN** the publish succeeds

#### Scenario: A hidden entry publishes

- **WHEN** a step's view entry declares `visible: false`, `required: true` and
  `readonly: true`
- **AND** no source in the body writes the field
- **THEN** the publish succeeds

#### Scenario: A pair on an all-automatic or terminal step publishes

- **WHEN** a step with no manual path declares a view entry with
  `required: true` and `readonly: true`
- **AND** the step qualifies: its paths are all-automatic; it is
  terminal; or its only exit is a timer declaring a `targetPath`. A
  timer-forced transition is automatic, so that last case has no manual
  path either.
- **AND** no source in the body writes the field
- **THEN** the publish succeeds

#### Scenario: A CEL-visible unwritten pair fails the publish

- **WHEN** a step carrying a manual path's view entry declares
  `required: true`, `readonly: true`, and `visible` as a CEL expression
- **AND** no source in the body writes the field
- **THEN** the publish fails with a validation error naming that field and step
