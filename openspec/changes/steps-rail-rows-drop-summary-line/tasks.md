## 1. Remove the line

- [ ] 1.1 Replace the three summary-line cases in `studio-stepsRail.test.tsx`
  with the row checks design.md describes. Point its header comment at the new
  requirement name. Confirm each row check fails against today's code before
  any source change.
- [ ] 1.2 Remove the line from `StepsRail.tsx`, per design.md's decisions on
  the wrapper and the process list. That covers its imports, the prop's
  argument in `EditScreen.tsx`, and the render test's `processes` prop and
  fixture. Correct the comments in those three files that name the line or the
  old requirement. Verify: the row checks pass and `bun run typecheck` passes.
- [ ] 1.3 Remove `railRowSummary` from `panels/stepRailRow.ts`, with every
  import only it read. In `studio-stepRailRow.test.ts`, drop its block, the
  `PROCESSES` fixture, and the `railRowSummary` and `ProcessSummary` imports.
  Rewrite that file's header comment to cover `railRowIssues` alone. Verify:
  `bun run typecheck` passes.
- [ ] 1.4 Remove the five `stepsRail.` keys design.md lists from
  `catalogs/studio.ts`. Verify: a grep over `packages/web` for each key finds
  no match.

## 2. Prose

- [ ] 2.1 Correct the `processLabel` docblock in `draft/guided-labels.ts`.
  Point the docblock in `draft/registerOrder.ts` at the added requirement's
  name. In `docs/current-state.md`, correct the passage on
  `panels/stepRailRow.ts`. Move its `draft/roleStamp.ts` sentence to the Forms
  tab paragraph, since the rail never reads that module. Verify: a grep for
  "summary line" over `packages/web/src` and that passage finds nothing.
- [ ] 2.2 Add a `docs/browser-checks.md` section for this change, shaped like
  its recent sections. It checks the Steps tab on `it-offboarding` at 1440 and
  420 pixels wide, then discards the draft. Each row shows its number, label
  and move controls, and no summary line. A call added from the rail's foot
  shows its issue badge at the row's trailing edge. A step renamed to a
  60-character label wraps inside its row. Verify: antislop's finding count for
  that file does not rise.

## 3. Verification

- [ ] 3.1 Run `bun run typecheck`, then `bun run build`, in the devcontainer.
  Record what each one printed.
- [ ] 3.2 Run the full `bun test` with `DATABASE_URL` set, piped through
  `scripts/gates/silent-green.sh`. Record the pass, fail and skip counts.
- [ ] 3.3 Run the prose gate and the whitespace gate, each fed by
  `sh scripts/gates/range.sh < /dev/null`. Record both outputs.
- [ ] 3.4 Run the `docs/browser-checks.md` entry from 2.2 in a real browser.
  Record what each width showed.
- [ ] 3.5 Run the Impeccable detector on `StepsRail.tsx`. Then run
  `/impeccable critique` and `/impeccable audit` on the Steps tab route.
  Resolve every finding this change caused.
