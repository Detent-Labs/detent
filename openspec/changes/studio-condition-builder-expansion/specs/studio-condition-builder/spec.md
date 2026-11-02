# Spec Delta

## ADDED Requirements

### Requirement: A group holds rows of its own, one level deep

The builder SHALL offer a group row. A group holds comparison rows and raw
rows, with no group inside it. A control on its head says how they combine:
"any of these" or "all of these". The builder SHALL offer "+ Add group"
beside "+ Add row", and "+ Add row to this group" inside a group.

A new group SHALL start with one fresh row, on the joiner opposite to its parent's. The gutter inside a group SHALL print the group's joiner as a word and no control. The head's control alone sets it.

#### Scenario: A group's remove control names the group

- **WHEN** an author reads a group's remove control
- **THEN** it reads "Remove group"

#### Scenario: Removing a group's last row removes the group

- **WHEN** an author removes the one row of a group
- **THEN** the group goes too

#### Scenario: A new group starts with one row on the opposite joiner

- **WHEN** an author presses "+ Add group" under a condition joined by "and"
- **THEN** a group appears with one empty row and its control reads "any of
  these"

#### Scenario: The group's control sets the group's joiner

- **WHEN** an author sets a group's control to "all of these"
- **THEN** the group's rows join by `&&`, whatever the condition's joiner

#### Scenario: A group offers no group inside it

- **WHEN** an author opens a group
- **THEN** the group offers "+ Add row to this group" and no add-group
  command

### Requirement: A group writes with parentheses and reads back as a group

A group with two or more complete rows SHALL write in parentheses, joined by
its joiner. That holds when the condition writes another part beside it. A
group with one complete row SHALL write that row bare. One with none SHALL
write nothing.

On read, a `&&` or `||` node under a chain of the other operator SHALL become
a group. Its chain SHALL flatten into the group's rows. A chain of the
condition's own operator SHALL flatten on either side.

#### Scenario: And over an or-group writes parentheses

- **WHEN** a condition holds the row `Amount is greater than 1,000` and a
  group of "any of these" holding `Department is Sales` and `Department is
  Marketing`
- **THEN** the builder writes
  `data.amount > 1000.0 && (data.department == "sales" || data.department == "marketing")`

#### Scenario: A parenthesised or-chain reads back as a group

- **WHEN** a guard reads
  `data.amount > 1000.0 && (data.department == "sales" || data.department == "marketing")`
- **THEN** the builder shows one comparison row and one group of two
  comparison rows whose control reads "any of these"

#### Scenario: An or over an and-chain reads back as a group

- **WHEN** a guard reads `data.a == "x" || data.b == "y" && data.c > 1.0`
- **THEN** the joiner reads "or" and the first row compares `a`
- **AND** the second row is a group of "all of these" holding `b` and `c`

#### Scenario: A nested chain of the same operator flattens

- **WHEN** a guard reads `data.a == "x" && (data.b == "y" && data.c > 1.0)`
- **THEN** the builder shows three comparison rows and no group

#### Scenario: A group of one complete row writes that row bare

- **WHEN** a group holds one complete comparison row and one unfinished row
- **THEN** the written text carries the complete row with no parentheses
  around it

### Requirement: A row compares against another field

A comparison row SHALL compare against a typed value or another field. One
command under the value editor swaps the two and empties the value. It reads
"Compare with a field instead" over a value and "Type a value instead" over a
field.

The field picker SHALL list the field and called-process operands of the row's operand's CEL type and `format`. The operand itself stays out. A list operand, and an
operand with no candidate, SHALL offer no command.

#### Scenario: A date compares against another date field

- **WHEN** an author picks "End date", "is after", presses "Compare with a
  field instead" and picks "Start date"
- **THEN** the builder writes `data.end_date > data.start_date`
- **AND** the sentence reads "End date is after Start date."

#### Scenario: A field comparison reads back as a row

- **WHEN** a guard reads `data.approver == data.requester` over two person
  fields
- **THEN** the builder shows one comparison row whose value side is the field
  picker set to the requester field

#### Scenario: The picker offers fields of the operand's type only

- **WHEN** an author presses "Compare with a field instead" on a number row
- **THEN** the picker lists the other number fields of the same CEL type
- **AND** it lists no text, date, list or context operand

#### Scenario: A date row's picker lists date fields alone

- **WHEN** an author presses "Compare with a field instead" on a date row
- **THEN** the picker lists the other date fields and no text or date-time field

#### Scenario: A context operand on the right stays a raw row

- **WHEN** a guard reads `data.status == instance.status`
- **THEN** the builder shows one raw row

#### Scenario: A key change follows the right side too

- **WHEN** a guard reads `data.end_date > data.start_date`
- **AND** the author changes the key `start_date` to `begin`
- **THEN** the guard reads `data.end_date > data.begin`

### Requirement: A negated list membership reads and writes as one row

The builder SHALL write "does not include" as `!(<literal> in <operand>)`.
It SHALL read a `!` node over an `in` node back as that row. It SHALL read a
`!` node over a bare boolean operand as a comparison against `false`. That
is the twin of the bare operand's reading as `true`. Any other `!` node stays a raw
row.

#### Scenario: Does not include writes a negated membership

- **WHEN** an author picks "The person's roles", "does not include" and
  types `manager`
- **THEN** the builder writes `!("manager" in actor.roles)`

#### Scenario: A negated membership reads back

- **WHEN** a guard reads `!("manager" in actor.roles)`
- **THEN** the builder shows one row on "The person's roles" with the
  operator "does not include" and the value `manager`

#### Scenario: A negated boolean reads as no

- **WHEN** a guard reads `!data.approved` over a boolean field
- **THEN** the builder shows one row reading "Approved is no"

#### Scenario: A negated comparison stays raw

- **WHEN** a guard reads `!(data.amount > 1000.0)`
- **THEN** the builder shows one raw row

## MODIFIED Requirements

### Requirement: The builder reads the condition as a sentence

Under the rows the builder SHALL print the condition in words, in place of its CEL. Each complete comparison row SHALL read as one clause of its operand's label, the operator's words and the value. A list row puts the value first. The joiner SHALL read "and" or "or".

A closed list's value SHALL print as its label, and a
boolean's as "yes" or "no". A number's SHALL print as a formatted number, and
a date's as a formatted date. Free text SHALL stand in curly quotes. A field
value SHALL print as that field's label.

A list clause SHALL read "{value} is one of {field}" or "{value} is not one
of {field}". A group of two SHALL read "either A or B" or "both A and B". Three or more SHALL read "any of A, B or C" or "all of A, B and C". A group clause with a clause after it SHALL end in a comma. With no row
and no stored condition, the
sentence SHALL say that the condition always matches.

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

#### Scenario: A list clause names the value first

- **WHEN** a guard reads `"manager" in actor.roles`
- **THEN** the sentence reads "“manager” is one of the person's roles."

#### Scenario: A negated list clause names the value first

- **WHEN** a guard reads `!("manager" in actor.roles)`
- **THEN** the sentence reads "“manager” is not one of the person's roles."

#### Scenario: A group of two reads as either or

- **WHEN** a guard reads
  `data.amount > 1000.0 && (data.department == "sales" || data.department == "marketing")`
- **AND** `department` labels its options "Sales" and "Marketing"
- **THEN** the sentence reads "Amount is greater than 1,000 and either
  Department is Sales or Department is Marketing."

#### Scenario: A group of three reads as any of

- **WHEN** a guard reads
  `data.amount > 1000.0 && (data.department == "sales" || data.department == "marketing" || "manager" in actor.roles)`
<!-- antislop: allow sentence-length -->
<!-- Why: the bullet quotes the builder's own three-clause sentence whole. -->
- **THEN** the sentence reads "Amount is greater than 1,000 and any of
  Department is Sales, Department is Marketing or “manager” is one of the
  person's roles."

#### Scenario: An and-group of two reads as both

- **WHEN** a guard reads `data.a == "x" || data.b == "y" && data.c > 1.0`
- **AND** the fields carry the labels "A", "B" and "C"
- **THEN** the sentence reads "A is “x” or both B is “y” and C is greater
  than 1."

#### Scenario: A date value prints as a date

- **WHEN** a guard reads `data.due_date <= "2026-12-31"` over a date field
  labeled "Due date"
- **THEN** the sentence reads "Due date is on or before Dec 31, 2026."

### Requirement: An existing condition reads back into the builder

The builder SHALL derive its rows by parsing the stored CEL. It SHALL NOT
store a record of how an author built a condition. That holds for the
process body and for the draft alike.

A top-level `&&` or `||` becomes the joiner. The chain of that same operator
flattens into one row per operand, on either side. A conjunct of the other
operator becomes a group. An expression with neither operator at the top
reads as a single row.

#### Scenario: A hand-written guard opens in the builder

- **WHEN** a developer opens a guard that a person typed by hand as CEL
- **THEN** the builder shows it as rows, and no stored record of the build
  exists

#### Scenario: A mixed-operator chain keeps its meaning

- **WHEN** a guard reads `a && b || c`
- **THEN** the joiner is `||`, and the rows are a group holding `a` and `b`
  on the left and `c` on the right

### Requirement: A fragment the builder cannot represent survives as a raw row

A conjunct may not match a comparison the builder can show. The builder
SHALL then keep it as a raw row holding the exact source text of that
fragment. It SHALL NOT drop the fragment. It SHALL NOT push the whole
condition out of the builder. A `&&` or `||` node inside a group is such a fragment. So is a comparison whose operator the operand does not offer.

A raw row SHALL gain parentheses when its level holds a second row.

#### Scenario: A macro becomes one raw row beside the rest

- **WHEN** a guard reads `data.tags.exists(t, t == "vip") && data.amount > 1000.0`
- **THEN** the builder shows a raw row holding `data.tags.exists(t, t == "vip")`
  and a comparison row for the amount

#### Scenario: A guard on a deleted field stays intact

- **WHEN** a guard names an operand the catalog no longer declares
- **THEN** the builder shows it as a raw row with its text unchanged
- **AND** the existing validation reports the unknown variable as it does today

#### Scenario: An ordering on a text field reads as a raw row

- **WHEN** a guard reads `data.city > "Bern"` on a text field
- **THEN** the builder shows one raw row with that text
- **AND** `data.due_date > "2026-01-01"` on a date field still reads as a comparison row

#### Scenario: A group inside a group reads as a raw row

- **WHEN** a guard reads
  `(data.department == "sales" || (data.region == "eu" && data.tier == "gold")) && data.amount > 1000.0`
- **THEN** the builder shows a group holding a comparison row and a raw row
  whose text reads `data.region == "eu" && data.tier == "gold"`
- **AND** the sentence reads "Either Department is Sales or a hand-written rule, and Amount is greater than 1,000."

### Requirement: Operators and value editors follow the operand type

The operators a row offers SHALL follow the operand's CEL type and format. A
number offers six: is, is not, is less than, is at most, is greater than, is
at least. A date offers six: is, is not, is before, is on or before, is after, is on or after. A date-time offers is and is not.

Other text and a boolean offer is and is not. A list offers includes and
does not include. No operator prints a CEL symbol.

The value editor SHALL follow the operand's type and the field's own declared `format`. A field declaring options in the body SHALL show those options by label and write the option value. A boolean SHALL offer yes, no and an empty choice. A row on a boolean operand starts on the empty choice. It stays incomplete until the author picks yes or no. Picking "No" from the empty choice SHALL write the row.

A number SHALL use a native number input, and a `format: "date"` or `format: "datetime"` field SHALL use the matching native input. `instance.status` SHALL offer the engine's instance statuses. A field bound to a data source and `actor.roles` SHALL take free text, since no studio route resolves those values. A field value takes the field picker in place of the editor.

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

<!-- The heading keeps the live wording, which a MODIFIED block must match; the operator now reads "includes". -->
#### Scenario: A list operand offers contains

- **WHEN** a developer picks `actor.roles` as the operand
- **THEN** the row offers "includes" and "does not include"
- **AND** "includes" emits `"manager" in actor.roles`

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

#### Scenario: A date operand offers date words

- **WHEN** a developer picks a `{type: "string", format: "date"}` field
<!-- antislop: allow sentence-length -->
<!-- Why: the bullet lists the six operator words whole. -->
- **THEN** the operator select lists "is", "is not", "is before", "is on or
  before", "is after" and "is on or after"
- **AND** "is on or before" writes `<=`

#### Scenario: A date-time operand offers equality only

- **WHEN** a developer picks a `{type: "string", format: "datetime"}` field
- **THEN** the row offers "is" and "is not" and no ordering operator

#### Scenario: A person field offers equality only

- **WHEN** a developer picks a `{type: "string", format: "person"}` field
- **THEN** the row offers "is" and "is not" and no ordering operator

<!-- antislop: allow passive-voice -->
<!-- Why: a MODIFIED heading must match the live spec's wording exactly. -->
### Requirement: An incomplete row is held in the builder and not written

A row may name an operand and have no value. The builder SHALL then keep the
row visible and marked incomplete, and leave it out of the written
expression. A group with no complete row counts as incomplete too, and takes
the same dashed border. The builder SHALL never emit a fragment that fails to
parse.

When rows exist and none contributes, the builder SHALL write nothing, and the stored expression stands. Removing a row, inside a group or not, is the one action that can remove that expression. A removal that leaves no complete row SHALL remove the condition, the same as clearing the text input. A removal at a site whose draft has no condition SHALL leave the draft as it was.

While no row contributes, the sentence SHALL read the condition the draft holds. It SHALL say the condition stays until the author finishes the row. A site that holds nothing SHALL ask the author to finish a row instead.

#### Scenario: A half-filled row does not reach the draft

- **WHEN** an author picks an operand and an operator but enters no value
- **THEN** the row stays visible and marked incomplete, and the written
  expression omits it

#### Scenario: Deleting the last row removes the condition

- **WHEN** an author deletes the last row of a path guard
- **THEN** the guard goes away, the same as clearing the text input
- **AND** the publish-time path rules judge the result as they do today

<!-- antislop: allow synonym-rotation -->
<!-- Why: a MODIFIED scenario heading must match the live spec's wording exactly. -->
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

#### Scenario: A group with no finished row holds the stored condition

- **WHEN** a guard reads `data.amount > 1000.0`
- **AND** an author adds a group and leaves its one row without a value
- **THEN** the group draws the dashed incomplete border
- **AND** the guard still reads `data.amount > 1000.0`

#### Scenario: Removing the last row inside a group removes the condition

- **WHEN** the builder shows one group holding one complete row and nothing else
- **AND** an author removes that row
- **THEN** the guard goes away, the same as clearing the text input

### Requirement: A path's guard reads as a sentence on its canvas way out

The canvas SHALL read a path's guard in the builder's clause words, on the
way out's line. That holds for an automatic path and for a manual path. The
words SHALL come from the same `Condition`/`Row` model the builder computes,
a group's clause included. A condition with no readable row SHALL read "a
hand-written rule holds". A complete comparison row inside a group counts
as readable. The line SHALL NOT print CEL source. `studio-canvas` states the
sentence around the condition.

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

#### Scenario: A grouped guard reads its group on the line

- **WHEN** a path's guard reads
  `data.amount > 1000.0 && (data.department == "sales" || data.department == "marketing")`
- **THEN** the path's line reads "Only if Amount is greater than 1,000 and
  either Department is Sales or Department is Marketing"

### Requirement: A condition reads as a sentence outside the builder

The studio SHALL read a stored condition as one sentence, for a place that
lists conditions without a builder. The sentence SHALL join the complete rows'
clauses as the builder's own sentence does, a group's clause included. It SHALL start with a capital letter, unless it opens on a value, and end with a period. A row
the builder cannot read SHALL read as the catalog's phrase for it, never as
CEL.

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

#### Scenario: A field comparison reads in a Read by row

- **WHEN** a guard reads `data.end_date > data.start_date` over the fields
  "End date" and "Start date"
- **THEN** the Read by row of either field reads "End date is after Start date."

#### Scenario: A list guard keeps its value's case

- **WHEN** a guard reads `"vip" in data.tags` and the choice `vip` carries the label "vip"
- **THEN** its sentence reads "vip is one of Tags."
