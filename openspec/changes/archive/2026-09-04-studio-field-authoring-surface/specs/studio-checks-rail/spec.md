## REMOVED Requirements

### Requirement: The rail lists in full on the panels screen

**Reason**: The requirement stood the grouped list in a column of its own on
the panels screen. This change gives that column's width to the open view. It
docks the one-line summary instead. The requirement's two scenarios assert the
standing column, so both state what the screen no longer does.

**Migration**: "The rail docks its collapsed summary on the panels screen"
is the requirement this change adds. It keeps every other rule. Those are the
same issues, the same count as the canvas, and the grouped list one
activation away. An author on the panels screen chooses the summary once and
sees the same groups.

### Requirement: The rail adds a consolidated view; it does not replace per-entity issue placements

**Reason**: The requirement placed a field's own `IssueList` above the field
editor's tab set. It named the Rules tab as the reason. This change deletes
the tab set. The requirement's second scenario asserts that placement on the
Values tab, so it names a tab that no longer exists.

**Migration**: "The rail adds a consolidated view; a field's checks stand at
their zones" replaces it. The rail's own role does not change: `IssueList`
keeps every other per-entity placement. The rail stays one more consolidated
view over the same `validation.issues[]`. What changes is where a field's own
check stands. The `studio-app` capability states the zone rule.

## ADDED Requirements

### Requirement: The rail adds a consolidated view; a field's checks stand at their zones

`IssueList` SHALL keep rendering its existing per-entity views. Those
views sit under the process header, on a step card, and on a path row.
The checks rail is one more consolidated view over the same
`validation.issues[]` array. It does not replace those placements.

The Fields view is the one placement that changes. A field's own check
SHALL stand at the zone the check names, per the `studio-app`
capability's zone requirement. The view SHALL mount no `IssueList`
gathering that field's checks in one place.

The reason the old placement existed still holds, and the zone rule
answers it. A check inside one tab hid whenever the author opened
another tab. Zones open none, so no check hides.

#### Scenario: An issue shows in both its entity placement and the rail

- **WHEN** a path guard carries a CEL issue
- **THEN** that issue shows in the path's own `IssueList` placement and
  in the checks rail's CEL group

#### Scenario: A field's check shows at its zone and in the rail

- **WHEN** a field carries a validation issue
- **THEN** the check shows in the definition half's "Validation" zone,
  and the docked summary counts it

#### Scenario: No zone hides a field's check

- **WHEN** a field carries checks naming two different zones
- **THEN** both checks show at once, and neither waits on the author
  opening anything

### Requirement: The rail docks its collapsed summary on the panels screen

The panels screen SHALL dock the rail's one-line summary at the screen's
bottom edge. It SHALL NOT stand the grouped list in a column of its own.

The `collapsed` form is the one to mount here. That form exists and serves
two sites today. One of them docks at the bottom edge of the canvas
inspector, per the collapse requirement above. No new component comes about.
The summary keeps every rule that requirement states. Those are the single
count, the held-back indicator, and the refusal to read as clear while a
group holds back.

Choosing the summary SHALL expand the grouped list in place, over the screen.
The list SHALL then show the same groups it shows on the canvas.

The rail SHALL report the same issues it reports on the canvas. Both screens
read one `validation.issues[]`, so a count on one and a count on the other
cannot disagree.

A check belonging to one entity SHALL also stand at that entity's own place
in the open view. The `studio-app` capability states where. This rail carries
the draft-wide roll-up and the publish gate. It is not the only place an
author reads a field's own finding.

The standing column this requirement asked for is gone. Its width goes to the
open view. The column came about because a `<dialog>` once covered the rail;
the reason was visibility while editing, not the column itself. A docked
summary keeps that visibility and returns the width.

#### Scenario: The panels screen docks the summary

- **WHEN** the developer opens the panels screen on a draft holding issues in
  two groups
- **THEN** a one-line summary sits at the screen's bottom edge, carrying the
  total count
- **AND** no third column stands beside the open view

#### Scenario: The summary expands to the grouped list

- **WHEN** the developer chooses the docked summary on the panels screen
- **THEN** the grouped list opens in place and lists both groups, in full

#### Scenario: A fix on the screen clears its own entry

- **WHEN** the developer corrects a field key the rail reports
- **THEN** that entry leaves the rail without a reload

#### Scenario: The two screens agree on the count

- **WHEN** the developer reads the summary on the panels screen, then returns
  to the canvas with nothing selected
- **THEN** the summary's count equals the entry count the canvas rail lists

#### Scenario: A held-back group reaches the docked summary

- **WHEN** the panels screen opens on a draft whose structural group holds
  back for want of a compiled body
- **THEN** the docked summary shows the held-back indicator, and it does not
  read as clear
