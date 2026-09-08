## MODIFIED Requirements

### Requirement: The rail lists every open issue, grouped by source

The Checks tab SHALL carry the full grouped rail, per the
`studio-process-tabs` capability's tab-row requirement. The rail SHALL list
every entry in the loaded draft's `validation.issues[]`. The rail SHALL group
entries by `source`: zod, structural, CEL, registry, duration, and view.

The first five sources are engine validators. The studio runs each one
unmodified, and reports what it returns. The sixth holds the studio's own
findings, over a draft the engine would publish. It needs its own name for
that reason.

The Checks tab is the one place the full grouped rail stands. It stands there
whatever the author has selected. No column beside another tab stands it. A
row in the rail opens the tab that owns its subject, per the
`studio-process-tabs` capability.

#### Scenario: A structural issue appears in its group

- **WHEN** the loaded draft has a structural issue on some step
- **THEN** the Checks tab prints that issue under a structural group

<!-- The heading repeats the live spec's wording verbatim, so a delta can match it. -->
<!-- antislop: allow synonym-rotation -->
#### Scenario: Issues across sources each show in their own group

- **WHEN** the loaded draft has a structural issue and a CEL issue
- **THEN** the Checks tab prints one group for each source, each holding its
  own issue

#### Scenario: A Zod-invalid draft's issues show in their own group

- **WHEN** the loaded draft fails Zod validation (`zodValid` is false)
- **THEN** the Checks tab prints those issues under a `zod` group
- **AND** the structural, CEL, registry, duration, and view groups read held
  back, not empty

### Requirement: The rail collapses to a one-line issue-count summary when the developer selects a step

The studio's area nav SHALL carry the rail's one-line summary. It stands there
as the Checks control, beside Save and Publish. The control stands on every tab
of the process surface. It stands in every state of that surface, whatever the
author has selected.

The summary SHALL carry a single count. That count totals every open entry in
`validation.issues[]`. It spans the zod, structural, CEL, registry, duration,
and view groups. A registry type-resolution issue counts toward that total.
The registry group's config-validation half stays held back in every draft
state this deployment reaches, per the held-back requirement above. That
held-back half alone SHALL NOT enter the count, and SHALL NOT decide whether
the summary reads clear.

Any of the zod, structural, CEL, registry, duration, or view groups can hold
back. That happens for want of a compiled body. When one does, the summary
SHALL carry a held-back indicator instead. That indicator SHALL differ from
both a count and "no count." A held-back group has not run its checks yet. It
is not clear.

The summary SHALL NOT read as clear or passing while one of those six groups
holds back. That holding-back is for want of a compiled body. This carries the
rail's own held-back requirement into its collapsed form. The registry group's
config-validation half can hold back on its own. When it does, with the
group's type-resolution half clear, the summary SHALL NOT enter this state.

The Checks control SHALL carry a state dot beside the count. The dot reads the
worst open issue. One color marks a blocker, one marks an advisory issue, and
one marks a clear draft. A held-back group SHALL NOT take the clear color.

Pressing the Checks control SHALL open the Checks tab. The full grouped list
stands in that tab body. No disclosure expands the list in place, under the
area nav or on any tab.

The summary SHALL be a `<button type="button">`. Its accessible name SHALL
carry the open issue count and the state the dot reads.

#### Scenario: Selecting a step collapses the rail to a summary

- **WHEN** the developer selects a step on the Steps tab
- **THEN** the area nav's Checks control still carries the one-line summary
- **AND** no column stands the full rail beside the step page

#### Scenario: The summary shows with nothing selected

- **WHEN** the developer opens the process surface and selects nothing
- **THEN** the area nav's Checks control still carries the one-line summary

#### Scenario: The summary counts every open issue

- **WHEN** the loaded draft carries three open issues across two groups
- **THEN** the Checks control's count reads three

#### Scenario: A registry type-resolution issue enters the collapsed count

- **WHEN** the loaded draft compiles, and names an action type the registry
  response does not hold
- **THEN** the Checks control's count includes that registry issue
- **AND** the registry group's own config-validation half stays held back
  without changing that count

#### Scenario: A fully clear draft's summary carries no count

- **WHEN** the loaded draft passes every zod, structural, CEL, registry,
  duration, and view check
- **THEN** the Checks control carries no count
- **AND** it carries no held-back indicator, even though the registry group's
  config-validation half stays held back

#### Scenario: A structurally invalid draft's summary shows held back, not clear

- **WHEN** the loaded draft is not Zod-valid, so every one of those six groups
  holds back
- **THEN** the Checks control carries the held-back indicator
- **AND** it does not read as "no count"

#### Scenario: Choosing the summary expands the full grouped list

- **WHEN** the developer presses the Checks control in the area nav
- **THEN** the Checks tab opens, and the grouped list stands in the tab body
- **AND** no disclosure expands under the area nav

#### Scenario: Choosing the summary again collapses the list

- **WHEN** the Checks tab stands open and the developer presses the Checks
  control again
- **THEN** the Checks tab stays open, and the grouped list stays in its body

#### Scenario: Selecting several steps keeps the docked summary

- **WHEN** the developer selects more than one step on the Canvas tab
- **THEN** the area nav's Checks control still carries the one-line summary
- **AND** its count does not follow the selection

#### Scenario: The Checks control stands on every tab

- **WHEN** the developer walks the tab row from Canvas to Contract
- **THEN** the area nav's Checks control stands on each tab, with one count

### Requirement: The rail adds a consolidated view; a field's checks stand at their zones

`IssueList` SHALL keep rendering its existing per-entity views. Those views
sit under the process header, on a step page, and on a path row. The Checks
tab is one more consolidated view over the same `validation.issues[]` array.
It does not replace those placements.

The Fields tab is the one placement that changes. A field's own check SHALL
stand at the zone the check names, per the `studio-app` capability's zone
requirement. The Fields tab SHALL mount no `IssueList` gathering that field's
checks in one place.

The reason the old placement existed still holds, and the zone rule answers
it. A check inside one section of a field hid whenever the author opened
another section. Zones open none, so no check hides.

#### Scenario: An issue shows in both its entity placement and the rail

- **WHEN** a path guard carries a CEL issue
- **THEN** that issue stands in the path's own `IssueList` placement and in
  the Checks tab's CEL group

#### Scenario: A field's check shows at its zone and in the rail

- **WHEN** a field carries a validation issue
- **THEN** the check stands in the definition half's "Validation" zone
- **AND** the area nav's Checks control counts it

#### Scenario: No zone hides a field's check

- **WHEN** a field carries checks naming two different zones
- **THEN** both checks stand at once, and neither waits on the author opening
  anything

### Requirement: The rail docks its collapsed summary on the panels screen

No panels screen stands any more, so no screen docks a summary of its own. The
area nav's Checks control is the one summary. It serves every tab of the
process surface.

The `collapsed` form is the one to mount there. That form exists and serves two
sites today. Both sites go with the two screens the process surface replaces.
No new component comes about. The summary keeps every rule the collapse
requirement states. Those are the single count, the held-back indicator, and
the refusal to read as clear while a group holds back.

Pressing the summary SHALL open the Checks tab. The grouped list stands in
that tab body. No list expands in place, over a tab.

The area nav's count and the Checks tab's entry count SHALL NOT disagree. Both
read one `validation.issues[]`.

A check belonging to one entity SHALL also stand at that entity's own place in
the open tab. The `studio-app` capability states where. This rail carries the
draft-wide roll-up and the publish gate. It is not the only place an author
reads a field's own finding.

The standing column this requirement asked for is gone. Its width goes to the
tab body. The column came about because a `<dialog>` once covered the rail.
The reason was visibility while an author changes a draft, not the column
itself. One summary in the area nav keeps that visibility and returns the
width.

#### Scenario: The panels screen docks the summary

- **WHEN** the developer opens a draft holding issues in two groups
- **THEN** the area nav's Checks control carries the total count
- **AND** no third column stands beside the tab body

#### Scenario: The summary expands to the grouped list

- **WHEN** the developer presses the Checks control in the area nav
- **THEN** the Checks tab opens and lists both groups, in full

#### Scenario: A fix on the screen clears its own entry

- **WHEN** the developer corrects a field key the rail reports
- **THEN** that entry leaves the rail without a reload
- **AND** the area nav's count falls by one

#### Scenario: The two screens agree on the count

- **WHEN** the developer reads the area nav's count, then opens the Checks tab
- **THEN** that count equals the entry count the Checks tab lists

#### Scenario: A held-back group reaches the docked summary

- **WHEN** the process surface opens on a draft whose structural group holds
  back for want of a compiled body
- **THEN** the Checks control carries the held-back indicator
- **AND** it does not read as clear
