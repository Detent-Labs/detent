## MODIFIED Requirements

### Requirement: A view entry declaring literal `required: true` and literal `readonly: true` names a field some source writes

The compile pass SHALL reject a `view.fields[]` entry declaring literal
`required: true` and literal `readonly: true`. The rejection SHALL apply
only where no source in the body writes the field that entry names. The
write must happen before a participant submits the entry's own step.

An entry the rule rejects strands the instance. The participant cannot type
into a readonly field. The required check then refuses to advance the
step. Nobody can clear the result.

A step D **dominates** a step S when every path from `initialStep` to S
passes through D. This walks `Path` edges. Both `manual` and `automatic`
triggers count as edges for this purpose. A guard's outcome at runtime does
not change which edges exist. A step reachable from `initialStep` dominates
itself.

No existing check guarantees every declared step is reachable from
`initialStep`. An authored body may legally contain a step nothing points
to. Such an orphan can carry its own valid outgoing path. It then satisfies
"all `id` references resolve" and "every non-terminal step has at least one
exit" on its own. For such an unreachable step S, every step in the body
vacuously dominates S. No path from `initialStep` to S exists for any step
to fail to lie on.

So a required+readonly pair on an unreachable step's manual-path view entry
always finds a dominating writer. That holds whenever the body carries any
writer for that field at all. This behavior matches today's, unchanged. It
is the intended outcome for an unreachable step, not an oversight.

A source writes a field, guaranteed before the entry's own step S, when the
body carries one of these:

- an action's `output` naming the field, where the action sits on a step
  that dominates S. This holds at any position: `onEntry`, `onExit`,
  `onPath`, `onCancel`, or a timer's `onFire`, target-path or reminder
  alike. It also holds on S's own step, but only at `onEntry`.

  It also holds at S's own step's timer `onFire` declaring a `targetPath`.
  An action on S's own step at `onExit`, `onPath`, or `onCancel` does not
  count. This holds whether or not the step dominates itself. Those fire
  only after the submission gate. They cannot help it.
- a step's `subprocess.outputMapping` naming the field, where the step
  dominates S
- a `columnMapping` target naming the field. Some step that dominates S,
  other than S itself, must carry the mapping field in an editable view
  entry. That entry must declare neither `visible: false` nor
  `readonly: true`. If the field is editable only on S's own step, the
  write-back runs after that step's own submission gate. That is the same
  as an own-step action
- a `contract.inputFields` entry naming the field
- a field's catalog `default` declaring a literal. The engine seeds it into
  `instance.data` at creation (`applyFieldDefaults`). A CEL `default` may
  raise at creation and leave the field unwritten, so it counts for nothing.
- a view entry naming the field that declares neither `visible: false` nor
  `readonly: true`, on a step that dominates S, other than S itself

That set SHALL match the studio's `writtenFieldCounts` for the structural
sources, the editable-entry rule, and the dominance test. That function
lives in `packages/web/src/areas/studio/draft/view-flags.ts`. Two
documented engine refinements apply beyond that shared set. The engine
excludes an action output on the
entry's own step at `onExit`/`onPath`/`onCancel`. It also excludes a
`columnMapping` target whose mapping field is editable only on the entry's
own step. It excludes one that appears in no editable view entry on any
step dominating the entry's own step too.

The studio counts the target regardless of where, or whether, the caller
places the mapping field. That is true past the dominance test both share.
The engine
counts a literal catalog `default` too, which the studio does not. The
change record's design.md (Decisions) carries the reasoning for both, and
for the dominance test's shared placement.

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
  position. Or it sits on the entry's own step, only at `onEntry`. It may
  also sit at the entry's own step's timer `onFire` declaring a
  `targetPath`.
- **THEN** the publish succeeds

#### Scenario: An action output on a non-dominating step does not make the entry publishable

- **WHEN** a step carrying a manual path's view entry declares
  `required: true` and `readonly: true`
- **AND** the only source naming the field is an action's `output`. That
  output sits on a step that does NOT dominate the entry's own step. The
  step is reachable only after it, or only via a different branch
- **THEN** the publish fails with a validation error naming that field and step

#### Scenario: A timer's onFire output on a non-dominating step does not make the entry publishable

- **WHEN** a step carrying a manual path's view entry declares
  `required: true` and `readonly: true`
- **AND** the only source naming the field is a timer's `onFire` action's
  `output`. That output sits on a step that does NOT dominate the entry's
  own step. The step is reachable only after it, or only via a different
  branch
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
  entry's own step's timer. That timer declares no `targetPath`
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
  entry's own. That step carries the mapping field in an editable view
  entry
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
  step. That step is reachable only by first leaving `initialStep`. So
  `initialStep` cannot dominate it, and it cannot dominate `initialStep`
- **THEN** the publish fails with a validation error naming that field and step

#### Scenario: An editable entry on a sibling branch step does not make the entry publishable

- **WHEN** a step S's view entry declares `required: true` and `readonly: true`
  for a field
- **AND** the only source naming the field is an editable view entry on a
  step. That step is reachable from `initialStep` only via a path that
  never passes through S. It is a branch sibling, not an ancestor
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
