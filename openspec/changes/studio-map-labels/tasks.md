# Tasks

## 1. The words: one module, no CEL fallback

- [ ] 1.1 In `panels/shared/conditionLogic.ts`, add `guardPhrase` per design D2. Keep `edgeGuardLabel` for now.
- [ ] 1.2 Drop the `RawRowReading` parameter and type, so `summarizeCondition` always reads the phrase, per D2.
- [ ] 1.3 Add `condition.handWrittenHolds`, "a hand-written rule holds", to `i18n/catalogs/studio.ts`.
- [ ] 1.4 Make `draft/guarded-path-notes.ts` read `guardPhrase` and drop `raw`. Drop `FormPreview.tsx`'s `<code>` branch, per D2.
- [ ] 1.5 Add `canvas/mapWords.ts` per design D1, D3, D9 and D11, with `stampLines` per D4.
- [ ] 1.6 Add the catalog keys of D9 and D10. Rewrite the `stepRole` comment and the accessible-name comment, per D10.
- [ ] 1.7 Delete `canvas/pathName.ts`. Point `CanvasView.tsx` at `mapWords.ts` for both accessible names.
- [ ] 1.8 Delete the six retired name keys of D9. Keep `elseMarker` and `initialStamp` for group 2.
- [ ] 1.9 Add `studio-mapWords.test.ts`: each row of D3's table, ranks at 10 and 20, the sixth rank and both stamps.
- [ ] 1.10 There, test both names, an empty guard source, two unnamed steps and a long outcome's `stampLines`.
- [ ] 1.11 There, assert no key, no enum value, no `priority` number and no CEL source in any name or sentence.
- [ ] 1.12 Move `studio-edgeGuardLabel.test.ts` to `studio-guardPhrase.test.ts` against `guardPhrase`, per D2's three cases.
- [ ] 1.13 Drop that file's canvas source-text block. Group 2's task 2.11 covers the canvas.
- [ ] 1.14 Fix `studio-conditionLogic.test.ts` and `studio-guardedPathNotes.test.ts` for D2, with no `raw` flag left.
- [ ] 1.15 Fix `studio-formPreview.test.tsx`: the line reads "Approve: shown only when a hand-written rule holds", with no `<code>`.
- [ ] 1.16 Run typecheck, then the full suite with `DATABASE_URL` set, both in the foreground. Name any failing test.

## 2. The canvas draws the words

- [ ] 2.1 Move `NodeLabel`'s clip measurement into a `useClipped(ref, text)` hook in `CanvasView.tsx`, per design D5.
- [ ] 2.2 Add `NodeStamp` and draw both stamps per D4. Delete `stampCircle`, `stampText` and `canvas.initialStamp`.
- [ ] 2.3 Add `EdgeLabel` and draw `wayOutSentence` per D5, with `aria-hidden` on its text block.
- [ ] 2.4 Delete `edgeBadge`, both badge texts, `canvas.elseMarker`, `guardEdgeLabel` and `edgeGuardLabel`.
- [ ] 2.5 Add the connect handle's hit circle with its `<title>`, per D6.
- [ ] 2.6 Make the node body read `stepTextMap`, never `step.key`, per D11.
- [ ] 2.7 Delete the inline rename per D8, with `inlineRename.ts`, its test and `stepSections.renameLabel`.
- [ ] 2.8 Add the double-click handlers on the node, the edge group and the sentence, per D7.
- [ ] 2.9 Give `onOpenStepPage` its `pathId`. Add `waysOutRequest` to `EditScreen.tsx` per D7. `StepPage.tsx` reads it.
- [ ] 2.10 Rewrite the canvas block of `studio-processSurface.test.ts` for D7 and D8.
- [ ] 2.10a There, each double-click handler calls `onOpenStepPage`, and `onNodePointerUp` still does not.
- [ ] 2.10b There, the node's `onDoubleClick` has no `startRename`, and the opener bumps `waysOutRequest`.
- [ ] 2.11 Rewrite `studio-canvas-node-a11y.test.tsx` to the new names, stamps and sentences, with no badge or "else".
- [ ] 2.12 There, assert the handle's two titles and each stamp's `aria-hidden`.
- [ ] 2.13 Fix `studio-canvas-node-label.test.tsx`: a keyed step with no label prints "(unnamed step)".
- [ ] 2.14 In `studio-stepPage.test.tsx`, assert that the Ways-out effect's keys name `waysOutRequest`.
- [ ] 2.15 Run typecheck, then the full suite with `DATABASE_URL` set, both in the foreground. Name any failing test.

## 3. The catalog control, the docs and the records

- [ ] 3.1 Set `fieldCatalog.showOnCanvas` to "Show on the map", and fix every test that reads the old string.
- [ ] 3.2 In `docs/authoring-guide.md`, beside "Map draws the process on a canvas.", say what a double-click and the handle do.
- [ ] 3.3 In `docs/browser-checks.md`, rewrite the four passages naming the raw-CEL label, the badge or the inline rename.
- [ ] 3.4 Add a `docs/browser-checks.md` entry for this change, holding the walk of tasks 4.4 to 4.7.
- [ ] 3.5 In `.claude/rules/ui-glossary.md`, add the way out's line on the canvas to the sentence row, with `canvas/mapWords.ts`.
- [ ] 3.6 In `docs/decisions.md`, close SELECTS-4, SENTENCE-3, ACCORDION-1 and the Show on the canvas entry.
- [ ] 3.7 There, close the `neutral900` stamp site, and fix the palette entry near line 540.
- [ ] 3.8 There, fix FIELDS-9 and KEYFOLLOW-9, which still say "Show on the canvas".
- [ ] 3.9 There, record this change's open points under its own heading, starting from design.md's Non-Goals.
- [ ] 3.10 Run `antislop check` on every Markdown file this group touched. Add no finding.

## 4. Verification

- [ ] 4.1 Run `bun run typecheck` and `bun run build`, and report the last lines of each.
- [ ] 4.2 Run the full suite: `rtk test sh scripts/dev-exec.sh sh scripts/test-gated.sh bun test`. Report its summary line.
- [ ] 4.3 On the host, run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` and the same with `whitespace.sh`.
- [ ] 4.4 On the production build, check both stamps, a long outcome, and Fit to view framing a stamp.
- [ ] 4.5 Check the sentences on two seeded maps, at 1440 and at 1024 wide.
- [ ] 4.6 Check the handle's two tooltips, a press 10px off its centre, and the end step's cursor.
- [ ] 4.7 Check each double-click: node, way out, waypoint, and the reopen of a folded Ways out.
- [ ] 4.8 Run `/impeccable critique` and `/impeccable audit` on the Map tab, and `impeccable detect --json` in place of the overlay.

## Workflow follow-up

- Run `openspec-verify-change`, then `openspec-sync-specs`, then archive.
- At sync, move each ADDED block to its removed predecessor's place. Then grep the old names and run `openspec validate <cap> --type spec --strict`.
- Rewrite the stage 64 status line in `ROADMAP.md`.
