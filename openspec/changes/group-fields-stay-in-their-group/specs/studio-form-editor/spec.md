## ADDED Requirements

### Requirement: Removing a group card removes the members placed inside it

Removing a group card from the canvas SHALL remove every entry placed
inside that group. One draft change carries all of it. That covers
field members and note members alike.

The catalog keeps every field. Each removed member SHALL return to the
palette, and the group's own entry SHALL return with them.

A member cannot outlive its group card on a form. The definition
contract already refuses a body whose entry names a group the view
leaves out. Leaving the members behind would hand the author a draft
that no publish accepts. Nothing on the canvas would explain it.

#### Scenario: Removing a group takes its members off the form

- **WHEN** the developer removes a group card holding two placed member
  fields
- **THEN** the view carries neither the group entry nor either member
- **AND** all three appear in the palette again

#### Scenario: Removing a group takes a note placed inside it

- **WHEN** the developer removes a group card holding a note
- **THEN** the view carries neither the group entry nor the note

#### Scenario: Removing a group leaves the catalog alone

- **WHEN** the developer removes a group card holding two placed member
  fields
- **THEN** the field catalog still declares the group and both fields,
  nested as before

#### Scenario: Removing one member leaves the group standing

- **WHEN** the developer removes a single member card from inside a
  group
- **THEN** the group card stays on the canvas, with its other members

## MODIFIED Requirements

### Requirement: A left palette lists catalog fields not yet on the form, and offers minting a new one

The editor SHALL show every catalog field not currently referenced by
the step's view in a palette on the left. Dragging a placed-field entry
onto the canvas SHALL add it to the view, at the drop position.

A field the catalog nests inside a group is the exception to the drop
position. Dragging one onto the canvas SHALL place it inside that
group, whatever slot the drop named. A drop landing on another member's
own edge SHALL place it at that slot among the members. Every other
drop SHALL place it after the group's last member.

Where the group's own card is absent from the view, the same drop SHALL
place the group card too. One draft change carries both. The group card
goes at the slot the drop named. A member reaching a form without its
group would leave a draft no publish accepts.

The palette SHALL also offer an "add a field to the process" section, by
type. Dragging one of those entries onto the canvas SHALL mint a new
catalog field of that type. It SHALL add that field to the view, at the
drop position, in the same move. A minted field is a top-level catalog
field, so it joins no group.

A field already on the view SHALL NOT appear in the palette's
place-an-existing-field list. Removing a field from the canvas SHALL
return it to that list, if the field stays in the catalog.

#### Scenario: A field leaves the palette once placed

- **WHEN** the developer drags a palette field onto the canvas
- **THEN** that field appears on the canvas and no longer appears in
  the placed-an-existing-field list

#### Scenario: Removing a field returns it to the palette

- **WHEN** the developer removes a placed field from the canvas
- **THEN** that field reappears in the palette, and the view no longer
  references it

#### Scenario: Dropping a group's field outside the group still places it inside

- **WHEN** the developer drags a palette field the catalog nests inside
  a group, and drops it between two ungrouped cards
- **THEN** the card appears inside that group's card on the canvas
- **AND** the view entry carries the group field's key as its `group`

#### Scenario: A drop on a member's edge picks the position among the members

- **WHEN** the developer drags a palette field the catalog nests inside
  a group
- **AND** drops it on the leading edge of that group's second member
- **THEN** the card appears between the group's first and second members

#### Scenario: A group's first field brings the group card with it

- **WHEN** the canvas has no card for a given group
- **AND** the developer drags a palette field the catalog nests inside
  that group onto the canvas
- **THEN** the view carries the group's own entry and the member entry
- **AND** the canvas draws the member inside the group card

#### Scenario: Dropping an "add a field" entry mints and places a field

- **WHEN** the developer drags a "Text" entry from the "add a field to
  the process" section onto the canvas
- **THEN** a new catalog field of type `string` exists in the draft
- **AND** that field appears on the canvas at the drop position

#### Scenario: A minted field joins no group

- **WHEN** the developer drops an "add a field" entry inside a group
  card on the canvas
- **THEN** the minted field sits at the form's root, carrying no `group`

#### Scenario: A minted field is reachable through the field catalog too

- **WHEN** the developer mints a field through the form editor's
  palette
- **THEN** that field appears in the process's field catalog
- **AND** it appears there the same way a field minted on the panels
  screen's Fields view does

### Requirement: The canvas places fields at the view's column count, in array order

The canvas SHALL show the form at the step view's declared column
count (see the `runtime-api` and `form-ui` capabilities for `columns`
and `span`). Position on the canvas SHALL be the view array's own
order, read left to right, then down. This is the same order the
override-row list's `↑`/`↓` buttons already express.

The canvas SHALL draw a group's placed members inside that group's own
card. An entry with no `group` sits at the form's root. A group card
draws the entries naming its key, in the view array's order. That is
the nesting `form-ui` already renders, so the canvas and the preview
beside it agree on sight.

A group field's own member fields SHALL show at the same column count
as the form around them. That matches how `form-ui` lays a group out
(see the `form-ui` capability). The editor SHALL offer no separate
column count for a group.

The canvas places view entries of either kind. A note card takes
its position from the same array and answers the same order rule. Nothing
here reads a card's kind: a note occupies a slot the way a field card does.
A note carrying a group's key draws inside that group, beside the field
members.

#### Scenario: A form built before this editor loads unchanged

- **WHEN** the developer opens the editor for a view whose fields carry
  no `span` or `columns`
- **THEN** the canvas shows one column, every field full width, in the
  view array's existing order

#### Scenario: Dragging a field to a new position changes the array

- **WHEN** the developer drags a placed field to a new position on the
  canvas
- **THEN** the view array's order changes to match, left to right then
  down

#### Scenario: A group's members draw inside its card

- **WHEN** the developer opens the editor for a view carrying a group
  entry and two entries naming that group's key
- **THEN** the canvas draws both member cards inside the group card
- **AND** neither appears at the form's root

#### Scenario: Members draw in the order the preview renders them

- **WHEN** a view holds a group's two members at array positions that
  another entry separates
- **THEN** the canvas draws them adjacent inside the group card, in
  array order
- **AND** the preview beside the canvas shows the same two, in the same
  order

The canvas SHALL draw an entry whose `group` resolves to no group card at
the form's root. Three drafts hold one:

- a body somebody hand-edited in the JSON view
- a body published before the parentage rule
- a group whose `key` is still empty mid-edit

The checks rail reports each of those, so the canvas SHALL show the entry
rather than hide it.

#### Scenario: An entry naming an unknown group draws at the root

- **WHEN** a view holds a field entry whose `group` matches no group field
  the same view carries
- **THEN** the canvas draws that entry at the form's root
- **AND** the checks rail reports the unresolved group

#### Scenario: A field under a key-less group draws at the root

- **WHEN** the catalog nests a field inside a group field whose `key` is
  still empty
- **THEN** the canvas draws that field at the form's root, and draws no
  group card for the key-less group

#### Scenario: A note card takes its position from the same array

- **WHEN** the developer opens the editor for a view holding a field entry,
  a note and a second field entry
- **THEN** the canvas draws three cards in that order, left to right then
  down

### Requirement: A selected field's strip sets its overrides and span

Selecting a placed field SHALL show a strip below the canvas for that
field. The strip SHALL offer `visible`, `required`, and `readonly`.
Each is a three-way choice among `true`, `false`, and a CEL
expression. Choosing the expression option SHALL reveal an input for
that field's expression. The strip SHALL also offer `span`.

The strip SHALL offer no `group` control. The field catalog answers
where a field belongs, once, for the whole process. Its own
re-parenting control is where an author changes that. A select here
would offer one lawful value and several the publish rejects.

Where the selected field's `FieldDef` declares `technical: true`, the
strip SHALL NOT offer the `required` or `readonly` controls at all. The
definition contract rejects either key on that field's view entry. A
control the author could set there would only invite a rejected publish.
`visible` and `span` stay offered unchanged.

Each control SHALL start at the value the engine resolves for an absent
key. That value is true for `visible`. It is false for `required` and for
`readonly`. `resolveFlag` (`src/runtime/api.ts`) sets those three. The
strip SHALL show what the engine does, whatever the key holds.

Each control SHALL write its key only on a departure from that default.
On a return to the default, the control SHALL clear the key. A view
entry that carried no `visible` key SHALL carry none again, after a tick
and an untick.

That rule keeps `ProcessBody` still under a change that alters no
behaviour. A written `visible: true` moves `definitionHash`, and an
identical re-publish then stops being a no-op.

A `visible` of literal `false` SHALL disable the `required` and the
`readonly` control. It SHALL clear both keys. A `visible` that holds a
CEL expression SHALL leave both controls alone. Nobody can read an
expression's value without an instance.

Nothing else in the draft writes a selected field before the developer
submits its own step. When that holds, its `required` and `readonly`
controls SHALL gate each other. That is the same rule the field
matrix's live cell applies. Checking `required` SHALL disable
`readonly`, while `readonly` does not already read `true`. Checking
`readonly` SHALL disable `required`, while `required` does not already
read `true`.

"No other source, guaranteed before this step" means none of these
already write the field:

- an action's `output`, on a step whose action **dominates** the
  selected field's own step. Every path from `initialStep` to that
  step passes through the action's step.

- an action's `output` on the field's own step, set at `onEntry`.

- an action's `output` on the field's own step's timer `onFire`, when
  that timer declares a `targetPath`.

- a subprocess's `outputMapping`, on a step that dominates the
  selected field's own step.

- a field's `columnMapping`.

- a `contract.inputFields` entry.

- another editable view entry (`visible !== false`, `readonly !==
  true`) for the same field, on a step that dominates the selected
  field's own step.

A step dominating another is the same relation the compile pass's
`definition-contract` check (`checkUnsatisfiableRequiredReadonly`) and
the field matrix's live cell use. All three SHALL share one dominance
computation over the draft's `workflow.steps`. None can disagree with
the others about which step guarantees a value by the time the
developer submits a step.

A field editable only on a step that does NOT dominate the selected
field's own step does NOT count. Gating stays engaged regardless. That
non-dominating step may be reachable solely after it, or only via a
different branch.

Where a selected field already carries `required: true` and
`readonly: true` before either gate engages, neither control SHALL
disable. The developer keeps a path to uncheck either one.

#### Scenario: An absent visible key shows the field as visible

- **WHEN** the developer selects a placed field whose view entry carries
  no `visible` key
- **THEN** the strip's `visible` control reads true

#### Scenario: Returning to the default clears the key

- **WHEN** the developer sets a placed field's `visible` to false, then
  back to true
- **THEN** the view entry has no `visible` key

#### Scenario: A departure from the default writes the key

- **WHEN** the developer sets a placed field's `visible` to false
- **THEN** the view entry carries `visible: false`

#### Scenario: An absent required key reads false

- **WHEN** the developer selects a placed field whose view entry carries
  no `required` key
- **THEN** the strip's `required` control reads false

#### Scenario: Hiding a field disables and clears its other two flags

- **WHEN** the developer sets a placed field's `visible` to false on an
  entry carrying `required: true` and `readonly: true`
- **THEN** the strip disables the `required` and `readonly` controls
- **AND** the view entry carries neither key

#### Scenario: A CEL visible leaves the other two controls alone

- **WHEN** a placed field's `visible` is a CEL expression
- **THEN** the strip leaves the `required` and `readonly` controls
  enabled

<!-- antislop: allow trailing-negation - a MODIFIED scenario name must match the live spec's wording exactly -->
#### Scenario: Leaving the expression option restores the default, not false

- **WHEN** the developer switches a placed field's `visible` from the
  expression option to the boolean option
- **AND** that entry carries `required: true` and `readonly: true`
- **THEN** the view entry has no `visible` key
- **AND** the `required` and `readonly` keys stay as they were

#### Scenario: Switching an override to an expression reveals the input

- **WHEN** the developer sets a selected field's `required` choice to
  the expression option
- **THEN** a CEL expression input appears in the strip for `required`

#### Scenario: Changing span changes the field's width on the canvas

- **WHEN** the developer sets a selected field's `span` to `2` on a
  `columns: 2` view
- **THEN** that field's card widens to span both columns on the canvas

#### Scenario: Checking required disables readonly on an unwritten field

- **WHEN** the developer checks `required` on a selected field
- **AND** nothing else in the draft writes that field before its own
  step
- **AND** `readonly` does not already read `true`
- **THEN** the strip's `readonly` control disables

#### Scenario: Checking readonly disables required on an unwritten field

- **WHEN** the developer checks `readonly` on a selected field
- **AND** nothing else in the draft writes that field before its own
  step
- **AND** `required` does not already read `true`
- **THEN** the strip's `required` control disables

#### Scenario: A field something else writes keeps both controls free

- **WHEN** the developer checks `required` on a selected field
- **AND** some other source already writes that field, on a step that
  dominates the selected field's own step
- **AND** that source is one the requirement above already lists
- **THEN** the strip's `readonly` control stays enabled

#### Scenario: A field editable only on a non-dominating step keeps gating engaged

- **WHEN** the developer checks `required` on a field selected on the
  process's first step
- **AND** the field's only other writer is an action output or a
  subprocess output mapping on a non-dominating step
- **AND** that non-dominating step is reachable only after this first
  step, or only via a different branch
- **THEN** the strip's `readonly` control disables

#### Scenario: An own-step post-gate output does not clear gating

- **WHEN** the developer checks `required` on a selected field
- **AND** the field's only other writer is an action's `output` on the
  field's own step at `onExit`, `onPath`, or `onCancel`
- **THEN** the strip's `readonly` control still disables. An own-step
  post-gate output fires after the submission gate. It does not count
  as a source that writes the field before the developer submits this
  step.

#### Scenario: An entry already carrying both flags stays editable

- **WHEN** the developer selects a field whose entry already carries
  `required: true` and `readonly: true`
- **AND** nothing else in the draft writes that field before its own
  step
- **THEN** neither the `required` nor the `readonly` control disables
- **AND** the developer can uncheck either one

#### Scenario: A technical field's strip omits required and readonly

- **WHEN** the developer selects a placed field whose `FieldDef` declares
  `technical: true`
- **THEN** the strip shows `visible` and `span`
- **AND** the strip shows no `required` or `readonly` control


#### Scenario: A field's strip offers no group control

- **WHEN** the developer selects a placed field the catalog nests inside
  a group
- **THEN** the strip shows no control for `group`
- **AND** the view entry keeps the `group` it carries

<!-- antislop: allow trailing-negation - a MODIFIED heading must match the live spec's wording exactly -->
### Requirement: A field's position is reachable by keyboard, not drag alone

Every placed field SHALL offer keyboard-operable move commands, in
addition to its drag handle. The commands are move up and move down. A
keyboard move SHALL change the view array the same way a drag does.

A move-to-group command is gone from the set. The catalog holds a
field's group now, and the strip offers no control for it either.

A member of a group SHALL move among that group's own entries alone.
Move-up on the group's first entry and move-down on its last SHALL be
unavailable. A drag that would land a member outside its group SHALL
change nothing.

An entry carrying no `group` SHALL move among the form's root entries
alone, skipping over a group card's members. A group card is one root
entry, and a move past it clears the whole group.

A note placed inside a group answers the member rule. A note at the
form's root answers the root rule.

#### Scenario: A keyboard move reorders the same way a drag does

- **WHEN** the developer uses a placed field's move-up command
- **THEN** the view array's order changes exactly as it would from
  dragging that field one position up

#### Scenario: A member's move-up stops at its group's first entry

- **WHEN** the developer opens a group's first member and reads its
  move-up command
- **THEN** the command is unavailable

#### Scenario: A member's move-down stops at its group's last entry

- **WHEN** the developer opens a group's last member and reads its
  move-down command
- **THEN** the command is unavailable

#### Scenario: A member's move swaps it with its own sibling

- **WHEN** the developer uses the move-up command on a group's second
  member
- **THEN** that member and the group's first member trade places
- **AND** no entry outside the group moves

#### Scenario: A drag out of a group changes nothing

- **WHEN** the developer drags a group member onto a drop slot at the
  form's root
- **THEN** the view array keeps every entry where it was
- **AND** the member stays inside its group

#### Scenario: A root entry's move steps over a whole group

- **WHEN** the developer uses the move-down command on a root entry
  sitting directly above a group card holding three members
- **THEN** that entry lands below the group card and all three members
