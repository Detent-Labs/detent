# Spec Delta

## ADDED Requirements

### Requirement: A modal dialog holds the keyboard until it closes

Tab and Shift+Tab SHALL move the focus among a modal dialog's own controls and wrap at both ends. The focus SHALL NOT reach the document body or the page behind. A Tab pressed with the focus outside the dialog's controls, as after a click on its text, SHALL land on a control of the dialog. A control inside a closed Developer view SHALL NOT be a stop.

#### Scenario: Tab from Cancel wraps

- **WHEN** a dialog opens with Cancel focused, as its last control, and the author presses Tab
- **THEN** the dialog's first control holds the focus
- **AND** the focus never stands on the document body

#### Scenario: Shift+Tab from the first control wraps

- **WHEN** the dialog's first control holds the focus and the author presses Shift+Tab
- **THEN** Cancel holds the focus

#### Scenario: A click on the dialog's text keeps the hold

- **WHEN** the author clicks a fact's text and then presses Tab
- **THEN** the dialog's first control holds the focus

#### Scenario: A closed Developer view holds no stop

- **WHEN** the Publish dialog opens with its Developer view closed
- **THEN** Tab stops on the view's summary and not on anything inside it

### Requirement: A modal dialog returns the focus when it closes

Every close route that keeps the opener on the page SHALL return the focus to the control that opened the dialog. Those routes are Cancel, Escape and a confirm that leaves the opener in place. A confirm that removes the opener SHALL place the focus on a named control, never on the document body. A press on the backdrop SHALL close nothing.

#### Scenario: Escape returns the focus

- **WHEN** an author opens the publish dialog by keyboard and presses Escape
- **THEN** the dialog closes and the Publish control holds the focus

#### Scenario: The start picker and the import preview return the focus

- **WHEN** an author cancels the start picker or the import preview
- **THEN** the control that opened it holds the focus

#### Scenario: A request that drops the focus gets it back

- **WHEN** a confirm runs, both controls disable, and the engine refuses the act
- **THEN** the dialog stays open and Cancel holds the focus

#### Scenario: A backdrop press changes nothing

- **WHEN** an author presses the backdrop of an open dialog
- **THEN** the dialog stays open

### Requirement: A modal dialog states its name and description

A modal dialog SHALL name itself through `aria-labelledby` on its heading. It SHALL carry `aria-describedby` pointing at its body, the facts and notes between the heading and the controls. A refusal SHALL stand outside that description and carry `role="alert"`.

#### Scenario: A screen reader hears the facts

- **WHEN** the discard dialog opens
- **THEN** its accessible name is its heading
- **AND** its accessible description holds the process and the note on published versions

#### Scenario: A refusal reads once

- **WHEN** a discard is refused inside the dialog
- **THEN** the reason sits in an alert outside the dialog's description
