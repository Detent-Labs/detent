## MODIFIED Requirements

### Requirement: The panels screen keeps every change and states so

<!-- antislop: allow synonym-rotation -->
<!-- Why: the toolbar's Discard control drops every unsaved change. The
     panel's Remove control drops one entity. Two separate controls,
     each keeping its own name. -->
The panels screen SHALL carry no Save control. Every change an author
makes on it SHALL write straight into the in-browser draft. That is how
the panels write today. The screen's own Save, Discard and Publish
toolbar SHALL remain the only thing that persists.

Leaving the screen SHALL discard nothing. The screen SHALL state that
plainly, so leaving never reads as a cancel.

A panel's own unsubmitted input SHALL survive a switch between views.
The contract panel holds a half-typed outcome name in component state.
The data sources panel fetches its list keys on mount. The field matrix
holds its selected cell in component state. All four views SHALL
therefore stay mounted for as long as the panels screen is open.
Switching a view SHALL reveal and hide them, rather than mount them.

An index rail SHALL list the four views. Each entry SHALL carry two
numbers, and they SHALL read as different things. The entity count says
how many fields, data sources, outcomes or live cells the view holds.
The issue count says how many of them are wrong. Only the issue count
takes the refusal tone. An entry SHALL carry no issue count when the
view holds no issue.

For the Fields view and for the Data sources view the rail SHALL also
list that view's own entities and an Add entry. Choosing an entity SHALL
select it. The view SHALL render that one entity's editor. The Add entry
SHALL add an entity, through the call the panel's own add control makes.
A group field's children indent one level under it.

Contract holds a single editor, so its rail entry SHALL carry no
sub-list. The field matrix draws a grid, so its entry SHALL carry none
either.

The rail SHALL render a sub-list only under the open view. Two
sub-lists at once fill the column.

A group field SHALL keep one recursive editor. Choosing a child in the
rail SHALL select the parent group and scroll the child into view inside
that editor.

A selection SHALL live in component state and SHALL take no address of
its own. The screen SHALL select the first entity on mount. It SHALL
select the added entity after an Add.
<!-- antislop: allow synonym-rotation -->
<!-- Why: the panel's Remove control drops one entity. The toolbar's
     Discard control drops every unsaved change. The two are separate
     controls, so neither word may stand in for the other. -->
It SHALL select the neighbour after a Remove. Switching to another view
and back SHALL keep the selection the first view held.

Each entity entry SHALL carry its own issue mark, separate from the
view entry's issue count. One entity at a time otherwise hides a broken
entity behind whichever entry an author has open.

The rail SHALL mark the open view with `aria-current`. A rail entry
switches a view rather than disclosing adjacent content, so it SHALL
NOT carry `aria-expanded`.

The rail SHALL cap indentation at two levels. A group field's children
indent once. A field nested deeper SHALL take its own top-level rail
entry rather than a deeper indent. This is a rail-rendering rule only:
the draft's own field tree SHALL keep whatever depth it declares.

The Fields rail entry SHALL name a field by its resolved label alone, on
one line. The field's friendly type and the issue mark SHALL sit beside
it. The row SHALL NOT print the field's key. The key stays in the Field
tab once an author selects that field. The engine's own exact-match
value already lives there.

The rail SHALL keep the fallback name it shows today. It SHALL trigger
on an EMPTY RESOLVED LABEL rather than an empty key. The label is the
row's primary text now. A field carrying a key but no label needs the
fallback exactly as an empty-key field did before.

#### Scenario: Leaving the screen keeps every change

- **WHEN** the developer adds a field on the screen and then returns to
  the canvas
- **THEN** the draft still carries that field, and the screen's toolbar
  still reports unsaved changes

#### Scenario: Switching views keeps a half-typed outcome name

- **WHEN** the developer types an outcome name in the Contract view,
  switches to Fields without adding it, then switches back
- **THEN** the typed text is still in the input

#### Scenario: Switching views keeps the field matrix's selected cell

- **WHEN** the developer moves roving focus to a live cell in the
  Field matrix view and activates it
- **AND** the developer switches to Contract, then switches back
- **THEN** the same cell still holds roving focus, and it is still
  activated

#### Scenario: The screen offers no Save of its own

- **WHEN** the developer inspects the open screen
- **THEN** it carries no Save control, and it states that it keeps
  every change

#### Scenario: The rail lists each view with its entity count

- **WHEN** a draft carries three fields, two data sources, and a
  contract
- **THEN** the rail's Fields entry reads three, its Data sources entry
  reads two, and its Contract entry carries no sub-list

#### Scenario: The rail's issue count is separate from its entity count

- **WHEN** a draft carries three fields and one of them holds a
  validation issue
- **THEN** the rail's Fields entry reads three for its entity count and
  one for its issue count. Only the issue count takes the refusal tone

#### Scenario: A view with no issue shows no issue count

- **WHEN** a draft's two data sources both validate
- **THEN** the rail's Data sources entry reads two and shows no issue
  count

#### Scenario: A twice-nested group field takes its own rail entry

- **WHEN** a group field holds a group field holding a leaf field
- **THEN** the leaf field takes a top-level rail entry, not a third
  indent level. The draft keeps its own nesting

#### Scenario: The Fields view renders the selected field alone

- **WHEN** a draft carries three fields and the developer chooses the
  second in the rail
- **THEN** the Fields view renders that field's editor, and it renders
  neither of the other two

#### Scenario: The Data sources view renders the selected data source alone

- **WHEN** a draft carries two data sources and the developer chooses
  the second in the rail
- **THEN** the Data sources view renders that data source's editor, and
  it renders no other

#### Scenario: The rail sub-list follows the open view

- **WHEN** the developer opens the Data sources view on a draft that
  carries both fields and data sources
- **THEN** the rail lists the data sources under that entry, and it
  lists no field under the Fields entry

#### Scenario: A group child selects its group

- **WHEN** the developer chooses a group field's child in the rail
- **THEN** the view renders the group's own recursive editor, and it
  scrolls the child into view inside that editor

#### Scenario: The Fields rail adds a field

- **WHEN** the developer chooses the rail's Add entry under Fields
- **THEN** the draft carries one more field, the rail lists it, and the
  view renders that new field

#### Scenario: Removing a field selects its neighbour

- **WHEN** the developer removes the selected field from a draft that
  carries three
- **THEN** the view renders a neighbouring field, and it reports no
  empty selection

#### Scenario: A reload selects the first entity

- **WHEN** the developer reloads the browser on the Fields view
- **THEN** the view renders the first field in the catalog

#### Scenario: The Data sources rail adds a data source

- **WHEN** the developer chooses the rail's Add entry under Data sources
- **THEN** the draft carries one more data source, the rail lists it, and
  the view renders that new data source

#### Scenario: Removing a data source selects its neighbour

- **WHEN** the developer removes the selected data source from a draft
  that carries three
- **THEN** the view renders a neighbouring data source, and it reports no
  empty selection

#### Scenario: A reload selects the first data source

- **WHEN** the developer reloads the browser on the Data sources view
- **THEN** the view renders the first data source in the draft

#### Scenario: Each entity entry marks its own issue

- **WHEN** a draft's second field holds a validation issue, and the
  developer has the first field selected
- **THEN** the second field's own rail entry carries an issue mark

#### Scenario: The screen keeps every missing-translation warning

- **WHEN** the studio's `contentLocale` is `de`, and a draft's field has
  a `label` carrying the base-locale value but no `de` value
- **THEN** the screen's Fields view shows the missing-translation
  warning next to that field's label input

#### Scenario: The Fields rail row shows no key

- **WHEN** the developer opens the Fields view on a draft whose fields
  each carry a `key`
- **THEN** every rail row shows the resolved label, the friendly type
  and any issue mark
- **AND** no row prints a `key`

### Requirement: The Fields and Data sources views take the area's field rule

<!-- antislop: allow synonym-rotation -->
<!-- Why: "render" names DOM structure (what mounts), "show" and
     "print" name what a person sees on screen (what is visible or
     legible). "Edit" names the developer's action on a field; "change"
     names a mutation to the draft as a whole, whatever the source.
     None of the four pairs stands in for the others below. -->
Both views SHALL render their editors under the design language's field
rule. The rule `.steps-panel label` states it in the area today. A
label SHALL sit above its control. A `key` and a `type` SHALL print in
mono, because the engine matches both exactly. A hairline SHALL divide
rail rows, and a rule SHALL sit under a view's heading. No corner SHALL
take a radius.

<!-- antislop: allow synonym-rotation -->
<!-- Why: same "edit"/"change"/"render"/"show" distinction named above,
     carried forward for this paragraph and the two after it. -->
The Fields view SHALL edit one field through three tabs, in order:
Field, Values, Rules. The field's checks (`IssueList`) SHALL show
once, above the tab set, so an issue stays visible whatever tab is
open.

The tab set SHALL edit the selected TOP-LEVEL field alone. A group
field's children SHALL render inside the Field tab through the area's
existing flat, recursive field row. They SHALL carry no tab set of
their own. Nesting a tab set inside a tab set would let an issue on a
child hide behind a tab. That is exactly what a field's own
unconsolidated checks did before this change.

The Field tab SHALL show the key, the label, the description and the
type picker without a click. It SHALL also hold the Technical control,
always visible outside either disclosure, directly below the type
picker.

Translation status SHALL show as a badge beside the label input. The
badge SHALL name the current locale's missing count. The field SHALL
carry no separate translation-status list. Adding a language SHALL
stay draft-scoped in the content-locale switcher. The preview ("How
it will look") and the usage list ("Used in") SHALL each sit inside a
collapsed `<details>` disclosure. Both SHALL start closed.

A group field's children SHALL stay outside any disclosure, inside the
Field tab's always-visible content. The developer view SHALL keep its
own existing, separate `<details>` disclosure, untouched by this
change. Remove field SHALL sit below a rule at the tab's end. It SHALL
read as the tab's least frequent action, not one more item in the stack
above it.

The Values tab SHALL divide into zones, each under its own heading. A
rule SHALL separate each zone from its neighbour. "Where values come
from" (the data source and the options) and "Default value" SHALL
always show.

"Column mapping" SHALL show as a third zone only when the field's data
source is mappable, per the existing `showsColumnMapping` rule. It is
not a fourth control stacked beside the other two. Its absence draws
no rule of its own.

The Rules tab SHALL divide into two zones under the same rule. The
zones are "Only ask this when" (the condition) and "Validation" (the
field's validation rules).

The Default value zone SHALL offer a literal input matching the
field's base type. For a `select` field that input SHALL be a
`<select>` bound to the field's own static `options`. For a
`multiselect` field it SHALL be the multi-value equivalent.

Either control SHALL offer no option when the field is
`dataSource`-bound, since the draft carries no resolved rows for one.
That is the same carve-out named below for the preview. The CEL toggle
SHALL still work there.

For a `reference` or `file` field the whole Default value zone SHALL
show disabled. It SHALL state that the type accepts no default here.
This mirrors "Only ask this when" 's own disabled state for a field no
step view references.

For a `group` field the whole Default value zone SHALL also show
disabled. It SHALL state that a group's own default is never read. A
group carries no slot of its own in the flat data payload. A literal
or CEL default written there would silently never apply. That is the
same issue this change exists to close for `FieldDef.default` in
general.

Every other type gets a link-styled toggle. It SHALL switch the zone
to a raw CEL text input for an expression default. This mirrors the
toggle affordance the Rules tab's condition row already uses. The zone
SHALL NOT mount the guard-shaped condition-builder component. A
default is a value, not a boolean. It needs no comparison-row builder.

Writing through the literal input SHALL set the field's `default` key
to that literal value. Writing through the CEL input SHALL set it to `{
lang: "cel", src }`. Clearing either input SHALL remove the `default`
key.

All three tab panels SHALL stay mounted while a field stays selected.
Switching a tab SHALL reveal and hide them, rather than mount them.
This is the rule the four views take one level up. It holds here for
the same reason. The developer view holds a half-typed config in
component state. Each builder holds an incomplete row the draft does
not carry.

A disclosure inside the Field tab SHALL keep its own open/closed state,
independent of the active tab. Switching away from Field and back SHALL
NOT reset an open disclosure to closed.

The type picker SHALL list the ten base field types under friendly
names, each with a short note. It SHALL write the raw `baseFieldType`
value to the draft. It SHALL offer no type the contract does not carry.
It SHALL keep the custom plugin envelope.

"How it will look" SHALL preview the field through the shared form
component, read-only, inside its disclosure. Every previewed entry's
`readonly` SHALL read `true`, and the preview's container SHALL carry
`inert`.

The preview runs over a synthesized single-field view. For a group
field it synthesizes the group's own entry, plus one entry per
descendant. That reaches every depth, not only the group's immediate
children.

A group holding a group SHALL preview both levels. That is the
grouping the shared form component itself applies. The synthesis
SHALL also carry the sample values in the shape that component reads
them, keyed by field id.

A dataSource-backed field SHALL preview with no option list. The
draft carries no resolved rows for one. The row stating so SHALL name
that the field resolves at runtime. An author previews what a
participant gets.

"Used in" SHALL list, inside its disclosure, every step whose view
references the field, with the modes those references set. A "Show on
the canvas" control on a row SHALL return to the canvas with that step
preselected.

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

The row's operand picker SHALL withhold `child.*`. The row writes one
expression across steps of mixed type, and a `visible` override admits
`child` on a subprocess step alone.

Updating the condition SHALL write the same override to every
referencing view, and SHALL name the write before it happens. Where a
referencing view holds a literal, the notice SHALL name that step.
Clearing the condition SHALL drop the `visible` key from every
referencing view. It SHALL name that scope before it happens, on the
same terms a write does. The field SHALL NOT store a field-level
condition.

#### Scenario: A field editor states its labels above its controls

- **WHEN** the developer opens the Fields view on any field
- **THEN** each label sits above its own control, and no label sits
  beside one

#### Scenario: A key prints in mono

- **WHEN** the developer opens the Fields view on any field
- **THEN** the field's key and its type print in the mono face

#### Scenario: The type picker writes a raw type

- **WHEN** the developer chooses "Choice" in the type picker
- **THEN** the draft's field type reads `select`, and the definition
  serializes unchanged

#### Scenario: The Field tab shows identity without a click

- **WHEN** the developer opens the Fields view on any field
- **THEN** the key, the label, the description and the type picker show
  without opening any disclosure
- **AND** the preview and the usage list each start closed

#### Scenario: The Technical checkbox shows without opening either disclosure

- **WHEN** the developer opens the Fields view on any non-group field
- **THEN** the Technical checkbox shows below the type picker, with
  neither the preview nor the usage list disclosure open

#### Scenario: Translation status shows as a badge

- **WHEN** the studio's `contentLocale` is `de`, and a field's label
  carries a base-locale value but no `de` value
- **THEN** a badge beside the label input names its missing count for
  the active content locale
- **AND** no separate translation-status list renders
- **AND** the badge names no locale of its own. The content-locale
  switcher already names `de` once, in the toolbar

#### Scenario: A disclosure survives a tab switch

- **WHEN** the developer opens the preview disclosure on the Field tab,
  switches to the Rules tab, then switches back
- **THEN** the preview disclosure is still open

#### Scenario: Remove field sits below a rule

- **WHEN** the developer opens the Fields view on any field
- **THEN** Remove field is the tab's last control, below a rule that
  separates it from every other control

#### Scenario: The Values tab always shows its first two zones, ruled apart

- **WHEN** the developer opens the Values tab on any field
- **THEN** "Where values come from" and "Default value" each show
  under their own heading, with a rule between them

#### Scenario: The Values tab shows a third ruled zone only for a mappable field

- **WHEN** the developer opens the Values tab on a field whose data
  source is mappable
- **THEN** "Column mapping" also shows, as a third zone ruled apart
  from "Default value"

#### Scenario: An unmappable field shows no Column mapping zone

- **WHEN** the developer opens the Values tab on a field whose data
  source is not mappable
- **THEN** no "Column mapping" heading renders, and "Default value"
  draws no rule below it for a zone that isn't there

#### Scenario: The Rules tab shows two ruled zones

- **WHEN** the developer opens the Rules tab on any field
- **THEN** "Only ask this when" and "Validation" each show under their
  own heading, with a rule between them

#### Scenario: A literal default writes the field's raw value

- **WHEN** the developer types `100` into a Number field's Default
  value input, with the CEL toggle off
- **THEN** the draft's field carries `default: 100`

#### Scenario: A CEL default writes an expression

- **WHEN** the developer switches the Default value zone to CEL and
  types `data.subtotal * 1.1`
- **THEN** the draft's field carries `default: { lang: "cel", src:
  "data.subtotal * 1.1" }`

#### Scenario: Clearing the default drops the key

- **WHEN** the developer clears a field's Default value input, whether
  literal or CEL
- **THEN** the draft's field carries no `default` key

#### Scenario: A literal default on a Choice field uses its own options

- **WHEN** the developer chooses one of a `select` field's own
  `options` in its Default value zone, with the CEL toggle off
- **THEN** the draft's field carries `default` set to that option's
  value

#### Scenario: A dataSource-bound field's default offers no option list

- **WHEN** the developer opens the Default value zone on a
  `dataSource`-bound `select` field
- **THEN** the literal control offers no option, and the CEL toggle
  still lets the developer write an expression default

#### Scenario: The Default value zone disables for a reference or file field

- **WHEN** the developer opens the Values tab on a `reference` or a
  `file` field
- **THEN** the Default value zone shows disabled, and states that the
  type accepts no default here

#### Scenario: The Default value zone disables for a group field

- **WHEN** the developer opens the Values tab on a `group` field
- **THEN** the Default value zone shows disabled, and states that a
  group's own default is never read

#### Scenario: The preview shows one field, read-only

- **WHEN** the developer opens a field's preview
- **THEN** the shared form component shows that field with sample
  values
- **AND** none of the preview's controls take keyboard or pointer
  interaction

#### Scenario: A group field previews its group and its children

- **WHEN** the developer opens the preview on a group field carrying
  two children
- **THEN** the shared form component draws the group and both children
  inside it

#### Scenario: A tab switch keeps a half-typed developer view

- **WHEN** the developer types a config the developer view cannot parse
  yet, switches to the Rules tab, and switches back
- **THEN** the typed text is still in the input

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

- **WHEN** the developer clears "Only ask this when" on a field that
  two step views reference
- **THEN** the row named both steps before the clear, and neither view
  carries a `visible` key afterwards

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
