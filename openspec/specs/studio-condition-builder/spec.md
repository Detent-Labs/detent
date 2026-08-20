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
wherever the studio edits one. That includes the field catalog's Rules tab
"Only ask this when" row. That row edits a field's `visible` override
across every step view that references the field.

<!-- antislop: allow synonym-rotation -->
<!-- Why: "surface" is this capability's own noun for the raw-CEL escape hatch (the requirement header names it, and the "The CEL surface stays reachable from every builder site" requirement below does too). "show" is the unrelated verb for what the builder does with the CEL it produces. Not a rotated synonym. -->
Below the rows the builder SHALL show the CEL it produces, on a
read-only line.

That row's operand picker SHALL withhold `child.outcome` and
`child.data`. It writes one expression across steps of mixed type. "A
subprocess step offers the child's contract as operands" scopes those
operands to a site on the subprocess step itself. The row keeps the
CEL toggle presentation every view-override site takes.

A timer deadline is not a condition and keeps its text input.

#### Scenario: A path guard opens on the builder

- **WHEN** a developer opens a path's guard editor
- **THEN** the row builder appears, with the CEL it produces below it

#### Scenario: A view override opens on the builder

- **WHEN** a developer opens the `visible`, `required` or `readonly` override of
  a view field
- **THEN** the same row builder appears at that site

#### Scenario: The field catalog's condition row opens on the builder

- **WHEN** a developer opens "Only ask this when" on the field catalog's
  Rules tab
- **THEN** the same row builder appears, editing the `visible` override the
  row writes to every referencing step view

#### Scenario: A timer deadline keeps its text input

- **WHEN** a developer opens a timer's deadline expression
- **THEN** the plain CEL text input appears, unchanged

### Requirement: The CEL surface stays reachable from every builder site

The builder SHALL carry a toggle to a CEL text input holding the same
expression. The chosen mode SHALL NOT persist to the draft or to the published
body.

#### Scenario: An author switches to CEL and back

- **WHEN** a developer toggles to the CEL surface at a condition site
- **THEN** the text input holds the same expression the rows produced, and
  toggling back reads it into rows again

#### Scenario: The mode is not stored

- **WHEN** a developer leaves a condition site in CEL mode and returns to it
- **THEN** the site opens on the builder again, and no part of the draft records
  the earlier mode

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

### Requirement: Source that does not parse holds the builder closed

The stored source may not parse. The site SHALL then open on the CEL text input,
with the toggle disabled. It SHALL show the parse message as the hint. The
toggle SHALL become available as soon as the source parses.

#### Scenario: An unparseable guard opens in CEL mode

- **WHEN** a developer opens a condition whose source does not parse
- **THEN** the CEL text input appears, the builder toggle stays disabled, and
  the site shows the parse message

#### Scenario: Fixing the syntax frees the toggle

- **WHEN** the developer corrects the source so it parses
- **THEN** the builder toggle becomes available

### Requirement: Only an authoring action writes the expression

The builder SHALL write the expression only when the author changes a row, an
operator, a value or the joiner. Mounting the site, reading the condition and
switching the mode SHALL NOT write.

#### Scenario: Opening a condition leaves it byte for byte

- **WHEN** a developer opens a guard in the builder, reads it, and navigates away
  without touching a row
- **THEN** the stored `src` stands character for character

### Requirement: The builder re-reads when the operand set changes

The builder holds its rows while the author works. It SHALL re-read them from
the source whenever the operand set changes, not only when the source text
changes.

A resolving child process leaves every guard's text untouched. It also turns a
fragment the builder could not represent into a comparison row. A builder that
keyed on the text alone would show the raw row for the rest of the session.

The operand set counts as changed when a path or its CEL type changes. A label
SHALL NOT count. No row reads one, so a label edit must not discard a row the
author is still filling in.

#### Scenario: A resolving child converts a raw row in place

- **WHEN** a developer opens a guard reading `child.outcome == "approved"` on a
  subprocess step whose child has not resolved
- **AND** the developer then resolves that child
- **THEN** the raw row becomes a comparison row against `child.outcome`
- **AND** the stored source is unchanged, since reading is not an authoring
  action

#### Scenario: Renaming a field falls its guard back to a raw row

- **WHEN** a field's key changes while a guard on the old key is open
- **THEN** that row re-reads as a raw row holding its text unchanged

#### Scenario: Editing a label keeps an unfinished row

- **WHEN** a field's label changes while a row sits incomplete
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
the field's label with its key beside it.

Beyond the catalog the picker SHALL read the engine's declared instance and
actor context. It SHALL hide four entries: `instance.id`,
`instance.currentStepId`, `instance.transitionSeq` and `actor.id`. None of the
four can express a guard that means anything at a condition site.

The picker is a suggestion list, not a permission gate. The CEL surface SHALL
still reach every variable the engine registers.

#### Scenario: A grouped field contributes its leaves

- **WHEN** the catalog declares a group holding two fields
- **THEN** the picker offers the two leaf fields and not the group itself

#### Scenario: The four hidden entries do not appear

- **WHEN** a developer opens the operand picker
- **THEN** `instance.status` and `actor.roles` appear
- **AND** `instance.id`, `instance.currentStepId`, `instance.transitionSeq` and
  `actor.id` do not

#### Scenario: The CEL surface still reaches a hidden variable

- **WHEN** a developer types `actor.id == "usr_x"` in the CEL surface
- **THEN** the expression stays valid exactly as it is today

### Requirement: A subprocess step offers the child's contract as operands

A condition may sit on a subprocess step whose child resolved. The picker SHALL
then offer `child.outcome`, carrying the child contract's declared outcomes as
its values. It SHALL also offer `child.data.<key>`, over the child contract's
`outputFields` alone. The authoring check types `child.data` against those
fields, so a key outside them would author a publish error.

Both condition sites on such a step SHALL carry these operands. Those are the
step's path guards and its three view overrides. The authoring check admits
`child` at both.

When the child does not resolve, `child.outcome` SHALL fall back to a free-text
value, and no `child.data.<key>` operand SHALL appear.

#### Scenario: A resolved child gives an outcome picker

- **WHEN** a developer authors a guard on a path leaving a subprocess step whose
  child resolved
- **THEN** `child.outcome` offers exactly the outcomes the child contract
  declares

#### Scenario: A view override on a subprocess step reaches child too

- **WHEN** a developer opens the `visible` override of a view field on that same
  subprocess step
- **THEN** the picker offers `child.outcome` and `child.data.<key>` there as well

#### Scenario: Only the contract's output fields appear

- **WHEN** the child declares a field its contract omits from `outputFields`
- **THEN** no `child.data` operand names that field

#### Scenario: An unresolved child falls back to text

- **WHEN** the subprocess step's child did not resolve
- **THEN** `child.outcome` takes a free-text value, and no `child.data` operand
  appears

### Requirement: Operators and value editors follow the operand type

The operators a row offers SHALL follow the operand's CEL type. A number offers
the six ordering and equality operators. A string, a date, a datetime, a select,
a reference and a boolean offer equality only. A list offers a contains
operator, which emits `in`.

The value editor SHALL follow the same type. A select or reference declaring
options in the body SHALL show those options by label and write the option
value. A boolean SHALL offer yes or no. A number, a date and a datetime SHALL
use the matching native input. `instance.status` SHALL offer the engine's
instance statuses. A select bound to a data source and `actor.roles` SHALL take
free text, since no studio route resolves those values.

#### Scenario: A number operand offers ordering operators

- **WHEN** a developer picks a `number` field as the operand
- **THEN** the row offers equality, inequality and the four ordering operators

#### Scenario: A select operand offers its declared options

- **WHEN** a developer picks a `select` field that declares options in the body
- **THEN** the value editor lists the option labels and writes the option value

#### Scenario: A list operand offers contains

- **WHEN** a developer picks `actor.roles` as the operand
- **THEN** the row offers a contains operator, and it emits
  `"manager" in actor.roles`

#### Scenario: A data-source-bound field takes free text

- **WHEN** a developer picks a select field bound to a data source
- **THEN** the value editor takes free text

### Requirement: The written literal follows the operand's declared type

The builder SHALL write a literal in the form the operand's CEL type requires.
The form the author typed does not govern. A number operand SHALL emit the CEL
`double` form.

The builder SHALL write a string literal in double quotes. It SHALL escape any
character the CEL string grammar requires it to escape. It SHALL write a bare
boolean operand as an explicit comparison against `true`.

#### Scenario: A value holding a quote stays parseable

- **WHEN** an author enters a value that itself holds a double quote or a
  backslash
- **THEN** the written literal escapes it, and the whole expression parses

#### Scenario: A number literal is written in double form

- **WHEN** an author types `1000` as the value of a `number` operand
- **THEN** the builder writes `data.amount > 1000.0`, which type-checks

#### Scenario: A single-quoted literal is normalised on edit

- **WHEN** an author edits a guard that reads `data.status == 'failed'`
- **THEN** the written guard reads `data.status == "failed"`, with the same
  meaning

### Requirement: An incomplete row is held in the builder and not written

A row may name an operand and carry no value. The builder SHALL then keep the
row visible and marked incomplete. It SHALL leave that row out of the written
expression, and SHALL NOT emit a fragment that does not parse.

When no row contributes, the builder SHALL write no expression. That is the
state an empty text input produces today.

#### Scenario: A half-filled row does not reach the draft

- **WHEN** an author picks an operand and an operator but enters no value
- **THEN** the row stays visible and marked incomplete, and the written
  expression omits it

#### Scenario: Deleting the last row removes the condition

- **WHEN** an author deletes the last row of a path guard
- **THEN** the guard goes away, the same as clearing the text input
- **AND** the publish-time path rules judge the result as they do today

### Requirement: An automatic path's guard shows a plain-English summary on its canvas edge

The canvas SHALL show a plain-English summary of an automatic path's
guard as a label on that path's edge. A new pure function,
`summarizeCondition`, SHALL build that summary from the same
`Condition`/`Row` model the builder already computes for that guard.
It SHALL NOT read `celReadout`, the builder's raw-CEL preview text, to
produce this summary. That text is CEL syntax, not a sentence.

A guard the builder cannot represent as rows SHALL show its raw CEL text
as the edge label instead. See "A fragment the builder cannot represent
survives as a raw row" above.

#### Scenario: A single-row guard shows its plain-English form

- **WHEN** an automatic path's guard reads `data.status == "approved"`,
  and the builder shows it as one row
- **THEN** the path's canvas edge shows a label built from that row, not
  the raw CEL

#### Scenario: An unbuildable guard shows raw CEL on the edge

- **WHEN** an automatic path's guard holds a fragment the builder keeps
  as a raw row
- **THEN** the path's canvas edge shows that fragment's CEL text as the
  label

### Requirement: The path inspector shows a "triggered by" control, and the guard under an "Only when" heading

The path inspector SHALL render the path's existing `trigger` field
as a two-option segmented control, labeled "triggered by". The options
are a participant's choice (`trigger: "manual"`), and a condition
(`trigger: "automatic"`). This SHALL set the same field the path
inspector sets today; it adds no new field.

Choosing "a condition" SHALL show the existing `ConditionBuilder` row
UI under an "Only when" heading. Choosing "a participant's choice"
SHALL hide it, since a manual path carries no guard.

#### Scenario: Choosing "a condition" shows the guard under "Only when"

- **WHEN** the developer selects "a condition" in a path's "triggered
  by" control
- **THEN** the path's `trigger` becomes `automatic`
- **AND** the existing `ConditionBuilder` row UI renders under an
  "Only when" heading

#### Scenario: Choosing "a participant's choice" hides the guard

- **WHEN** the developer selects "a participant's choice" in a path's
  "triggered by" control
- **THEN** the path's `trigger` becomes `manual`
- **AND** no "Only when" panel renders for that path

### Requirement: The path-guard site's CEL toggle is a labeled "Developer view" disclosure

The path-guard condition site's CEL toggle SHALL become a collapsible
disclosure labeled "Developer view". This SHALL hold on the canvas edit
screen only. This is the same toggle "The CEL surface stays reachable
from every builder site" describes.

The toggle's label and placement change at this one site. Its behavior
does not: the mode still does not persist to the draft or to the
published body.

This requirement covers the path-guard site only. The view-override
sites (`visible`, `required`, `readonly`) keep their existing toggle
presentation; they sit outside this change's scope.

#### Scenario: The path-guard site's toggle reads "Developer view"

- **WHEN** a developer opens a path's guard editor on the canvas edit
  screen
- **THEN** the CEL toggle appears as a "Developer view" disclosure

#### Scenario: The toggle's mode still does not persist

- **WHEN** a developer opens the "Developer view" disclosure, reads the
  CEL, and navigates away
- **THEN** no part of the draft records that the disclosure was open
