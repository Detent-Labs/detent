## 0. Design pass

- [ ] 0.1 Per `CLAUDE.md`, invoke `/frontend-design:frontend-design` before
  reshaping any of these components, and pull in `web-design-guidelines`,
  `vercel-react-best-practices` and `vercel-composition-patterns`
- [ ] 0.2 Decide the row treatment once for all three list surfaces: which
  cell carries the control, how hover moves from the row to the control, and
  what the focus-visible style is (none exists today)

## 1. Row navigation becomes a control

- [ ] 1.1 `packages/app/src/screens/TasksScreen.tsx:112` — wrap the task's
  identifying content in `<button type="button">`, remove the `<li>`
  `onClick`, keep the `<li>` as the list item it is
- [ ] 1.2 `packages/admin/src/screens/InstancesScreen.tsx:96` — same, with the
  control in the identifying `<td>`; remove the `<tr>` `onClick` and the
  `admin-row-clickable` behavior that depended on it
- [ ] 1.3 `packages/admin/src/screens/TimersScreen.tsx:79` — same
- [ ] 1.4 Give each control an accessible name that identifies the row, not a
  bare "Open" repeated down the page
- [ ] 1.5 Move the hover styling from the row to the control, and add the
  focus-visible style decided in 0.2

## 2. Disclosure headers

- [ ] 2.1 `packages/studio/src/panels/StepsPanel.tsx:110` — replace the
  `<div className="step-card-header" onClick>` with
  `<button type="button" aria-expanded={isOpen} aria-controls={bodyId}>`,
  deriving `bodyId` from the step id
- [ ] 2.2 Give the card body that `id`
- [ ] 2.3 Repeat in `packages/editor/src/panels/StepsPanel.tsx:99` if the
  editor still exists — same edit twice; skip only if it has been deleted
- [ ] 2.4 Confirm the add-step path still auto-expands the new step
  (`StepsPanel.tsx:65`), and that it now also moves focus sensibly

## 3. form-ui: required, invalid, described-by

- [ ] 3.1 Thread `aria-required` onto the control on every branch of
  `FieldForm.tsx:84-126`, from the resolved view's `required`
- [ ] 3.2 Thread `aria-invalid` from `issues.length > 0`
- [ ] 3.3 Add `aria-describedby` pointing at the issue list's id (the
  field id suffixed with `-issues`) when issues are present, and leave it
  undefined when there are none
- [ ] 3.4 Decide per branch whether the native `required` attribute is safe —
  it must not block a submission the engine is supposed to judge; default to
  `aria-required` only
- [ ] 3.5 Cover the group branch too: a group's members render through the
  same component and must not be exempt

## 4. form-ui: valid markup and localized messages

- [ ] 4.1 Move the `<ul>` out of the wrapping `<label>` (`FieldForm.tsx:129`)
  to a sibling, and give it the id `aria-describedby` references
- [ ] 4.2 Add a message catalog keyed by `issue.kind`, in `form-ui`, using the
  `locale` prop the component already takes — modelled on
  `packages/app/src/errors.ts::describeError`
- [ ] 4.3 Render the catalog message instead of `issue.kind`, falling back to
  the raw kind when no entry exists
- [ ] 4.4 Enumerate the `SubmissionIssue` kinds the engine can produce and
  write one message each; a missing kind is a gap, not a crash
- [ ] 4.5 Check `packages/form-ui`'s stylesheet: the issue list is no longer
  inside the label, so its selectors change

## 5. Canvas memoization

- [ ] 5.1 Wrap `autoPlaced` (`CanvasView.tsx:64`) and `nodePositions` (`:71`)
  in `useMemo` keyed on `[steps, initialStepId, layout]`
- [ ] 5.2 Do **not** add `React.memo` to the node/edge subtrees yet — profile
  a drag on a realistic process first and only then decide
- [ ] 5.3 If a profile does warrant it, extract the node `<g>` into a
  `React.memo` child taking `{step, x, y, isSelected, isInitial, isTerminal}`

## 6. Verification

- [ ] 6.1 Run `bun run typecheck` from the repo root and confirm it passes
- [ ] 6.2 Run the FULL `bun test` suite with `DATABASE_URL` set and confirm it
  passes — check the skip count, not only the pass count
- [ ] 6.3 Keyboard-only walkthrough of `packages/app`: tab from the inbox into
  a task, claim it, fill the form, submit — without touching the mouse
- [ ] 6.4 Keyboard-only walkthrough of `packages/admin`: instances list into
  an instance, timers list into a timer
- [ ] 6.5 Keyboard-only walkthrough of Studio's steps panel: expand and
  collapse an existing step
- [ ] 6.6 Screen-reader spot check on one form: the field's name is its label,
  its required state is announced, and its issues are announced as a
  description
- [ ] 6.7 Confirm a drag on the canvas still positions nodes correctly after
  memoization — a wrong dependency array shows up immediately as a node that
  does not move
- [ ] 6.8 Re-grep `tabIndex|onKeyDown|aria-required|aria-invalid|aria-describedby`
  across all packages and confirm the counts now reflect the work
