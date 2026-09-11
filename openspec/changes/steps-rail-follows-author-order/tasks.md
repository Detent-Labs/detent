## 1. The rail's order

- [ ] 1.1 Replace the two order cases in `studio-stepsRail.test.tsx` with the
  draft-order cases the delta spec names. Add the case for a move control
  moving its own row. Point the file's header comment at the added
  requirement. Confirm each new case fails against today's code.
- [ ] 1.2 Make `StepsRail.tsx` list `draft.workflow.steps` and drop its
  `registerOrder` import. Correct the docblock that states the old order.
  Verify: the new rail cases pass and `bun run typecheck` passes.
- [ ] 1.3 Make `EditScreen.tsx` build `railOrder` from the draft's own order.
  Leave `reachableStepIds` and `onReorderStep` as they are. Correct the
  `onReorderStep` docblock, which says a reachable step keeps its place.
  Verify: `bun run typecheck` passes.
- [ ] 1.4 Make `formCardRows.ts` order the cards by the draft's own order.
  Correct `studio-formCardRows.test.ts` for that order. Verify: its cases pass.
- [ ] 1.5 Remove `registerOrder` from `draft/registerOrder.ts`, keeping
  `reachableStepIds`. Drop its cases from `studio-registerOrder.test.ts` and
  keep that file's own block. Verify: a grep over `packages/web` finds
  `registerOrder` nowhere, and `bun run typecheck` passes.

## 2. Prose

- [ ] 2.1 Correct every passage in `docs/current-state.md` that names the
  rail's old order. Verify: a grep for "reachability" over that file names
  only the canvas bar's report.
- [ ] 2.2 Correct the steps rail section of `docs/browser-checks.md`. It checks
  that a move control moves its row, at both widths. Verify: antislop's
  finding count for that file does not rise.
- [ ] 2.3 Remove the RAIL-1 entry from `docs/decisions.md`, which this change
  closes. Verify: a grep for "RAIL-1" over the repo finds only this change's
  own files.

## 3. Verification

- [ ] 3.1 Run `bun run typecheck`, then `bun run build`, in the devcontainer.
  Record what each one printed.
- [ ] 3.2 Run the full `bun test` with `DATABASE_URL` set, piped through
  `scripts/gates/silent-green.sh`. Record the pass, fail and skip counts.
- [ ] 3.3 Run the prose gate and the whitespace gate, each fed by
  `sh scripts/gates/range.sh < /dev/null`. Record both outputs.
- [ ] 3.4 Run the `docs/browser-checks.md` entry from 2.2 in a real browser, at
  1440 and 420 pixels wide. Record what each width showed.
- [ ] 3.5 Run the Impeccable detector on `StepsRail.tsx`. Then run
  `/impeccable critique` and `/impeccable audit` on the Steps tab route.
  Resolve every finding this change caused.
