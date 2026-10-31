# Tasks

Exact values live in `design.md` D3 and in the delta specs. A task cites a
key and never restates its value.

## 1. The catalog takes the vocabulary table

- [x] 1.1 In `packages/web/src/i18n/catalogs/studio.ts`, apply every row of the five D3 tables. Add the four new `paths.*` keys. Delete the six keys D3 names. Verify: `bun run typecheck` passes, so no consumer reads a deleted key.
- [x] 1.2 Rewrite the catalog's header comment and the two block comments that say the flag words stay untranslated. State the new rule: a caption reads words, and the JSON key stays in the Developer view. Verify: `grep -n "stay untranslated\|KeyCaption" studio.ts` prints nothing.
- [x] 1.3 Add `packages/web/test/studio-vocabulary.test.ts` per design D6. Verify: the test passes in the full suite.
- [x] 1.4 Change every test that quotes an old word, reading each failure by name from the full suite. Known files: `studio-stepPage.test.tsx`, `studio-sectionIssues.test.ts`, `studio-sectionsFor.test.ts`, `studio-pathsPanel-manualGuard.test.tsx`, `studio-changeSet.test.ts`, `studio-formsTab.test.tsx`, `studio-formEditor-strip.test.tsx`, `studio-fieldMatrix.test.ts`. The header comments of `studio-pathsPanel-manualGuard.test.tsx` and `studio-pathTrigger.test.ts` quote the removed requirement; reword them to the successor. Verify: the full suite passes with no skip beyond the floor.

## 2. The JSON key leaves every caption

- [x] 2.1 Delete `panels/shared/KeyCaption.tsx`. At each of its 26 call sites in the eight panels design D1 names, print the `t(...)` result in place. Verify: `grep -rn KeyCaption packages/web/src` prints nothing and typecheck passes.
- [x] 2.2 In `studio-panels-literal-text.test.ts`, delete the `KeyCaption` case and keep `NotCheckedBadge`. In `studio-pathsPanel-manualGuard.test.tsx`, point `PRIORITY_INPUT` at the new caption with no `code` element. Assert the row prints no `code` element holding `priority` or `onPath`. Verify: both tests pass in the full suite.

## 3. The key moves into the Developer view, and a way out reads as a sentence

- [x] 3.1 In `panels/StepPage.tsx`, delete the key input from the masthead row and let the name line take the full width. Add a "Key" input, mono, inside the Developer view above the `id` line (design D2). Verify: `studio-stepPage.test.tsx` asserts no key input before `<details`, the key input inside it, and the JSON still carrying the key.
- [x] 3.2 In `panels/PathsPanel.tsx`, open each row with an `h4` reading `paths.rowHeading` per design D4. Move the key input into a per-row `details` whose summary reads `paths.developerView`, keeping `styles.monoInput`. Reword the comment that quotes "triggered by". Verify: `studio-pathsPanel-manualGuard.test.tsx` asserts the heading "Approve → Done" for a labelled path and "(unnamed way out)" for an empty label. It also asserts the key input sits after the `details` tag.
- [x] 3.3 Keep `studio-guidedSurfaceStyle.test.ts` green: the name caption still precedes the key caption, and the key field keeps the mono treatment. Verify: the full suite passes.

## 4. The glossary, the decisions file, the browser checks and the roadmap

- [x] 4.1 In `.claude/rules/ui-glossary.md`, drop the key from the masthead row and add the key input to the Developer view row. Add the vocabulary table with its rule to section 2. Verify: `antislop check` on the file reports no rise.
- [x] 4.2 In `docs/decisions.md`, find the entry "Retired UI words still sit in live specs and in the studio catalog". Cut its catalog sentences. The spec sweep stays open. Add that `studio-canvas` still names the "Path to" section, at the six lines design Risks cites. Verify: the entry names no catalog key.
- [x] 4.3 In `docs/browser-checks.md`, rewrite the `catalog-studio-literal-strings` walk to check that no mono name follows a caption. Replace every quoted old caption at the lines design Risks names. Delete the label-and-key row walk whole. Add one walk for this change over the Steps tab. Verify: `grep -n "triggered by\|Path to\|Actions on entry\|Add path" docs/browser-checks.md` prints nothing.
- [x] 4.4 In `ROADMAP.md`, set stage 64's status line to "CHANGES 1 AND 2 DONE, REST NOT STARTED". Append "Shipped 2026-10-31." to change 2's line. Verify: the two lines read so.

## 5. Verification

- [x] 5.1 Run `bun run typecheck` and then `bun run build` in the devcontainer. Verify: both exit 0.
- [x] 5.2 Run the full suite in the devcontainer with `DATABASE_URL` set: `rtk test sh scripts/dev-exec.sh sh scripts/test-gated.sh bun test`. Verify: the gate accepts the run and no test fails.
- [x] 5.3 On the host, run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` and the same with `whitespace.sh`. Verify: both exit 0.
- [x] 5.4 Browser check on the production build with `playwright-cli -s=studio-vocabulary-no-key-echo`. Walk the Steps tab, the form editor and the field matrix of a seeded process. Then `impeccable critique`, `impeccable audit` and `impeccable detect --json` on those screens. Verify: no caption prints a mono name, and the detector reports no new finding.

## Workflow follow-up

- Run `openspec-verify-change`, then `openspec-sync-specs`, then archive.
- At sync, move each ADDED successor to its REMOVED predecessor's place (design D7).
