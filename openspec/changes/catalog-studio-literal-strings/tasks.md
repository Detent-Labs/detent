# Tasks

## 1. Guard test and caption component

- [x] 1.1 Write `packages/web/test/studio-panels-literal-text.test.ts` as design.md D3 states, with the planted-literal assertion. Run the full suite once and confirm that this test fails and names today's literals.
- [x] 1.2 Add `panels/shared/KeyCaption.tsx` as design.md D1 states. Widen the `label` or `legend` prop of `ActionListEditor`, `PluginEnvelopeEditor` and `FieldExpressionMapEditor` to `ReactNode`. Run `bun run typecheck` and expect exit code 0.

## 2. Captions

- [x] 2.1 Add every caption key from the design.md D2 caption table to the studio catalog. Rewrite the catalog header's exemption into the caption rule the delta spec states.
- [x] 2.2 Replace the literal captions in `PathsPanel.tsx`, `TimersPanel.tsx`, `SubprocessSpecEditor.tsx`, `shared/PluginEnvelopeEditor.tsx`, `DataSourcesPanel.tsx`, `ProcessHeaderBar.tsx`, `StepPage.tsx` and `MigrationSpecEditor.tsx` with `KeyCaption` and the new keys. Confirm that the guard test no longer lists these files.

## 3. Messages and badges

- [x] 3.1 Move the plugin config messages in `validateField` to catalog sentences, filled with the function replacer. Add a unit test per message that asserts the filled sentence and no leftover `{`.
- [x] 3.2 Move the unknown-data-list warning in `dataListKeysLogic.ts` and the locale gap option in `ContentLocaleSwitcher.tsx` to catalog sentences. Extend the existing data list keys test to assert the filled sentence.
- [x] 3.3 Change `NotCheckedBadge` to take a whole `text` sentence. Pass the three badge keys from `ActionListEditor.tsx` and `StepPage.tsx`, and delete `issues.notChecked`. Change `studio-actionListEditor-registryBadge.test.tsx` and every other test that asserts old literal text.
- [x] 3.4 Run the full suite. Confirm the guard test passes with no exemption beyond the three in design.md D3.

## 4. Records

- [x] 4.1 Delete STEP-4 and the path-row caption entry from `docs/decisions.md`. Delete this change's entry from the 2026-10-10 audit index.
- [x] 4.2 Add a `docs/browser-checks.md` entry for the new captions and one plugin config message.

## 5. Verification

- [ ] 5.1 Run `bun run typecheck` in the devcontainer. Expect exit code 0.
- [ ] 5.2 Run `bun run build` in the devcontainer. Expect exit code 0.
- [ ] 5.3 Run the full `bun test` suite with `DATABASE_URL` set through `sh scripts/test-gated.sh bun test` and `OPENSPEC_TELEMETRY=0`. Read the pass, skip and fail counts.
- [ ] 5.4 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` on the host. Read its exit code.
- [ ] 5.5 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh` on the host. Read its exit code.
- [ ] 5.6 Do a browser check on the production bundle. Read the new captions on the Paths tab, a timer, a plugin envelope and the header bar menu. Enter a too-short plugin config value and read the message.
- [ ] 5.7 Run `/impeccable critique` and `/impeccable audit` against the Steps tab and the Paths tab.

## Workflow follow-up

- Verify, sync the specs, and archive.
- Push, open the PR, and merge on green CI.
