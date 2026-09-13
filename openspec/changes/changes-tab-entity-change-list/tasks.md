## 1. The dormant role

- [x] 1.1 Add the dormant primitive and role to `tokens.css` and `tokens.stylex.ts`, per D6. Verify: typecheck passes.
- [x] 1.2 Name the role in `DESIGN.md` and `.claude/rules/design-language.md`, and file the five literal colors in `docs/decisions.md`, per D11. Verify: antislop reports no new finding.

## 2. The change set logic

- [x] 2.1 Write `packages/web/test/studio-changeSet.test.ts`, per D9. Verify: each case fails first.
- [x] 2.2 Add every word `draft/changeSet.ts` returns to the studio catalog, per D4 and D5. Verify: typecheck passes.
- [x] 2.3 Build pairing and row ownership, per D1 to D3, without D2's two fallback rules. Verify: the anchor and ownership cases pass.
- [x] 2.4 Add order detection, per D4. Verify: the reorder case and the moved-field case pass.
- [x] 2.5 Add the D5 value rules, the guided words from D3 and the `locale` argument. Verify: the locale, guided-word and JSON-key cases pass.
- [x] 2.6 Complete the D5 word table until the coverage walk from 2.1 passes. Verify: it names every declared key it checks.
- [x] 2.7 Make the walker total over malformed bodies, and add D2's two fallback rules. Verify: those cases pass and throw nothing.
- [x] 2.8 Add `tabForChangeGroup` to `draft/process-tabs.ts`, per D10. Verify: a case in `studio-processTabs.test.ts` maps every group.

## 3. The change list component

- [x] 3.1 Add the component copy to the studio catalog, one key per sentence, per D6. Verify: typecheck passes.
- [x] 3.2 Write `packages/web/test/studio-changeList.test.tsx`, per D9. Verify: each case fails first.
- [x] 3.3 Build `panels/ChangeList.tsx`, per D6 and its shape brief. Verify: the change list cases pass.

## 4. The Changes tab

- [x] 4.1 Give `ChangesView` a `contentLocale` prop, passed from `EditScreen.tsx` as `PathsView` takes one. Mount `ChangeList` there, and drop the old list markup. Verify: the tab count reads the row count, and a German label reads in German.
- [x] 4.2 Add `openTabFromRow` to `EditScreen.tsx` and wire both row commands, per D10. Verify: typecheck passes.

## 5. The Versions screen

- [x] 5.1 Mount `ChangeList` in `VersionsScreen.tsx` with its waiting line, per D7. Drop the old list markup, its diff styles and the unused imports. Verify: typecheck passes, and `DIFF_KIND_FIRST_CODE_STYLE` is gone.

## 6. Documents

- [x] 6.1 Rewrite the Changes walk in `docs/browser-checks.md`, and add the Versions and keyboard walks, per D11. Verify: antislop reports no new finding.
- [x] 6.2 Rewrite the D11 passages in `docs/current-state.md`, including its Versions-screen sentence. Rewrite `openspec/config.yaml`'s context line too. Verify: antislop reports no new finding.
- [x] 6.3 Add the glossary's change list row, and rewrite its Developer view row, per D11. Verify: antislop reports no new finding.
- [x] 6.4 Reword the Purpose of `openspec/specs/process-version-inspection/spec.md` to name the change list. Verify: antislop reports no new finding on that file.

## 7. Verification

- [ ] 7.1 Run `bun run typecheck`, then `bun run build`, in the devcontainer. Verify: both exit 0.
- [ ] 7.2 Run the full `bun test` with `DATABASE_URL` set, piped through `scripts/gates/silent-green.sh`. Verify: no named failure.
- [ ] 7.3 Run the prose gate and the whitespace gate over the pushed range. Verify: both pass.
- [ ] 7.4 Walk the new `docs/browser-checks.md` entries in a real browser, at desktop width and at 400px. Verify: every pass line holds.
- [ ] 7.5 Run `/impeccable critique`, `/impeccable audit`, the detector and `web-design-guidelines` on both changed screens. Verify: no open finding remains.
