## 1. The rail's order

- [ ] 1.1 Replace the order case at `studio-stepsRail.test.tsx:118` with the
  draft-order cases the delta spec names. Leave the numbering case and the
  current-mark case as they are. Add a second fixture whose `workflow.steps`
  array runs call, end, task. Let the call reach the task, and the task reach
  the end. Assert the rail numbers the call one, the end two and the task
  three. Confirm that case fails against today's code.
- [ ] 1.2 Add a case to `studio-stepsRail.test.tsx` for a move control moving
  its own row. Drop the file's `registerOrder` import. Point its header comment
  at the added requirement. Confirm the new case fails against today's code.
- [ ] 1.3 Make `StepsRail.tsx` list `draft.workflow.steps` and drop its
  `registerOrder` import. Correct the docblock that states the old order.
  Verify: the new rail cases pass and `bun run typecheck` passes.
- [ ] 1.4 Make `EditScreen.tsx` build `railOrder` from the draft's own order.
  Leave `reachableStepIds` and `onReorderStep` as they are. Correct the
  `onReorderStep` docblock, which says a reachable step keeps its place.
  Correct the comment above `reachable` as well. The bar's reachability no
  longer shares the rail's order, and it reads the same two inputs on its own.
  Verify: `bun run typecheck` passes.
- [ ] 1.5 Make `formCardRows.ts` order the cards by the draft's own order.
  Give `studio-formCardRows.test.ts` a fixture whose array order differs from
  the graph order. Assert the card order follows the array. Correct the
  docblocks at `formCardRows.ts:89` and `FormsTab.tsx:171`, and the catalog
  comment at `i18n/catalogs/studio.ts:509`. Verify: its cases pass, and
  `git grep -n 'reachability order' -- packages/web` returns nothing once 1.6
  lands.
- [ ] 1.6 Remove `registerOrder` from `draft/registerOrder.ts`, keeping
  `reachableStepIds`. Correct that file's surviving docblock, which names the
  removed function twice. In `studio-registerOrder.test.ts`, drop the cases for
  the removed function and correct the header docblock. Keep the
  `reachableStepIds` block, with its first case narrowed. Drop its
  `registerOrder` assertion, and name that case "holds a reached terminal
  step". Verify: a grep for `registerOrder(` over `packages/web` finds no call
  site, and `bun run typecheck` passes.

## 2. Prose

- [ ] 2.1 Correct every passage in `docs/current-state.md` that names the
  rail's old order. Verify: a grep for "reachability" over that file names
  only the canvas bar's report.
- [ ] 2.2 Add a section to `docs/browser-checks.md` for this change, shaped
  like its recent sections. It reuses the `it_offboarding` draft setup the
  steps rail section above already describes. It presses Move earlier on the
  rail's third row and checks that the row moves. It runs at 1440 and at 420
  pixels wide. Leave the summary-line section as it stands. Verify: antislop's
  finding count for that file does not rise.
- [ ] 2.3 Remove the RAIL-1 entry from `docs/decisions.md`, which this change
  closes. Verify: a grep for "RAIL-1" over the repo finds only this change's
  own files.
- [ ] 2.4 Correct the `steps rail` row of the chrome table in
  `.claude/rules/ui-glossary.md`. It reads "one numbered row per step, in the
  draft's own order". Verify: a grep for "reachability" over `.claude/rules/`
  names only the canvas bar row.

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
