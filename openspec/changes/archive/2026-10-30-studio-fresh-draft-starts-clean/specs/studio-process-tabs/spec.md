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

#### Scenario: A structurally valid draft shows no such banner

- **WHEN** the loaded draft passes structural validation
- **THEN** no such banner stands

#### Scenario: A fresh empty draft shows no banner

- **WHEN** an author opens a draft the empty choice just seeded
- **THEN** no banner stands above the header bar

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
