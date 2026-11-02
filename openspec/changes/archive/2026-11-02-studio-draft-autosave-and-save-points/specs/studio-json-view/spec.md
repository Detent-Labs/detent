<!-- antislop: allow-file sentence-length passive-voice negation-habit trailing-negation long-words synonym-rotation em-dash run-ons -->
<!-- Why: the MODIFIED block copies the live spec's older text word for word. -->

## MODIFIED Requirements

### Requirement: The edit screen offers a JSON surface alongside Structure

The process surface (`/processes/:id/edit`) SHALL offer a JSON surface. An
author opens it from the header bar's `⋮` menu, or through a check's Fix
control. No Structure control and no
JSON control SHALL stand beside the header bar any more. The JSON entry
lives inside that menu, instead of as a separate toggle beside it.

The tab body covers every component that changes the draft body. That includes
the process header, the field catalog, the data sources and the contract. It
also includes the canvas, the step page, and the paths, timers and actions
sections. The JSON surface prints the draft body it currently holds as
pretty-printed JSON text.

The process surface SHALL keep only one of the two visible at a time. Only the
visible one SHALL accept interaction. No component that changes the draft body
SHALL be reachable while the JSON surface stands open. No control from the JSON
surface SHALL be reachable while a tab stands open.

The header bar menu's JSON entry SHALL name its own state. An author reads
from it whether the entry opens the JSON surface or leaves it.

`useDraftToolbarActions` (publish, discard) changes no draft body. Its
controls SHALL stay usable whichever of the two stands open. The content-locale
switcher stands on the Settings tab, so it hides with that tab. The JSON surface
prints every language at once and reads no content locale.

#### Scenario: Switching to the JSON surface shows the current draft

- **WHEN** the developer picks the JSON entry in the header bar's `⋮` menu
- **THEN** the JSON surface prints the draft's current body, pretty-printed
- **AND** no tab body remains reachable

#### Scenario: Switching back to Structure reflects the current draft

- **WHEN** the developer picks the same header-bar-menu entry a second time
- **THEN** the tab that stood open before prints the draft state the store
  currently holds
- **AND** that state carries any JSON edit already applied

<!-- antislop: allow negation-habit -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
#### Scenario: The header bar carries no surface pair

- **WHEN** the developer reads the header bar's row without opening its `⋮`
  menu
- **THEN** no Structure control and no JSON control stand there directly
- **AND** opening the `⋮` menu is what reaches the JSON entry

#### Scenario: The draft's commands stay over the JSON surface

- **WHEN** the JSON surface stands open
- **THEN** Publish stands in the header bar, and Discard draft in its `⋮` menu
- **AND** no content-locale control stands in the header bar

#### Scenario: A Fix control opens the surface

- **WHEN** an author presses Fix on a check whose sentence names the JSON surface
- **THEN** the JSON surface stands open in place of the tab body
- **AND** the check's sentence stands above the input
- **AND** keyboard focus stands on its input

#### Scenario: A tab press leaves the surface

- **WHEN** an author presses a tab while the JSON surface stands open with no
  unapplied text
- **THEN** the JSON surface leaves and that tab's body stands open

## ADDED Requirements

### Requirement: Unapplied JSON counts as unsaved work

The JSON surface's text SHALL count as unsaved work while it differs from its seed or its last Apply. The state line SHALL then read "Unsaved changes", and a tab close SHALL prompt. No save SHALL run, since the draft does not hold the text.

An exit SHALL ask in the leave dialog with no flush. A tab press and each menu entry that leaves the surface SHALL ask the same dialog. A successful Apply, or the text back at its seed, SHALL clear this. The Publish dialog SHALL note what it leaves out.

#### Scenario: Unapplied text reads as unsaved and sends nothing

- **WHEN** an author changes the JSON surface's text and presses no Apply
- **THEN** the state line reads "Unsaved changes", in the refusal tone
- **AND** closing the tab prompts
- **AND** no `PUT /drafts/:processId` leaves

#### Scenario: An exit asks with no flush

- **WHEN** an author presses the back control over unapplied text
- **THEN** the leave dialog opens at once and no save request leaves
- **AND** its body reads "The JSON you have not applied goes with it. The saved draft stays."
- **AND** its heading reads "Leave without applying?" and its confirm "Leave without applying"

#### Scenario: A tab press or the menu asks first

- **WHEN** an author presses a tab, or the menu's entry that leaves the surface, over unapplied text
- **THEN** the same dialog opens
- **AND** Cancel keeps the surface and the text

#### Scenario: Confirming drops the text alone

- **WHEN** an author applied a change, typed more, and confirms the dialog at an exit
- **THEN** the typed text goes and the applied change still saves

#### Scenario: A successful Apply clears the state

- **WHEN** an author presses Apply on text that parses
- **THEN** the state line follows the draft again and a tab press leaves with no question

#### Scenario: A refused Apply keeps the state

- **WHEN** an author presses Apply on text that does not parse
- **THEN** the state line still reads "Unsaved changes"

#### Scenario: Text back at its seed clears the state

- **WHEN** an author types the text back to what the surface opened with
- **THEN** the state line follows the draft again, and closing the tab does not prompt

#### Scenario: The Publish dialog says what it leaves out

- **WHEN** an author presses Publish over unapplied text
- **THEN** the dialog adds the note "The JSON you have not applied is not part of this publish."
