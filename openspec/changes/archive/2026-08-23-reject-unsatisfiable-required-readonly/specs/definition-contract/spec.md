## ADDED Requirements

### Requirement: A view entry declaring literal `required: true` and literal `readonly: true` names a field some source writes

The compile pass SHALL reject a `view.fields[]` entry declaring literal
`required: true` and literal `readonly: true`. The rejection SHALL apply
only where no source in the body writes the field that entry names.

An entry the rule rejects strands the instance. The participant cannot type
into a readonly field. The required check then refuses to advance the
step. Nobody can clear the result.

A source writes a field when the body carries one of these:

- an action's `output` naming the field. Except an action on the entry's own
  step at `onExit`, `onPath`, or `onCancel`: those fire only after the
  submission gate they cannot help.
- a step's `subprocess.outputMapping` naming the field
- a `columnMapping` target naming the field. Some step other than the
  entry's own must carry the mapping field in an editable view entry
  (neither `visible: false` nor `readonly: true`). If it is editable only
  on the entry's own step, the write-back runs after that gate.
- a `contract.inputFields` entry naming the field
- a field's catalog `default` declaring a literal. The engine seeds it into
  `instance.data` at creation (`applyFieldDefaults`). A CEL `default` may
  raise at creation and leave the field unwritten, so it counts for nothing.
- a view entry naming the field that declares neither `visible: false` nor
  `readonly: true`

That set SHALL match the studio's `writtenFieldCounts`
(`packages/web/src/areas/studio/draft/view-flags.ts`) for the structural
sources and the editable-entry rule, with two documented engine
refinements. The engine excludes an action output on the entry's own step
at `onExit`/`onPath`/`onCancel`. It also excludes a `columnMapping` target
whose mapping field is editable only on the entry's own step. It excludes
one that appears in no editable view entry on any other step too.

The studio counts the target regardless of where, or whether, the caller
places the mapping field. The engine counts a literal catalog `default`
too, which the studio does not. The change record's design.md (Decisions)
carries the reasoning for both.

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
  action sits on a step other than the one carrying the entry, or on the
  entry's own step's `onEntry`.
- **THEN** the publish succeeds

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
- **AND** a step's `subprocess.outputMapping` names the same field
- **THEN** the publish succeeds

#### Scenario: A column mapping makes the entry publishable

- **WHEN** a step's view entry declares `required: true` and `readonly: true`
- **AND** a `columnMapping` target names the field
- **AND** a step other than the entry's own carries the mapping field in an
  editable view entry
- **THEN** the publish succeeds

#### Scenario: A contract input field makes the entry publishable

- **WHEN** a step's view entry declares `required: true` and `readonly: true`
- **AND** a `contract.inputFields` entry names the same field
- **THEN** the publish succeeds

#### Scenario: An editable entry on another step makes the entry publishable

- **WHEN** a step's view entry declares `required: true` and `readonly: true`
- **AND** another step's view entry names the field as neither hidden nor
  readonly
- **THEN** the publish succeeds

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
