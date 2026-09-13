## 1. The miniature

- [x] 1.1 Add `formsTab.miniatureLabel`, `formsTab.miniatureLabelOne` and `formsTab.miniatureEmpty` to the studio catalog, with the wording `design.md` gives. Verify `bun run typecheck` passes.
- [x] 1.2 Rewrite the miniature assertions in `packages/web/test/studio-formCardRows.test.ts` first. Cover mark order by height, a group break, a skipped note and a stale reference at 12px. Cover a group entry raising `fieldCount` by one while drawing no mark. Cover `requiredCount`, the heights 8, 12, 16 and 24, and a view of notes alone counting as empty. Verify the height, group break and `requiredCount` assertions fail against today's code.
- [x] 1.3 Rewrite the miniature assertions in `packages/web/test/studio-formsTab.test.tsx` first. Cover the `role="img"` name, "No fields yet", and "Empty form" with "Start the form" on a view of notes alone. Rewrite the `miniatures()` helper to match the `role="img"` element, since it matches `<ul>` today. Assert it finds one miniature per non-empty card before the no-focus loop runs. Verify the name and "No fields yet" assertions fail against today's code.
- [x] 1.4 Update `packages/web/test/studio-guidedSurfaceStyle.test.ts` first. Point the `miniatureRequired` block check at `backgroundColor`. Add a check that the `miniature` block declares `flexWrap: "wrap"` and `alignItems: "flex-end"`, and matches no `/overflow[XY]?: "hidden"/`. Verify the `backgroundColor`, `flexWrap` and `alignItems` assertions fail against today's code. The no-clip assertion passes today and guards a regression.
- [x] 1.5 Rework `formCardRows.ts` and the miniature in `FormsTab.tsx` in one task, per `design.md`. Retire `formsTab.requiredMark` and `formsTab.noteEntry` in the same task. Verify typecheck passes and the three test files from 1.2 to 1.4 pass in the full suite run.

## 2. The foot row

- [x] 2.1 Add the foot assertions to `packages/web/test/studio-formsTab.test.tsx` first. The count follows the miniature and precedes the open control. The words "Open the form" and "Start the form" stay. Match the count as element text, `>1 field<` and `>4 fields<`, in the two existing count tests and in the order assertion. Verify the order assertion fails against today's code.
- [x] 2.2 Move the count into a foot row beside the open control, per `design.md`. Restyle the control as the authoring command with 4px block padding, and set the card's gap to 4px. Verify the foot assertions pass in the full suite run.

## 3. Documentation

- [x] 3.1 Update `DESIGN.md`: the Form Card section, the Accent on Muted line and the authoring command paragraph in Buttons. Widen that paragraph and the Do's line from a row of secondary commands to a card's single open control. State in the Form Card section that the card's command takes 4px block padding, where the authoring command takes 8px. Verify the Form Card section names outlined marks, filled required marks, group breaks and the foot row.
- [x] 3.2 Widen the authoring command rule in `.claude/rules/design-language.md` the same way. Verify its wording matches `DESIGN.md`.
- [x] 3.3 Rewrite the `--color-accent-on-muted` comment in `packages/web/src/shell/tokens.css`. The filled required mark is a graphic held to 3:1, which the token clears in both schemes. It reads this token to keep the required color the asterisk used. Verify the comment claims no 4.5:1 need for the mark and still names `.btn-destructive` as the reader held to 4.5:1.
- [x] 3.4 Update the Forms tab paragraph in `docs/current-state.md`. Verify every symbol it names exists after groups 1 and 2.
- [x] 3.5 Add a Forms tab check to `docs/browser-checks.md`, on a fresh `it_offboarding` draft at 1100px wide. Step one sizes the window until the Forms tab body measures 635px tall. It then reads the twelfth card's open control without scrolling. Step two reads both mark kinds, outlined and filled, in the light scheme. Verify both steps state their pass line.
- [x] 3.6 Extend that check with two more steps. Step three repeats both reads in the dark scheme. Step four adds ten field entries to Submit the Exit Notification in the form editor. Back on the Forms tab, its marks continue on a second line, none clipped. Verify both steps state their pass line.

## 4. Verification

- [ ] 4.1 Run `bun run typecheck`, then `bun run build`, in the devcontainer. Verify both exit 0 and record what each printed.
- [ ] 4.2 Run the full `bun test` with `DATABASE_URL` set, piped through `scripts/gates/silent-green.sh`. Verify zero failures and a skip count at or under the floor.
- [ ] 4.3 Run `sh ~/.claude/skills/impeccable/scripts/impeccable detect --json packages/web/src/areas/studio/panels/FormsTab.tsx` once. Verify no finding remains open, or record why one stands.
- [ ] 4.4 Run the new browser check, then `/impeccable critique` and `/impeccable audit` on the Forms tab. Verify both schemes pass and record the measured card height.
- [ ] 4.5 Run the prose gate and the whitespace gate over the pushed range, per `CLAUDE.md`. Verify both exit 0.
