<!-- antislop: allow-file passive-voice sentence-length synonym-rotation -->
<!-- The MODIFIED blocks below carry live-spec text verbatim, which the archive step matches by exact header, so their existing findings stay unrewritten; "validation error" there and "located issue" in the ADDED blocks are both the live spec's own wording, which is why synonym-rotation is listed. -->
## MODIFIED Requirements

### Requirement: View field references resolve against the full recursive field set

A `view.fields[].ref` SHALL resolve against every field id in the body,
including fields nested at any depth inside a `group` field, matching the
field set the CEL layer already type-checks expressions against. A
`view.fields[].ref` naming a nested field id SHALL NOT be rejected, and one
naming no field at any depth SHALL fail to parse.

This rule reaches field entries alone. A note entry declares no `ref` to
resolve, and its absence SHALL NOT read as an unresolvable reference.

#### Scenario: A view referencing a nested group field's id resolves
- **WHEN** a step's `view.fields` includes an entry whose `ref` names a field id declared inside a `group` field's `fields`
- **THEN** the process body parses successfully (subject to every other invariant)

#### Scenario: A view reference to an unknown field id is still rejected
- **WHEN** a step's `view.fields` includes an entry whose `ref` names no field id at any depth
- **THEN** the process body fails to parse

#### Scenario: A note entry needs no resolvable field reference

- **WHEN** a step's `view.fields` holds a note entry and the body declares no
  field the note could name
- **THEN** the body parses, because this rule reaches field entries alone

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
entry carrying no `ref`: a note entry names no field, so this rule has no
field to look for a writer of.

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

#### Scenario: A note beside an unwritten pair moves neither verdict

- **WHEN** a step carrying a manual path holds a note and a view entry
  declaring `required: true` and `readonly: true`
- **AND** no source in the body writes the field that entry names
- **THEN** the publish fails with a validation error naming that field and
  step, and reports nothing against the note

## ADDED Requirements

### Requirement: A step view holds entries of two kinds, and one of them is a note

A `view.fields` array SHALL hold entries of two kinds. An entry carrying no
`kind` key SHALL be a field entry, with the shape and the meaning it carries
today. An entry carrying `kind: "note"` SHALL be a note entry. A note
references no field and carries authored text.

A note entry SHALL declare `text` as `LocalizedText`. It MAY declare `visible`,
`group` and `span`, each meaning what it means on a field entry. It SHALL
declare no `ref`, `required`, `readonly`, `validation` or `validationMode`.

A field entry SHALL carry no `kind` key at all, rather than a literal marking
it as a field. The schema also deserializes stored immutable bodies. A required
discriminant would make every body published before this change throw on read.

Reading a stored body SHALL keep stripping, as it does for every other
undeclared key. Publishing SHALL reject a note entry that carries a field
entry's key. The two paths then behave exactly as they already do elsewhere.

An entry carrying a `kind` this contract does not declare SHALL be read as a
field entry, and publishing SHALL then report `kind` as an unknown key on it.
A `kind` that is not a string SHALL be read the same way. No entry SHALL
escape the unknown-key check by carrying a `kind` no member claims.

Every other requirement in this capability phrased over a `view.fields[]`
entry reaches field entries alone. A note declares none of the keys those
rules name.

#### Scenario: A view mixes a note with field entries

- **WHEN** a step's `view.fields` holds a note entry followed by two field
  entries
- **THEN** the body parses, and the note keeps the position the array gives it

#### Scenario: Publishing rejects a note entry carrying a field key

- **WHEN** an authored body declares a note entry that also carries `ref`
- **THEN** publishing fails with a located issue naming `ref` on that entry

#### Scenario: A body published before this change parses unchanged

- **WHEN** the engine reads a stored body whose view entries carry no `kind`
- **THEN** every entry parses as a field entry, and the body's
  `definitionHash` matches the one stored beside it

### Requirement: A note's base-locale check takes the schema placement

The rule a note's `text` meets is `authored-content-localization`'s. It is not
a second rule. That capability requires a non-empty base-locale entry for
every `LocalizedText` value in the body. A note's `text` is one of them.

This requirement records where that check runs. It SHALL run in the
`definition.ts` schema. Its call sits beside the ones `processBody`'s
superRefine already makes for a label, a description and an option label.

That placement follows this capability's own placement rule. An invariant
whose violation cannot exist in an already-published body MAY live in the
schema. No body published before this change carries a note.

#### Scenario: The check runs on the read path, not at publish alone

- **WHEN** the engine reads a body whose note text omits the body's
  `baseLocale`
- **THEN** it fails to parse, rather than passing the read and failing only at
  publish

#### Scenario: A note omitting the base locale fails to parse

- **WHEN** a note entry's `text` declares `fr` alone, and the body's
  `baseLocale` is `de`
- **THEN** the body fails to parse, with an issue locating the step and the
  entry

### Requirement: Publishing reports an unknown key on either kind of view entry

Publishing SHALL report an unknown key on a note entry and on a field entry
alike. A second entry kind SHALL NOT weaken the check on the first. A view
holding a note keeps every field entry beside it under the same scrutiny.

This requirement adds a note to the surface an existing rule already covers.
It states no new rule about unknown keys.

#### Scenario: Publishing reports an unknown key on a note entry

- **WHEN** an authored body declares a note entry carrying `txet`
- **THEN** publishing fails with a located issue naming that key

#### Scenario: Publishing still reports an unknown key on a field entry beside a note

- **WHEN** an authored body declares a view holding a note entry and a field
  entry, and the field entry carries `requried`
- **THEN** publishing fails with a located issue naming that key

#### Scenario: Publishing rejects a view entry whose kind names no member

- **WHEN** an authored body declares a view entry carrying `kind: "notes"`, a
  `ref` that resolves, and a `text`
- **THEN** publishing fails with a located issue naming `kind` on that entry,
  rather than publishing it as a field entry with the two keys stripped
