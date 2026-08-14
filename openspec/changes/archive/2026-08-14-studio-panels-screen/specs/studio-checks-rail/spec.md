## ADDED Requirements

### Requirement: The rail lists in full on the panels screen

The panels screen SHALL show the rail's grouped list, in the third of
its three columns. The rail shows that same state on the canvas, when
the developer has selected nothing.

The rail SHALL NOT collapse to its one-line summary here. The collapse
rule exists because a selection takes the third column for an
inspector. The panels screen carries no selection and no inspector.

The rail SHALL report the same issues it reports on the canvas. Both
screens read one `validation.issues[]`, so a count on one and a count
on the other cannot disagree.

This placement is the reason the screen exists. An author on it edits
field keys and data source keys. Those two produce most of what the
rail reports, and a rail behind a backdrop reports to nobody.

#### Scenario: The panels screen shows the grouped list

- **WHEN** the developer opens the panels screen on a draft holding
  issues in two groups
- **THEN** the third column lists both groups, in full

#### Scenario: The rail does not collapse without a selection

- **WHEN** the developer opens the panels screen
- **THEN** the rail shows its grouped list, not its one-line summary

#### Scenario: A fix on the screen clears its own entry

- **WHEN** the developer corrects a field key the rail reports
- **THEN** that entry leaves the rail without a reload

#### Scenario: The two screens agree on the count

- **WHEN** the developer reads the rail on the panels screen, then
  returns to the canvas with nothing selected
- **THEN** both list the same entries
