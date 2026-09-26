# Tasks

## 1. Ring tokens

- [ ] 1.1 In `packages/web/src/shell/tokens.css`, add `--focus-ring-width: 2px`,
  `--focus-ring-offset: 2px` and `--focus-ring-reach` as their `calc()` sum.
  Verify with a grep that the file still has no element selector.
- [ ] 1.2 In `packages/web/src/shell/global.css`, make the `:focus-visible`
  rule read `--focus-ring-width` and `--focus-ring-offset` in place of both
  `2px` literals. Verify in the browser that a focused button's computed
  `outline-width` and `outline-offset` still read 2px.
- [ ] 1.3 In `packages/form-ui/src/tokens.stylex.ts`, add a `focus` group with
  `reach: "var(--focus-ring-reach)"`. Run `bun install` in the container,
  then verify that `bun run typecheck` reports no error.

## 2. Pad the four named boxes

- [ ] 2.1 Pad `StepsRail.tsx`'s `rail` by `focus.reach` on all four sides
  (RAIL-3). Verify in the browser that the first step's ring shows in full.
- [ ] 2.2 Pad `EntityTabs.tsx`'s `rail` and `editor` by `focus.reach`
  (FIELDS-4). Verify in the browser that the chosen entry's ring shows in
  full.
- [ ] 2.3 Pad `EditScreen.tsx`'s `tabBody` by `focus.reach` (CHANGES-2).
  Verify in the browser that the Expand all command's ring shows in full.
- [ ] 2.4 Pad `ProcessTabRow.tsx`'s `row` by `focus.reach` (ROW-1). Move the
  open tab's mark from `tabSelected`'s inset shadow to a `::after` bar, as
  design.md states. Verify at a 400px viewport that a focused tab's ring
  shows in full. Verify also that the open tab's bar sits flush on the
  divider.

## 3. Sweep the other studio boxes

- [ ] 3.1 Tab through `ChecksRail`, `FormsTab`, `FormTabStrip`, `StepPage`,
  `CanvasBar` and `FormEditorScreen` at 1300px and at 400px. Pad each box
  whose ring clips by `focus.reach`. Verify that the list of padded boxes and
  the measured edges land in the task's ledger entry.

## 4. Documents

- [ ] 4.1 In `DESIGN.md` and `.claude/rules/design-language.md`, add one rule
  under Focus: a scroll box pads by the ring's reach. Verify both files state
  the same rule.
- [ ] 4.2 In `docs/decisions.md`, mark RAIL-3, FIELDS-4, CHANGES-2 and ROW-1 as
  resolved by `studio-focus-ring-clipping`, the way RAIL-4 reads. Reword
  each audit section heading to say findings go one change per screen.
  Verify with a grep that no heading still says "each needs its own".
- [ ] 4.3 Add an entry for this change to `docs/browser-checks.md`. Verify it
  names the four boxes and the 400px tab row check.

## 5. Browser check

- [ ] 5.1 Build the web package and serve it from this worktree's container.
  Tab to each control named in tasks 2.1 to 2.4. Verify by measurement that
  each ring's bounding box lies inside its scroll box's visible box.
- [ ] 5.2 Run `/impeccable critique` and `/impeccable audit` on the Steps,
  Fields and Changes tabs. Fix each finding the two reports list, or
  record it in `docs/decisions.md`.
- [ ] 5.3 Add `packages/web/test/studio-scrollBoxRingRoom.test.ts`, a static
  source scan over `packages/web/src/areas/studio/**` that fails unless
  every `overflow`/`overflowX`/`overflowY: "auto"` style also reads
  `focus.reach` in a padding key and a scroll-padding key, or is named in
  a short exempt list with a reason checked against the source. Verify
  `bun test` runs it and it passes with no exempt entry unverified.

## 6. Verification

- [ ] 6.1 Run `bun run typecheck` and verify it reports no errors.
- [ ] 6.2 Run `bun run build` and verify it completes without error.
- [ ] 6.3 Run the full `bun test` suite with `DATABASE_URL` set and verify every test passes with no silent skip.
- [ ] 6.4 Run the antislop and whitespace push gates over the pushed range
  (`sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` and
  the same piped to `whitespace.sh`). Verify both pass on every Markdown
  file this change touched.
