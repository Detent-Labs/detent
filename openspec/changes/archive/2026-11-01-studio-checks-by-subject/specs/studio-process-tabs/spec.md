# Spec Delta

## ADDED Requirements

### Requirement: A check's Fix control lands on its place on Steps

A row on the Checks tab SHALL carry one Fix control. A press on a step's issue
SHALL open the Steps tab on that step, with the owning section open. A way out,
a time limit or an action SHALL open its owning section on its step. An issue
on the step's name, description or kind SHALL open the step alone. Leaving
Checks SHALL drop the rail's narrowing.

#### Scenario: A step's assignment check opens Who acts

- **WHEN** an author presses Fix on a check about a step's assignment
- **THEN** the Steps tab is the open one
- **AND** the step page stands on that step, with Who acts open

#### Scenario: A way out's check marks its row

- **WHEN** an author presses Fix on a check about a way out
- **THEN** the step page stands on the step the way out leaves, with Ways out open
- **AND** that way out's row reads as selected

#### Scenario: A time limit's check opens Time limit

- **WHEN** an author presses Fix on a check about a time limit
- **THEN** the step page stands on that step, with Time limit open

#### Scenario: A first-step check opens the Steps tab

- **WHEN** an author presses Fix on the check that no step comes first
- **THEN** the Steps tab is the open one

### Requirement: A check's Fix control lands on its place on Fields

An issue on a field SHALL open the Fields tab's Catalog view with that field
selected. More SHALL open where the check stands inside it. An issue on a data
source SHALL open the Where values come from view with that source selected.

#### Scenario: A field's check selects the field and opens More

- **WHEN** an author presses Fix on a field's validation check
- **THEN** the Fields tab's Catalog view is open with that field selected
- **AND** More stands open

#### Scenario: A data source's check opens its view on Fields

- **WHEN** an author presses Fix on a data source's check
- **THEN** the Fields tab is open on Where values come from, with that source
  selected

### Requirement: A check's Fix control lands on the process's own places

An issue on the contract SHALL open the Settings tab's What it takes in and
gives back view. An issue on the process's key or base language SHALL open the
Settings tab's Process view. An issue on the process's name SHALL stay on the
open tab. An issue whose sentence names the JSON surface SHALL open it. Each
sentence's rule SHALL name its place, so the two cannot disagree.

#### Scenario: A contract's check opens its Settings view

- **WHEN** an author presses Fix on a contract check
- **THEN** the Settings tab is open on What it takes in and gives back

#### Scenario: A machine-only check opens the JSON surface

- **WHEN** an author presses Fix on a check about two steps sharing one id
- **THEN** the JSON surface stands open

#### Scenario: A duplicate field key opens Fields

- **WHEN** an author presses Fix on the check that two fields share one key
- **THEN** the Fields tab's Catalog view stands open

### Requirement: A Fix control moves focus to the place

A press on Fix SHALL move keyboard focus to the place it opened. The
scenarios below name each place. Focus SHALL NOT fall to the page body. The opened tab
SHALL take focus where no finer place exists, and it SHALL carry
`tabindex="0"`. A later tab switch SHALL NOT pull focus back.

#### Scenario: Focus lands on the section header

- **WHEN** a keyboard user presses Fix on a check about a step's assignment
- **THEN** keyboard focus stands on the Who acts header

#### Scenario: Focus lands on the key input

- **WHEN** a keyboard user presses Fix on a check about a step's key
- **THEN** More and its Developer view stand open
- **AND** keyboard focus stands in the key input

#### Scenario: Focus lands on the Name input

- **WHEN** a keyboard user presses Fix on a step's name check
- **THEN** keyboard focus stands in that step's Name input

#### Scenario: Focus lands on a field's sentence

- **WHEN** a keyboard user presses Fix on a field's check
- **THEN** keyboard focus stands on that check's sentence on the field card

#### Scenario: A process name check focuses the name

- **WHEN** a keyboard user presses Fix on the process's name check
- **THEN** the Checks tab stays the open one
- **AND** keyboard focus stands on the name input in the header bar
- **AND** a later press on the Steps tab leaves focus on the Steps tab

#### Scenario: A JSON check focuses the JSON input

- **WHEN** a keyboard user presses Fix on a check about an internal id
- **THEN** keyboard focus stands on the JSON surface's input

#### Scenario: A contract check moves focus onto its tab

- **WHEN** a keyboard user presses Fix on a contract check
- **THEN** keyboard focus stands on the Settings tab in the tab row

## MODIFIED Requirements

### Requirement: A structurally invalid draft's banner carries the refusal color

Where the loaded draft fails structural validation, its warning banner
SHALL take `colors.refusal`. That is the color the Checks tab's blocked
count already carries. Plain, uncolored text left that state reading no
differently from routine copy.

Two gaps SHALL NOT raise the banner on their own. One is the missing first
step of a draft with no step, the start state `studio-checks-rail` defines.
The other is the missing base-locale name of a draft that holds a step.
That gap reads as a sentence at the name. The banner SHALL stand only when the
draft carries some other Zod issue.

<!-- antislop: allow sentence-length -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
The banner SHALL stand below the header bar. It SHALL read one sentence that
says what to do and prints no engine word: no "Zod", no "CEL", no "registry". It
SHALL NOT stand while the Checks tab's body is open, where it only repeats the
list. The JSON surface stands in place of that body, so the banner stands there.

This banner SHALL NOT take the bordered, rotated stamp treatment. This
screen already reserves that treatment for a load or a request that comes
back wrong. That treatment marks a fixed, five-tone case vocabulary a
design decision alone extends. A structurally invalid draft joins the
plain-text signal family instead.

<!-- antislop: allow synonym-rotation -->
<!-- Copied from the live spec; "failure" names a failed request, the case this paragraph sets apart from a Zod issue. -->
`spa-error-reporting` binds this screen's failure states to one banner
shape. That capability's own Purpose scopes it to a request that fails.
This banner reports a validation state of the draft body rather than a
failed request. So that one-shape rule does not reach it.

#### Scenario: A structurally invalid draft's banner carries the refusal color

- **WHEN** the loaded draft fails structural validation on a Zod issue
  other than the two start gaps
- **THEN** its banner takes `colors.refusal`
- **AND** it does not take the bordered stamp treatment
- **AND** it stands below the header bar
- **AND** it names no check kind

#### Scenario: A structurally valid draft shows no such banner

- **WHEN** the loaded draft passes structural validation
- **THEN** no such banner stands

#### Scenario: A fresh empty draft shows no banner

- **WHEN** an author opens a draft the empty choice just seeded
- **THEN** no banner stands

#### Scenario: An unnamed draft with a step shows no banner

- **WHEN** the loaded draft holds one named end step, and its only Zod
  issue is the missing base-locale name
- **THEN** no banner stands
- **AND** the name sentence stands beside the name in the header bar

#### Scenario: Another Zod issue keeps the banner on a draft with no step

- **WHEN** a draft with no step also carries a Zod issue of another kind
- **THEN** the banner stands

#### Scenario: A new task step with no name or way out keeps the banner

- **WHEN** an author adds a first task step that has no name and no way out
- **THEN** the banner stands, since those two gaps lie outside the start
  gaps

#### Scenario: The banner stands over the JSON surface

- **WHEN** the JSON surface stands open from the Checks tab on an invalid draft
- **THEN** the banner stands

#### Scenario: The banner leaves the Checks tab

- **WHEN** a structurally invalid draft stands on the Checks tab
- **THEN** no such banner stands
- **AND** it stands again on the Steps tab

### Requirement: A focused tab rests whole in the tab row's view

A tab that takes focus from an arrow key SHALL stand whole in view. So SHALL
a tab that takes focus from a Fix control's or a Read by row's hand-off. So
SHALL a tab that takes keyboard focus from the Tab key.

#### Scenario: A row command's focus hand-off lands the tab in view

- **WHEN** the tab row stands at its end in a window 400px wide
- **AND** a keyboard user presses Fix on a row about a contract
- **THEN** keyboard focus stands on the Settings tab
- **AND** the Settings tab stands whole in view, clear of the edge fade

#### Scenario: An arrow key lands the focused tab in view

- **WHEN** a keyboard user at 400px focuses the Steps tab and presses the
  right arrow key three times
- **THEN** keyboard focus stands on the Checks tab
- **AND** the Checks tab stands whole in view, clear of the edge fade

#### Scenario: The Tab key lands the open tab in view

- **WHEN** an author at 400px scrolls the open Forms tab partly past the
  row's trailing edge
- **AND** a keyboard user presses the Tab key from the control before the row
- **THEN** keyboard focus stands on the Forms tab
- **AND** the Forms tab stands whole in view, clear of the edge fade

## REMOVED Requirements

<!-- antislop: allow sentence-length -->
<!-- Why: the heading repeats the live spec's wording, which a REMOVED block must match. -->
### Requirement: A check opens the tab that owns its subject
**Reason**: The press now lands on the section, and a process-level issue no longer stays on Checks.
**Migration**: The three "A check's Fix control lands on" requirements state each landing.

<!-- antislop: allow sentence-length -->
<!-- Why: the heading repeats the live spec's wording, which a REMOVED block must match. -->
### Requirement: A check opening another tab moves focus onto that tab
**Reason**: Focus now lands on the place, and on the tab only where no finer place exists.
**Migration**: "A Fix control moves focus to the place" states each target.
