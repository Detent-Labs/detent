## 1. The reason's own place

- [x] 1.1 Drop `publishReason`'s absolute block. Keep its 11px uppercase
  register.
- [x] 1.2 Render the line as the cluster's leading item, so the cluster's own
  auto-margin holds every control still.
- [x] 1.3 Restore `publishBlockedReason`, the refusal tone the blocked reason
  carries over the shared register.

## 2. The control and the line

- [x] 2.1 Drop the `role="group"` wrapper. The control returns its button
  alone, keeping `aria-describedby` and the id constant.
- [x] 2.2 Add `PublishReasonLine`, reading `publishAvailability` itself and
  rendering the reason or nothing.
- [x] 2.3 Measure Publish's trailing edge across thirteen widths, in both
  reason states. It holds 69px from the viewport's.

## 3. Tests

- [x] 3.1 Split the cases that read the reason out of the control's markup.
  Render both components and compare across the two.
- [x] 3.2 Assert the id reference between them, so the split cannot break the
  binding in silence.
- [x] 3.3 Assert the blocked line's class differs from the permission line's,
  and that a clear draft renders no line.
- [x] 3.4 Assert the placement: one `<div>` opens between the reason and
  Save, in both reason states.

## 4. Docs

- [x] 4.1 Rewrite the `docs/browser-checks.md` entry. Its pass condition
  reads a red line beneath the button today.
- [x] 4.2 State the new pass condition. The line reads on the row, no
  control moves, and the bottom border stays whole.
- [x] 4.3 Confirm `docs/authoring-guide.md` states no rule this change
  touches. Report the grep either way.

## 5. Verification

- [x] 5.1 Run `bun run typecheck`, then `bun run build`. Report what each
  printed.
- [x] 5.2 Run the full `bun test` with `DATABASE_URL` set. Report the pass
  count and the skip count.
- [ ] 5.3 Run the prose gate over the pushed range, per `CLAUDE.md`. A gate
  reads a commit range, so this waits for the commit.
- [ ] 5.4 Run the whitespace gate over the same range, piped in the same
  way. It waits for the commit too.
- [x] 5.5 Open a blocked draft in a real browser. Confirm the line reads on
  the row and Publish holds its position.
- [x] 5.6 Repeat as an actor without the publish permission. Confirm that
  reason reads in the same place, in the muted tone.
- [x] 5.7 Run `/impeccable critique` and `/impeccable audit` against the
  studio screen holding that draft. Resolve what they report.
