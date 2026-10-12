# Design

## Context

All five fixes sit in `packages/web/src/areas/studio/`. See `proposal.md` for the findings.

`ConditionInput` holds the builder's rows in local state. It writes through `commit`, which calls `onChange(undefined)` whenever `toCel` finds no complete row. The Fields tab's `writeVisible(undefined)` turns that call into a delete of `visible` in every referencing view. For a field whose steps disagree, `value` is `undefined`, so a row the author has only added already clears the views.

`literalOf` in `conditionLogic.ts` accepts `string | number | boolean`. The CEL parser returns an integer literal as `bigint`, and a negative literal as a `-_` node whose `args` is one node, not an array. `ruleLogic.ts` imports the same reader.

## Goals / Non-Goals

**Goals:**

- A condition site never loses a stored condition to an unfinished row.
- One builder footer carries the explicit clear.
- The reader and the writer agree on every type the builder offers.

**Non-Goals:**

- No change to `definition.ts`. A manual path's guard is already legal and already evaluated.
- No undo, and no confirm dialog. The label names the scope instead.
- No clear command at the path-guard and step-view sites. Removing the last row still clears there.
- No publish rule for a manual path's guard. The CEL check already covers every guard.

## Decisions

**Shape brief (`impeccable shape`, owner rulings 2026-10-10 and 2026-10-12).**

- Mode: operate. The audience is the process author, at the step page's Path to section and the Fields tab.
- The "Clear on <steps>" command is an authoring command: ghost button, slate, mono at 11px. It sits in the builder footer beside the CEL toggle. It shows only while the draft holds a condition or the views disagree. The label lists the step labels and wraps. It has no icon and asks no confirmation. The owner picked option A of the published mockup.
- The path row keeps one "Only when" fieldset for both triggers. A manual path shows one added note line in the existing note style. The note says the participant sees the button only while the condition holds. The guard input's hint reads "leave empty to always offer this path". The `priority` input stays automatic-only.
- The form preview prints one line per guarded manual path under the controls. The line holds the path label, then the condition in the canvas edge's words. The preview has no instance data, so it cannot hide the control.
- Anti-goals: no new color, no new weight, no tooltip that carries the only copy of a fact.

**1. The write rule lives in `ConditionInput.commit`.**
`commit` compares the new row count with the old one. It writes `undefined` only when a row was removed, no complete row is left, and a source is stored. In every other case that leaves no complete row, it keeps the new rows in local state and calls `onChange` not at all. `seededFrom` stays as it was, so the unfinished row survives the next render.
Alternative: pass the action kind from `ConditionBuilder` through `onChange`. Rejected: a row-count comparison keeps the builder's interface as it is.

**2. The readout shows the stored source while no row contributes.**
`preview` becomes `toCel(condition, operands) ?? src`. Without it, an unfinished edit would show "empty" above a guard that still stands.

**3. The clear command is a prop pair on `ConditionInput`.**
`clearLabel?: string` carries the label, and its presence shows the command. The Fields tab sets it from `fieldVisibleOverrides`: set when the state is `divergent`, or `uniform` with a value. Pressing the command calls `onChange(undefined)` and resets the local rows and `seededFrom`. In the divergent state `src` is `undefined` before and after the press, so the reset must be local.
Alternative: a separate button in `FieldCatalogPanel`, outside the footer. Rejected, because it would sit apart from the builder it clears, and option A put it in the footer.

**4. One trigger rule, in `draft/createPath.ts`.**
`triggerForNewPath(source)` returns `automatic` for a `subprocess` step, else the first path's trigger, else `manual`. `PathsPanel.addPath` and `CanvasView`'s connect drag both call it. The canvas had the sibling rule inline and no subprocess rule.

**5. The guard editor ignores the trigger; only `priority` depends on it.**
`PathsPanel` renders the `studioOnlyWhen` fieldset for both triggers. The trigger buttons write `{ trigger: "manual", priority: undefined }` and `{ trigger: "automatic" }`. `priority` is the one key the invariants tie to automatic paths, so it is the one key a switch drops.
Alternative: drop `guard` and `priority` on the switch, as the audit's second suggestion said. Rejected by the owner ruling, since a manual path may carry a guard.

**6. The canvas draws a guard label for any guarded path.**
`guardLabel` drops its `automatic` condition. The priority badge and the "else" marker keep theirs. The accessible name already carries the guard for any trigger (`studio-canvas`, "A path is a focusable control"), and a test confirms it.

**7. Read-back and write fixes sit in `conditionLogic.ts`.**
`literalOf` reads `bigint` as `Number(v)` while `Number.isSafeInteger` holds. It reads a `-_` node whose `args` is a `value` node as the negated number, to any depth. The nested case `--5` folds twice. `celLiteral` writes a `double` as `String(n)` when that text holds an `e`, else `${n}.0` for an integer value. For an `int` it requires `Number.isSafeInteger`. A test per type writes a literal, reads the text back through `fromCel`, and expects the same row.
The reader reads `data.amount > 3` on a `double` operand as a row, and the next author action writes `3.0`. The spec already allows that kind of rewrite for a single-quoted string. Mounting still writes nothing.

**8. The boolean select gains an empty option.**
Both `ConditionBuilder` and `RuleBuilder` show the value `""` for an undefined value. They map `""` back to `undefined`, as the option-list select next to it does. Choosing "No" from the empty choice then fires a change.

## Risks / Trade-offs

- [A kept condition sits beside an unfinished row] → The readout shows the kept source. The row carries the incomplete mark. A remount re-reads the kept text.
- [The clear label grows with the number of steps] → The footer already wraps. A field used on many steps gets a long label, and the scope stays readable.
- [Removing the last row at a view-override site still clears every referencing view] → That matches today's behavior for agreeing views. Only the divergent state needed the new rule.
- [The form preview line adds copy to an inert pane] → The line sits inside the existing `inert` body. It takes no focus and creates no tab stop.
- [A guarded manual path hides its button at runtime] → That is the owner-approved behavior. The canvas, the preview and the Paths tab now show it.
