## 1. Warning logic

- [x] 1.1 Add `packages/web/src/areas/studio/panels/assignmentWarningLogic.ts`
      exporting `assignmentWarning(terminal, assignment)`, per `design.md`.
- [x] 1.2 Add `packages/web/test/studio-assignmentWarningLogic.test.ts`
      covering: a terminal step draws no warning, a non-terminal step with
      an `assignment` draws no warning, a non-terminal step with no
      `assignment` returns the warning text.

## 2. Studio rendering

- [x] 2.1 In `StepsPanel.tsx`, import `assignmentWarning` and render its
      result in a `<p className="studio-warning">` directly below the
      `PluginEnvelopeEditor` for `step.assignment?.strategy`.

## 3. Decisions bookkeeping

- [x] 3.1 Remove the "A publish-time warning for a step with no
      `assignment`" bullet from `docs/decisions.md`'s "Decided, not yet
      built" list.

## 4. Verification

- [x] 4.1 Run `bun run typecheck` and confirm no errors.
- [x] 4.2 Run the full `bun test` suite with `DATABASE_URL` set and
      confirm a pass, checking the skip count alongside the pass count.
- [x] 4.3 Start the dev server and confirm in a real browser: a
      non-terminal step with no assignment shows the warning, a terminal
      step does not, and Publish still succeeds with the warning showing.
