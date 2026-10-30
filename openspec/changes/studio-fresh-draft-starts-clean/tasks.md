# Tasks

Paths under `screens/`, `draft/` and `panels/` sit in `packages/web/src/areas/studio/`.

## 1. Setup

- [x] 1.1 Run `/impeccable hooks on` in this worktree. Probe `hook.mjs` once, so the detector runs after each edit under `packages/web/**`.

## 2. Seed every list empty (studio-app)

- [x] 2.1 In `screens/processListLogic.ts::seededDraftInput`, return the D1 body from `design.md` for the empty choice. Keep `layout: {}` and `revision: 0`.
- [x] 2.2 Rewrite the comment in `draft/chainingFetch.ts` that quotes the old `{ baseLocale: "en" }` seed. It names the new seeded body.
- [x] 2.3 In `packages/web/test/studio-processListLogic.test.ts`, expect the D1 body. Add a test: `validateStructure` on it reports one Zod issue, at `workflow.initialStep`.
- [x] 2.4 In `packages/web/test/studio-processesScreen-createGate.test.tsx`, cite "A new process mints a prefixed id client-side in one write". Verify both tests in group 8.

## 3. Recognize the two start gaps (studio-checks-rail)

- [x] 3.1 Add `draft/startGaps.ts` with the start-gap test of D2 and the name-gap test of D3.
- [x] 3.2 Add the banner predicate of D4 to `draft/startGaps.ts`. It reads `validation.issues` alone.
- [x] 3.3 Add the optional `noStepYet` to `ValidationResult` in `draft/validation.ts`.
- [x] 3.4 Add the optional `plain` to `EditorIssue` in `draft/issues.ts`.
- [x] 3.5 In `draft/validation.ts::runValidation`, drop the start gap and set `noStepYet`. Give the name gap its catalog sentence and `plain: true`.
- [x] 3.6 Add the three D7 keys to `i18n/catalogs/studio.ts`, with the exact texts from `design.md`.
- [x] 3.7 In `panels/shared/IssueList.tsx`, `IssueItems` prints no source label for a `plain` issue.
- [x] 3.8 Add `packages/web/test/studio-startGaps.test.ts`. Feed it real `validateStructure` output from five bodies.
- [x] 3.9 Use the D1 body and D1 plus a field with no `type`. Add D1 with one named end step.
- [x] 3.10 Add that body once more with the process named. Add D1 with the unnamed task step `newStep` mints.
- [x] 3.11 In that file, assert `noStepYet`, the issue count, the sentence and `plain` for each body. Also assert the banner predicate for each.
- [x] 3.12 In `packages/web/test/studio-issueList.test.tsx`, add a test: a `plain` issue renders its message with no source label.

## 4. The checks rail's start state (studio-checks-rail)

- [x] 4.1 In `panels/ChecksRail.tsx`, render the D5 start state from `noStepYet`. With no open issue, only the sentence shows.
- [x] 4.2 With `noStepYet` and an open issue, the sentence stands first and the groups follow. The all-clear state stays hidden.
- [x] 4.3 Give `draft/checksRail.ts::checksDotState` the `noStepYet` argument of D5. It returns `clear` when no group holds an issue.
- [x] 4.4 Pass `validation.noStepYet` to `checksDotState` in `screens/EditScreen.tsx` and in `panels/ProcessHeaderBar.tsx`.
- [x] 4.5 In `packages/web/test/studio-checksRail.test.ts`, assert `clear` for the start state, and `blocker` once an issue is open.
- [x] 4.6 In `packages/web/test/studio-checksRail-publishVerdict.test.tsx`, test three renders: sentence alone, sentence above groups, and no all-clear.

## 5. The banner gate (studio-process-tabs)

- [x] 5.1 In `screens/EditScreen.tsx`, gate the banner on the D4 predicate in place of `!validation.zodValid`.
- [x] 5.2 The predicate tests in 3.11 cover the gate. No test in `packages/web/test` reads `draftIncomplete` today.

## 6. Publish in the start state (studio-publish)

- [ ] 6.1 Give `screens/draftToolbarState.ts::publishAvailability` the optional `noStepYet = false` of D6. The permission answer stays first.
- [ ] 6.2 Give `PublishNavControl` and `PublishReasonLine` a `noStepYet` prop. `ProcessHeaderBar` passes `validation.noStepYet` to both.
- [ ] 6.3 The new reason takes the muted tone the permission reason uses. Verify with the render tests in 6.5.
- [ ] 6.4 In `packages/web/test/studio-draftToolbarState.test.ts`, cover three cases: no step, no step without permission, and a draft with a step.
- [ ] 6.5 In `packages/web/test/studio-processHeaderBar-publishGate.test.tsx`, a stepless draft renders Publish with `aria-disabled` and the reason.
- [ ] 6.6 In the same file, activating that Publish control sends no request and opens no dialog.

## 7. Docs

- [ ] 7.1 In `docs/authoring-guide.md`, add one sentence after "Empty process". A new draft opens with no check result.
- [ ] 7.2 The same sentence says that Publish waits for a first step. Check the guide with the prose gate in 8.5.
- [ ] 7.3 In `docs/decisions.md`, add a line to FIELDS-8: the process-name message now reads a sentence, and the field-label part stays open.
- [ ] 7.4 Add one entry to `docs/browser-checks.md` for the fresh-draft walk in 8.7.
- [ ] 7.5 In `ROADMAP.md` stage 64, set the status to `CHANGE 1 DONE, REST NOT STARTED`.
- [ ] 7.6 In the same stage, mark item 1 shipped as `studio-fresh-draft-starts-clean`, as stages 40 and 43 do.

## 8. Verification

- [ ] 8.1 Run `bun run typecheck` in the devcontainer. Expect exit code 0.
- [ ] 8.2 Run `bun run build` in the devcontainer. Expect exit code 0.
- [ ] 8.3 Run the full suite: `rtk test sh scripts/dev-exec.sh sh scripts/test-gated.sh bun test`, with `OPENSPEC_TELEMETRY=0`.
- [ ] 8.4 Read the pass, skip and fail counts off that run. Name any failing test.
- [ ] 8.5 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` on the host. Read its exit code.
- [ ] 8.6 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh` on the host. Read its exit code.
- [ ] 8.7 On the production bundle, create an empty process. Check: no banner, no "zod" text, Checks reads 0, and Publish states its reason.
- [ ] 8.8 Add an end step and name it. Check: the name sentence stands beside the name, with no banner.
- [ ] 8.9 Type a process name. Check: the sentence leaves. Add a task step. Check: the banner returns, as Risks states.
- [ ] 8.10 Run `/impeccable critique` and `/impeccable audit` on `/studio/processes/<id>/edit/canvas` for a fresh draft.

## Workflow follow-up

- Verify, sync the specs, and archive. At sync, move both added `studio-app` requirements to the removed one's place.
- Push, open the PR, and merge on green CI.
