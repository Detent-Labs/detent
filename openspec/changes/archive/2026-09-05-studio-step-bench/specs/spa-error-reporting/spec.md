## MODIFIED Requirements

### Requirement: The studio edit screen makes a failure perceivable and announced

Rendering a failure message is not the same as reporting it. A message the
developer cannot pick out of the screen reports nothing. One that no screen
reader announces reports nothing to a blind user.

This requirement binds the studio edit screen's own chrome. That means the
process header bar, the two failure paragraphs `EditScreen.tsx` renders
directly, and the canvas ribbon's bar.

Every other component that screen mounts keeps the rule above. So does every
other screen in `packages/web`. That rule asks a screen to render a failure,
and says nothing about the shape. A named follow-up carries this one further;
proposal.md records it.

Every failure state the edit screen renders SHALL carry an ARIA live
announcement, through `role="alert"` or an equivalent live region. A message
that appears after the developer acted is the exact case that rule exists
for.

Every failure state on that screen SHALL render as a block of its own, apart
from the content around it. It SHALL NOT render as one inline item inside a
row of status badges, labels or controls. Color alone SHALL NOT be what
separates it from its neighbours. Color alone also fails the developers who
cannot see it.

The edit screen SHALL render every one of its failures in the same shape.
One measurement stands behind that rule. That screen renders a failed load as
a bordered alert banner with a stamp. It renders a failed save, discard or
publish as a bare colored paragraph. That paragraph sits inside a wrapping
flex row of ten badges. The second shape reached the DOM and reached nobody.

Four further paragraphs on that screen take the second shape:

- the save conflict
- the missing form step
- the absent draft
- the failed diff load of the panels screen's Changes view

<!-- Why: "edit screen" names a screen; a change is a draft mutation. -->
<!-- antislop: allow synonym-rotation -->
The dock hosted that fourth paragraph until now. The Changes view hosts it
today, on the panels screen. The rule follows the paragraph rather than the
host, so the shape it must take does not move.

When a modal dialog is open, the failure SHALL render inside that dialog
rather than behind it. A modal puts everything behind it out of reach, so the
developer can neither read nor dismiss a banner there.

#### Scenario: Assistive technology announces a failed mutation

- **WHEN** a save, discard or publish on the edit screen fails, and the
  failure is not a 401
- **THEN** the failure renders in a live region that assistive technology
  announces without the developer moving focus

#### Scenario: A failure does not render as one more badge

- **WHEN** the edit screen's failure message renders beside its row of
  status badges and controls
- **THEN** it renders as its own block, distinguished by more than its color

#### Scenario: The edit screen uses one failure shape

- **WHEN** the edit screen renders any one of its failure states
- **THEN** each one renders in the same alert banner shape as the others

#### Scenario: The Changes view's failed diff load takes that shape

- **WHEN** the panels screen's Changes view fails to load its base version
- **THEN** the failure renders in the same alert banner shape, in a live
  region

#### Scenario: A failure under an open modal renders inside it

- **WHEN** a request fails while the publish or discard dialog is open
- **THEN** the failure renders inside that dialog, not behind it
