<!-- antislop: allow-file synonym-rotation -->
<!-- The translation-warning block below carries live-spec text verbatim, which the archive step matches by exact header, so its existing findings stay unrewritten. -->
## MODIFIED Requirements

### Requirement: The panels screen's field matrix toolbar filters inert columns and reports coverage

This requirement covers the panels screen's field matrix only. See
"The canvas dock's Field matrix tab carries no toolbar or bulk
badges" below.

The field matrix SHALL offer a toolbar above the grid. The toolbar
SHALL carry a toggle that hides every step with no `view` at all from
the grid, when engaged. The toggle SHALL affect only the grid's
columns. It SHALL leave every row in place.

The toolbar SHALL also report one live count line. That line SHALL
state four numbers. A note entry SHALL raise neither the declared
field-entry count nor, through it, the undeclared-cell count. The one
case below is its only exception. The fourth number subtracts the
first from a grid of cells, so the two must count the same thing.

- the number of declared field entries
- the field count
- the count of steps the grid currently draws
- the number of cells among those steps that carry no entry

That case moves two of the four numbers. Where a note is the first
entry in a step that declared no `view`, that step stops being inert.
It then joins the drawn columns. `stepCount` rises by one, and
`undeclaredCells` by the whole field count.

That is one more cell than a first field entry moves it. A field entry
adds a declared entry, and the fourth number subtracts that entry back
out. A note adds none. The note itself still counts as no entry and
occupies no cell.

#### Scenario: Hiding inert columns removes steps with no view

- **WHEN** the developer engages the "Hide inert columns" toggle on a
  draft where 3 of 13 steps declare no view
- **THEN** the grid draws 10 columns, and none of them belongs to a
  step with no view

#### Scenario: The toggle leaves every row in place

- **WHEN** the developer engages the "Hide inert columns" toggle
- **THEN** the grid still draws every catalog field as a row

#### Scenario: The count line reflects the currently drawn columns

- **WHEN** a draft carries 54 field entries, 22 fields and 13 steps, of
  which 3 declare no view
- **AND** the developer engages the "Hide inert columns" toggle
- **THEN** the count line reads 54 field entries, 22 fields, 10 steps,
  and 166 cells the visible steps do not declare

#### Scenario: A note moves none of the four numbers

- **WHEN** a step that already declares a view in that same draft gains
  three note entries
- **THEN** the count line still reads 54 field entries and 166
  undeclared cells, because a note occupies no cell

#### Scenario: A note in a viewless step joins the drawn columns

- **WHEN** a note is the first entry in one of that same draft's 3 steps
  declaring no `view`
- **AND** the developer engages the "Hide inert columns" toggle
- **THEN** the count line reads 54 field entries, 22 fields, 11 steps, and
  188 cells the visible steps do not declare

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

That rule also pins the number of sites it found. The note's text is the
tenth. A change adding a site SHALL move that literal in the same commit.
Otherwise the rule rejects a site it exists to admit.

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

- **WHEN** a site legitimately needs no warning
- **THEN** an inline comment states the reason, and the rule skips it

#### Scenario: A note's text missing the current locale draws a warning

- **WHEN** the studio's `contentLocale` is `de`, and a note's `text` carries
  the base-locale value alone
- **THEN** the note's strip shows the warning beside its text input

## REMOVED Requirements

### Requirement: The field matrix's rail entry counts view entries and view findings

**Reason**: The header says "view entries". Since this change, the count
reads field entries alone, and a note is not one. A header that outlives its
own rule misleads every later reader. Replaced by the renamed requirement
below. It carries the same body and every scenario, plus the note case.

**Migration**: None. The replacement carries the same rule, and adds the note
case. No stored data and no published body reads this count.

## ADDED Requirements

### Requirement: The field matrix's rail entry counts field entries and view findings

The panels screen's index rail SHALL show the field matrix's entity
count. That count is the total number of field entries across every
step in the draft. A live cell represents one of that same total.

A note entry SHALL count as none of them. The count answers how much a
step binds to the catalog, and a note binds to nothing. Counting one
would report a step as busier than its data says.

This is the matrix's analogue of two other counts. The Fields view
counts catalog rows. The Contract view counts outcomes.

The field matrix's issue count SHALL equal the number of open findings
carrying the `view` source over the whole draft. Those are the findings
the `studio-checks-rail` capability's rail groups under that name.
Since this change, that set holds one finding anchored on a field
rather than a cell: an unwritten technical field. The count therefore
over-reports by one per such field, with nothing to find in the grid.
The field catalog's own badge, which counts by entity type, surfaces
that finding correctly.

The count SHALL NOT come from the step entity type. A per-step view
finding shares that entity type with every other per-step issue in the
draft.

#### Scenario: The entity count matches the live-cell total

- **WHEN** the developer opens the field matrix on a draft with 54
  field entries across its steps
- **THEN** the rail's Field matrix entry shows 54 as its entity count

#### Scenario: A note leaves the field matrix count alone

- **WHEN** a draft holds one step whose view carries two field entries
  and three notes
- **THEN** the rail's Field matrix entry shows 2 as its entity count

#### Scenario: A step holding notes alone contributes no entity count

- **WHEN** a draft holds one step whose view carries notes alone
- **THEN** that step raises the rail's Field matrix entity count by none

#### Scenario: The issue count reflects only view-source findings

- **WHEN** the draft carries one `checkViewFlags` finding and several
  unrelated issues on the same steps, from other sources
- **THEN** the rail's Field matrix entry shows an issue count of 1, not
  a count including the unrelated issues

#### Scenario: An unwritten technical field raises the matrix issue count

- **WHEN** the draft carries one unwritten-technical-field finding and
  no other `view`-source finding
- **THEN** the rail's Field matrix entry shows an issue count of 1

### Requirement: The Steps panel's configured-field count reads field entries alone

The Steps panel SHALL report how many of the catalog's fields a step's view
configures. That line reads `N / M`, where `M` is the catalog's own size.

The first number SHALL count field entries alone. A note occupies no catalog
row. Counting one would report a step as binding more of the catalog than it
does. The second number never moves for a note, because the catalog holds
none.

This count sits on the Steps panel, not in the form editor. The form editor
displays no count of its own.

#### Scenario: A note raises no configured-field count

- **WHEN** a step's view holds one field entry and three notes
- **THEN** the Steps panel reports that step's configured fields as 1

#### Scenario: A step holding notes alone reports none configured

- **WHEN** a step's view holds notes alone
- **THEN** the Steps panel reports that step's configured fields as 0
