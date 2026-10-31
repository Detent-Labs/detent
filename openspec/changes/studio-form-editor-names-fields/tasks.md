# Tasks

## 1. Draft logic and catalog keys

- [ ] 1.1 Add the new keys of design.md D10 to `packages/web/src/i18n/catalogs/studio.ts`. Remove none yet.
- [ ] 1.2 In `draft/mintField.ts`, list the sixteen `FIELD_KINDS` keys per D5 and drop `KIND_BY_PALETTE_KIND`.
- [ ] 1.2a Point `FormEditorScreen.tsx`'s mint import, `Dragging` type and label lookup at `FieldKindName`, so typecheck stays green.
- [ ] 1.2b Pass the draft's base locale in `FormEditorScreen.tsx`'s `mintAndPlace` call to `mintCatalogField`.
- [ ] 1.3 Make `mintCatalogField(kind, label, baseLocale)` seed two choices on the three choice kinds, per D5.
- [ ] 1.4 Fix `packages/web/test/studio-mintField.test.ts`: every call's base locale, sixteen kinds, Number, the seeded choices.
- [ ] 1.4a Pass a base locale to `mintCatalogField` in `packages/web/test/studio-fieldCatalogLogic.test.ts`, its third argument.
- [ ] 1.5 Drop `""` from `labelChangePatch`'s taken set per D4, with a case in `studio-fieldCatalogLogic.test.ts`.
- [ ] 1.6 Add `draft/fieldLabel.ts` with `writeFieldLabel` per D4, for a top-level, nested and group field.
- [ ] 1.6a Add `packages/web/test/studio-fieldLabel.test.ts`: key follows, dedupe to `amount_2`, lock, nested field, group rewrite.
- [ ] 1.7 Add `firstWorkedStepId` to `draft/performedBy.ts` per D9, with a test of its four cases.
- [ ] 1.8 Move the foot text into `formSizeText` and add `formCounts` in `panels/formCardRows.ts`, per D8.
- [ ] 1.8a Make `FormsTab.tsx` read `formSizeText` in the same commit, and keep `studio-formsTab.test.tsx` green.
- [ ] 1.9 Cover `formSizeText` and `formCounts` in `packages/web/test/studio-formCardRows.test.ts`, groups and notes included.
- [ ] 1.10 Run typecheck, then the full gated suite, both in the foreground. Name any failure.

## 2. The form editor screen

- [ ] 2.1 Replace the header's back control with the breadcrumb of D2 and the reworded `h2`.
- [ ] 2.2 Add the optional props `originTab` and `onOpenStep` to `FormEditorScreen` for the breadcrumb of D2.
- [ ] 2.3 Draw the palette's mint section from the sixteen kinds per D5. Remove the five `formEditor.mint*` keys.
- [ ] 2.4 Print each card's label, kind line and word marks per D6. Drop `renderFieldKey`, `typeLabel` and the width mark.
- [ ] 2.5 Print a group legend's label and a note card's kind word per D6. Remove `formEditor.noteType`.
- [ ] 2.6 Give `LocalizedTextInput` the optional `ariaLabel` and `autoComplete` props of D3.
- [ ] 2.6a Add the `naming` state and `CardNameInput` of D3 on leaf cards and on a group card's legend.
- [ ] 2.6b Wire focus, Enter, Escape and blur per D3, and wrap the input card's controls onto a second row.
- [ ] 2.7 Write the card's name and the strip's Name through `writeFieldLabel` inside `mutate`, per D4.
- [ ] 2.8 Give `FormEditorStrip` the Name control, its translation warning and the label heading of D7.
- [ ] 2.8a Give both strips' Width selects the words of D7, and fix the `TabOption` comment.
- [ ] 2.9 Print `formEditor.markCondition` on the card and in `OverrideField`, per D6. Keep `formEditor.markCel`.
- [ ] 2.10 Give `NoteEditorStrip` group options as label and key pairs, per D7.
- [ ] 2.11 Fix `studio-formEditor-groupCanvas.test.tsx` and `studio-narrowWidths.test.ts` to the new markup.
- [ ] 2.11a Fix `studio-formEditor-strip.test.tsx`: the provider, `onChangeLabel`, `fieldLabel` and `groupOptions` in every mount.
- [ ] 2.11c In that file, assert the Name control and the width words on both strips.
- [ ] 2.11b Fix `studio-conditionInput-childOperands.test.tsx`: `onChangeLabel`, `fieldLabel`, `groupOptions` and the provider.
- [ ] 2.12 Check `studio-vocabulary.test.ts` and `studio-guidedSurfaceStyle.test.ts` against the removed keys and styles.
- [ ] 2.12a In `boundaries.test.ts`, move the site count from 7 to 9 and extend its comment's site list, per D3.
- [ ] 2.13 Add `packages/web/test/studio-formEditor-naming.test.tsx`: the input on an unnamed leaf and group card.
- [ ] 2.13a In that file, assert the input's name and placeholder, and an untranslated label keeping its card.
- [ ] 2.13b There, assert a cleared translation with a base-locale label keeps its card too, per D3.
- [ ] 2.14 In that file, assert a card prints label and kind and no key, and the breadcrumb's three crumbs.
- [ ] 2.15 Run typecheck, then the full gated suite, both in the foreground. Name any failure.

## 3. The editor's place and its entry points

- [ ] 3.1 In `screens/EditScreen.tsx`, mount the editor inside the origin tab's panel per D1, its body kept mounted.
- [ ] 3.2 Add `surfaceTab` to `draft/process-tabs.ts` per D1, with cases in `studio-processTabs.test.ts`.
- [ ] 3.2a Make the screen's `openTab` itself read `surfaceTab`, so every reader follows it.
- [ ] 3.3 Make `openFormEditor` select its step, add the direct-load effect, and clear the origin on leaving, per D1.
- [ ] 3.3a Pass `originTab` and `onOpenStep` to `FormEditorScreen`, now required. `onOpenStep` selects the step and opens Steps.
- [ ] 3.4 Show the restore notice over the editor too, and drop the comment that hid it, per D1.
- [ ] 3.4a In `studio-stash-wiring.test.ts`, expect the ungated notice and flag one gated on `formStepId`.
- [ ] 3.4b There, fix the two mutation cases whose regexes still name the removed gate.
- [ ] 3.5 Thread `onOpenForm` through `FieldsTabViews`, `EntityTabs` and `FieldCatalogPanel` for the empty-state route, per D9.
- [ ] 3.6 Make the empty state's route read `firstWorkedStepId`, and offer no route when it returns nothing.
- [ ] 3.7 Rewrite the step page's Form section per D8. Remove the two `stepSections.view*` keys.
- [ ] 3.8 Remove `configuredFieldCount` from `panels/stepsPanelLogic.ts` and its block in `studio-stepsPanelLogic.test.ts`.
- [ ] 3.10 Extend `studio-stepPage.test.tsx`: the Form section's sentence and control words for a form and for none.
- [ ] 3.11 Extend `studio-fieldCatalogPanel.test.tsx`: the route opens the form, skips a subprocess, hides with no worked step.
- [ ] 3.12 Fix the source scan in `studio-formEditorBoundary.test.tsx` to the editor's place inside the panel.
- [ ] 3.13 Run typecheck, then the full gated suite, both in the foreground. Name any failure.

## 4. Docs and records

- [ ] 4.1 In `.claude/rules/ui-glossary.md`, place the form editor under the tab row and name the breadcrumb, per D1 and D2.
- [ ] 4.2 There, drop the palette from the *section* note, and keep the Forms legend in it, per D5.
- [ ] 4.3 In `docs/authoring-guide.md`, rewrite the form editor walkthrough near "Build the form" to this change's screen.
- [ ] 4.4 Add a `docs/browser-checks.md` entry for this change holding the walk of task 5.6.
- [ ] 4.4a Re-point the three `docs/browser-checks.md` steps that choose "← Back to the process" to the breadcrumb.
- [ ] 4.5 In `docs/decisions.md`, record the two open questions of design.md as open points of this change.
- [ ] 4.5a Move KEYS-1 and the key-less `_2` entry to `docs/decisions-archive.md` word for word, as resolved.
- [ ] 4.6 Run `antislop check` on every Markdown file this group touched. Add no finding.

## 5. Verification

- [ ] 5.1 Run `bun run typecheck` and report its last lines.
- [ ] 5.2 Run `bun run build` and report its last lines.
- [ ] 5.3 Run `rtk test sh scripts/dev-exec.sh sh scripts/test-gated.sh bun test` and report pass, skip and fail.
- [ ] 5.4 On the host, run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` and report its exit code.
- [ ] 5.5 On the host, run the same pipe with `whitespace.sh` and report its exit code.
- [ ] 5.6 Browser check on the production build: mint, name, breadcrumb, tab row, Form section, the Fields route.
- [ ] 5.6a In that check, measure a label at 1100px, a two-column card's input and the palette at 1280px.
- [ ] 5.7 Run `/impeccable critique` and `/impeccable audit` on the form editor, plus `impeccable detect --json`.
- [ ] 5.8 Fix every P0 and P1 the audit reports, then rerun 5.1 to 5.3.

## Workflow follow-up

- Run `openspec-verify-change`, then sync the specs and archive the change.
- At sync, move each ADDED successor to its removed predecessor's place.
- Set the stage 64 status line in `ROADMAP.md`.
