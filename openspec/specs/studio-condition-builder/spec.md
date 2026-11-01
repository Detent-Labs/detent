<!-- antislop: allow-file passive-voice synonym-rotation -->
<!-- Why passive-voice: a scenario states an outcome, and the actor is the
     system under test. Why synonym-rotation: "change" and "edit" name two
     different things here. A change is an OpenSpec artifact; an edit is the
     keystroke an author makes in a panel. -->
# studio-condition-builder Specification

## Purpose

A row builder over CEL at the studio's three condition sites. A business
analyst can then author a path guard, a view override, or a field's
cross-step `visible` condition without writing CEL. The builder reads an
existing condition back by parsing it. A hand-written guard and a built
one therefore stay one artifact.

## Requirements

### Requirement: The builder is the default surface at every condition site

The studio SHALL offer a row builder as the default editor for a path guard.
It SHALL offer the same builder for `visible`, `required` and `readonly`,
wherever the studio edits one. That includes the field catalog's
"Only ask this when" row, which sits in the Fields view's effect half. That
row edits a field's `visible` override across every step view that references
the field.

Below the rows the builder SHALL show the condition as a sentence. The
requirement "The builder reads the condition as a sentence" states it.

That row's operand picker SHALL withhold `child.outcome` and
`child.data`. It writes one expression across steps of mixed type. The
requirement "A subprocess step's path guards offer the child's contract as
operands" scopes those operands. Only a path guard on the subprocess step
itself offers them. The row keeps its CEL in the same Developer view every
site takes.

A timer deadline is not a condition and keeps its text input.

#### Scenario: A path guard opens on the builder

- **WHEN** a developer opens a path's guard editor
- **THEN** the row builder appears, with its sentence below it

#### Scenario: A view override opens on the builder

- **WHEN** a developer opens the `visible`, `required` or `readonly` override of
  a view field
- **THEN** the same row builder appears at that site

#### Scenario: The field catalog's condition row opens on the builder

- **WHEN** a developer opens "Only ask this when" in the field catalog's
  effect half
- **THEN** the same row builder appears, editing the `visible` override the
  row writes to every referencing step view

#### Scenario: A timer deadline keeps its text input

- **WHEN** a developer opens a timer's deadline expression
- **THEN** the plain CEL text input appears, unchanged

### Requirement: The builder reads the condition as a sentence

Under the rows the builder SHALL print the condition in words, in place of
its CEL. Each complete row SHALL read as one clause: the operand's label, the
operator's words and the value. The joiner SHALL read "and" or "or".

A closed list's value SHALL print as the option's label. A boolean's SHALL
print as "yes" or "no", and a number's as a formatted number. Free text SHALL print
in curly quotes. With no row and no stored condition, the sentence SHALL say
that the condition always matches.

#### Scenario: A two-row guard reads as one sentence

- **WHEN** a guard reads `data.amount > 1000.0 && data.status == "approved"`
- **AND** `status` offers the option "approved" labeled "Approved"
<!-- antislop: allow passive-voice -->
<!-- Why: the quoted sentence is the builder's own output, and "is Approved" names a value. -->
- **THEN** the sentence reads "Amount is greater than 1,000 and Status is
  Approved."
- **AND** the builder site prints no CEL outside its Developer view

#### Scenario: A boolean row reads yes or no

- **WHEN** a guard reads `data.approved == false`
- **THEN** the sentence reads "Approved is no."

#### Scenario: Free text stands in quotes

- **WHEN** a guard reads `data.city == "Bern"` on a text field labeled "City"
- **THEN** the sentence reads "City is “Bern”."

#### Scenario: An empty site says it always matches

- **WHEN** a condition site has no expression and no row
- **THEN** the sentence reads "No condition yet: this always matches."

#### Scenario: The Fields tab's divergent state says the steps disagree

- **WHEN** the steps that ask a field hold different `visible` overrides
- **AND** a developer opens "Only ask this when" on the Fields tab
- **THEN** the sentence reads "The steps hold different conditions. Build
  one here to set it on every step."
- **AND** it does not read "this always matches"

### Requirement: The CEL surface stays reachable from every builder site

Every builder site SHALL carry a CEL text input holding the same expression,
inside the site's Developer view. Editing that text SHALL re-read the rows.
Whether the Developer view stands open SHALL NOT persist to the draft or to
the published body.

#### Scenario: An author switches to CEL and back

- **WHEN** a developer opens the Developer view at a condition site
- **THEN** its text input holds the same expression the rows produced
- **AND** a parseable edit of that text shows as rows above it

#### Scenario: The mode is not stored

- **WHEN** a developer opens a condition site's Developer view and reloads
  the draft
- **THEN** the Developer view stands closed again, and no part of the draft
  records the earlier state

### Requirement: An existing condition reads back into the builder

The builder SHALL derive its rows by parsing the stored CEL. It SHALL NOT store
a record of how an author built a condition. That holds for the process body and
for the draft alike.

A top-level `&&` or `||` becomes the joiner. The chain of that same operator
then flattens into one row per operand. An expression with neither operator at
the top reads as a single row.

#### Scenario: A hand-written guard opens in the builder

- **WHEN** a developer opens a guard that a person typed by hand as CEL
- **THEN** the builder shows it as rows, and no stored record of the build
  exists

#### Scenario: A mixed-operator chain keeps its meaning

- **WHEN** a guard reads `a && b || c`
- **THEN** the joiner is `||`, and the rows are the whole `a && b` on the left
  and `c` on the right

### Requirement: A fragment the builder cannot represent survives as a raw row

A conjunct may not match a comparison the builder can show. The builder SHALL
then keep it as a raw row holding the exact source text of that fragment. It
SHALL NOT drop the fragment. It SHALL NOT push the whole condition out of the
builder.

A raw row SHALL gain parentheses when the condition holds a second row.

#### Scenario: A macro becomes one raw row beside the rest

- **WHEN** a guard reads `data.tags.exists(t, t == "vip") && data.amount > 1000.0`
- **THEN** the builder shows a raw row holding `data.tags.exists(t, t == "vip")`
  and a comparison row for the amount

#### Scenario: A guard on a deleted field stays intact

- **WHEN** a guard names an operand the catalog no longer declares
- **THEN** the builder shows it as a raw row with its text unchanged
- **AND** the existing validation reports the unknown variable as it does today

### Requirement: Source that does not parse opens the Developer view

The stored source may not parse. The site SHALL then open with its Developer
view open on the CEL text input. A line in place of the rows and the sentence
SHALL say that the condition cannot show as rows. It SHALL say where to fix
it, as a status message.

Once the source parses, the rows and the sentence SHALL return. The Developer
view SHALL stay open.

#### Scenario: An unparseable guard opens on the Developer view

- **WHEN** a developer opens a condition whose source does not parse
- **THEN** the Developer view stands open, with the CEL text input holding the
  source
- **AND** the site says the condition cannot show as rows and points to the
  Developer view

#### Scenario: Fixing the syntax brings the rows back

- **WHEN** the developer corrects the source so it parses
- **THEN** the rows and the sentence appear above the Developer view
- **AND** the Developer view stays open

### Requirement: Only an authoring action writes the expression

The builder SHALL write the expression only when the author changes a row, an
operator, a value or the joiner. Mounting the site, reading the condition and
switching the mode SHALL NOT write.

#### Scenario: Opening a condition leaves it byte for byte

- **WHEN** a developer opens a guard in the builder, reads it, and navigates away
  without touching a row
- **THEN** the stored `src` stands character for character

### Requirement: The builder re-reads when its source or operand set changes

The builder holds its rows while the author works. It SHALL re-read them from
the source whenever the source text or the operand set changes. A resolving
child process changes the operand set and leaves the text as it stands.

The operand set counts as changed when a path or its CEL type changes. A label
alone SHALL NOT count. A label change that moves a key changes a path. Every
open builder then drops its unfinished row.

#### Scenario: A resolving child converts a raw row in place

- **WHEN** a developer opens a guard reading `child.outcome == "approved"` on a
  subprocess step whose child has not resolved
- **AND** the developer then resolves that child
- **THEN** the raw row becomes a comparison row against `child.outcome`
- **AND** the stored source is unchanged, since reading is not an authoring
  action

#### Scenario: A rewritten guard re-reads on the new key

- **WHEN** a guard reading `data.amount > 1000.0` is open
- **AND** the field's key changes to `total`
- **THEN** the row reads as a comparison on that field
- **AND** the stored source reads `data.total > 1000.0`

#### Scenario: A label change that moves no key keeps an unfinished row

- **WHEN** a field's label changes while a row sits incomplete
- **AND** no key changes
- **THEN** the incomplete row is still there, with its operand and operator

### Requirement: A view override keeps the arm the author chose

A view override is `boolean` or an expression, and the author picks which. That
choice SHALL survive the builder writing no expression.

The builder writes none for as long as its only row is incomplete. An override
reading that absence as "the author wants a boolean" would collapse to its
checkbox on the first click. It would discard the row.

An expression or a boolean present SHALL win over the remembered choice. A
change made through the JSON surface therefore still shows.

#### Scenario: The first row survives being added

- **WHEN** a developer switches a view override to the expression arm
- **AND** adds a row, which stays incomplete until it carries a value
- **THEN** the override still shows the builder, and the row is still there

#### Scenario: A present value decides the arm

- **WHEN** the stored override holds an expression, or holds a boolean
- **THEN** the override shows the matching arm, whatever the author last chose

### Requirement: The operand picker offers the catalog and the curated context

The picker SHALL offer every leaf field of the draft's catalog as `data.<key>`.
A group therefore contributes its leaves and not itself. Each entry SHALL show
the field's label and no key. A field with no label SHALL read "(unnamed
field)". Where two fields share a label, the second and later SHALL add a
count, such as "Name (2)".

Beyond the catalog the picker SHALL read the engine's declared instance and
actor context. It SHALL hide four entries: `instance.id`,
`instance.currentStepId`, `instance.transitionSeq` and `actor.id`. None of the
four can express a guard that means anything at a condition site.

The context entries SHALL read in the author's words: "The case's status" for
`instance.status` and "The person's roles" for `actor.roles`. The case's
status SHALL offer its four values as words.

The picker SHALL list the catalog's fields first. The called process's
entries follow where the site offers them, then the case, then the person. Each list
SHALL stand under its own heading, and a list with no entry SHALL draw none.

The picker is a suggestion list and no permission gate. The CEL surface SHALL
still reach every variable the engine registers.

#### Scenario: A grouped field contributes its leaves

- **WHEN** the catalog declares a group holding two fields
- **THEN** the picker offers the two leaf fields and not the group itself

#### Scenario: The four hidden entries do not appear

- **WHEN** a developer opens the operand picker
- **THEN** "The case's status" and "The person's roles" appear
- **AND** `instance.id`, `instance.currentStepId`, `instance.transitionSeq` and
  `actor.id` do not

#### Scenario: The CEL surface still reaches a hidden variable

- **WHEN** a developer types `actor.id == "usr_x"` in the Developer view's CEL
  input
- **THEN** the expression stays valid exactly as it is today

#### Scenario: A field entry shows its label alone

- **WHEN** the catalog declares a field labeled "Amount" with the key `amount`
- **THEN** the picker's entry reads "Amount", with no key beside it

#### Scenario: Two fields sharing a label stay apart

- **WHEN** the catalog declares two fields both labeled "Name"
- **THEN** the picker offers "Name" and "Name (2)", in catalog order

#### Scenario: The case and the person come last

- **WHEN** a developer opens the operand picker on a draft with two fields
- **THEN** the two fields stand first, under the heading "Fields"
- **AND** "The case's status" follows under "The case", and "The person's
  roles" under "The person"

### Requirement: A subprocess step's path guards offer the child's contract as operands

A path guard on a subprocess step whose child resolved SHALL offer
`child.outcome`, carrying the child contract's declared outcomes as its values.
It SHALL also offer `child.data.<key>`, over the child contract's
`outputFields` alone. The authoring check types `child.data` against those
fields, so a key outside them would author a publish error.

The view overrides on that step (`visible`, `required` and `readonly`)
SHALL NOT offer these operands. The authoring check withholds `child` there,
because the runtime resolves a view flag with no child in scope.

When the child does not resolve, `child.outcome` SHALL fall back to a free-text
value at the path guard. No `child.data.<key>` operand SHALL appear then.

#### Scenario: A resolved child gives an outcome picker

- **WHEN** a developer authors a guard on a path leaving a subprocess step whose
  child resolved
- **THEN** `child.outcome` offers exactly the outcomes the child contract
  declares

#### Scenario: A view override on a subprocess step offers no child operand

- **WHEN** a developer opens a view field's `visible`, `required` or `readonly`
  override on that same subprocess step
- **OR** the developer opens a note's `visible` override
- **THEN** the picker offers neither `child.outcome` nor `child.data.<key>`

#### Scenario: Only the contract's output fields appear

- **WHEN** the child declares a field its contract omits from `outputFields`
- **THEN** no `child.data` operand names that field

#### Scenario: An unresolved child falls back to text

- **WHEN** the subprocess step's child did not resolve
- **THEN** `child.outcome` takes a free-text value at the path guard, and no
  `child.data` operand appears

### Requirement: Operators and value editors follow the operand type

The operators a row offers SHALL follow the operand's CEL type. A number
offers the six ordering and equality operators, whether it reports `double` or
`int`. A string and a boolean offer equality only. A list offers a contains
operator, which emits `in`.

The operator select SHALL print each operator in words, and no CEL symbol.
The words read "is", "is not", "is less than", "is at most", "is greater
than", "is at least" and "contains".

The value editor SHALL follow the operand's type and the field's own declared
`format`. A field declaring options in the body SHALL show those options by
label and write the option value. A boolean SHALL offer yes, no and an empty
choice.

A row on a boolean operand starts on the empty choice. The row
stays incomplete until the author picks yes or no. Picking "No" from the empty
choice SHALL write the row. A number
SHALL use a native number input, and a `format: "date"` or
`format: "datetime"` field SHALL use the matching native input.
`instance.status` SHALL offer the engine's instance statuses. A field bound to
a data source and `actor.roles` SHALL take free text, since no studio route
resolves those values.

#### Scenario: A number operand offers ordering operators

- **WHEN** a developer picks a `number` field as the operand
- **THEN** the row offers equality, inequality and the four ordering operators

#### Scenario: An integer operand offers the same operators

- **WHEN** a developer picks a `{type: "number", format: "integer"}` field as
  the operand
- **THEN** the row offers the same six operators a `double` operand offers

#### Scenario: A select operand offers its declared options

- **WHEN** a developer picks a `string` field that declares options in the body
- **THEN** the value editor lists the option labels and writes the option value

#### Scenario: A date operand uses a native date input

- **WHEN** a developer picks a `{type: "string", format: "date"}` field
- **THEN** the value editor is a native date input

#### Scenario: A list operand offers contains

- **WHEN** a developer picks `actor.roles` as the operand
- **THEN** the row offers a contains operator, and it emits
  `"manager" in actor.roles`

#### Scenario: A data-source-bound field takes free text

- **WHEN** a developer picks a `string` field bound to a data source
- **THEN** the value editor takes free text

#### Scenario: A new boolean row starts empty

- **WHEN** a developer adds a row on a boolean operand
- **THEN** the value select shows the empty choice
- **AND** the row shows the incomplete mark

#### Scenario: Choosing No on a new boolean row writes the row

- **WHEN** a developer picks "No" in the value select of that new row
- **THEN** the builder writes `data.approved == false`

#### Scenario: The operator select reads words

- **WHEN** a developer picks a `number` field as the operand
- **THEN** the operator select lists six options in words, from "is" to "is
  at least"
- **AND** no option prints `==`, `!=`, `<`, `<=`, `>` or `>=`

### Requirement: The builder's rows print no CEL

The joiner control SHALL read "and" or "or", and flipping it SHALL keep its
behavior. A raw row SHALL print a sentence in place of its fragment's text.
That sentence SHALL point to the Developer view. The row SHALL keep the
fragment unchanged in the written expression, and its remove control SHALL
stay. In the condition's sentence, a raw row SHALL read "a hand-written
rule". The canvas way out's sentence and the form preview's note read a raw
row the same way, per `studio-canvas`.

#### Scenario: The joiner reads a word

- **WHEN** a guard holds two rows joined by `||`
- **THEN** the joiner control reads "or"
- **AND** pressing it makes the joiner read "and" and writes `&&`

#### Scenario: A raw row reads as a sentence

- **WHEN** a guard reads `data.tags.exists(t, t == "vip") && data.amount > 1000.0`
- **THEN** the raw row reads "A hand-written rule. The Developer view holds
  its text."
- **AND** the page shows `data.tags.exists(t, t == "vip")` only inside the
  Developer view
- **AND** the sentence reads "A hand-written rule and Amount is greater than
  1,000."

### Requirement: The written literal follows the operand's declared type

The builder SHALL write a literal in the form the operand's CEL type requires.
The form the author typed does not govern. A `double` operand SHALL emit the
CEL `double` form. An `int` operand SHALL emit a bare integer, with no decimal
part, since a `double` literal does not type-check against an `int`.

The text SHALL be valid CEL for every finite number. A `double` literal whose
JavaScript text carries an exponent, such as `1e21`, SHALL keep that text
without a trailing `.0`. An `int` operand SHALL take a safe integer only.
A value beyond the safe range counts as no literal, and the row stays
incomplete.

The builder SHALL write a string literal in double quotes. It SHALL escape any
character the CEL string grammar requires it to escape. It SHALL write a bare
boolean operand as an explicit comparison against `true`.

#### Scenario: A value holding a quote stays parseable

- **WHEN** an author enters a value that itself holds a double quote or a
  backslash
- **THEN** the written literal escapes it, and the whole expression parses

<!-- antislop: allow passive-voice -->
<!-- Why: copied byte for byte from the live requirement. -->
#### Scenario: A number literal is written in double form

- **WHEN** an author types `1000` as the value of a `number` operand declaring
  no format
- **THEN** the builder writes `data.amount > 1000.0`, which type-checks

#### Scenario: The builder writes an integer literal bare

- **WHEN** an author types `3` as the value of a
  `{type: "number", format: "integer"}` operand
- **THEN** the builder writes `data.prioritaet > 3`, which type-checks

#### Scenario: A large double gets valid CEL text

- **WHEN** an author types `1e21` as the value of a `number` operand
- **THEN** the builder writes `data.amount > 1e+21`, which parses and type-checks

#### Scenario: An integer beyond the safe range is no literal

- **WHEN** an author types `9007199254740993` as the value of a
  `{type: "number", format: "integer"}` operand
- **THEN** the row stays marked incomplete, and the written expression omits it

<!-- antislop: allow passive-voice -->
<!-- Why: copied byte for byte from the live requirement. -->
#### Scenario: A single-quoted literal is normalised on edit

- **WHEN** an author edits a guard that reads `data.status == 'failed'`
- **THEN** the written guard reads `data.status == "failed"`, with the same
  meaning

<!-- antislop: allow passive-voice -->
<!-- Why: copied byte for byte from the live requirement. -->
### Requirement: An incomplete row is held in the builder and not written

A row may name an operand and have no value. The builder SHALL then keep the
row visible and marked incomplete. It SHALL leave that row out of the written
expression. It SHALL never emit a fragment that fails to parse.

When rows exist and none contributes, the builder SHALL write nothing. The
expression the draft holds, if any, SHALL stand as it was.

Removing a row is the one action that can remove that expression. A removal
that leaves no complete row SHALL remove the condition, the same as clearing
the text input. A removal at a site whose draft has no condition SHALL leave
the draft as it was.

While no row contributes, the sentence under the rows SHALL read the
condition the draft holds. It SHALL say that the condition stays until the
author finishes the row. A site that holds nothing SHALL ask the author to
finish a row instead.

#### Scenario: A half-filled row does not reach the draft

- **WHEN** an author picks an operand and an operator but enters no value
- **THEN** the row stays visible and marked incomplete, and the written
  expression omits it

#### Scenario: Deleting the last row removes the condition

- **WHEN** an author deletes the last row of a path guard
- **THEN** the guard goes away, the same as clearing the text input
- **AND** the publish-time path rules judge the result as they do today

#### Scenario: An unfinished edit keeps the stored condition

- **WHEN** a guard reads `data.amount > 1000.0`
- **AND** an author picks another operand for its only row, which leaves the
  row without a value
- **THEN** the row stays visible and marked incomplete
- **AND** the guard still reads `data.amount > 1000.0`
- **AND** the sentence reads "Until you finish the row, the condition
  stays: Amount is greater than 1,000."

#### Scenario: Removing a row added to an empty site changes nothing

- **WHEN** a condition site has no expression
- **AND** an author adds a row and then removes it
- **THEN** the site writes nothing

#### Scenario: An unfinished row over nothing says so

- **WHEN** a condition site has no expression
- **AND** an author adds a row and leaves it without a value
- **THEN** the sentence reads "Finish a row to set the condition."

### Requirement: The builder reads back every literal it writes

The builder SHALL read each literal it writes back as a comparison row. A
condition then survives a remount as the same row.

The parser returns an integer literal as a `bigint`. The reader SHALL accept it
and SHALL turn it into a number while the value stays a safe integer. It SHALL
fold a unary minus over a numeric literal into a negative number. That holds
for an integer and a double. A literal outside the safe range stays a raw row,
and so does any other node.

The rule builder for `validation.rule` shares these readers and SHALL meet the
same rule.

#### Scenario: An integer literal reads back as a row

- **WHEN** a guard reads `data.prioritaet > 3` and `prioritaet` is a
  `{type: "number", format: "integer"}` field
- **THEN** the builder shows one comparison row with the value `3`

#### Scenario: A negative literal reads back as a row

- **WHEN** a guard reads `data.amount > -5.0` and `amount` is a `number` field
- **THEN** the builder shows one comparison row with the value `-5`

#### Scenario: Every written literal reads back

- **WHEN** the builder writes a literal for a `string`, `bool`, `int` or
  `double` operand, including a negative number and a double with an exponent
- **THEN** reading the written text yields a comparison row with the same
  operand, operator and value

#### Scenario: An unsafe integer stays a raw row

- **WHEN** a guard reads `data.prioritaet == 9007199254740993`
- **THEN** the builder shows that comparison as one raw row

#### Scenario: A validation rule reads back the same literals

- **WHEN** a field's `validation.rule` reads `data.prioritaet > -3`
- **THEN** the rule builder shows one comparison row

### Requirement: A path's guard reads as a sentence on its canvas way out

The canvas SHALL read a path's guard in the builder's clause words, on the
way out's line. That holds for an automatic path and for a manual path. The
words SHALL come from the same `Condition`/`Row` model the builder computes.
A condition with no readable row SHALL read "a hand-written rule holds". The
line SHALL NOT print CEL source. `studio-canvas` states the sentence around
the condition.

#### Scenario: A single-row guard reads in words

- **WHEN** an automatic path's guard reads `data.status == "approved"`, and
  the builder shows it as one row
- **THEN** the path's line carries the row's clause in words

#### Scenario: An unbuildable guard reads as a hand-written rule

- **WHEN** a path's guard reads `size(data.amount) > 3`
- **THEN** the path's line reads "Only if a hand-written rule holds"
- **AND** the guard's source text appears nowhere on the canvas

#### Scenario: A manual path's guard draws its sentence and no number

- **WHEN** a manual path's guard reads `data.amount > 1000.0`
- **THEN** the path's line reads "Only if Amount is greater than 1,000"
- **AND** no number draws on the line

### Requirement: A way out's row shows a "How it is taken" control

A way out's row SHALL render the path's existing `trigger` field as a
two-option segmented control, labeled "How it is taken". The options are "A
person chooses" (`trigger: "manual"`) and "Happens by itself"
(`trigger: "automatic"`). This SHALL set the same field the row set before.
Choosing "A person chooses" SHALL drop the path's `priority` and SHALL keep
its guard. Choosing "Happens by itself" SHALL keep a guard the path already
carries.

#### Scenario: Choosing "Happens by itself" makes the path automatic

- **WHEN** the developer selects "Happens by itself" in a way out's "How it
  is taken" control
- **THEN** the path's `trigger` becomes `automatic`

#### Scenario: Switching to a person's choice drops the priority and keeps the guard

- **WHEN** an automatic way out carries a priority and a guard
- **AND** the developer selects "A person chooses"
- **THEN** the path has no `priority` key
- **AND** its guard stays as it was

### Requirement: A way out's guard stands under "Only when" for either trigger

The row SHALL render the existing `ConditionBuilder` row UI under an "Only
when" heading for both triggers. On an automatic way out the guard decides
whether the engine takes it. On a manual way out the guard decides whether
the person gets the button. The row SHALL say so beside the guard. The
`priority` input SHALL render for an automatic way out alone.

#### Scenario: An automatic way out shows the guard under "Only when"

- **WHEN** a way out's `trigger` is `automatic`
- **THEN** the existing `ConditionBuilder` row UI renders under an "Only
  when" heading
- **AND** a `priority` input renders beside it

#### Scenario: A manual way out shows its guard editor

- **WHEN** the developer opens a manual way out
- **THEN** the "Only when" heading and the `ConditionBuilder` row UI render
- **AND** no `priority` input renders

### Requirement: Every condition site keeps its CEL in a Developer view

Every condition site SHALL hold its CEL in a disclosure labeled "Developer
view" under the builder. The disclosure SHALL stand closed on open, except
over source that does not parse. The rows and the sentence SHALL stay
visible while it stands open. Other specs name this disclosure the site's
CEL toggle.

One site already stands inside a Developer view: the form editor's flag
override. It SHALL show the CEL text input with no second disclosure.

#### Scenario: A way out's guard holds its CEL in a Developer view

- **WHEN** a developer opens a way out's "Only when" on the Steps tab
- **THEN** a closed "Developer view" disclosure stands under the sentence
- **AND** opening it shows the CEL text input, with the rows still above it

#### Scenario: The field catalog's condition row holds its CEL in a Developer view

- **WHEN** a developer opens "Only ask this when" on the Fields tab
- **THEN** a closed "Developer view" disclosure stands under the sentence
- **AND** no "Edit as CEL" control appears

#### Scenario: The form editor's override shows no second disclosure

- **WHEN** a developer opens a flag's Developer view in the form editor and
  picks CEL
- **THEN** the builder, the sentence and the CEL text input appear, with no
  second "Developer view" disclosure

### Requirement: A field rename rewrites CEL source through the parsed tree

The studio SHALL rewrite one CEL source for a field key change from `from`
to `to`. It SHALL parse the source and visit every node. A member read of
the identifier `data` with the name `from` SHALL take the name `to`. The
rewrite SHALL replace only the name's own characters, which end where the
node's range ends. Every other character SHALL stay as written, spaces and
parentheses included. A read inside a macro or a call SHALL change like any
other.

#### Scenario: A comparison takes the new key

- **WHEN** a guard reads `data.amount > 1000.0 && data.status == "open"`
- **AND** the field `amount` takes the key `total`
- **THEN** the guard reads `data.total > 1000.0 && data.status == "open"`

#### Scenario: The rest of the text stays as written

- **WHEN** a guard reads `( data . amount  >  5.0 )`
- **AND** the field `amount` takes the key `total`
- **THEN** the guard reads `( data . total  >  5.0 )`

#### Scenario: A read inside a macro or a call changes

- **WHEN** a guard reads `has(data.amount) && size(data.amount) > 0`
- **AND** the field `amount` takes the key `total`
- **THEN** the guard reads `has(data.total) && size(data.total) > 0`

### Requirement: A field rename leaves what is not a field read

A string literal SHALL stay. So SHALL an index read such as `data["from"]`,
a read under `child.data`, and a longer name that starts with `from`.

#### Scenario: A string literal, an index read and a child read stay

- **WHEN** a guard reads
  `"data.amount" == data.note && data["amount"] > 1.0 && child.data.amount > 1.0`
- **AND** the field `amount` takes the key `total`
- **THEN** the guard reads exactly as before

#### Scenario: A longer key that shares the start stays

- **WHEN** a guard reads `data.amount_2 > 1.0`
- **AND** the field `amount` takes the key `total`
- **THEN** the guard still reads `data.amount_2 > 1.0`

### Requirement: Source that does not parse changes by text

Source that does not parse SHALL change by text. Each `data.<from>` on word
boundaries, with no identifier character or dot before `data`, SHALL read
`data.<to>`. The reader count uses that same match, so the rewrite changes
exactly the sources the count counts.

#### Scenario: Source that does not parse changes by text

- **WHEN** a guard reads `data.amount >` and does not parse
- **AND** the field `amount` takes the key `total`
- **THEN** the guard reads `data.total >`

### Requirement: A condition reads as a sentence outside the builder

The studio SHALL read a stored condition as one sentence, for a place that
lists conditions without a builder. The sentence SHALL join the clauses of
the complete rows the way the builder's own sentence does. It SHALL start
with a capital letter and end with a period. A row the builder cannot read
SHALL read as the catalog's phrase for it, never as CEL.

Source that does not parse, and source with no complete row, SHALL read
"A hand-written rule."

#### Scenario: A guard reads in words

- **WHEN** a guard reads `data.amount > 1000.0`
- **AND** the field `amount` carries the label "Amount"
- **THEN** its sentence reads "Amount is greater than 1,000."

#### Scenario: Source that does not parse reads as a hand-written rule

- **WHEN** a guard reads `data.amount >`
- **THEN** its sentence reads "A hand-written rule."
- **AND** the sentence has no `data.`
