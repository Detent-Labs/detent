## Context

All four SPAs were built quickly and structurally, with the interesting logic
extracted into pure, tested modules and the React kept thin. The thin React is
where the accessibility went: a clickable `<tr>` or `<li>` is the shortest
possible way to make a row navigable, and nothing in the review loop caught
that it makes the app unusable without a mouse. The same is true of the
disclosure headers in both `StepsPanel`s.

`form-ui` is a different case. It is the deliberate shared seam — source-only,
no build, consumed by both `packages/app` and the editor Player, so what an
author previews is what a participant gets. That property makes it the highest
leverage file in the repo for this: one fix reaches every participant-facing
form. It is also where the omissions compound, because a form is exactly the
place a screen-reader user needs required/invalid state announced.

The canvas item is not an accessibility defect and is included only because it
lives in the same files the accessibility work touches. It is explicitly
unprofiled.

## Goals / Non-Goals

**Goals:**

- Every navigation and disclosure affordance is reachable by tab and operable
  by Enter/Space, in every browser package.
- A screen-reader user is told which fields are required, which are invalid,
  and what is wrong with them, in their language.
- The form markup is valid, so the accessible name of a control is its label
  and not its error text.

**Non-Goals:**

- A full WCAG audit or a conformance claim. This change fixes the named
  blocks; it does not certify anything, and no axe pass has been run on these
  apps.
- Making the canvas keyboard-operable as an authoring surface. The canvas is
  specified to introduce no operation unavailable through the panels, so the
  panels are the keyboard path by design. Making the *panels* operable is in
  scope; making drag-to-connect keyboard-drivable is not.
- Colour contrast, focus-ring design, motion, or any visual redesign. Where a
  focus style is needed because none exists, it is added minimally and the
  design skills decide how it looks.
- Localizing anything beyond the validation-issue messages this change
  introduces.
- Measuring or optimizing the canvas beyond the two `useMemo`s. If they are
  not enough, the next step is a profile, not more memoization.

## Decisions

**A real `<button>` inside the row, not `tabIndex`+`role`+`onKeyDown` on the
row.** Adding the three attributes to a `<tr>` reproduces a button badly:
Enter and Space must be handled separately, the announced role has to be
maintained by hand, and browsers give it no default focus affordance. Wrapping
the row's *identifying* cell — the process/step label, the timer's instance —
in a button gives all of that for free and matches the mental model: the row is
a record, the label is the link into it. The row-level `onClick` is removed
rather than kept as a convenience, because a row that is clickable but not
focusable is exactly the state that made this invisible.

**`<button type="button">` rather than `<a href>` for now.** These apps route
in memory (`navigate({name, id})`) and have no URL per instance to link to, so
an anchor would need a fabricated `href` and a click-prevented handler — worse
markup than a button. If the apps ever get real routes, the anchors are the
right upgrade and the change is local to these five call sites.

**The standard disclosure pattern for both `StepsPanel` headers.**
`<button type="button" aria-expanded={isOpen} aria-controls={bodyId}>` is the
established pattern, and `aria-expanded` is the part that matters: it is the
only way the collapsed/expanded state is announced. The body needs a stable
`id` derived from the step id, which both panels already have.

**Fix the editor's twin even though the editor is scheduled for deletion.**
It is the same edit twice, and leaving one half broken while
`studio-tools-and-player` is pending means an author using the documented
Player workflow still cannot use a keyboard. If the editor is already gone
when this lands, the work disappears with it.

**`form-ui` owns the issue-message catalog, not its consumers.** It already
takes `locale` as a prop and holds no locale state, so a catalog keyed by
`issue.kind` fits its existing contract. Putting it in the consumers would
duplicate it in `packages/app` and the Player — the exact duplication
`form-ui` exists to prevent — and would leave each consumer free to render a
different message for the same failure. Note that the `form-ui` spec already
describes the prop as carrying *messages*; the raw-discriminator rendering is
a drift from its own spec, not just an omission.

**`aria-describedby` on the control, issue list as a sibling of the label.**
The `<ul>` currently sits inside the `<label>`, which is invalid (label
permits phrasing content only) and folds the error text into the control's
accessible name — so a screen reader announces the label *and* the error as
one name, every time the control is focused. Moving the list out and
referencing it by id gives the correct behavior: the name stays the label, and
the description is announced as a description.

**`required` and `aria-required` both.** `required` alone changes browser
validation behavior, which this change should not do (the engine is the
validator, and a native browser block would prevent the submission the server
is supposed to judge). So: `aria-required` for announcement on every branch,
and the native `required` attribute only where it does not introduce native
blocking — decided per branch during implementation, defaulting to
`aria-required` only.

**Memoize the two expressions; extract the node subtree only if profiling
warrants.** `autoPlaced` and `nodePositions` are pure functions of
`[steps, initialStepId, layout]` and neither reads `nodeDrag`, so during a
drag they are recomputed for nothing — that part is certain without a
profiler. Whether the per-node `<g>` re-creation actually costs anything is
not, so `React.memo` on an extracted child is conditional on a measurement.
This is deliberately the smaller half of the review's recommendation.

## Risks / Trade-offs

- **Row markup changes affect table layout and hover styling** in the admin
  console; a button inside a `<td>` inherits none of the row's styling → The
  CSS work is real and is why this goes through the design skills. The
  functional requirement (focusable, operable, announced) is independent of
  how it ends up looking.
- **A focus-visible style is now load-bearing** where previously nothing was
  focusable → Adding one is part of the change; without it the fix is
  technically correct and practically unusable for a sighted keyboard user.
- **`form-ui` changes hit two consumers at once**, one of which
  (`packages/editor`'s Player) may be mid-deletion → That is the seam working
  as intended; both consumers render from the same component, so both are
  verified in the same pass.
- **A localized catalog adds a maintenance surface**: a new `issue.kind` in
  the engine now needs a message here → Correct and intended. A missing key
  should fall back to the raw kind rather than crash, so the failure mode of
  forgetting one is exactly today's behavior for that one kind.
- **Memoization can hide a stale-layout bug** if the dependency array is wrong
  → The dependencies are the function's entire input; a mistake shows up
  immediately as a node that does not move.
- **No axe pass, no screen-reader test in CI** → Out of scope, and stated so
  the change is not read as a conformance claim. Manual keyboard verification
  is in the tasks.

## Migration Plan

Purely client-side; no data, no API, no contract.

1. Land the design pass first (it decides the row/button and focus treatment),
   then the three navigation packages, then `form-ui`, then the canvas
   memoization.
2. `form-ui` last among the functional changes, because both its consumers
   must be walked after it.
3. Rollback is reverting; nothing persists.

## Open Questions

- Should the apps adopt real URLs per instance/task, which would turn these
  buttons into anchors and give back-button behavior for free? Bigger than
  this change and worth its own; noted because it is the natural next step and
  would supersede the button decision.
- Should `form-ui` also surface a form-level summary of issues whose
  `fieldId` matches no rendered field? Its spec currently makes that the
  consumer's responsibility, and both consumers implement it identically —
  a candidate for the same consolidation, but not part of an accessibility
  fix.
