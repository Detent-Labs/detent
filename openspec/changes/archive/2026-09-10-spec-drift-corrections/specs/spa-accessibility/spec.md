## REMOVED Requirements

### Requirement: A disclosure is a button carrying its expanded state

**Reason**: Both of its scenarios test a step card that expands, and no
package renders that card any more. The rail in `StepsRail.tsx` replaced the
cards, and its rows select a step instead. A scenario is the testable half of
a requirement, so a stale scenario pair is worse than a stale name. Replaced
by the requirement below. That one carries the same SHALL sentence, a note
matching the tree, and two scenarios the components answer.

**Migration**: None. The rule holds unchanged, and the delta below restates
it word for word. Only the note and the two scenarios change.

## ADDED Requirements

### Requirement: A disclosure is a button that carries its expanded state

<!-- Copied byte for byte from the requirement this change removes. -->
An element that expands or collapses adjacent content SHALL be a
`<button type="button">` carrying `aria-expanded` reflecting its current
state and `aria-controls` naming the element it discloses.

The studio's step cards carried this defect: a click-handling `<div>` header
no keyboard could open. The rail in `StepsRail.tsx` replaced those cards. Its
rows are buttons that open a step page, and the current row carries
`aria-current`. Its two chevrons reorder a step. No row in the rail expands.

The step page stands every section open, so no section heading discloses
anything. Two disclosures remain, and both read "Developer view". The step's
own read-only JSON stands behind a native `<details>` pair. The browser
supplies its button role, its keyboard operation and its state announcement.
This requirement governs a disclosure a package builds itself. A native pair
stays outside it.

A path's guard editor carries the second, one toggle per automatic path. The
studio builds that button itself, so this requirement governs it. It carries
`aria-expanded` and no `aria-controls`. That gap predates this change and
stays open.

#### Scenario: A steps rail row selects rather than discloses

- **WHEN** a keyboard user tabs to a row in the steps rail and presses Enter
  or Space
- **THEN** that step's page opens, and no rail row carries `aria-expanded`

#### Scenario: A native disclosure sits outside this requirement

- **WHEN** focus reaches the `<summary>` over the step page's read-only JSON
- **THEN** Enter toggles it, and a screen reader reads its open state from the
  native `<details>` pair
