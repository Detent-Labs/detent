# Tasks

## 1. Reader sites and the rewrite

- [x] 1.1 In `draft/key-readers.ts`, add `rewriteFieldRead(src, from, to)` per design.md Decision 1. Replace from the last offset back.
- [x] 1.2 Give unparseable source the regex `keyReader` builds, with a global flag, so the rewrite matches the count.
- [x] 1.3 Add `keyReaderSites(draft, key)` with each site's JSON path. Make `countKeyReaders` its length.
- [x] 1.4 Add `rewriteKeyReaders(draft, fieldId, from, to)`, which writes in place and returns the count, and `readKeys(draft)`.
- [x] 1.5 Extend `packages/web/test/studio-keyReaders.test.ts` with one test per scenario of the `studio-condition-builder` rename requirements.
- [x] 1.6 Test that `rewriteKeyReaders` reaches a guard, a view flag, a field rule and a mapping value, and returns 4.
- [x] 1.7 Test that `rewriteKeyReaders` writes nothing and returns 0 while another field carries the old key.
- [x] 1.8 Add a `ConditionInput` test: a rewritten source re-seeds as a comparison row on the renamed field.

## 2. A condition as a sentence outside the builder

- [x] 2.1 Add `readerSentence(src, operands)` to `panels/shared/conditionLogic.ts`, per design.md Decision 4.
- [x] 2.2 Add `condition.readerRaw` to the studio catalog, `packages/web/src/i18n/catalogs/studio.ts`.
- [x] 2.3 Test the two scenarios of "A condition reads as a sentence outside the builder", and a two-row condition.

## 3. The lock, the taken set and the writes

- [x] 3.1 In `panels/fieldCatalogLogic.ts`, drop the reader clause from `isFieldKeyLocked` and its `draft` argument.
- [x] 3.2 Add `takenFieldKeys(draft, exceptId?)` with its three parts, per design.md Decision 2.
- [x] 3.3 Make `labelChangePatch` use both, and keep a read key when the label derives an empty one.
- [x] 3.4 In `nextFieldKey`, let a prior empty derivation match a read key, per design.md Decision 2.
- [x] 3.5 Add `keyCommitProblem(draft, field, typed)` per design.md Decision 2. A group always answers `undefined`.
- [x] 3.6 Add `keyFollowsLabel(draft, field)` per design.md Decision 2.
- [x] 3.7 Add `draft/fieldKey.ts::writeFieldKey(d, fieldId, next)`. A group goes to `writeGroupKey`; any other field rewrites its readers.
- [x] 3.8 Make `draft/fieldLabel.ts::writeFieldLabel` rewrite the readers when the derived key moves.
- [x] 3.9 Fix the tests that pin the old lock: `studio-fieldCatalogLogic.test.ts`, `studio-fieldCatalogPanel.test.tsx`, `studio-mintField.test.ts`.
- [x] 3.10 Test each scenario of the eight key-derivation requirements. Test each scenario of the rewrite requirement too.
- [x] 3.11 Test each `keyCommitProblem` answer. Test a commit onto a key only an expression reads.
- [x] 3.12 Test that a group commits an empty key and another group's key as before, and rewrites its view entries.
- [x] 3.13 In `studio-fieldLabel.test.ts`, test that `writeFieldLabel` rewrites a guard and leaves one on a published field.
- [x] 3.14 Mint through `takenFieldKeys` in `FormEditorScreen.tsx::mintAndPlace`. Test it in `studio-mintField.test.ts`.

## 4. The field editor's key, rewrite line and label path

- [x] 4.1 In `FieldCatalogPanel.tsx`, move the key input into a Developer view after the description, per design.md Decision 5.
- [x] 4.2 Add the Escape event to `keyInputStep` and the input. Add `autoComplete="off"` and `translate="no"`.
- [x] 4.3 Show a refused commit's sentence under the input, with `aria-invalid` and `aria-describedby`. Clear it on the next keystroke.
- [x] 4.4 Rework `keyNoticeFor` per design.md Decision 5, and show its sentence inside the Developer view.
- [x] 4.5 Open the Developer view while a check on the key stands in "What this field asks".
- [x] 4.6 Route the label control through `mutate((d) => writeFieldLabel(...))`, still bumping the definition-write counter.
- [x] 4.7 Route the key commit through `writeFieldKey` and bump the definition-write counter. Count readers before each write.
- [x] 4.8 Add the rewrite line under the label row in an always-present polite live region, per design.md Decision 3.
- [x] 4.9 Add the catalog strings of design.md Decision 6 for the key and the rewrite line. Remove `keyReadByOne` and `keyReadByMany`.
- [x] 4.10 Test the scenarios of the Developer view, commit, refusal and rewrite line requirements.
- [x] 4.11 Replace the reader-notice tests in `studio-fieldCatalogPanel.test.tsx` with tests of the new sentences.

## 5. The "Read by" zone

- [x] 5.1 Add `panels/readByRows.ts`, which turns reader sites into place and sentence rows per design.md Decision 4.
- [x] 5.2 Add the `readBy.*` and `fieldCatalog.readBy*` catalog strings of design.md Decision 6.
- [x] 5.3 Draw the "Read by" zone under "Used in" for a field that is not a group. Memoize it on the draft, key and locale.
- [x] 5.4 Test every place kind in the classification table, a note included. Test every "Read by" scenario.
- [x] 5.5 Test the effect half's zone order, with "Read by" second.
- [x] 5.6 Test that a rendered zone over three readers contains no `data.` and no key.

## 6. The change list

- [x] 6.1 Add a `describeChanges` test for "The change list shows the rename". Fix `draft/changeSet.ts` only if the test fails.

## 7. Documents

- [x] 7.1 In `docs/authoring-guide.md`, state that the key follows the label until the first publish, and that a rename rewrites readers.
- [x] 7.2 In `docs/browser-checks.md`, replace the `guard-field-key-renames` walk with a walk over the new rename.
- [x] 7.3 Rewrite the notice lines of the change-list walk there. Open the Developer view in the 1040px walk.
- [x] 7.4 In `docs/decisions.md`, close `FIELDS-27` and move its text to `docs/decisions-archive.md`. Add an "Open from" section.
- [x] 7.5 List there: the pending hint, the index read, a child's callers, and the form editor's missing rewrite line.
- [x] 7.6 In `.claude/rules/ui-glossary.md`, name the key input's place in the field editor's Developer view.
- [x] 7.7 Add the terms "Read by zone" and "rewrite line" there, and widen the entry "sentence".
- [x] 7.8 Run `antislop check` on every Markdown file this group touched. Add no finding.

## 8. Verification

- [x] 8.1 Run `bun run typecheck` in the devcontainer. Expect exit code 0.
- [x] 8.2 Run `bun run build` in the devcontainer. Expect exit code 0.
- [x] 8.3 Run the full suite: `rtk test sh scripts/dev-exec.sh sh scripts/test-gated.sh bun test`.
- [x] 8.4 Read the pass, skip and fail counts off that run. Compare the pass count with `scripts/gates/pass-floor.txt`.
- [x] 8.5 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` on the host. Read its exit code.
- [x] 8.6 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh` on the host. Read its exit code.
- [x] 8.7 On the production bundle, rename an unpublished field a guard reads. The guard follows, and the rewrite line counts it.
- [x] 8.8 Commit a key in a published field's Developer view. The guard follows; the Publish dialog lists both rows.
- [x] 8.9 Read the "Read by" zone of a field with several readers. No CEL or key shows.
- [x] 8.10 Run `/impeccable critique` and `/impeccable audit` on the Fields tab. Run `impeccable detect --json`, since the CSP blocks the overlay.
- [x] 8.11 Run `sh scripts/dev-exec.sh bun run e2e` in the devcontainer. Expect every flow to pass.

## Workflow follow-up

- Verify, sync the specs, and archive. Place each ADDED block by hand, since the archive appends it at the end.
- Set the stage 64 status line in `ROADMAP.md`.
- Push, open the PR, and merge on green CI.
