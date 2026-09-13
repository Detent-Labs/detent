## 1. Contain the hidden text

- [ ] 1.1 Write `packages/web/test/hiddenTextContainment.test.ts` per design D3. It covers `ProcessTabRow.tsx` `row`, `EntityTabs.tsx` `rail`, `EditScreen.tsx` `tabBody` and `form-ui`'s `FieldForm.tsx` `tabRow`. Verify: it fails on all four before 1.2.
- [ ] 1.2 Add `position: "relative"` to those four styles, each with a one-line comment naming the hidden text it contains (design D1, D2). Verify: the test from 1.1 passes; `bun run typecheck` passes after `bun install --frozen-lockfile` in the container.

## 2. Documents

- [ ] 2.1 Add a `docs/browser-checks.md` entry under `spa-accessibility` with design D3's probe. It needs Pass lines for the three delta-spec scenarios and the Player tabbed-form case from design Risks. Verify: antislop count stays at or below `origin/main`.
- [ ] 2.2 Remove CHANGES-1 and FIELDS-2 from `docs/decisions.md`. Verify: no other entry still points at either tag, and antislop stays at or below `origin/main`.

## 3. Verification

- [ ] 3.1 Run `bun run typecheck` and `bun run build` in the devcontainer. Verify: both exit 0.
- [ ] 3.2 Run the full `bun test` with `DATABASE_URL` set, piped through `scripts/gates/silent-green.sh`. Verify: 0 fail, and the gate exits 0.
- [ ] 3.3 Run the whitespace and prose push gates over the branch range. Verify: both exit 0.
- [ ] 3.4 Walk the new `docs/browser-checks.md` entry and the Fields view's narrow-width check on the production build. Verify: every Pass line holds, with measured numbers recorded.
- [ ] 3.5 Run the design detector on the four edited files, and `/impeccable audit` on the process surface at 400px (design D4). Verify: no finding this change causes.
