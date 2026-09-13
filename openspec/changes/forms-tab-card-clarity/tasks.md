## 1. The count and the foot

- [ ] 1.1 Rewrite the count assertions in `packages/web/test/studio-formCardRows.test.ts` first. The group-break test expects `fieldCount` 1. A view of one group entry alone reads `fieldCount` 0. The file's header comment cites the two added requirement names. The group-break test's title drops "and still counts it in fieldCount". Verify both assertions fail against today's code.
- [ ] 1.2 Rewrite the foot assertions in `packages/web/test/studio-formsTab.test.tsx` first, per the table in `design.md`. Cover `>1 field<` on a view of one optional entry, then `>1 field, 1 required<`, `>4 fields, 1 required<` and `>4 fields<`. The notes-only test reads "No fields yet" where it read "Empty form". The order test finds the count by its new text. The empty-form test asserts no "Empty form", and no `<span` between "No fields yet" and "Start the form". Verify the two required-count texts and the empty-form test fail today, while `>1 field<` and `>4 fields<` pass.
- [ ] 1.3 Add a check to `packages/web/test/studio-guidedSurfaceStyle.test.ts` that the `openControl` block declares `marginInlineStart: "auto"`. Verify it fails against today's code.
- [ ] 1.4 Rework `fieldCount` in `formCardRows.ts` and the foot in `FormsTab.tsx`, per `design.md`. Retire `formsTab.emptyForm` and rewrite the catalog comment over the count keys. Verify typecheck passes, and 1.1 to 1.3 pass in the full suite run.

## 2. The miniature and the open control

- [ ] 2.1 Rewrite the miniature assertions in `packages/web/test/studio-formsTab.test.tsx` first. The `miniatures()` helper matches the `aria-hidden="true"` element. No `role="img"` remains, and no miniature `aria-label`. Keep one miniature per non-empty card, and keep the no-focus loop's guard. The order test locates the miniature by `aria-hidden="true"` as well. Verify the new assertions fail against today's code.
- [ ] 2.2 Add assertions on the open control's name first. Its `aria-labelledby` lists its own `id`, then the id of the span holding the step label. Two cards' controls name different spans. Verify they fail against today's code.
- [ ] 2.3 Mint the two ids with `useId`, set `aria-labelledby`, and hide the miniature, per `design.md`. Rewrite the comments that quote a removed requirement name or the miniature's accessible name. They are `styles.miniature`'s and `Miniature`'s in `FormsTab.tsx`, and `MiniatureEntry`'s and `requiredCount`'s in `formCardRows.ts`. Verify 2.1 and 2.2 pass in the full suite run.

## 3. Documentation

- [ ] 3.1 Update the Form Card section of `DESIGN.md`. The foot carries the field count, and the required count where an entry declares `required: true`. An empty form's foot carries the control alone. Verify the section says both.
- [ ] 3.2 Update the Forms tab paragraphs in `docs/current-state.md`. Replace the `role="img"` sentence with the hidden miniature, the foot's text and the control's name. Verify every symbol they name exists after groups 1 and 2.
- [ ] 3.3 Append a step to the Forms tab entry in `docs/browser-checks.md`, after step 4. It reads the accessibility tree on "Review the Exit Notification", a card step 4 leaves alone. Pass: the control's name reads "Open the form Review the Exit Notification". The foot reads "22 fields, 2 required", and no miniature node appears. Add `forms-tab-card-clarity` to the entry's Source line. Verify the step states its pass line.
- [ ] 3.4 Append a second step after it. The step opens "Hold and Close the Account" from its card and empties it without saving. Pass: back on the Forms tab, that card's foot holds "Start the form" alone, at its trailing edge. The card's accessibility tree reads "No fields yet". The closing paragraph adds the leave-draft confirm that Back to processes now raises, which the tester accepts. Verify the step states its pass line.
- [ ] 3.5 Update `docs/decisions.md` per `design.md`: drop FORMS-1, FORMS-3 and FORMS-4, and rewrite the questions paragraph, FORMS-2 and FORMS-5. Then re-read every `FormsTab.tsx:`, `formCardRows.ts:`, `studio.ts:`, `DESIGN.md:` and `browser-checks.md:` citation in the file. Correct each line that moved. FORMS-2 names its requirement rather than a `spec.md` line. The rewritten paragraph records the answers without the retired tags. Verify `grep -nE 'FORMS-(1|3|4)\b' docs/decisions.md` prints nothing.

## 4. Verification

- [ ] 4.1 Run `bun run typecheck`, then `bun run build`, in the devcontainer. Verify both exit 0 and record what each printed.
- [ ] 4.2 Run the full `bun test` with `DATABASE_URL` set, piped through `scripts/gates/silent-green.sh`. Verify zero failures and a skip count at or under the floor.
- [ ] 4.3 Run `sh ~/.claude/skills/impeccable/scripts/impeccable detect --json packages/web/src/areas/studio/panels/FormsTab.tsx` once. Where the checkout has no detector hook, this run stands in for the per-edit one. Verify no finding remains open, or record why one stands.
- [ ] 4.4 Run the Forms tab browser check with its two new steps, then `/impeccable critique` and `/impeccable audit` on the Forms tab. Pass `-s=forms-card-clarity` to every `playwright-cli` call, and read names through `run-code` with `ariaSnapshot()`. Verify every step passes, and record the names and foot texts read.
- [ ] 4.5 Run the prose gate and the whitespace gate over the pushed range, per `CLAUDE.md`. Verify both exit 0.
