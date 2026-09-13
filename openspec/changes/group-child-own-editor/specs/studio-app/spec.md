## MODIFIED Requirements

<!-- antislop: allow synonym-rotation -->
### Requirement: The panels screen keeps every change and states so

<!-- antislop: allow synonym-rotation -->
<!-- The area nav's Discard control drops every unsaved change; a panel's Remove control drops one entity. -->
No tab SHALL carry a Save control. Every change an author makes on a tab SHALL
write straight into the in-browser draft. That is how the panels write today. The
area nav's Save and Publish controls SHALL remain the only ones that persist.

<!-- antislop: allow synonym-rotation -->
<!-- "surface" here names the process surface, a noun, and no verb of display. -->
Leaving a tab SHALL discard nothing. The surface SHALL state that plainly, so
leaving a tab never reads as a discard.

A tab's own unsubmitted input SHALL survive a switch between tabs. The contract
panel holds a half-typed outcome name in component state. The data sources panel
fetches its list keys on mount. The field matrix holds its selected cell in
component state. All four tabs SHALL therefore stay mounted for as long as the
process surface is open. Switching a tab SHALL reveal and hide them, rather than
mount them.

Each of those four tabs SHALL carry two numbers, and they SHALL read as different
things. The entity count says how many fields, data sources, outcomes or live
cells the tab holds. The `studio-process-tabs` capability states which tab prints
one. The issue count says how many of them are wrong. Only the issue count takes
the refusal tone. A tab SHALL have no issue count while its subject has no
issue.

The Fields tab and the Data sources tab SHALL each stand an entity rail beside
the open editor. The rail SHALL list that tab's own entities, and an Add entry
too. Choosing an entity SHALL select it. The tab SHALL open that one entity's
editor.

The Add entry SHALL add an entity, through the call the panel's own add control
makes. On the Fields tab, the Add entry SHALL add a top-level field. A group
field's children indent one level under it.

A field entry SHALL be the drag source that moves its field into a group and
out of it. The entry SHALL have no move control of its own, since the field's
editor carries that control. The move requirement below states the drag, its
keyboard route and what the move writes. Data source entries SHALL take no
part in a move, since a data source nests under nothing.

Contract holds a single editor, so its tab SHALL stand no entity rail. The field
matrix draws a grid, so its tab SHALL stand none either.

A tab SHALL stand its own rail alone. No tab SHALL list another tab's entities.

Choosing a field nested inside a group SHALL select that field. The tab SHALL
open that field's own editor, the same one a top-level field opens. The rail
SHALL mark that entry alone, and it SHALL leave the group's own entry unmarked.

On the Fields tab, a newly chosen field's editor SHALL open at its top. A move
keeps the same field selected, and the editor keeps its scroll position.

A selection SHALL live in component state and SHALL take no address of its own.
The tab SHALL select the first entity on mount. It SHALL select the added entity
after an Add.

<!-- antislop: allow synonym-rotation -->
<!-- The panel's Remove control drops one entity; the area nav's Discard control drops every unsaved change. -->
It SHALL select the neighbour after a Remove. Inside a group, the neighbour
SHALL be the next field of that group, then the previous one, then the group.
Switching to another tab and back SHALL keep the selection the first tab held.

Each entity entry SHALL carry its own issue mark, separate from the tab's issue
count. One entity at a time otherwise hides a broken entity behind whichever
entry an author has open.

The rail SHALL mark the selected entity with `aria-current`. A rail entry selects
an entity rather than disclosing adjacent content, so it SHALL NOT carry
`aria-expanded`. The `studio-process-tabs` capability states the tab row's own
tab-set semantics.

The rail SHALL cap indentation at two levels. A group field's children indent
once. A field nested deeper SHALL take its own top-level rail entry rather than a
deeper indent. This is a rail-rendering rule only: the draft's own field tree
SHALL keep whatever depth it declares.

The Fields rail entry SHALL name a field by its resolved label alone, on one
line. A label too long for the rail's width SHALL truncate there rather than
wrap onto a second line. An icon for the field's kind SHALL lead the label on
that same line. The issue mark SHALL follow the label there.

The entry SHALL print neither the kind name nor a group's name as visible
text. The indent alone SHALL show the group. The kind name SHALL stay the
icon's tooltip, and it SHALL stay part of the entry's accessible name. A
nested entry's accessible name SHALL also carry the name of the group that
holds its field. The indent shows that group to a sighted author alone.

The row SHALL NOT print the field's key. The key stays in the definition
half's "What this field asks" zone, once an author selects that field. The
engine's own exact-match value already lives there. The Data sources rail
entry names its data source through the same rail-row name element. An
over-long data source key SHALL truncate on its one line the identical way.

The kind icon and the kind name SHALL come from the same table the kind picker
reads. Each kind SHALL take an icon no other kind takes. A plugin-typed field
SHALL take one further icon. A field whose members name no kind SHALL take
another. A row naming the base type while the picker beside it names the kind
would give one field two vocabularies. The row's kind name therefore reads
"Date" where the picker reads "Date".

The rail SHALL keep the fallback name it carries today. It SHALL trigger on an
EMPTY RESOLVED LABEL rather than an empty key. The label is the row's primary
text now. A field carrying a key but no label needs the fallback exactly as an
empty-key field did before.

#### Scenario: Leaving the screen keeps every change

- **WHEN** the author adds a field on the Fields tab and then opens the
  Canvas tab
- **THEN** the draft still carries that field, and the area nav still reports
  unsaved changes

#### Scenario: Switching views keeps a half-typed outcome name

- **WHEN** the author types an outcome name on the Contract tab, opens the
  Fields tab without adding it, then returns
- **THEN** the typed text is still in the input

#### Scenario: Switching views keeps the field matrix's selected cell

- **WHEN** the author moves roving focus to a live cell on the Field matrix
  tab and activates it
- **AND** the author opens the Contract tab, then returns
- **THEN** the same cell still holds roving focus, and it is still activated

#### Scenario: The screen offers no Save of its own

- **WHEN** the author inspects an open tab
- **THEN** it has no Save control, and it states that it keeps every
  change

#### Scenario: The rail lists each view with its entity count

- **WHEN** a draft carries three fields, two data sources, and a contract
- **THEN** the Fields tab reads three, the Data sources tab reads two, and
  the Contract tab stands no entity rail

#### Scenario: The rail's issue count is separate from its entity count

- **WHEN** a draft carries three fields and one of them holds a validation
  issue
- **THEN** the Fields tab reads three for its entity count and one for its
  issue count. Only the issue count takes the refusal tone

#### Scenario: A view with no issue shows no issue count

- **WHEN** a draft's two data sources both validate
- **THEN** the Data sources tab reads two and has no issue count

#### Scenario: A twice-nested group field takes its own rail entry

- **WHEN** a group field holds a group field holding a leaf field
- **THEN** the leaf field takes a top-level rail entry instead of a third
  indent level. The draft keeps its own nesting

#### Scenario: The Fields view renders the selected field alone

- **WHEN** a draft carries three fields and the author picks the second in
  the rail
- **THEN** the Fields tab renders that field's editor, and it renders neither
  of the other two

#### Scenario: The Data sources view renders the selected data source alone

- **WHEN** a draft carries two data sources and the author picks the second
  in the rail
- **THEN** the Data sources tab renders that data source's editor, and it
  renders no other

#### Scenario: The rail sub-list follows the open view

- **WHEN** the author opens the Data sources tab on a draft that carries both
  fields and data sources
- **THEN** that tab's rail lists the data sources, and it lists no field

<!-- The heading keeps the live spec's wording, since a MODIFIED block keeps every scenario; the child now opens its own editor. -->
#### Scenario: A group child selects its group

- **WHEN** the author picks a group field's child in the rail
- **THEN** the tab renders that child's own editor, with both halves
- **AND** the rail marks the child's entry alone, and neither the group's
  entry nor a sibling's entry

#### Scenario: A newly chosen field's editor opens at its top

- **WHEN** the author scrolls a field's editor down to its "Validation" zone
- **AND** the author picks another field in the rail
- **THEN** the editor shows that field's "What this field asks" zone at its
  top

#### Scenario: The Fields rail adds a field

- **WHEN** the author picks the rail's Add entry on the Fields tab
- **THEN** the draft carries one more field, the rail lists it, and the tab
  renders that new field

<!-- The heading keeps the live spec's wording; the entry now offers the drag, and the editor holds the control. -->
#### Scenario: A field entry offers the move control

- **WHEN** the author opens the Fields tab on a draft carrying a group field
  and a top-level field
- **THEN** each field entry offers the drag that moves its field, and no
  data source entry offers one
- **AND** no rail entry carries a move control of its own

#### Scenario: A rail entry names no group

- **WHEN** a draft carries a group field holding two fields
- **THEN** both child entries indent once under the group's entry
- **AND** neither child entry prints the group's name

#### Scenario: A nested entry's accessible name carries its group's name

- **WHEN** a draft carries a group field holding a field
- **THEN** the child entry's accessible name carries the group's name
- **AND** the entry prints no group name as visible text

#### Scenario: Removing a field selects its neighbour

- **WHEN** the author removes the selected field from a draft that carries
  three
- **THEN** the tab renders a neighbouring field, and it reports no empty
  selection

#### Scenario: Removing a field inside a group selects the field after it

- **WHEN** a group holds three fields, and the author removes the first
- **THEN** the tab renders the field that followed it in that group

#### Scenario: Removing a group's last field selects the field before it

- **WHEN** a group holds three fields, and the author removes the third
- **THEN** the tab renders the group's second field

#### Scenario: Removing a group's only field selects the group

- **WHEN** a group holds one field, and the author removes it
- **THEN** the tab renders the group's own editor

#### Scenario: A reload selects the first entity

- **WHEN** the author reloads the browser on the Fields tab
- **THEN** the tab renders the first field in the catalog

#### Scenario: The Data sources rail adds a data source

- **WHEN** the author picks the rail's Add entry on the Data sources tab
- **THEN** the draft carries one more data source, the rail lists it, and the
  tab renders that new data source

#### Scenario: Removing a data source selects its neighbour

- **WHEN** the author removes the selected data source from a draft that
  carries three
- **THEN** the tab renders a neighbouring data source, and it reports no
  empty selection

#### Scenario: A reload selects the first data source

- **WHEN** the author reloads the browser on the Data sources tab
- **THEN** the tab renders the first data source in the draft

#### Scenario: Each entity entry marks its own issue

- **WHEN** a draft's second field holds a validation issue, and the author
  has the first field selected
- **THEN** the second field's own rail entry carries an issue mark

#### Scenario: A nested field's entry marks its own check

- **WHEN** a field inside a group carries a check on its key
- **THEN** that field's own rail entry carries the issue mark
- **AND** the group's entry carries none for that check

#### Scenario: The screen keeps every missing-translation warning

- **WHEN** the studio's `contentLocale` is `de`, and a draft's field has a
  `label` carrying the base-locale value but no `de` value
- **THEN** the Fields tab carries the missing-translation warning next to
  that field's label input

#### Scenario: The Fields rail row shows no key

- **WHEN** the author opens the Fields tab on a draft whose fields each carry
  a `key`
- **THEN** every rail row carries the resolved label, the kind icon and any
  issue mark
- **AND** no row prints a `key`

#### Scenario: The rail row and the picker name one kind

- **WHEN** the author selects a `{type: "string", format: "date"}` field
- **THEN** the rail row's kind icon carries, as its tooltip, the word the kind
  picker shows for that field

#### Scenario: Each kind takes its own icon

- **WHEN** a draft carries one field of each kind the kind picker offers
- **THEN** each of those rail entries shows an icon no other entry shows
- **AND** no entry prints its kind name as visible text

#### Scenario: A plugin-typed field takes the plugin icon

- **WHEN** a draft carries a field whose `type` is a plugin envelope
- **THEN** its rail entry shows the plugin icon, and the icon's tooltip reads
  the kind picker's custom-type word

#### Scenario: A long field name truncates instead of wrapping

- **WHEN** a field's resolved label is longer than the rail entry's own
  width, especially once indented under a group
- **THEN** the rail entry shows the label truncated on its one line. It
  prints no character of it on a line of its own

<!-- A MODIFIED block keeps every scenario, so this heading stays though the kind name no longer prints. -->
#### Scenario: A long kind name truncates instead of wrapping

- **WHEN** a field's kind name is longer than any share of the rail entry's
  line
- **THEN** the rail entry keeps its one line and prints no character of the
  kind name on it. The icon's tooltip carries the kind name whole

#### Scenario: A long data source key truncates instead of wrapping

- **WHEN** a data source's `key` is longer than the Data sources rail
  entry's own width
- **THEN** the rail entry shows the key truncated on its one line. It
  prints no character of it on a line of its own

<!-- The heading repeats the live spec's wording verbatim, so a delta can match it. -->
<!-- antislop: allow synonym-rotation -->
### Requirement: The field catalog's definition half offers a Technical control

The field catalog's definition half SHALL offer a Technical checkbox for
the selected field. A field nested inside a group SHALL offer it in that
field's own editor. Checking it SHALL write `technical: true`. Unchecking it
SHALL delete the `technical` key. Every other view-flag control in the studio
already follows that same convention for its own default value.

A group's child holds a value of its own, and a structural source can
write it. The compile rule and the rail's own finding both read the
flattened catalog. A control on the top-level field alone would leave
one gap. A nested field would state `technical` through the JSON view
alone.

Checking it SHALL also delete every `required` and `readonly` key that
any step's `view.fields[]` entry carries for that field. That deletion
SHALL happen in the same draft mutation. The definition contract rejects
those keys on a technical field's entry.

Every builder control that could clear one also goes away as the
developer checks the box. The strip omits them, the matrix cell disables
them, the row offers no bulk badge. Without the clearing pass, a stale
key would block the publish. The JSON view would be the only route back
to it. The pass SHALL walk every step, including a step the field matrix
omits.

Unchecking SHALL write no `required` or `readonly` key back. The pass
records no prior state, so an uncheck cannot restore an authored
`required: true` or `readonly: true` the check deleted. Restoring a
default-valued key instead would move `definitionHash` under a change
that alters no behaviour. Restoring an authored one is not possible.

Checking Technical SHALL need a confirmation before the clearing
pass runs. The confirmation SHALL name the count of `required` and
`readonly` keys the pass will delete. Declining it SHALL leave the
draft as it stands, with no `technical` key written. Checking
Technical on a field carrying no such key SHALL run no confirmation.

A field of `type: "group"` SHALL disable the control, at any nesting
depth. The definition contract rejects `technical: true` on a group
field. Offering the control there would only invite a rejected publish.

#### Scenario: Checking Technical writes the key

- **WHEN** the developer checks Technical on a non-group field in the
  field catalog
- **THEN** that field's `technical` key becomes `true`

#### Scenario: Checking Technical clears the field's stale flag keys

- **WHEN** one step's view entry for a field carries `required: true`
- **AND** another step's entry for it carries `readonly: false`
- **AND** the developer checks Technical on that field
- **THEN** neither entry carries a `required` or a `readonly` key
- **AND** the draft publishes

#### Scenario: Unchecking Technical deletes the key

- **WHEN** the developer unchecks Technical on a field already carrying
  `technical: true`
- **THEN** that field has no `technical` key
- **AND** no view entry regains a `required` or `readonly` key

#### Scenario: A group's child offers the control

- **WHEN** the developer selects a field nested inside a `type: "group"`
  field
- **THEN** that field's own definition half offers the Technical checkbox

#### Scenario: A group field disables the Technical control

- **WHEN** the developer selects a field of `type: "group"` in the field
  catalog
- **THEN** the field catalog disables the Technical checkbox

#### Scenario: Checking Technical confirms the keys it will delete

- **WHEN** the developer checks Technical on a field whose view entries
  carry three `required` or `readonly` keys across the draft's steps
- **THEN** the field catalog asks for a confirmation naming that count
  of keys
- **AND** declining it leaves every one of those keys in place, and
  writes no `technical` key

#### Scenario: A field with no stale key confirms nothing

- **WHEN** the developer checks Technical on a field no view entry
  carries a `required` or `readonly` key for
- **THEN** the field catalog asks for no confirmation

### Requirement: The field catalog's field key auto-derives from the field label

The field catalog's key field SHALL auto-fill from the field's label as the
developer types it. It SHALL do so while the key is empty. It SHALL also do
so while the key still equals what derivation produces from the label's prior
value. In any other case, a write to the label SHALL leave the key as it
stands. This applies to a top-level catalog field and to a field nested inside
a `group` field alike.

Derivation SHALL read only the base-locale entry of the field's label. A write
to any other locale's translation SHALL NOT trigger key derivation.
Derivation SHALL lower-case the label. It SHALL collapse every run of
characters outside `[a-z0-9]` to a single `_`. It SHALL trim a leading or
trailing `_`. A result starting with a digit SHALL gain a leading `_`.

The result then takes the shape the definition contract's identifier grammar
already requires of a published `FieldDef.key`: `/^[a-z_][a-z0-9_]*$/`.

A derived key can collide with a key that another field already carries.
That other field can sit at the top level or inside any `group`. The field
catalog SHALL then append `_2`. A second collision SHALL swap `_2` for `_3`.
The catalog SHALL keep raising the number until no other field carries the
candidate.

The developer's first direct write to a field's key field SHALL stop this
auto-fill for that one field. The stop SHALL hold for the rest of the draft's
lifetime in the browser. The key field SHALL remain an ordinary, writable text
input throughout.

#### Scenario: A new top-level field's key follows its label as the developer types

- **WHEN** the studio's content locale is the draft's base locale
- **AND** the developer drops a new field onto the canvas
- **AND** the developer types "Requested amount" into its label, never
  touching its key field
- **THEN** the field's key reads `requested_amount`

#### Scenario: A new field's key stays empty while the developer types in a non-base content locale

- **WHEN** the developer has switched the studio's content locale away from
  the draft's base locale
- **AND** the developer drops a new field onto the canvas
- **AND** the developer types a label into it, never touching its key field
- **THEN** the field's key stays empty. A new field's label seeds under the
  current content locale. Derivation reads the base-locale entry alone

#### Scenario: A new nested field's key follows its label as the developer types

- **WHEN** the developer adds a field inside a `group` field
- **AND** the developer types a label into it, never touching its key field
- **THEN** the nested field's key derives from its own label the same way a
  top-level field's does

#### Scenario: A colliding derived field key gets a numeric suffix

- **WHEN** the developer types a label that derives to a key another field
  in the catalog already carries
- **AND** that other field sits at the top level or inside a group
- **THEN** the new field's key reads the colliding key with a `_2` suffix

#### Scenario: A second collision takes the next number

- **WHEN** the developer types a label that derives to `amount`
- **AND** other fields already carry `amount` and `amount_2`
- **THEN** the new field's key reads `amount_3`

#### Scenario: A hand-edited field key stops following its label

- **WHEN** the developer types over a field's auto-derived key
- **AND** the developer then types more into that field's label
- **THEN** that field's key stays what the developer typed

#### Scenario: Editing a non-base-locale translation leaves an already-derived field key untouched

- **WHEN** the developer types a base-locale field label, which derives a key
- **AND** the developer switches the studio's content locale
- **AND** the developer types a translation into the label's entry for that
  locale
- **THEN** the field's key keeps the value it derived

### Requirement: The Fields view divides into a definition half and an effect half

<!-- antislop: allow synonym-rotation -->
<!-- "edit" names an author working one field; "change" names one write to the draft. -->
The Fields view SHALL edit one field through two halves under one
heading. The definition half comes first, the effect half second. The
view SHALL have no tab set.

The definition half says what the field is. It SHALL hold five zones, plus
a sixth for a group field. Their order reads "What this field asks", "What
kind of field", "Where values come from", "Default value", "Validation". Each
zone SHALL sit under its own heading, with a rule between it and its
neighbour.

A group field's definition half SHALL hold a sixth zone after "Validation",
named "Fields inside this group". That zone SHALL draw none of the group's
fields, since the rail lists them. It SHALL hold one control, which adds a
field at the end of the group. The tab SHALL then select that new field.

Keyboard focus SHALL then land in the new field's label input, since a new
field needs its label first. The rail SHALL bring the new field's entry into
view where it sits outside the rail's visible part. It SHALL scroll no further
than that, and it SHALL NOT animate the scroll.

"What this field asks" holds the label, the description, the key and the
move control, in that order. "What kind of field" holds the kind picker and
the Technical control. "Where values come from" holds the data source and
the options.

The effect half says where the field acts in the process. It SHALL hold
four zones, in this order: "Used in", "Only ask this when", "Ask for
this" and "Column mapping". The same heading and rule treatment holds.

"Used in" lists every step whose view references the field, with the
modes those references set. "Only ask this when" holds the condition.
"Ask for this" holds the requiredness.

Neither half SHALL sit behind a disclosure. Both SHALL show as the view
opens. A closed disclosure over the usage list is what this change
removes. Returning one would undo the change.

A change in the definition half SHALL tint the affected row in the
effect half. That tint SHALL be the only motion the two halves carry.

#### Scenario: The view draws two halves and no tab set

- **WHEN** the developer opens the Fields view on any field
- **THEN** the definition half and the effect half both show, side by
  side under one heading
- **AND** no tab set renders

#### Scenario: A definition change tints its effect row

- **WHEN** the developer changes the label of a field two step views
  reference
- **THEN** both rows for those steps tint in the effect half

#### Scenario: The move control stands under the key

- **WHEN** the developer opens the Fields view on any field
- **THEN** "What this field asks" holds the move control directly under the key
- **AND** the control names the group that holds the field, or the top level

#### Scenario: A group's own zone adds a field and selects it

- **WHEN** the developer uses the control in a group field's "Fields inside
  this group" zone
- **THEN** the group's `fields` array carries one more field, at its end
- **AND** the tab selects that field and shows its own two halves
- **AND** keyboard focus sits in that field's label input

#### Scenario: The rail brings a new field in a long group into view

- **WHEN** a group holds 18 fields, and the rail shows the group's entry but
  not its last field's entry
- **AND** the developer uses the control in that group's "Fields inside this
  group" zone
- **THEN** the rail shows the new field's entry, carrying the current mark
- **AND** the rail reaches that position at once, with no smooth scroll

#### Scenario: A new entry the rail already shows moves no rail

- **WHEN** the rail shows a group's last field and the entry after it
- **AND** the developer uses the control in that group's "Fields inside this
  group" zone
- **THEN** the rail keeps its scroll position
- **AND** the new field's entry carries the current mark

#### Scenario: Only a group field holds the sixth zone

- **WHEN** the developer opens the Fields view on a group field, then on a
  `string` field
- **THEN** the group field's definition half shows "Fields inside this group"
  directly after "Validation"
- **AND** the `string` field's definition half shows no such zone

### Requirement: A field's checks stand at the zone each one belongs to

The Fields view SHALL place a check on the selected field at the zone
the check names. A check on the key stands in "What this field asks". A
check on an option stands in "Where values come from". A check on a
validation rule stands in "Validation".

A check the view cannot place SHALL stand at the top of the definition
half. No check SHALL go unshown for want of a matching zone.

Placement SHALL read the check's own location in the body. A check
carries that location today. The studio's issue model drops it, so this
rule needs the model to carry it through. The `studio-app` capability
states no shape for that model. What it states is the outcome: two
checks on one field, naming two zones, stand apart.

A nested field's check SHALL stand in that field's own editor, at the
zone the check names. The group's editor SHALL show the group's own checks
alone.

The view SHALL have no consolidated check list of its own. The
draft-wide roll-up and the publish gate sit in the docked summary the
`studio-checks-rail` capability states.

A zone holding a check SHALL take the refusal tone at its own heading.
An author scanning the halves then sees which zone is wrong, with
nothing to open.

#### Scenario: A key check stands at the key's zone

- **WHEN** the selected field's key breaks the identifier grammar
- **THEN** the check shows inside "What this field asks", and that
  zone's heading takes the refusal tone

#### Scenario: An unplaceable check stands at the top

- **WHEN** the selected field carries a check naming no zone the view
  draws
- **THEN** the check shows at the top of the definition half

<!-- antislop: allow negation-habit -->
<!-- The live heading and body, unchanged; the negation names what the rule forbids. -->
#### Scenario: The view carries no consolidated list

- **WHEN** the developer opens the Fields view on a field carrying two
  checks in two zones
- **THEN** each check shows at its own zone, and no list gathers both
  in one place

<!-- The heading keeps the live spec's wording, since a MODIFIED block keeps every scenario; the child row is now the child's own editor. -->
#### Scenario: A group's child row keeps its own list

- **WHEN** a field nested inside a group carries a check on its key
- **THEN** selecting that field shows the check inside its own "What this
  field asks" zone
- **AND** selecting the group shows the group's own checks alone

### Requirement: The Fields view's definition half states values, a default and a preview

The two halves SHALL belong to the selected field alone, at any nesting
depth. A field nested inside a group SHALL take the same two halves a
top-level field takes. A group field's halves SHALL have no editor for any
of its children. Inside the halves, only the group's preview draws them.

Translation status SHALL show as a badge beside the label input. The
badge SHALL name the current locale's missing count. The field SHALL
have no separate translation-status list. Adding a language SHALL stay
draft-scoped in the content-locale switcher.

"How it will look" SHALL sit in the definition half, inside a collapsed
`<details>` disclosure. It SHALL start closed. The developer view SHALL
keep its own existing, separate `<details>` disclosure, untouched by
this change.

Remove field SHALL sit below a rule at the definition half's end. It
SHALL read as the half's least frequent action.

Every zone SHALL stay mounted while a field stays selected. A
disclosure SHALL keep its own open state for as long as the same field
stays selected. Each builder holds an incomplete row the draft does not
carry. The developer view holds a half-typed config in component state.

<!-- antislop: allow sentence-length -->
<!-- Why: the live requirement's own words, rewrapped so no code span breaks across a line. -->
The Default value zone SHALL offer a literal input matching the field's
type and its declared format. For a field carrying static `options`
that input SHALL be a `<select>` bound to those options, or the
multi-value equivalent when the field's type is `list`.
For a `string` field declaring a `format` it SHALL be that format's own
native input.

<!-- antislop: allow sentence-length -->
<!-- Why: copied byte for byte from the live requirement. -->
Either control SHALL offer no option when the field is
`dataSource`-bound, since the draft carries no resolved rows for one.
That is the same carve-out named below for the preview. The CEL toggle
SHALL still work there. A field declaring `format: "person"` and
neither `options` nor `dataSource` SHALL get the identical carve-out,
whether its type is `string` or `list`: the draft resolves no
`allowedGroups`-sourced people list either, since that resolution needs
a live database read the draft editor does not have. The CEL toggle
still works there too.

<!-- antislop: allow sentence-length -->
<!-- Why: copied byte for byte from the live requirement. -->
The note the zone shows in the person case SHALL name the people list
rather than a data source. The existing note names a data source by hand, and
this field declares none; an author reading it would learn the wrong
thing about their own draft.

For a `file` field the whole Default value zone SHALL show disabled. It
SHALL state that the type accepts no default here. This mirrors "Only
ask this when" 's own disabled state for a field no step view
references.

For a `group` field the whole Default value zone SHALL also show
disabled. It SHALL state that a group's own default is never read. A
group has no slot of its own in the flat data payload. A literal
or CEL default written there would silently never apply.

Every other type gets a link-styled toggle. It SHALL switch the zone
to a raw CEL text input for an expression default. This mirrors the
toggle affordance the condition zone already uses. The zone SHALL NOT
mount the guard-shaped condition-builder component. A default is a
value rather than a boolean. It does not need a comparison-row builder.

Writing through the literal input SHALL set the field's `default` key
to that literal value. Writing through the CEL input SHALL set it to `{
lang: "cel", src }`. Clearing either input SHALL remove the `default`
key.

"How it will look" SHALL preview the field through the shared form
component, read-only, inside its disclosure. Every previewed entry's
`readonly` SHALL read `true`, and the preview's container SHALL carry
`inert`.

The preview runs over a synthesized single-field view. For a group
field it synthesizes the group's own entry, plus one entry per
descendant. That reaches every depth, beyond the group's immediate
children.

A group holding a group SHALL preview both levels. That is the
grouping the shared form component itself applies. The synthesis
SHALL also carry the sample values in the shape that component reads
them, keyed by field id.

<!-- antislop: allow sentence-length -->
<!-- Why: copied byte for byte from the live requirement. -->
A dataSource-backed field SHALL preview with no option list. The
draft has no resolved rows for one. The row stating so SHALL name
that the field resolves at runtime. An author previews what a
participant gets. A field declaring `format: "person"` and neither
`options` nor `dataSource` SHALL preview the same way, for the
identical reason: the draft cannot reach the live `allowedGroups`
expansion either. That field SHALL get its own row wording. It names the
people list rather than a data source it does not declare.

<!-- antislop: allow sentence-length -->
<!-- Why: the live requirement's own words, with its em-dash rewritten as two sentences. -->
The preview's sample value SHALL match the shape the field's own type
takes. A `format` narrows the value domain, so a formatted field
previews that format's sample rather than its type's. A `{type:
"list"}` field holds an array whatever its format, so its sample SHALL
be the format's sample inside an array. A scalar there would draw a
multi-select with nothing selected, since the shared form component
reads a non-array value as an empty selection.

<!-- The heading keeps the live spec's wording, since a MODIFIED block keeps every scenario; the group's halves now draw no child at all. -->
#### Scenario: A group's children render without halves of their own

- **WHEN** the developer selects a `group` field carrying two children
- **THEN** the definition half draws no row for either child
- **AND** the rail still lists both children, indented under the group

#### Scenario: A nested field takes the same two halves

- **WHEN** the developer selects a `string` field nested inside a `group`
  field
- **THEN** the view shows that field's definition half and effect half
- **AND** the definition half shows the Default value zone and the preview

#### Scenario: Translation status shows as a badge

- **WHEN** the studio's `contentLocale` is `de`, and a field's label
  carries a base-locale value but no `de` value
- **THEN** a badge beside the label input names its missing count for
  the active content locale
- **AND** no separate translation-status list renders
- **AND** the badge names no locale of its own. The content-locale
  switcher already names `de` once, in the toolbar

#### Scenario: A disclosure survives a selection that returns

- **WHEN** the developer opens the preview disclosure, selects another
  field, and selects the first field again
- **THEN** the preview disclosure state follows the rule the view
  states, and no half remounts

#### Scenario: Remove field sits below a rule

- **WHEN** the developer opens the Fields view on any field
- **THEN** Remove field is the definition half's last control, below a
  rule that separates it from every other control

#### Scenario: The definition half shows its zones ruled apart

- **WHEN** the developer opens the Fields view on any field
- **THEN** the five zone headings show, in the order the requirement
  names
- **AND** a rule sits between each zone and its neighbour

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
- **THEN** the draft's field has no `default` key

#### Scenario: A literal default on a Choice field uses its own options

- **WHEN** the developer chooses one of a `string` field's own
  `options` in its Default value zone, with the CEL toggle off
- **THEN** the draft's field carries `default` set to that option's
  value

#### Scenario: A dataSource-bound field's default offers no option list

- **WHEN** the developer opens the Default value zone on a
  `dataSource`-bound `string` field
- **THEN** the literal control offers no option, and the CEL toggle
  still lets the developer write an expression default

#### Scenario: A bare person field's default offers no option list

- **WHEN** the developer opens the Default value zone on a `{type:
  "string", format: "person"}` field declaring neither `options` nor
  `dataSource`
- **THEN** the literal control offers no option, and the CEL toggle
  still lets the developer write an expression default
- **AND** the note names the people list rather than a data source

#### Scenario: A bare person list's default offers no checkbox group

- **WHEN** the developer opens the Default value zone on a `{type:
  "list", format: "person"}` field declaring neither `options` nor
  `dataSource`
<!-- antislop: allow sentence-length -->
<!-- Why: copied byte for byte from the live requirement. -->
- **THEN** the literal control offers no option, rather than a checkbox
  group over an empty option set, and the CEL toggle still lets the
  developer write an expression default

#### Scenario: The Default value zone disables for a reference or file field

- **WHEN** the developer opens the Fields view on a `file` field
- **THEN** the Default value zone shows disabled, and states that the
  type accepts no default here

#### Scenario: A formatted string field's default uses that format's input

- **WHEN** the developer opens the Default value zone on a
  `{type: "string", format: "date"}` field, with the CEL toggle off
- **THEN** the literal input is a native date input

#### Scenario: The Default value zone disables for a group field

- **WHEN** the developer opens the Fields view on a `group` field
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

#### Scenario: A bare person field previews with no option list

- **WHEN** the developer opens the preview on a `{type: "string",
  format: "person"}` field declaring neither `options` nor `dataSource`
<!-- antislop: allow sentence-length -->
<!-- Why: copied byte for byte from the live requirement. -->
- **THEN** the preview shows no option list, and the row states that
  the field's people list resolves at runtime, naming no data source

#### Scenario: A person list previews an array sample

- **WHEN** the developer opens the preview on a `{type: "list", format:
  "person"}` field
<!-- antislop: allow sentence-length -->
<!-- Why: copied byte for byte from the live requirement. -->
- **THEN** the synthesized sample value is an array holding the person
  format's own sample rather than that sample as a bare scalar
- **AND** the `{type: "string"}` twin still previews the scalar

### Requirement: A field moves into a group and out of it from the catalog rail

The catalog rail's drag SHALL move a field into a group field and out of it,
in place. The field editor's move control SHALL make the same move. The move
SHALL neither remove the group nor rebuild it. It SHALL neither remove the
moved field nor rebuild it.

The move SHALL write the field's place in the draft's field array. The
field SHALL keep its `id`, its `key` and every other key it carries. No
CEL expression and no column mapping SHALL change.

That holds because a group has no entry in the flat data payload,
and `FieldDef.key` is unique across every depth. A leaf field takes a
flat address through its own key, whatever group it sits in. Views and
column mappings reference the `id`. The `definition-contract` capability
states both rules, and this requirement rests on them rather than
restating them.

A view entry is the one reference the move SHALL rewrite. The definition
contract binds a field entry's `group` to the field's catalog parent. A
move that leaves the entries alone therefore strands every one of them.
The move SHALL set the `group` of every view entry whose `ref` names the
moved field, to the destination group's `key`. A move to the top level
SHALL remove that key instead of writing it.

The same contract refuses an entry whose `group` names a card its view
does not carry. A step's view may carry the moved field without the
destination group's card. The move SHALL then place that card on the view,
immediately before the moved field's entry.

A destination nested inside other groups SHALL bring every missing ancestor
card too, outermost first. Each placed card SHALL name its own parent's key
as its `group`. A view already carrying a card SHALL gain no second one. A
move to the top level SHALL place nothing.

The rewrite and every placed card SHALL reach every step in the draft. Both
SHALL land in the same draft change as the field-array write. A reader
between the writes would see a catalog and a set of views that disagree.

A tabbed form keeps the definition contract's tab rules through the move.
Each entry's former tab is the tab the form editor's canvas drew it on. A
root's former tab is its own, and a member's is its outermost group card's.

An entry the move puts inside a group SHALL lose its `tab`, since its card
names the tab. A card the move places at the form's root SHALL take that
entry's former tab. An inner card of a placed chain SHALL have no `tab`. An
entry the move lifts to the top level SHALL take its former tab. On a form
declaring no tabs, the move SHALL write no `tab` anywhere.

A group moved into another group follows the same rule. Its own card loses
its `tab`, and the destination card holds the tab instead. A card the move
places takes the moved card's former tab. A card the form already carries
keeps its own.

A note entry SHALL stay untouched. A note names no catalog field, so no
move can carry it.

A pointer SHALL move the field by dragging its rail entry. The keyboard
SHALL move the same field through the move control in that field's own
editor. A field nested inside a group carries that control in its own
editor too. The `spa-accessibility` capability names this route for a
move into a group or out of one. Both gestures SHALL reach one write.

The two gestures SHALL reach the same set of destinations. A drop names
its target by the row it lands on, so it reaches every group. The move
control SHALL therefore name every group too, and the top level beside
them. A control offering one direction fails this rule. It reaches the
nearest group alone. Every other group then needs a pointer.

The move control SHALL name the group that holds the field, or the top
level. After a move made through the control, keyboard focus SHALL return
to it.

A move may nest a field below the rail's own two-level indentation cap.
The rail SHALL then draw that field at the cap. The draft's own field
tree SHALL keep whatever depth the move produces.
That split is the rail-rendering rule the panels screen already states.

A move SHALL keep the moved field selected. The view SHALL keep showing
that field's own two halves.

#### Scenario: A field moves into a group with a pointer

- **WHEN** the developer drags a top-level field's rail entry onto a
  group field's entry
- **THEN** the draft carries that field inside the group's `fields`
  array, and the group keeps its own `id` and `key`

#### Scenario: A field moves out of a group with the keyboard

- **WHEN** the developer focuses the move control in a group child's own
  editor, and picks the top level
- **THEN** the draft carries that field at the top level, and the
  group's remaining children keep their order

#### Scenario: The keyboard reaches every group the pointer reaches

- **WHEN** the developer moves a top-level field with the keyboard, on a
  draft carrying two group fields
- **THEN** the move control names both groups and the top level
- **AND** the field reaches whichever group the developer picks

#### Scenario: Focus returns to the move control after a move

- **WHEN** the developer moves a group child to the top level through its
  move control
- **THEN** the tab selects that field, and keyboard focus sits on the move
  control in the field's own editor

#### Scenario: A move rewrites no reference

- **WHEN** the developer moves a field that two step views reference
  and one column mapping targets
- **THEN** both view entries and the column mapping still resolve, and
  neither carries a changed `id`
- **AND** each view entry's `group` now names the destination group

#### Scenario: A move to the top level clears the group on every entry

- **WHEN** the developer moves a group child out to the top level
- **AND** three step views carry an entry naming that field
- **THEN** none of the three entries carries a `group` key any more

#### Scenario: A move brings the destination group's card to a form lacking it

- **WHEN** the developer moves a top-level field into a group
- **AND** a step view carries that field but not the group's card
- **THEN** that view carries the group's card immediately before the
  field's entry
- **AND** the field's entry names the group's key

#### Scenario: A move into a nested group brings the whole missing chain

- **WHEN** the developer moves a field into a group that sits inside
  another group
- **AND** a step view carrying the field carries neither group's card
- **THEN** that view carries the outer card, then the inner card naming
  the outer key, then the field's entry

#### Scenario: A form already carrying the group's card gains no second one

- **WHEN** the developer moves a field into a group whose card a step view
  already carries
- **THEN** that view still carries exactly one card for that group

#### Scenario: A group moved into another group brings the destination card

- **WHEN** the developer moves a group field into a second group
- **AND** a step view carries the first group's card and its members, but
  not the second group's card
- **THEN** that view carries the second group's card immediately before
  the first group's card
- **AND** the first group's members keep their places after its card

#### Scenario: A move to the top level places nothing

- **WHEN** the developer moves a group child out to the top level
- **THEN** every step view keeps the cards it carried, and gains none

#### Scenario: A move into a group takes the entry's tab off

- **WHEN** the developer moves a top-level field into a group
- **AND** a tabbed step view carries that field on its second tab, but not the
  group's card
- **THEN** that view carries the group's card on the second tab, immediately
  before the field's entry
- **AND** the field's entry names the group's key and has no `tab`

#### Scenario: Only the outermost placed card takes the tab

- **WHEN** the developer moves a field on a tabbed form into a group nested
  inside another group
- **AND** that view carries neither group's card
- **THEN** the outer card carries the field's former tab
- **AND** neither the inner card nor the field's entry carries a `tab`

#### Scenario: A move to the top level gives the entry its card's tab

- **WHEN** the developer moves a group child out to the top level
- **AND** a tabbed step view carries the child inside a group card on the
  second tab
- **THEN** the child's entry names the second tab

#### Scenario: A form without tabs gains no tab from a move

- **WHEN** the developer moves a group child out to the top level
- **AND** a step view carrying it declares no tabs
- **THEN** the child's entry has no `tab`

#### Scenario: A group moved into a group hands its tab to the destination card

- **WHEN** the developer moves a group field into a second group
- **AND** a tabbed step view carries the first group's card on its second tab,
  but not the second group's card
- **THEN** that view carries the second group's card on the second tab
- **AND** the first group's card has no `tab`

#### Scenario: A move leaves a note inside the group alone

- **WHEN** the developer moves a field out of a group whose view also
  holds a note naming that group's key
- **THEN** the note still names that group's key

#### Scenario: A move keeps the key

- **WHEN** the developer moves a field whose `key` is `amount` into a
  group
- **THEN** the field's `key` still reads `amount`, and every CEL
  expression naming `data.amount` still resolves

#### Scenario: The moved field stays selected

- **WHEN** the developer moves the selected field into a group
- **THEN** the view still shows that field's definition half and its
  effect half

### Requirement: The field matrix lists every catalog field against every workflow step

The field matrix view SHALL draw a grid. Its rows are the field
catalog, depth-first flattened in catalog order: a group field
immediately followed by its own children. Its columns are
`workflow.steps`, in array order. The grid SHALL include every catalog
field and every step. This holds whether or not a given step's view
references a given field.

Each cell SHALL draw in one of three states:

- **Hatched**, where the column's step declares no `view` at all. Every
  cell in that column SHALL draw hatched, regardless of the row.
- **Blank**, where the step declares a `view` and that view's `fields`
  has no entry referencing the row's field.
- **Live**, where such an entry exists. A live cell SHALL show
  independent `visible`, `required` and `readonly` controls. Each
  control SHALL show that entry's own resolved value. Where a flag
  carries a CEL expression instead, its control gives way to a CEL
  stamp. That stamp SHALL show the expression's source.

#### Scenario: The grid covers the whole catalog and the whole step list

- **WHEN** the developer opens the field matrix on a draft with N
  catalog fields and M workflow steps
- **THEN** the grid draws N rows and M columns, independent of how many
  view entries exist

#### Scenario: A group field heads its own children

- **WHEN** the field catalog declares a group field with nested fields
- **THEN** the group's row sits immediately above its children's rows,
  in the order the Fields rail lists them

#### Scenario: A step with no view hatches its whole column

- **WHEN** a workflow step declares no `view`
- **THEN** every cell in that step's column draws hatched, for every
  field row

#### Scenario: An unreferenced field on a view-bearing step draws blank

- **WHEN** a workflow step declares a `view` whose `fields` has no
  entry for a given catalog field
- **THEN** that field's cell in that step's column draws blank

#### Scenario: A referenced field draws live with its flags summarized

- **WHEN** a workflow step's view carries an entry referencing a
  catalog field
- **THEN** that cell draws live
- **AND** it shows one control per flag, each at the entry's resolved
  `visible`, `required` and `readonly` value

### Requirement: A LocalizedText entry missing the current locale draws an inline warning

Take the studio's currently selected `contentLocale`. Take an entry that
carries the draft's `baseLocale` value but lacks that locale's own value.
That entry SHALL draw a warning next to its `LocalizedTextInput`. The
warning SHALL NOT be an `EditorIssue`, and SHALL NOT block or delay
publishing.

It SHALL draw at every `LocalizedTextInput` site:

- the process label
- each step's label and description
- each field's label and description
- each field option's label
- each note's text

An entry that lacks the `baseLocale` value SHALL NOT draw this warning.
The existing base-locale `EditorIssue` already flags it. The warning
SHALL NOT draw when `contentLocale` equals `baseLocale`.

A static rule in `packages/web/test/boundaries.test.ts` SHALL enforce that
list, scoped to `src/areas/studio/`. Every `LocalizedTextInput` rendered
there SHALL sit beside a call to `missingTranslationWarning`. An exempt site
SHALL instead carry an inline comment stating why. A hand-kept list does not
grow with the code. This rule does.

That rule also pins the number of sites it found. A change adding or
removing a site SHALL move that literal in the same commit. Otherwise the
rule rejects a tree it exists to admit.

#### Scenario: A step label missing the current locale draws a warning

- **WHEN** the studio's `contentLocale` is `de`, and a draft's step has a
  `label` carrying an `en` (base locale) value but no `de` value
- **THEN** the studio shows a warning next to that step's label input

#### Scenario: An entry with the current locale filled in draws no warning

- **WHEN** a draft's field `label` carries both the base-locale value and
  the current `contentLocale`'s value
- **THEN** the studio shows no warning next to that field's label input

#### Scenario: Viewing the base locale draws no translation warning

- **WHEN** the studio's `contentLocale` equals the draft's `baseLocale`
- **THEN** the studio shows no missing-translation warning anywhere

#### Scenario: The warning does not block publishing

- **WHEN** an author publishes a draft carrying a missing-translation
  warning
- **THEN** the publish succeeds

#### Scenario: A new render site warns

- **WHEN** the studio area gains a `LocalizedTextInput` site
- **THEN** the site calls `missingTranslationWarning`
- **AND** an untranslated entry draws the warning there

#### Scenario: An unguarded site fails the suite

- **WHEN** a source file under `src/areas/studio/` renders a
  `LocalizedTextInput` with no adjacent `missingTranslationWarning` call and
  no exempting comment
- **THEN** the boundary test names the file and fails

#### Scenario: An exempt site says why

- **WHEN** a site legitimately does not need a warning
- **THEN** an inline comment states the reason, and the rule skips it

#### Scenario: A note's text missing the current locale draws a warning

- **WHEN** the studio's `contentLocale` is `de`, and a note's `text` carries
  the base-locale value alone
- **THEN** the note's strip shows the warning beside its text input

<!-- antislop: allow synonym-rotation -->
