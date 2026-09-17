## MODIFIED Requirements

### Requirement: A disclosure is a button that carries its expanded state

An element that expands or collapses adjacent content SHALL be a
`<button type="button">` carrying `aria-expanded` reflecting its current
state and `aria-controls` naming the element it discloses.

The studio's step cards carried this defect: a click-handling `<div>` header
no keyboard could open. The rail in `StepsRail.tsx` replaced those cards. Its
rows are buttons that open a step page, and the current row carries
`aria-current`. A grip at each row's trailing edge drags the step, and
answers `Alt+ArrowUp`/`Alt+ArrowDown`. No row in the rail expands.

The step page stands every section open, so no section heading discloses
anything. Two disclosures remain on the step page, and both read "Developer
view". The step's own read-only JSON stands behind a native `<details>` pair.
The browser supplies its button role, its keyboard operation and its state
announcement. This requirement governs a disclosure a package builds itself. A
native pair stays outside it.

A path's guard editor carries the second, one toggle per automatic path. The
studio builds that button itself, so this requirement governs it. It carries
`aria-expanded` and no `aria-controls`. That gap predates this change and
stays open.

On the Changes tab and the Versions screen, the change list folds each row into
a native `<details>` pair. A row's own Developer view is a
second native pair inside the row. Both stay outside this requirement, as the
step page's pair does. The list's Expand all command is a button the studio
builds itself, so this requirement governs it. It carries `aria-expanded`, true
while every row stands open, and `aria-controls` naming the list.

#### Scenario: A steps rail row selects rather than discloses

- **WHEN** a keyboard user tabs to a row in the steps rail and presses Enter
  or Space
- **THEN** that step's page opens, and no rail row carries `aria-expanded`

#### Scenario: A native disclosure sits outside this requirement

- **WHEN** focus reaches the `<summary>` over the step page's read-only JSON
- **THEN** Enter toggles it, and a screen reader reads its open state from the
  native `<details>` pair

#### Scenario: The change list's Expand all command carries its expanded state

- **WHEN** a change list stands with every row folded
- **THEN** its Expand all command carries `aria-expanded="false"`
- **AND** its `aria-controls` names the element holding the rows
