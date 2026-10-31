# Tasks

## 1. Draft logic and catalog keys

- [ ] 1.1 Bring `packages/web/src/i18n/catalogs/studio.ts` to the key list of design.md D10.
- [ ] 1.2 In `draft/mintField.ts`, list the sixteen `FIELD_KINDS` keys per D5 and drop `KIND_BY_PALETTE_KIND`.
- [ ] 1.3 Make `mintCatalogField(kind, label, baseLocale)` seed two choices on the three choice kinds, per D5.
- [ ] 1.4 Fix `packages/web/test/studio-mintField.test.ts`: sixteen kinds in table order, Number's type, the seeded choices.
- [ ] 1.5 Add `draft/fieldLabel.ts` with `writeFieldLabel` per D4, for a top-level, nested and group field.
- [ ] 1.6 Add `packages/web/test/studio-fieldLabel.test.ts`: key follows, dedupe to `amount_2`, lock, nested field, group rewrite.
- [ ] 1.7 Add `draft/stepKinds.ts` with `firstWorkedStepId` per D9, and a test file for its four cases.
- [ ] 1.8 Move the foot text into `formSizeText` and add `formCounts` in `panels/formCardRows.ts`, per D8.
- [ ] 1.9 Cover `formSizeText` and `formCounts` in `packages/web/test/studio-formCardRows.test.ts`, groups and notes included.
- [ ] 1.10 Run the full gated suite in the foreground. Name any failing test.

## 2. The form editor screen

- [ ] 2.1 Replace the header's back control with the breadcrumb of D2 and the reworded `h2`.
- [ ] 2.2 Give `FormEditorScreen` the props `originTab` and `onOpenStep` that the breadcrumb of D2 reads.
- [ ] 2.3 Draw the palette's mint section from the sixteen kinds, each with its icon and name, per D5.
- [ ] 2.4 Print each card's label, kind line and word marks per D6. Drop `renderFieldKey`, `typeLabel` and the width mark.
- [ ] 2.5 Print a group legend's label, and a note card's kind word "Note", per D6.
- [ ] 2.6 Add the `naming` state and the `CardNameInput` variant of D3, with focus, Enter, Escape and blur.
- [ ] 2.7 Write the card's name and the strip's Name through `writeFieldLabel` inside `mutate`, per D4.
- [ ] 2.8 Give `FormEditorStrip` the Name control, the label heading and the width words of D7.
- [ ] 2.9 Print "Condition" in place of "CEL" on the card and in `OverrideField`, per D6.
- [ ] 2.10 Give `NoteEditorStrip` group options as label and key pairs, per D7.
- [ ] 2.11 Fix `studio-formEditor-groupCanvas.test.tsx`, `studio-formEditor-strip.test.tsx` and `studio-narrowWidths.test.ts` to the new markup.
- [ ] 2.12 Check `studio-vocabulary.test.ts`, `studio-guidedSurfaceStyle.test.ts` and `boundaries.test.ts` against the removed keys and styles.
- [ ] 2.13 Add `packages/web/test/studio-formEditor-naming.test.tsx`: the input on an unnamed card, its name, its placeholder.
- [ ] 2.14 In that file, assert a card prints label and kind and no key, and the breadcrumb's three crumbs.
- [ ] 2.15 Run the full gated suite in the foreground. Name any failing test.

## 3. The editor's place and its entry points

- [ ] 3.1 In `screens/EditScreen.tsx`, mount the editor inside the origin tab's panel per D1, its body kept mounted.
- [ ] 3.2 Point the tab row's `open` at the origin tab while the route carries `formStepId`, per D1.
- [ ] 3.3 Make `openFormEditor` select its step, and wire `onOpenStep` to select the step and open Steps.
- [ ] 3.4 Show the restore notice over the editor too, and drop the comment that hid it, per D1.
- [ ] 3.5 Thread `onOpenForm` through `FieldsTabViews`, `EntityTabs` and `FieldCatalogPanel` for the empty-state route, per D9.
- [ ] 3.6 Make the empty state's route read `firstWorkedStepId`, and offer no route when it returns nothing.
- [ ] 3.7 Rewrite the step page's Form section per D8, with "Open the form" or "Start the form".
- [ ] 3.8 Remove `configuredFieldCount` and its block in `packages/web/test/studio-stepsPanelLogic.test.ts`.
- [ ] 3.9 Make `FormsTab.tsx` read `formSizeText`, and keep `studio-formsTab.test.tsx` green.
- [ ] 3.10 Extend `studio-stepPage.test.tsx`: the Form section's sentence and control words for a form and for none.
- [ ] 3.11 Extend `studio-fieldCatalogPanel.test.tsx`: the route opens the form, skips a subprocess, hides with no worked step.
- [ ] 3.12 Fix `studio-formEditorBoundary.test.tsx` to the panel placement and add a check of the tab row above.
- [ ] 3.13 Run the full gated suite in the foreground. Name any failing test.

## 4. Docs and records

- [ ] 4.1 In `.claude/rules/ui-glossary.md`, place the form editor under the tab row and name the breadcrumb, per D1 and D2.
- [ ] 4.2 There, drop the palette from the *section* note, and keep the Forms legend in it, per D5.
- [ ] 4.3 In `docs/authoring-guide.md`, rewrite the form editor walkthrough near "Build the form" to this change's screen.
- [ ] 4.4 Add a `docs/browser-checks.md` entry for this change holding the walk of task 5.6.
- [ ] 4.5 In `docs/decisions.md`, record the two open questions of design.md as open points of this change.
- [ ] 4.6 Run `antislop check` on every Markdown file this group touched. Add no finding.

## 5. Verification

- [ ] 5.1 Run `bun run typecheck` and report its last lines.
- [ ] 5.2 Run `bun run build` and report its last lines.
- [ ] 5.3 Run `rtk test sh scripts/dev-exec.sh sh scripts/test-gated.sh bun test` and report pass, skip and fail.
- [ ] 5.4 On the host, run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` and report its exit code.
- [ ] 5.5 On the host, run the same pipe with `whitespace.sh` and report its exit code.
- [ ] 5.6 Browser check on the production build: mint, name, breadcrumb, tab row, Form section, the Fields route.
- [ ] 5.7 Run `/impeccable critique` and `/impeccable audit` on the form editor, plus `impeccable detect --json`.
- [ ] 5.8 Fix every P0 and P1 the audit reports, then rerun 5.1 to 5.3.

## Workflow follow-up

- Run `openspec-verify-change`, then sync the specs and archive the change.
- At sync, move each ADDED successor to its removed predecessor's place.
- Set the stage 64 status line in `ROADMAP.md`.
