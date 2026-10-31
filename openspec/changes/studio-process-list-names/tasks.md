# Tasks

## 1. The draft listing's name fields (process-drafts)

- [ ] 1.1 In `src/engine/drafts.ts`, add `key`, `label` and `baseLocale` to `DraftSummary`, typed as `design.md` D1 states.
- [ ] 1.2 Make `listDrafts` select `body->'key'`, `body->'label'` and `body->'baseLocale'` beside its columns. Keep `ORDER BY updated_at DESC`.
- [ ] 1.3 Narrow the three values in `toDraftSummary` by the D1 rules. The function returns no body.
- [ ] 1.3a Do not call `parseJsonb` on the three values. Keep the key names SQL literals, never bound parameters.
- [ ] 1.4 In `test/drafts.test.ts`, add a test per scenario of the delta's modified listing requirement: well-formed, malformed, and a mixed label.
- [ ] 1.5 Keep the existing body-free listing test passing unchanged.

## 2. The saving account's display name (process-drafts)

- [ ] 2.1 In `src/http/studio-routes.ts`, export `DraftListEntry` as `DraftSummary & { updatedByDisplayName: string | null }`.
- [ ] 2.2 In `handleListDrafts`, filter first, then call `displayNamesForUserIds(ids, db)` once, with the handler's own `db`, over the de-duplicated `updatedBy` values.
- [ ] 2.3 Answer each entry with `updatedByDisplayName: map.get(updatedBy) ?? null`. The admin branch takes the same enrichment.
- [ ] 2.4 Name the new reader in the doc comment of `displayNamesForUserIds` in `src/auth/users.ts`. Change no code there.
- [ ] 2.5 In `test/http-studio.test.ts`, add one test per scenario of the added requirement: display name, email fallback, and no account.
- [ ] 2.6 Give each test account a unique email, such as `dev-${crypto.randomUUID()}@example.test`. That suite never clears `auth_users`.
- [ ] 2.7 Save each draft as an actor whose id is the created account's `userId`.

## 3. The row description (studio-app)

- [ ] 3.1 In `packages/web/src/areas/studio/api/types.ts`, mirror D1's three fields on `DraftSummary` and add `updatedByDisplayName: string | null`.
- [ ] 3.1a Make that type's comment read "Mirrors src/http/studio-routes.ts::DraftListEntry, without the body."
- [ ] 3.2 In the same file, add `publishedAt: string` to `ProcessSummary`, which the server already sends.
- [ ] 3.3 In `screens/processListLogic.ts`, carry `publishedAt` on `ProcessRowPublished`. Carry the four new draft fields on `ProcessRowDraft`.
- [ ] 3.4 Add `localizedText`, and rebuild `templateDisplayName` on it, per D3. Its existing tests stay unchanged and green.
- [ ] 3.5 Add `describeProcessRow`, `ProcessRowView` and `ProcessRowCommand`, with exactly the D3 rules.
- [ ] 3.6 Add `sortProcessRows` per D3, `isPlainLeftClick` per D5 and `relativeAgo` per D4.
- [ ] 3.7 Add the D10 keys to `packages/web/src/i18n/catalogs/studio.ts` in a `processList.*` block, with the exact texts.
- [ ] 3.8 In `packages/web/test/studio-processListLogic.test.ts`, cover each D3 rule for the three row kinds, and the untitled fallback.
- [ ] 3.9 In that file, cover the sort with an untitled row, each `relativeAgo` range edge with a fixed `now`, and a future time.
- [ ] 3.10 In that file, cover `isPlainLeftClick` for a plain click, each modifier, a middle click and a prevented event.
- [ ] 3.11 Add `publishedAt` to every `ProcessSummary` and `ProcessRowPublished` literal in the tests.
- [ ] 3.12 Add the four new draft fields to every `DraftSummary` and `ProcessRowDraft` literal in the tests.
- [ ] 3.13 The 3.11 and 3.12 files: `studio-processListLogic.test.ts`, `studio-subprocessSpec.test.ts`, `studio-subprocessSpecEditor.test.tsx`, `studio-promotionImportLogic.test.ts`.
- [ ] 3.14 All four sit in `packages/web/test/`. Extend the four `deriveProcessRows` `toEqual` expectations in `studio-processListLogic.test.ts` with the carried fields.
- [ ] 3.14a The four are the three per-kind tests and the discard test's `after`.

## 4. The screen (studio-app)

- [ ] 4.1 In `screens/ProcessesScreen.tsx`, narrow, describe, then sort the rows. Draw each row from its `ProcessRowView` alone.
- [ ] 4.1a Keep the `rows` state as `ProcessRow[]`, since `collidingProcessId` reads it. Derive and sort the views on each pass of the component.
- [ ] 4.2 Draw the name as the D5 link, with its style and the slate untitled form.
- [ ] 4.3 Draw the D6 Developer view in the Process cell, with its styles copied into this file's `stylex.create()`.
- [ ] 4.3a Leave out `developerBox`'s `position` and `overflowX`, per D6.
- [ ] 4.4 Draw the Draft and Published cells and the commands per D7, with each relative time in a `<time>` per D4.
- [ ] 4.5 Turn the import control into the D8 secondary button over a `hidden` file input. Drop the `fileLabel` style.
- [ ] 4.6 Make `discard` take the row's view and confirm with the D9 text.
- [ ] 4.7 Move the toolbar, head, cell, loading and empty strings to their D10 keys. Leave both dialogs' strings as they are.
- [ ] 4.8 In `packages/web/test/studio-processesScreen-createGate.test.tsx`, assert the import control is a `button` with class `btn-secondary`.
- [ ] 4.9 In the same file, assert that the file input carries `hidden`. Keep its three existing tests green.
- [ ] 4.10 Add `packages/web/test/studio-processesScreen-rows.test.tsx`. It feeds a row component fixed views through `renderToStaticMarkup`.
- [ ] 4.11 Assert an `<a href>` with the draft's address, the saved-by sentence and the `<time>`.
- [ ] 4.11a Strip the tags and the `<details>`. Assert the remaining text has no process id, key, revision, account id or hash.
- [ ] 4.11f Use fixture values the row never prints otherwise: revision `4711`, key `pl_dev_key`, account id `user_fixture_saver`.
- [ ] 4.11g The fixture hash is `hash_fixture_full`. Assert each of those four strings is absent from that text.
- [ ] 4.11b The `href` attribute carries the process id by design (D5), so the 4.11a check reads text only.
- [ ] 4.11c Feed a view with `saved: { by: null, at: <now − 2h> }`. Assert the text "Saved 2 hours ago".
- [ ] 4.11d Feed a view with `name: ""`. Assert "Untitled process" inside the link.
- [ ] 4.11e Feed a draft-only view and a published-only view. Assert "Not published yet" and "No draft".
- [ ] 4.12 For that test, export the row component from `ProcessesScreen.tsx` as `ProcessListRow`, taking `view`, `now` and the handlers as props.

## 5. The e2e flow and docs

- [ ] 5.1 In `e2e/publish.e2e.ts`, replace `PROCESS_KEY` with `DRAFT_NAME = "E2E draft"`, the label `scripts/e2e.ts` writes.
- [ ] 5.1a Open the draft with `page.getByRole("link", { name: DRAFT_NAME, exact: true }).click()`. Drop the row filter and the Open click.
- [ ] 5.2 Add one entry to `docs/browser-checks.md`: the name link with a modified click, the hidden input's chooser and the Developer view.
- [ ] 5.2a In `docs/browser-checks.md`, re-point every process-list step that finds a row by its key or reads its old cells.
- [ ] 5.2b Name the rows "IT Offboarding", "Access Request" and "Laptop Inventory", the button "Discard draft", the empty cell "No draft".
- [ ] 5.2c In the `process-list-create-once` probe, pass the process name to `row(...)`.
- [ ] 5.2d Then `grep -n 'choose "Discard" on\|em dash under Draft' docs/browser-checks.md` prints nothing.
- [ ] 5.3 In `ROADMAP.md` stage 64, append "Shipped <date>." to item 8.
- [ ] 5.3a Make the stage's status line read "CHANGES 1, 2 AND 8 DONE, REST NOT STARTED".
- [ ] 5.4 In `docs/decisions.md`, entry "The studio's six remaining `confirm()` prompts", fix the sentence on hardcoded English.
- [ ] 5.4a It reads: "Of these, `TemplatesScreen.tsx`'s template discard hardcodes English rather than reading the catalog."
- [ ] 5.4c Follow it with: "Its template-replace prompt (`TemplatesScreen.tsx:131`), outside the six, does too."
- [ ] 5.4b Add a `docs/decisions.md` entry: the process list's two dialogs, its import error and its import result line still print literals.
- [ ] 5.4d The entry names `ui-string-overrides` and says change 13 (`studio-one-dialog-form`) moves the dialog strings.
- [ ] 5.5 In `.claude/rules/ui-glossary.md`, Developer view row, add "Each process list row holds one." after "The change-list row holds one."
- [ ] 5.5b In that row, the meaning gains machine values. It reads: "a disclosure over raw JSON, CEL or machine values".
- [ ] 5.5a In the same row, add `screens/ProcessesScreen.tsx` to its Lives in column.

## 6. Verification

- [ ] 6.1 Run `bun run typecheck` in the devcontainer. Expect exit code 0.
- [ ] 6.2 Run `bun run build` in the devcontainer. Expect exit code 0.
- [ ] 6.3 Run the full suite: `rtk test sh scripts/dev-exec.sh sh scripts/test-gated.sh bun test`, with `OPENSPEC_TELEMETRY=0`.
- [ ] 6.4 Read the pass, skip and fail counts off that run. Name any failing test.
- [ ] 6.5 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` on the host. Read its exit code.
- [ ] 6.6 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh` on the host. Read its exit code.
- [ ] 6.7 On a freshly seeded database and the production bundle, set a display name on the profile page. Choose Create draft on one seeded row.
- [ ] 6.7a Back on `/studio`, that row prints its name, "Saved by <that name>, just now" and "v1 · <time> ago".
- [ ] 6.7b Every other seeded row prints its name, "No draft" and "v1 · <time> ago".
- [ ] 6.7c Create a process with + New process and return. Its row reads "Untitled process" and "Not published yet".
- [ ] 6.8 Check no key, id or hash shows until a Developer view opens.
- [ ] 6.8a On the row with a draft and a version, check five values. On a published-only row, check key, process id and hash.
- [ ] 6.9 Click a draft's name, then Ctrl+click it. Click a name without a draft. Check the editor, a new tab, and Versions.
- [ ] 6.10 Click "Import a promoted version" and check the file chooser opens. Pick Discard draft on a row and check that the confirmation names it.
- [ ] 6.11 Run `/impeccable critique` and `/impeccable audit` on `/studio`. Run `impeccable detect --json` there, since the app's CSP blocks the overlay.
- [ ] 6.12 Run `sh scripts/dev-exec.sh bun run e2e` in the devcontainer. Expect both flows of `e2e/publish.e2e.ts` to pass.
- [ ] 6.12a Without Chromium in the pod, first run `sh scripts/dev-exec.sh bunx playwright install --with-deps chromium`. Run it after 6.2.

## Workflow follow-up

- Verify, sync the specs, and archive.
- Push, open the PR, and merge on green CI.
