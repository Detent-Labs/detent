# Spec Delta

## MODIFIED Requirements

<!-- antislop: allow synonym-rotation -->
<!-- Why: the heading is copied byte for byte from the live requirement. -->
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

<!-- antislop: allow passive-voice -->
<!-- Why: the heading is copied byte for byte from the live requirement. -->
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
- **AND** the sentence reads "Until you finish the new row, the condition
  stays: Amount is greater than 1,000."

#### Scenario: Removing a row added to an empty site changes nothing

- **WHEN** a condition site has no expression
- **AND** an author adds a row and then removes it
- **THEN** the site writes nothing

#### Scenario: An unfinished row over nothing says so

- **WHEN** a condition site has no expression
- **AND** an author adds a row and leaves it without a value
- **THEN** the sentence reads "Finish a row to set the condition."

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

## ADDED Requirements

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

### Requirement: The builder's rows print no CEL

The joiner control SHALL read "and" or "or", and flipping it SHALL keep its
behavior. A raw row SHALL print a sentence in place of its fragment's text.
That sentence SHALL point to the Developer view. The row SHALL keep the
fragment unchanged in the written expression, and its remove control SHALL
stay. In the condition's sentence, a raw row SHALL read "a hand-written
rule". The canvas edge label keeps the fragment's text.

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

## REMOVED Requirements

### Requirement: Source that does not parse holds the builder closed

**Reason**: The builder no longer swaps its rows for the CEL input, so it has
no toggle to disable. The scenario "Fixing the syntax frees the toggle" names
a control that goes.

**Migration**: "Source that does not parse opens the Developer view" takes its
place.

### Requirement: The path-guard site's CEL toggle is a labeled "Developer view" disclosure

**Reason**: The rule covered the path-guard site alone and kept the other
sites' "Edit as CEL" toggle. Every site now takes the Developer view.

**Migration**: "Every condition site keeps its CEL in a Developer view" takes
its place.
