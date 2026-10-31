# Tasks

## 1. Routing and the tab model (studio-process-tabs, studio-app)

- [ ] 1.1 In `routing.ts`, make `ProcessTab` the six literals of design D1 and `PROCESS_TABS` their order.
<!-- antislop: allow synonym-rotation -->
<!-- Why: "edit" names the edit route; "change" names the change list and this OpenSpec change. -->
- [ ] 1.2 Add `FieldsView`, `SettingsView`, `TabView` and `TAB_VIEWS` per D1. Give the edit route `view?: TabView`.
- [ ] 1.2a The route field is optional, so every existing route literal in the tests still type-checks.
- [ ] 1.3 Make `routePath` write `/edit/:tab/:view` for a view. Make `matchPath` accept it only for a view the tab holds.
- [ ] 1.4 Add `RETIRED_TAB_TARGET` and rename `PANEL_VIEW_TAB` to `PANEL_VIEW_TARGET`, with D1's values. Map `changes` onto the versions route.
- [ ] 1.5 In `draft/process-tabs.ts`, make `processTabCounts(draft, issues)` return D9's six keys. Drop the changes count parameter.
- [ ] 1.6 Replace `tabForIssue` with `checkTarget(issue, steps)` per D8. Remove `tabForChangeGroup`. Keep `formEditorReturnTab`.
- [ ] 1.7 Add the D10 keys to `packages/web/src/i18n/catalogs/studio.ts`, with the exact texts. Remove no key yet.
- [ ] 1.8 Rewrite `packages/web/test/studio-routing.test.ts` per D13. Run the full gated suite. Read its verdict off the named tests.
- [ ] 1.9 Rewrite `packages/web/test/studio-processTabs.test.ts` per D13. Cover a timer and an onEntry action resolving to their step.

## 2. The tab row and the sub-row (studio-process-tabs, spa-accessibility)

- [ ] 2.1 In `panels/ProcessTabRow.tsx`, make `TAB_LABEL` read the six tabs. Fix every comment counting eleven or ten.
- [ ] 2.2 Rewrite `packages/web/test/studio-processTabRow.test.tsx` per D13: six tabs, the order, one `tabindex="0"` among six.
- [ ] 2.3 Add `panels/SubRow.tsx` per D2, with `subTabDomId` and `subTabPanelDomId`. Declare its styles with `stylex.create()`.
- [ ] 2.4 Add `packages/web/test/studio-subRow.test.tsx` per D13. Assert the tablist, two tab buttons, `aria-selected` and the ids.
- [ ] 2.4a Assert no `tabindex="-1"` renders, since the sub-row follows the plain-button pattern.

## 3. The Fields views, the Settings tab and the header bar (studio-process-tabs, studio-app)

- [ ] 3.1 Add `panels/FieldsTabViews.tsx` per D3. Every string comes from the catalog.
- [ ] 3.2 Add `panels/ProcessSettingsPanel.tsx` per D4, with D10's strings. Reuse `resolveBaseLocaleChange` and `AddLocaleControl`.
- [ ] 3.2a Put the key input and the process id inside a closed `<details>` Developer view, in the mono face.
- [ ] 3.3 Add `panels/SettingsTab.tsx` per D4. Mount `DataSourcesTab`, `ContractPanel` and `AccessPanel` as the other three views.
- [ ] 3.3a Place the assignment-groups link under the access lists, with its `go` target unchanged.
- [ ] 3.4 In `panels/ProcessHeaderBar.tsx`, remove the first menu group, its styles, `changeBaseLocale` and the `go` prop, per D5.
- [ ] 3.5 In `screens/EditScreen.tsx`, render the six bodies. Mount `FieldsTabViews` and `SettingsTab` with the route's view.
- [ ] 3.5a Thread `view` from the route through `EditScreenProps` and `root.tsx` into `ProcessSurface`.
- [ ] 3.5b Give `goToTab` a second `view` argument and `openTabFromRow` a target. Wire the Checks rail through `checkTarget` and `onSelectStep`.
- [ ] 3.5c Drop `changesCount`, `onChangesCount` and the Paths, Changes, Contract, Access and matrix bodies from the screen.
- [ ] 3.5d Make the canvas's `visible` read `openTab === "map"`. Keep every other body's `visible` on its own tab and view.
- [ ] 3.6 Update `packages/web/test/studio-processSurface.test.ts` per D13: six `tabPanel` calls and the one-group menu slice.
- [ ] 3.7 Update `packages/web/test/studio-heldWhileHidden.test.tsx` per D13. The `HeldDraft` match reads `FieldsTabViews.tsx`.
- [ ] 3.8 Add `packages/web/test/studio-processSettingsPanel.test.tsx` per D13. Run the gated suite; `studio-panels-literal-text.test.ts` stays green.

## 4. The change list in the publish dialog and on Versions (studio-publish, process-version-inspection, studio-app)

- [ ] 4.1 Add `panels/publishChangesLogic.ts` with `changesSentence(state, baseVersion)` over D6's states and D10's keys.
- [ ] 4.2 Add `panels/PublishChanges.tsx` per D6: the fetch, the sentence, the `<details>` disclosure and `ChangeList`.
- [ ] 4.3 In `ProcessHeaderBar.tsx`, add a `token` prop, render the Changes row in the publish dialog, and give the dialog D6's height rule.
- [ ] 4.3a Pass `token` from `EditScreen.tsx`.
- [ ] 4.4 In `panels/ChangeList.tsx`, remove `onOpenRow`, `OPEN_COMMAND` and the open-command styles. Read D7's group keys.
- [ ] 4.4a In `draft/changeSet.ts`, make the contract row's label read `changeList.group.contract`.
- [ ] 4.5 Remove `panels/ChangesView.tsx`, `panels/PathsView.tsx`, `panels/pathRows.ts` and `packages/web/test/studio-pathRows.test.ts`.
- [ ] 4.5a Remove `useHeldWhileHidden` from `draft/held-while-hidden.tsx` when `git grep` finds no other reader.
- [ ] 4.6 In `screens/VersionsScreen.tsx`, run the draft-against-base comparison from the load effect, per D11.
- [ ] 4.7 Remove the retired keys D10 lists from the catalog. `bun run typecheck` names any reader left.
- [ ] 4.8 In `packages/web/test/studio-vocabulary.test.ts`, drop the Paths tab block and rename its describe to the change list.
- [ ] 4.9 Update `packages/web/test/studio-changeList.test.tsx` per D13. Add `packages/web/test/studio-publishChanges.test.ts` per D13.

## 5. Docs, glossary and roadmap

- [ ] 5.1 Apply D12's eight glossary edits to `.claude/rules/ui-glossary.md`. Run `antislop check` on it; add no finding.
- [ ] 5.2 In `docs/authoring-guide.md`, list the six tabs in section 1. Re-point sections 2, 5 and 8 to the new places.
- [ ] 5.3 In `docs/browser-checks.md`, move every entry naming a retired tab or address to its new place.
- [ ] 5.3a Verify with `grep -n "Paths tab\|Field matrix tab\|Data sources tab\|Changes tab\|Access tab\|Contract tab" docs/browser-checks.md`.
- [ ] 5.3c That grep prints nothing.
- [ ] 5.3b Add one entry for the sub-row, the Settings tab and the dialog's Changes row. It holds the checks of 6.7 to 6.10.
- [ ] 5.4 In `docs/decisions.md`, move the Access-tab naming entry to `docs/decisions-archive.md` word for word.
- [ ] 5.4b Add a resolution line under the moved entry, naming this change.
- [ ] 5.4a Add the spec-sweep entry D12 names. List each stale "Canvas tab" and "Field matrix tab" site by spec and line.
- [ ] 5.5 In `openspec/config.yaml`, make the context name six tabs: map, steps, fields, forms, checks, settings.
- [ ] 5.6 In `ROADMAP.md` stage 64, append "Shipped <date>." to item 9. Make the status line read "CHANGES 1, 2, 8 AND 9 DONE, REST NOT STARTED".
- [ ] 5.7 In `docs/current-state.md`, make the tabs entry read "from the map to the settings". Change nothing else there.

## 6. Verification

- [ ] 6.1 Run `bun run typecheck` in the devcontainer. Expect exit code 0.
- [ ] 6.2 Run `bun run build` in the devcontainer. Expect exit code 0.
- [ ] 6.3 Run the full suite: `rtk test sh scripts/dev-exec.sh sh scripts/test-gated.sh bun test`, with `OPENSPEC_TELEMETRY=0`.
- [ ] 6.4 Read the pass, skip and fail counts off that run. Name any failing test. Compare the pass count with `scripts/gates/pass-floor.txt`.
- [ ] 6.5 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` on the host. Read its exit code.
- [ ] 6.6 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh` on the host. Read its exit code.
- [ ] 6.7 On the production bundle, open a seeded draft. The row reads Map, Steps, Fields, Forms, Checks, Settings. Map is open.
- [ ] 6.7a Open Fields, then Where fields appear. The address ends in `/edit/fields/matrix`. Reload keeps the view. The grid reaches the body's bottom edge.
- [ ] 6.7b Open Settings and each of its four views. The Process view prints no key until the Developer view opens.
- [ ] 6.7c On Where values come from, the rail scrolls on its own and the editor stands beside it.
- [ ] 6.8 Load `/edit/canvas`, `/edit/paths`, `/edit/matrix`, `/edit/dataSources`, `/edit/contract`, `/edit/access` and `/edit/changes`. Each lands per D1.
- [ ] 6.9 Press a Checks row naming a path. Steps opens on the owning step with that way out selected, and focus stands on the Steps tab.
- [ ] 6.10 Rename a field and open Publish. The Changes row reads one change. Its disclosure opens the list. Cancel holds the initial focus.
- [ ] 6.10a Open Versions. The draft's change list stands under the table with no press.
- [ ] 6.11 Run `/impeccable critique` and `/impeccable audit` on `/studio/processes/<id>/edit/settings`. Run `impeccable detect --json` there, since the app's CSP blocks the overlay.
- [ ] 6.12 Run `sh scripts/dev-exec.sh bun run e2e` in the devcontainer. Expect both flows of `e2e/publish.e2e.ts` to pass.

## Workflow follow-up

- Verify, sync the specs, and archive.
- Push, open the PR, and merge on green CI.
