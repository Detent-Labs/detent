## 1. Contain the hidden text

- [x] 1.1 Write `packages/web/test/hiddenTextContainment.test.ts` per design D3. It covers `ProcessTabRow.tsx` `row`, `EntityTabs.tsx` `rail`, `EditScreen.tsx` `tabBody` and `form-ui`'s `FieldForm.tsx` `tabRow`. Verify: the full `bun test` with `DATABASE_URL` set names four failures in that file.
- [x] 1.2 Add `position: "relative"` to those four styles, each with a one-line comment naming the hidden text it contains (design D1, D2). Verify: after `bun install --frozen-lockfile` in the container, `bun run typecheck` passes. The full `bun test` then names no failure in that file.

## 2. Documents

- [x] 2.1 Append a `docs/browser-checks.md` entry headed `### Hidden text stays inside its scroll region (visually-hidden-text-page-bounds)`, with design D3's probe. The probe's ancestor test matches `auto`, `scroll`, `hidden` and `clip`. Give Pass lines for the three delta-spec scenarios and the Player case from design Risks. Verify: antislop count stays at or below `origin/main`.
  - Setup one: the IT Offboarding draft, with one unconnected step added from the canvas bar as the blocker (`docs/browser-checks.md:3112`).
  - Setup two: that draft's Fields tab, and its Changes tab with every row opened.
  - Setup three: `purchase-requisition`'s Finance Review in the Player, submitted from "Review" with Finance Note empty (`docs/browser-checks.md:3329`).
- [x] 2.2 Remove CHANGES-1 and FIELDS-2 from `docs/decisions.md`. File the menu paint-over the review met, from this change's `proposal.md` What Changes. Verify: no other entry still points at either tag, and antislop stays at or below `origin/main`.

## 3. Verification

- [ ] 3.1 Run `bun run typecheck` and `bun run build` in the devcontainer. Verify: both exit 0.
- [ ] 3.2 Run the full `bun test` with `DATABASE_URL` set, piped through `scripts/gates/silent-green.sh`. Verify: 0 fail, and the gate exits 0.
- [ ] 3.3 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh`, then the same pipe into `prose.sh`. Verify: both exit 0.
- [ ] 3.4 Walk the new `docs/browser-checks.md` entry and the Fields view's narrow-width check on the production build. Verify: every Pass line holds, with measured numbers recorded.
- [ ] 3.5 Run the design detector from the CLI on the four edited files, after a positive control. Run `/impeccable critique` and `/impeccable audit` on the two routes design D4 names. Verify: no finding this change causes.
