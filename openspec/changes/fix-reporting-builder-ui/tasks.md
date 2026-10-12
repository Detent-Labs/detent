# Tasks

## 1. Builder date bounds

- [x] 1.1 Add `withDateBound(draft, edge, value)` to `screens/reportsLogic.ts`. Verify with tests in `reporting-reportsLogic.test.ts`. A 1 to 31 October pick yields local midnight and 23:59:59.999. An empty value clears the bound. `toDateInput` of the result returns the picked day.
- [x] 1.2 Use `withDateBound` and `toDateInput` in `ReportBuilderScreen.tsx` for the From and To inputs. Verify that no `new Date(e.target.value)` and no `.slice(0, 10)` remain in the file.
- [x] 1.3 Widen `test:tz` in `package.json` to run `reporting-reportsLogic.test.ts` beside the existing file. Verify with `bun run test:tz` in the container. Verify that the new tests fail when `withDateBound` builds the bound from `new Date(value)`.

## 2. Session end on 401

- [ ] 2.1 Take `onUnauthorized` in `ReportingArea` and pass it to the picker, the three views, the report list and both builder routes. Verify with `bun run typecheck`.
- [ ] 2.2 Build `fail = useFail(onUnauthorized, ...)` in `ProcessPickerScreen`, `CycleTimeScreen`, `BottleneckScreen`, `SlaScreen` and `ReportsListScreen`. Call it from each catch handler. Verify with `git grep -n describeCaughtError -- packages/web/src/areas/reporting/screens`. It may appear only inside the second argument of `useFail`, or in the builder code of task 2.3.
- [ ] 2.3 Do the same in `ReportBuilderScreen` for its five request sites: load, column choices, preview, save and CSV download. Pass `onUnauthorized` to the embedded picker. Verify with the canary of task 2.4. The effect behavior needs the browser check of task 4.3, because a static test run cannot run it.
- [ ] 2.4 Add a canary to `reporting-boundaries.test.ts`. `root.tsx` destructures `onUnauthorized`. Every `*Screen.tsx` file under `screens/` that imports `../api/client.js` calls `useFail(onUnauthorized`. Verify that the canary fails when one screen drops the call.

## 3. Failed column request

- [ ] 3.1 Keep the error of the column request in `choicesError` state and clear it on success. Show an `ErrorNote` above the "Add comparison" button. Verify in the browser check of task 4.3. A failing column request shows the note, and a later success removes it.
- [ ] 3.2 Add the optional `choicesError` prop to `ColumnEditor` and show the same note under its heading. Verify with a static-render test in `reporting-columnEditor.test.tsx`. The section shows the note with the prop and no note without it.

## 4. Documentation and browser check

- [ ] 4.1 Add a "The report builder dates, session end and column error" walk to `docs/browser-checks.md`, with the three checks of this change. Verify that the prose gate reports no rise for the file.
- [ ] 4.2 Strike the `fix-reporting-builder-ui` entry from the audit index in `docs/decisions.md`. Verify with `git grep -n fix-reporting-builder-ui -- docs/decisions.md` that no entry remains.
- [ ] 4.3 Run the browser walk of task 4.1 on the production build. Then run `/impeccable critique` and `/impeccable audit` against `/reporting/reports/new`. Verify that the report file prints each result.

## 5. Verification

- [ ] 5.1 Run `bun run typecheck`, then `bun run build`, then the full gated `bun test` with `DATABASE_URL` set. Verify that each prints a pass and that the gate accepts the run.
- [ ] 5.2 Run `bun run test:tz` in the container. Verify that it prints no error.
- [ ] 5.3 Run the antislop prose gate and the whitespace gate over the pushed range on the host. Verify that both exit 0.

## Workflow follow-up

- Review the change with `openspec-review-change` before apply.
- Verify, sync the specs, archive, push, open the PR, and merge on a green CI run.
