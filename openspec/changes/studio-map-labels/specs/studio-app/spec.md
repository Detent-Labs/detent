## MODIFIED Requirements

<!-- antislop: allow synonym-rotation -->
<!-- Why: the heading repeats the live spec's wording verbatim, so the delta can match it. -->
### Requirement: The panels screen is a routed sub-state of the edit screen

<!-- antislop: allow trailing-negation synonym-rotation -->
<!-- Why: the paragraph repeats the live spec's wording verbatim; this change edits one sentence of the block. -->
The six tabs SHALL sit on a routed surface, not behind a dialog. The path
SHALL read `/processes/:id/edit/:tab`. Here `:tab` is one of `map`, `steps`,
`fields`, `forms`, `checks` or `settings`. A view of the Fields or Settings
tab rides as a further segment, `/processes/:id/edit/:tab/:view`.

That path SHALL be a sub-state of the `edit` route. It rides as an optional field
on the same route object, the shape `formStepId` already takes. The
`studio-form-editor` capability routes its own screen that way.

An unrecognized `:tab` SHALL fall back to the Map tab. The routing table
already answers an unrecognized path with the process list, and this is that rule
one level down.

<!-- antislop: allow trailing-negation -->
<!-- Why: the paragraph repeats the live spec's wording verbatim; this change edits one sentence of the block. -->
The surface SHALL stand the tab row above one body. The body SHALL hold the open
tab alone. No rail of tab names SHALL stand beside it. The rail's one-line
summary SHALL stand in the studio's area nav, not at the surface's bottom edge.
See the `studio-checks-rail` capability for what the rail carries there.

<!-- antislop: allow negation-habit -->
<!-- Why: the paragraph repeats the live spec's wording verbatim; this change edits one sentence of the block. -->
A tab SHALL fill the body. The tab row above it SHALL keep every other tab one
click away. The surface therefore needs no control back to the canvas.

A step target SHALL ride on the `edit` route at its own path segment,
`/processes/:id/edit/step/:stepId`, ranked after the `tab` and `formStepId`
matches.

Choosing a "Show on the map" control SHALL open the Map tab with that step
preselected. The Map tab SHALL read the target on every change of it, and on
mount. Reaching it from another tab therefore still selects the step.

Once read, the surface SHALL replace that history entry with the plain `edit`
route. It SHALL NOT leave the step target addressable. The browser's Back control
therefore still returns to the tab the navigation came from, per
`unified-shell`'s navigation requirement.

The body SHALL fill the height the header rows and the tab row leave. It SHALL
stop above the floor the surface uses. A taller window therefore carries a taller
body, and no empty band sits below it.

#### Scenario: The columns fill a tall window

- **WHEN** the author opens a tab on a window taller than the floor
- **THEN** the body reaches the surface's bottom edge
- **AND** no empty band sits below it

#### Scenario: A short window holds the floor

- **WHEN** the author opens a tab on a window shorter than the floor
- **THEN** the body holds that floor and the page scrolls

#### Scenario: The screen stands no checks column

- **WHEN** the author opens a tab
- **THEN** the open tab fills the body
- **AND** the checks summary stands in the area nav, in no column of its own

#### Scenario: A view has its own address

- **WHEN** the author opens Where values come from on the Settings tab
- **THEN** the address bar reads `/processes/:id/edit/settings/sources`, and
  loading that path directly opens the same view

#### Scenario: The Changes and Paths views have addresses too

- **WHEN** the author loads `/processes/:id/edit/changes`
- **THEN** the Versions screen opens, where the change list stands now
- **AND** loading `/processes/:id/edit/paths` opens the Steps tab

#### Scenario: A reload keeps the open view

- **WHEN** the author reloads the browser on the Settings tab's What it takes
  in and gives back view
- **THEN** the surface reopens on that view, with Map closed

<!-- The scenario name repeats the live spec's wording verbatim, so a delta can match it. -->
<!-- antislop: allow synonym-rotation -->
#### Scenario: Back leaves the screen rather than the process

- **WHEN** the author reaches the Fields tab from the Map tab and presses
  the browser's Back control
- **THEN** the Map tab returns, and the draft keeps every change

#### Scenario: Show on the canvas preselects a step

- **WHEN** the author picks "Show on the map" on a used-in row of the
  Fields tab
- **THEN** the Map tab opens and selects the step that row named

#### Scenario: An unknown view falls back to the canvas

- **WHEN** the author loads `/processes/:id/edit/nonsense`
- **THEN** the Map tab opens, and the surface reports no issue

### Requirement: The Fields view's effect half states usage, a condition and requiredness

<!-- antislop: allow trailing-negation -->
<!-- Why: copied byte for byte from the live requirement. -->
"Column mapping" SHALL show in the effect half only when the field's
data source is mappable, per the existing `showsColumnMapping` rule.
Its absence draws no rule of its own. It sits in the effect half
because a column mapping writes into other fields. That is effect, not
definition.

"Used in" SHALL list every step whose view references the field, with
the modes those references set. A "Show on the map" control on a row
SHALL open the Map tab with that step preselected.

"Only ask this when" is a third condition-builder site, alongside the
path guard and the view-override sites `studio-condition-builder`
already names. It SHALL read the `visible` overrides of every step
view that references the field. When those views disagree, the row
SHALL state that plainly. A `visible` override is `boolean` or an
expression. The row edits expressions alone. A referencing view holding
a literal SHALL therefore count as a disagreement, and the row SHALL
name it.

When no step view references the field, the row SHALL show disabled.
It SHALL state that no step asks for it yet.

The row's operand picker SHALL withhold `child.*`. No `visible` override
admits `child`: the runtime resolves the flag with no child in scope.

Updating the condition SHALL write the same override to every
referencing view, and SHALL name the write before it happens. Where a
referencing view holds a literal, the notice SHALL name that step.

An unfinished row SHALL write nothing. Each referencing view's `visible`
key SHALL stand as it did until the row is complete. That holds when the
views disagree.

The row SHALL carry a "Clear on <steps>" command in the builder's footer,
beside the CEL toggle. It SHALL show only while some referencing view has a
`visible` key. Pressing it SHALL drop the `visible` key from every
referencing view. Its label SHALL name every step it clears, so the scope
stands before the press.

Removing the last row of a condition the views hold SHALL clear it too, on
the same terms. Removing a row the author just added, when no view holds a
condition, SHALL change nothing. The field SHALL NOT keep a field-level
condition.

"Ask for this" SHALL read and write the `required` override of every
step view that references the field. The catalog declares no `required`
key of its own, so this control writes the view and never the field.
That is the definition contract's own rule, and this control does not
bend it.

When those views disagree, the row SHALL state that plainly and name
the differing step. Updating SHALL name the write before it happens,
on the same terms the condition row takes. A technical field SHALL show
the row disabled, since `technical` already forces `required: false` on
every step. A field no step view references SHALL show it disabled too.

#### Scenario: A mappable field shows Column mapping in the effect half

- **WHEN** the developer opens the Fields view on a field whose data
  source is mappable
- **THEN** "Column mapping" shows in the effect half, ruled apart from
  its neighbour

#### Scenario: An unmappable field shows no Column mapping zone

- **WHEN** the developer opens the Fields view on a field whose data
  source is not mappable
- **THEN** no "Column mapping" heading renders, and its neighbour draws
  no rule below it for a zone that isn't there

#### Scenario: Used in lists steps and modes

- **WHEN** a field's ref appears in two step views, one with
  `required` and one with `readonly`
- **THEN** the usage list names both steps and both modes

#### Scenario: A condition writes every referencing view

- **WHEN** the developer sets "Only ask this when" on a field that
  two step views reference
- **THEN** both views carry the same `visible` override, and the row
  named both steps before the write

#### Scenario: Clearing the condition names its scope

- **WHEN** the developer presses "Clear on <steps>" in "Only ask this when"
  on a field that two step views reference
- **THEN** the command's label named both steps before the press, and
  neither view carries a `visible` key afterwards

#### Scenario: Adding a row to diverging views writes nothing

- **WHEN** one referencing view carries `visible: false` and another carries
  an expression
- **AND** the developer presses "Add row" and leaves it unfinished
- **THEN** both views keep the `visible` value they carried
- **AND** removing that row leaves both views as they were

#### Scenario: The clear command shows only with something to clear

- **WHEN** no referencing view carries a `visible` key
- **THEN** the row shows no "Clear on <steps>" command
- **AND** the command shows once a view carries a `visible` key

#### Scenario: The condition row names diverging views

- **WHEN** one referencing view carries a different `visible`
  override than the others
- **THEN** the condition row says so and names the differing step

#### Scenario: A literal override counts as a disagreement

- **WHEN** one referencing view carries `visible: false` and another
  carries an expression
- **THEN** the condition row says the views disagree and names the step
  holding the literal
- **AND** the write notice names that step too

#### Scenario: The condition row offers no child operand

- **WHEN** the developer opens "Only ask this when" on a field a
  subprocess step's view references
- **THEN** the operand picker offers the catalog and the instance and
  actor context, and it offers no `child.outcome` or `child.data` entry

#### Scenario: An unreferenced field disables the condition row

- **WHEN** the developer opens "Only ask this when" on a field no step
  view references
- **THEN** the row shows disabled and states that no step asks for
  the field yet

#### Scenario: Ask for this writes every referencing view

- **WHEN** the developer turns "Ask for this" on for a field that two
  step views reference
- **THEN** both views carry `required: true`, and the row named both
  steps before the write

#### Scenario: Ask for this names disagreeing views

<!-- antislop: allow negation-habit -->
<!-- Why: copied byte for byte from the live scenario. -->
- **WHEN** one referencing view carries `required: true` and another
  carries no `required` key
- **THEN** the row says the views disagree and names the differing step

#### Scenario: A technical field disables Ask for this

- **WHEN** the developer selects a field carrying `technical: true`
- **THEN** "Ask for this" shows disabled, and the draft's view entries
  keep no `required` key
