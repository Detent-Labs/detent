# spa-error-reporting Specification

## Purpose

Every SPA (`packages/web`,
the reporting area of `packages/web`) reaches the engine only over the HTTP wrapper, so every
screen has a request that can fail. This capability governs what the user sees
when one does: a named failure state instead of an empty result, an indefinite
`Loading…`, or a blank page. It covers the browser packages' rendering of
failure; the wire shape of the errors themselves belongs to `http-wrapper`.

## Requirements

### Requirement: A failed request is rendered as a failure, never as an empty result

Every screen in every browser package that loads or mutates data over HTTP
SHALL render a failure state when a request fails. A screen SHALL NOT rethrow
a non-401 error out of an async callback or a promise handler: the throw
becomes an unhandled rejection, no React error boundary can catch it, and the
screen renders as though the request had succeeded and returned nothing.

The 401 branch is unchanged: an unauthorized response SHALL continue to drive
the app's existing session-expiry path.

The failure state SHALL be rendered from the app's own message catalog, keyed
by the error's `type`, rather than from the server's `error.message` — the
server deliberately does not guarantee a client-presentable message, and for
an unexpected internal failure it sends none at all.

#### Scenario: A list screen during an outage says so

- **WHEN** a list screen's load fails because the engine is unreachable or
  answers 5xx
- **THEN** the screen renders an error state naming the failure, and does not
  render its empty-result text

#### Scenario: A 401 still drives session expiry

- **WHEN** any request answers 401
- **THEN** the app's unauthorized handler runs exactly as it does today, and
  no error state is rendered instead of it

#### Scenario: A failed mutation is reported

- **WHEN** an action (retry, discard, disable, cancel, save) fails with a
  non-401 error
- **THEN** the screen reports it rather than silently leaving the previous
  view

### Requirement: An empty state is conditioned on a successful load

Every "nothing here" message SHALL be rendered only when the request that
would have produced results completed successfully and returned none — that
is, gated on the absence of both a pending load and an error, not on the
result list being empty alone.

"No instances match these filters." and "No published versions yet." are
positive claims about the state of the system. Rendering them after a failed
request states something false, and does so on the two surfaces whose purpose
is to report system truth.

#### Scenario: An empty result still reads as empty

- **WHEN** a load succeeds and returns no rows
- **THEN** the empty-state message is shown, unchanged from today

#### Scenario: A failed load never reads as empty

- **WHEN** a load fails
- **THEN** the empty-state message is not shown, regardless of the fact that
  the result list is empty

### Requirement: A screen never renders a permanent loading state after a failure

A screen whose data model has a "loading" sentinel SHALL move to an explicit
error state when the load fails, and SHALL offer a way to retry or navigate
away. Leaving the sentinel in place renders an indefinite `Loading…` with no
indication that anything went wrong and no way forward.

#### Scenario: A failed load leaves the loading state

- **WHEN** a screen backed by a loading sentinel fails its initial load
- **THEN** it renders an error state rather than remaining in `Loading…`

#### Scenario: The user can act on the failure

- **WHEN** that error state is shown
- **THEN** the screen offers a retry, or navigation away, rather than being a
  dead end

### Requirement: Each browser package has an error boundary around its routed screen

Each browser package SHALL mount one React error boundary around its routed
screen, as a backstop for throws that happen during **render**.

The boundary is not a substitute for the per-screen handling above and SHALL
NOT be treated as one: React error boundaries do not catch throws from async
callbacks or promise handlers, which is where every current rethrow lives.

#### Scenario: A render-time throw shows a message, not a blank page

- **WHEN** a component throws while rendering
- **THEN** the boundary renders an error message in place of the screen,
  rather than the app unmounting to a blank page

#### Scenario: The boundary does not mask async failures

- **WHEN** an async load fails
- **THEN** it is handled by the screen's own error state; the boundary is not
  involved

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
