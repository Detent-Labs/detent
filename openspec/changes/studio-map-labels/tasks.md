# Tasks

## 1. The words: one module, no CEL fallback

- [ ] 1.1 In `panels/shared/conditionLogic.ts`, replace `guardEdgeLabel` and `edgeGuardLabel` with `guardPhrase`, per design D2.
- [ ] 1.2 Drop the `RawRowReading` parameter and type, so `summarizeCondition` always reads the phrase, per D2.
- [ ] 1.3 Add `condition.handWrittenHolds`, "a hand-written rule holds", to `i18n/catalogs/studio.ts`.
- [ ] 1.4 Make `draft/guarded-path-notes.ts` read `guardPhrase` and drop `raw`. Drop `FormPreview.tsx`'s `<code>` branch, per D2.
- [ ] 1.5 Add `canvas/mapWords.ts` with `stampWords`, `wayOutSentence`, `nodeName`, `pathName` and `orderWord`, per D1, D3 and D9.
- [ ] 1.6 Add the catalog keys of design D9 and D10. Delete the eight keys D9 retires.
- [ ] 1.7 Delete `canvas/pathName.ts`, and point `CanvasView.tsx` at `mapWords.ts` for both accessible names.
- [ ] 1.8 Add `studio-mapWords.test.ts`: each row of D3's table, ranks at 10 and 20, "Number 6", both stamps, both names.
- [ ] 1.9 There, assert no key, no enum value, no `priority` number and no CEL source in any name or sentence.
- [ ] 1.10 Rewrite `studio-edgeGuardLabel.test.ts` against `guardPhrase`: an unreadable guard reads "a hand-written rule holds".
- [ ] 1.11 Fix `studio-conditionLogic.test.ts` and `studio-guardedPathNotes.test.ts` for D2, with no `raw` flag left.
- [ ] 1.12 Run typecheck, then the full suite with `DATABASE_URL` set, both in the foreground. Name any failing test.

## 2. The canvas draws the words

- [ ] 2.1 Move `NodeLabel`'s clip measurement into a `useClipped(ref, text)` hook in `CanvasView.tsx`, per design D5.
- [ ] 2.2 Add `NodeStamp` and draw both stamps from `stampWords`, per D4. Delete `stampCircle` and `stampText`.
- [ ] 2.3 Add `EdgeLabel` and draw `wayOutSentence` on every path that has one, per D5. Delete `edgeBadge` and both badge texts.
- [ ] 2.4 Add the connect handle's hit circle with its `<title>`, per D6.
- [ ] 2.5 Make `stepLabel` fall back to `steps.unnamedStep`, never to `step.key`, per D11.
- [ ] 2.6 Delete the inline rename per D8, with `inlineRename.ts`, its test and `stepSections.renameLabel`.
- [ ] 2.7 Add the double-click handlers on the node, the edge group and the sentence, per D7.
- [ ] 2.8 Give `onOpenStepPage` its `pathId`. Add `waysOutRequest` to `EditScreen.tsx` per D7. `StepPage.tsx` reads it.
- [ ] 2.9 Rewrite `studio-canvas-node-a11y.test.tsx` to the new names, stamps and sentences, with no badge or "else".
- [ ] 2.10 There, assert the handle's two titles, each stamp's `aria-hidden`, and `onDoubleClick` wiring through the open callback.
- [ ] 2.11 Fix `studio-canvas-node-label.test.tsx`: a keyed step with no label prints "(unnamed step)".
- [ ] 2.12 Add a `StepPage` test: a bumped `waysOutRequest` reopens Ways out for an unchanged `selectedPathId`.
- [ ] 2.13 Run typecheck, then the full suite with `DATABASE_URL` set, both in the foreground. Name any failing test.

## 3. The catalog control, the docs and the records

- [ ] 3.1 Set `fieldCatalog.showOnCanvas` to "Show on the map", and fix every test that reads the old string.
- [ ] 3.2 In `docs/authoring-guide.md`, beside "Map draws the process on a canvas.", say what a double-click and the handle do.
- [ ] 3.3 In `docs/browser-checks.md`, rewrite the two passages that name the inline rename or the raw-CEL edge fallback.
- [ ] 3.4 Add a `docs/browser-checks.md` entry for this change, holding the walk of task 4.4.
- [ ] 3.5 In `docs/decisions.md`, close SELECTS-4, SENTENCE-3, ACCORDION-1, the Show on the canvas entry and the `neutral900` stamp site.
- [ ] 3.6 There, record this change's open points under its own heading, starting from design.md's Non-Goals.
- [ ] 3.7 Run `antislop check` on every Markdown file this group touched. Add no finding.

## 4. Verification

- [ ] 4.1 Run `bun run typecheck` and `bun run build`, and report the last lines of each.
- [ ] 4.2 Run the full suite: `rtk test sh scripts/dev-exec.sh sh scripts/test-gated.sh bun test`. Report its summary line.
- [ ] 4.3 On the host, run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` and the same with `whitespace.sh`.
- [ ] 4.4 Walk the Map tab on the production build: stamps, sentences at 1440 and 1024 wide, handle tooltip, both double-clicks.
- [ ] 4.5 Run `/impeccable critique` and `/impeccable audit` on the Map tab, and `impeccable detect --json` in place of the overlay.

## Workflow follow-up

- Run `openspec-verify-change`, then `openspec-sync-specs`, then archive.
- Rewrite the stage 64 status line in `ROADMAP.md`.
