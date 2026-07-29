## ADDED Requirements

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

Publishing a body SHALL fail, with a located issue per offending key, when it
carries any key the contract does not declare, at any depth — process, step,
path, action, timer, field, view field, validation, subprocess spec, contract,
data source.

Stripping an unknown key is not a safe default on the write path: reproduced
by execution, a path authored with `gaurd` compiles to a path with **no
guard**, turning a conditional transition into an unconditional default; the
same mechanism deletes misspelled action lists and turns a misspelled
`terminal` into a non-terminal step. Because Process Studio's JSON surface is
a first-class authoring path, hand-written JSON is ordinary input.

Reading a stored body SHALL continue to strip: `definitionHash` covers the
parse output, so a stored body cannot contain an undeclared key, and the read
schema stays permissive by design.

#### Scenario: A misspelled guard is rejected

- **WHEN** a body declares a path with a `gaurd` key
- **THEN** publishing fails with a located issue naming the unknown key and
  its path, rather than publishing a guardless path

#### Scenario: Every unknown key is reported

- **WHEN** a body carries unknown keys in more than one place
- **THEN** the failure names each of them

#### Scenario: The check is not bypassable by the compiled branch

- **WHEN** a body carrying an unknown key also satisfies
  `publishedProcessBody`
- **THEN** publishing still fails

#### Scenario: Reading a stored body is unaffected

- **WHEN** a previously published body is read back
- **THEN** it parses under the ordinary stripping read schema, with no
  unknown-key check applied

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
