<!-- antislop: allow-file sentence-length run-ons passive-voice em-dash synonym-rotation -->

## MODIFIED Requirements

### Requirement: Anything that navigates is a real, focusable control


In every browser package, an element whose activation navigates the user
somewhere SHALL be a real interactive control — a `<button>` or an `<a href>`
— reachable in the tab order, operable with Enter (and Space, for a button),
and announced with an accessible name describing where it leads.

A click handler on a `<tr>`, `<li>` or `<div>` SHALL NOT be the only way to
reach a destination. Such an element is not focusable, is not announced, and
is inert to the keyboard, so the destination is unreachable without a pointer.

Where a row of data is the navigable unit, the control SHALL wrap the row's
identifying content rather than the row element, and the row-level click
handler SHALL be removed rather than retained alongside it — a row that is
clickable but not focusable is the state that hides this defect.

This currently blocks:

- opening **any** task in the app area, which is the whole purpose of that
  app — WCAG 2.1.1 Keyboard, Level A;
- drilling into any instance or timer in the admin area.

#### Scenario: A participant opens a task with the keyboard

- **WHEN** a keyboard-only user tabs through the task list in the app area
  and presses Enter on a task
- **THEN** that task's screen opens, exactly as a pointer click opens it

#### Scenario: An operator drills into a row with the keyboard

- **WHEN** a keyboard-only user tabs through the instance list or the timer
  list in the admin area and activates a row
- **THEN** that row's detail opens

#### Scenario: A screen reader announces the destination

- **WHEN** focus reaches a row's control
- **THEN** it is announced as a control with a name identifying the row it
  opens, not as undifferentiated text

#### Scenario: A focus indicator is visible

- **WHEN** a control receives keyboard focus
- **THEN** a visible focus indicator is rendered — a focusable control with no
  focus style is operable but unusable

