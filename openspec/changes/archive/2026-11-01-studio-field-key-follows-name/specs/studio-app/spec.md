<!-- antislop: allow-file passive-voice -->
<!-- Why: a scenario states an outcome, and the actor is the system under test. -->
## REMOVED Requirements

### Requirement: The field catalog's field key auto-derives from the field label

**Reason**: A condition that reads the key no longer stops the key from
following its label. Rule R1 of decision D4 keeps only the first publish as
the stop. A label change rewrites the readers instead.

**Migration**: Eight requirements carry the rules over:

- "A field's key follows its label"
- "A new field's key starts from its kind or empty"
- "A prior label that derives no key leaves the key following"
- "A derived field key takes the identifier shape"
- "A derived field key steps past a taken key"
- "A field key never reads as a CEL literal"
- "A published field's key stays when its label changes"
- "A label that derives no key keeps a key that conditions read"

### Requirement: A field's key input commits on blur

**Reason**: A commit no longer leaves the readers alone. It rewrites them,
and the input moves into a Developer view.

**Migration**: See "A field's key input commits on blur or Enter". The
rewrite moves to "A key change rewrites every expression that reads the old
key".

### Requirement: A field's key input names the expressions that read it

**Reason**: The notice counted the readers and named none. The "Read by"
zone names each one, and a key change updates them.

**Migration**: "The field editor lists what reads the field" and "A key
change says how many expressions it updated".

## MODIFIED Requirements

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
fields, since the entity rail lists them. It SHALL hold one control, which
adds a field at the end of the group. The tab SHALL then select that new field.

Keyboard focus SHALL then land in the new field's label input, since a new
field needs its label first. The rail SHALL bring the new field's entry into
view where it sits outside the rail's visible part. It SHALL scroll no further
than that, and it SHALL NOT animate the scroll.

"What this field asks" holds the label and the line that says what a key
change updated. The description, a Developer view holding the key, and the
move control follow, in that order. "What kind of field" holds the kind picker and
the Technical control. "Where values come from" holds the data source and
the options.

The effect half says where the field acts in the process. It SHALL hold
five zones. In order they read "Used in", "Read by", "Only ask this when",
"Ask for this" and "Column mapping". A group's effect half has no "Read by".
The same heading and rule treatment holds.

"Used in" lists every step whose view references the field, with the
modes those references set. "Read by" lists the expressions that read it.
"Only ask this when" holds the condition.
"Ask for this" holds the requiredness.

Neither half SHALL sit behind a disclosure. Both SHALL show as the view
opens. A closed disclosure over the usage list is what this change
removes. Returning one would undo the change. The key's Developer view
covers the key alone.

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
- **THEN** "What this field asks" holds the move control directly under the
  Developer view that holds the key
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

#### Scenario: Read by stands second in the effect half

- **WHEN** the developer opens the Fields view on a field that is not a group
- **THEN** the effect half's zones open with "Used in", "Read by", "Only
  ask this when" and "Ask for this"

## ADDED Requirements

### Requirement: A field's key follows its label

The field catalog's key SHALL auto-fill from the field's label as the author
types it. It SHALL do so while the key is empty. It SHALL also do so while
the key still equals what derivation produces from the label's prior value.
In any other case, a write to the label SHALL leave the key as it stands.
This applies at the top level and inside a `group` alike.

Derivation SHALL read only the base-locale entry of the label. A write to
any other locale's translation SHALL NOT trigger it.

#### Scenario: A new top-level field's key follows its label as the author types

- **WHEN** the studio's content locale is the draft's base locale
- **AND** the author adds a new field
- **AND** the author types "Requested amount" into its label, never touching
  its key
- **THEN** the field's key reads `requested_amount`

#### Scenario: A new field's key stays empty while the author types in a non-base content locale

- **WHEN** the author has switched the studio's content locale away from the
  draft's base locale
- **AND** the author adds a new field and types a label into it
- **THEN** the field's key does not follow that label

#### Scenario: A new nested field's key follows its label as the author types

- **WHEN** the author adds a field inside a `group` field
- **AND** the author types a label into it, never touching its key
- **THEN** the nested field's key derives from its own label the same way a
  top-level field's does

#### Scenario: A hand-edited field key stops following its label

- **WHEN** the author commits a key of their own in a field's key input
- **AND** the author then types more into that field's label
- **THEN** that field's key stays what the author committed

#### Scenario: Editing a non-base-locale translation leaves an already-derived field key untouched

- **WHEN** the author types a base-locale field label, which derives a key
- **AND** the author switches the content locale and types a translation
- **THEN** the field's key keeps the value it derived

### Requirement: A new field's key starts from its kind or empty

The form editor keys a field it mints at once, from its kind's name
(`studio-form-editor`). A field the Fields tab adds SHALL start with an
empty key.

#### Scenario: A field the Fields tab adds starts with no key

- **WHEN** the author adds a field on the Fields tab
- **THEN** the new field's key reads empty

### Requirement: A prior label that derives no key leaves the key following

A prior label that derives no key SHALL count the current key as derived,
while an expression reads that key. The key then follows again after a label
that starts with punctuation. The new base label must derive a non-empty
key, so a translation write moves nothing.

#### Scenario: A key follows again after a label that derives no key

- **WHEN** an unpublished field carries the key `amount`
- **AND** a path guard reads `data.amount > 1000.0`
- **AND** the author replaces its label with "€"
- **AND** the author then types "€ Total" into the label
- **THEN** the field's key reads `total`
- **AND** the guard reads `data.total > 1000.0`

### Requirement: A derived field key takes the identifier shape

Derivation SHALL lower-case the label. It SHALL transliterate it by the rule
the header bar's process key states (`studio-canvas`), so "Prüfung" reads
"pruefung". It SHALL collapse every run of characters outside `[a-z0-9]` to
a single `_` and trim a leading or trailing `_`. A result starting with a
digit SHALL gain a leading `_`. The result matches the grammar a published
`FieldDef.key` needs: `/^[a-z_][a-z0-9_]*$/`.

#### Scenario: A field label with an umlaut derives a readable key

- **WHEN** the author types "Größe" into a new field's label, never touching
  its key
- **THEN** the field's key reads `groesse`

### Requirement: A derived field key steps past a taken key

A derived key can collide with a key another field carries, at the top
level or inside any `group`. The field catalog SHALL then append `_2`, and
on a second collision `_3`, raising the number until no field carries it.

For a field that is not a `group`, a key only an expression reads SHALL
count as taken. A label typed through it would capture its readers. A key
SHALL still count as derived while it reads the prior derivation plus a
`_<n>` suffix.

#### Scenario: A colliding derived field key gets a numeric suffix

- **WHEN** another field carries a key, at the top level or inside a group
- **AND** the author types a label that derives to that key
- **THEN** the new field's key reads the colliding key with a `_2` suffix

#### Scenario: A second collision takes the next number

- **WHEN** the author types a label that derives to `amount`
- **AND** other fields already carry `amount` and `amount_2`
- **THEN** the new field's key reads `amount_3`

#### Scenario: A derived key passes over a key that only an expression reads

- **WHEN** a guard reads `data.amount` and no field carries the key `amount`
- **AND** the author types "Amount" into a new field's label
- **THEN** the new field's key reads `amount_2`
- **AND** the guard still reads `data.amount`

#### Scenario: A deduped key keeps following its label

- **WHEN** a field labelled "Date" carries the key `date_2`, because another
  field held `date`
- **AND** the other field's key has since changed
- **AND** the author changes the first field's label to "Due date"
- **THEN** the field's key reads `due_date`

### Requirement: A field key never reads as a CEL literal

For a field that is not a `group`, a word CEL reads as a literal SHALL count
as taken: `in`, `true`, `false` and `null`. A derived key then takes a
number. A commit of such a word SHALL write nothing and keep the typed
text. Its sentence reads "Conditions read this word as a value. Pick
another key."

#### Scenario: A literal word takes a number

- **WHEN** the author types "Null" into a new field's label
- **THEN** the field's key reads `null_2`

#### Scenario: A literal word draws a refusal

- **WHEN** the author commits `true` in a field's key input
- **THEN** the draft still holds the old key
- **AND** a sentence at the input reads "Conditions read this word as a
  value. Pick another key."

### Requirement: A published field's key stays when its label changes

A lock stops the auto-fill for a field that is not a `group` and carries a
non-empty key. The lock holds while the draft's base version holds a field
with the same `id`. A label write then leaves the key, even while it equals
the prior derivation. An expression that reads the key SHALL NOT lock it.
Until the studio has read the base version, every such field SHALL count as
locked. A `group` field is outside the lock.

#### Scenario: A key that a guard reads follows the label and takes the guard along

- **WHEN** a new, unpublished field "Amount" carries the key `amount`
- **AND** a path guard reads `data.amount > 1000.0`
- **AND** the author changes the field's label to "Total amount"
- **THEN** the field's key reads `total_amount`
- **AND** the guard reads `data.total_amount > 1000.0`

#### Scenario: A published field's key stays when the label changes

- **WHEN** the draft's base version holds the field "Amount" with the key
  `amount`
- **AND** the author changes the field's label to "Total amount"
- **THEN** the field's key still reads `amount`

#### Scenario: A key that nothing reads follows the label in a draft with no base version

- **WHEN** the draft has no base version
- **AND** the author changes the label of the field with the key `amount` to
  "Total amount"
- **THEN** the field's key reads `total_amount`

#### Scenario: The lock holds until the base version has loaded

- **WHEN** the draft has a base version that the studio has not read yet
- **AND** the author changes the label of a field whose key still equals its
  prior derivation
- **THEN** the field's key keeps its value

#### Scenario: A group field's key follows its label under the lock's conditions

- **WHEN** the draft's base version holds a group field "Request" with the
  key `request`
- **AND** the author changes the group's label to "Order request"
- **THEN** the group's key reads `order_request`
- **AND** the view entries that named `request` name `order_request`

### Requirement: A label that derives no key keeps a key that conditions read

A label that derives an empty key SHALL leave the key as it stands while an
expression reads it. Its readers would otherwise read `data.` with no name.
A key nothing reads SHALL follow the label to empty, as before.

#### Scenario: A cleared label keeps a key that a condition reads

- **WHEN** an unpublished field "Amount" carries the key `amount`
- **AND** a path guard reads `data.amount > 1000.0`
- **AND** the author clears the field's label
- **THEN** the field's key still reads `amount`
- **AND** the guard still reads `data.amount > 1000.0`

### Requirement: A key change rewrites every expression that reads the old key

A change of a field's key from a non-empty `from` to `to` SHALL rewrite
every CEL expression in the draft that reads `data.<from>`. Typing a label
that moves the key does so. A commit in the key input does so too, on a
published field as well.

An expression is any object with `lang: "cel"` and a string `src`. One source changes per
`studio-condition-builder`. The key and its rewrites SHALL land in one draft
write. A `group` key change rewrites the view entries naming it.

#### Scenario: A commit rewrites a guard and a form condition

- **WHEN** a path guard reads `data.amount > 1000.0`
- **AND** a step view's `visible` reads `data.amount > 0.0`
- **AND** the author commits the key `total` for the field `amount`
- **THEN** the guard reads `data.total > 1000.0`
- **AND** the `visible` expression reads `data.total > 0.0`

#### Scenario: A published field's key commit rewrites its readers

- **WHEN** the draft's base version holds the field `amount`
- **AND** a path guard reads `data.amount > 1000.0`
- **AND** the author commits the key `total` in the field's key input
- **THEN** the field's key reads `total`
- **AND** the guard reads `data.total > 1000.0`

### Requirement: A shared old key keeps its readers

While another field also carries `from`, a key change SHALL rewrite no
expression. The readers may belong to that other field.

#### Scenario: A shared old key leaves its readers

- **WHEN** two fields both carry the key `amount`
- **AND** a path guard reads `data.amount > 1000.0`
- **AND** the author commits the key `total` for one of them
- **THEN** the guard still reads `data.amount > 1000.0`

### Requirement: A commit onto a key only an expression reads takes its readers

A key only an expression reads SHALL NOT count as taken for a commit. The
commit then binds those expressions to the field on purpose, which repairs
a dangling guard. The rewrite line counts only the rewritten expressions.

#### Scenario: A commit onto a key only an expression reads takes its readers

- **WHEN** a path guard reads `data.amount` and no field carries `amount`
- **AND** the author commits the key `amount` for the field `sum`
- **THEN** the guard reads `data.amount`, which now reads that field
- **AND** every expression that read `data.sum` reads `data.amount`

### Requirement: The change list shows a key change's rewrites

The Publish dialog's change list and the Versions screen's change list SHALL
show a rewrite as ordinary differences. The field's row SHALL carry its key
change. Each rewritten expression's owner SHALL carry its own row, such as
the way out whose condition changed.

#### Scenario: The change list shows the rename

- **WHEN** the draft's base version holds the field `amount` and a way out
  whose guard reads `data.amount > 1000.0`
- **AND** the author commits the key `total` for that field
- **THEN** the change list holds a row for the field with its key change
- **AND** it holds a row for that way out with its changed condition

### Requirement: A key change says how many expressions it updated

A key change can rewrite expressions in the field catalog's field editor.
At least one rewrite SHALL show one sentence under the field's label row. One rewrite SHALL read "Updated 1 condition."
More SHALL read "Updated {count} conditions." One expression counts once.

The sentence SHALL stand in a polite live region. A key change that rewrote
nothing SHALL leave the sentence as it stands. The sentence SHALL go when
another field opens.

#### Scenario: A rename that moves two readers says so

- **WHEN** two expressions read `data.amount`
- **AND** the author commits the key `total` for the field `amount`
- **THEN** the sentence under the label reads "Updated 2 conditions."

#### Scenario: A field nothing reads shows no sentence

- **WHEN** no expression reads `data.amount`
- **AND** the author changes the label of the unpublished field `amount`
- **THEN** no sentence about updated conditions shows

### Requirement: A field's key input stands in a Developer view

The field editor's "What this field asks" zone SHALL hold a "Developer
view" disclosure, closed when the field opens. It SHALL hold the key input
under "Key". No key input SHALL stand outside it, for a `group` too.

#### Scenario: The key stands behind the Developer view

- **WHEN** the author opens a field in the field catalog
- **THEN** no key input is visible until the Developer view opens

### Requirement: A field's Developer view says where its key comes from

For a field that is not a `group`, the Developer view SHALL say where the
key comes from:

- a key that follows its label: "The key follows the label until the first
  publish."
- an unpublished key that no longer follows: "The label no longer sets this
  key."
- a published field: "This field is in a published version. The label no
  longer sets its key."
- while the base version loads: no sentence.

#### Scenario: An unpublished field names the rule

- **WHEN** the draft's base version does not hold the field
- **AND** the author opens the field's Developer view
- **THEN** it reads "The key follows the label until the first publish."

### Requirement: A key follows while it reads as the label's derivation

The Developer view SHALL count a key as following while it is empty. A key
that reads as the label's derivation follows too, with or without a `_<n>`
suffix. So does a read key the empty-label rule holds.

#### Scenario: A hand-committed key says the label no longer sets it

- **WHEN** an unpublished field labelled "Amount" carries the committed key
  `sum`
- **AND** the author opens the field's Developer view
- **THEN** it reads "The label no longer sets this key."

### Requirement: A field's key input commits on blur or Enter

The key input SHALL hold the typed text locally and commit it on blur or
Enter, in one write. Typing SHALL write nothing before the commit. A commit
of the key the field already carries SHALL write nothing. Escape SHALL drop
the typed text and show the field's key again, writing nothing.

#### Scenario: Typing a key writes nothing until blur

- **WHEN** the author types `new_key` into the key input, one character at a
  time
- **THEN** the draft still holds the old key after each character
- **AND** after the input loses focus, the draft holds `new_key`

#### Scenario: Enter commits the key

- **WHEN** the author types a key into the key input and presses Enter
- **THEN** the draft holds the typed key

#### Scenario: Escape puts the key back

- **WHEN** the author types `other` into the key input of the field `amount`
- **AND** the author presses Escape
- **THEN** the input reads `amount`
- **AND** the draft still holds `amount`

### Requirement: A key commit refuses a key that cannot work

A literal word is one refused key. For a field that is not a `group`, three
more cases SHALL keep the typed text and write nothing. Each
case shows its own sentence at the input:

- Empty text: "Type a key, or press Escape to keep the current one."
- Bad grammar: "A key starts with a letter or an underscore and holds only
  lower-case letters, digits and underscores."
- A key another field carries: "{field} already uses this key.", with that
  field's label.

#### Scenario: A key outside the grammar draws a refusal

- **WHEN** the author types `Total Amount` into the key input and presses
  Enter
- **THEN** the draft still holds the old key
- **AND** the input still reads `Total Amount`
- **AND** a sentence at the input says which characters a key holds

#### Scenario: A key another field holds draws a refusal

- **WHEN** another field, labelled "Status", carries the key `status`
- **AND** the author commits `status` in this field's key input
- **THEN** the draft still holds the old key
- **AND** a sentence at the input reads "Status already uses this key."

#### Scenario: The taken refusal falls back for the other field's name

- **WHEN** the field that carries `status` has no label at the content
  locale
- **THEN** the sentence names it by its label at the base locale
- **AND** the sentence reads "(unnamed field) already uses this key." when
  the base locale has no label either

### Requirement: A group's key commit keeps its own rule

A group's key commit SHALL follow "Renaming a group field's key rewrites the
view entries naming it". None of the refusals applies to it.

#### Scenario: A group still commits an empty key

- **WHEN** the author clears a group field's key input and presses Enter
- **THEN** the group's key reads empty, as "Renaming a group field's key
  rewrites the view entries naming it" states

### Requirement: The field editor lists what reads the field

The field editor's effect half SHALL hold a "Read by" zone under "Used in".
A `group` has no such zone. The zone SHALL list one row per CEL expression
that reads `data.<key>`, in draft order. It counts the way a key change
does.

A row SHALL name its place in the author's words. A condition's row SHALL
add its sentence (`studio-condition-builder`). No row
SHALL print CEL, a key or an id. With no reader the zone SHALL read "No
condition reads this field."

#### Scenario: A guard reads as its way out and its sentence

- **WHEN** a way out "Approve → Book" on the step "Review" carries the guard
  `data.amount > 1000.0`
- **AND** the field `amount` carries the label "Amount"
- **THEN** the "Read by" zone of "Amount" holds a row "On Review: way out
  Approve → Book"
- **AND** that row reads "Amount is greater than 1,000."

#### Scenario: A field nothing reads says so

- **WHEN** no expression reads `data.amount`
- **THEN** the "Read by" zone of "Amount" reads "No condition reads this
  field."

#### Scenario: The zone prints no CEL

- **WHEN** three expressions read `data.amount`
- **THEN** the "Read by" zone of "Amount" contains no `data.`

### Requirement: A Read by row names each kind of place

A condition's place SHALL read:

- a way out's condition: "On {step}: way out {way out}", with the step it
  leaves and its row heading;
- a step form's conditions: "When {step} asks for {field}", "When {step}
  requires {field}", "When {field} is read-only on {step}";
- a note's condition: "When {step} shows a note";
- rules: "The rule for {field}", "The rule for {field} on {step}".

#### Scenario: A form condition names the step and the field

- **WHEN** the step "Review" asks for the field "Note" only when
  `data.amount > 0.0`
- **THEN** the "Read by" zone of "Amount" holds a row "When Review asks for
  Note"

### Requirement: A Read by row names a value's place

Any other place SHALL read:

- "The default value of {field}" and "The time limit on {step}";
- "Values passed to the called process on {step}", "Values copied back
  from the called process on {step}";
- else "Another rule on {step}", or "Another rule in this process".

#### Scenario: A time limit names its step

- **WHEN** the step "Review" carries a time limit whose deadline reads
  `data.due`
- **THEN** the "Read by" zone of the field `due` holds a row "The time limit
  on Review"
