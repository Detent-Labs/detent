## 1. Fix the rail row styles

- [x] 1.1 In `packages/web/src/areas/studio/panels/EntityTabs.tsx`, edit
  `railName`'s `overflowWrap: "anywhere"` to `whiteSpace: "nowrap"`,
  `overflow: "hidden"`, `textOverflow: "ellipsis"`. Edit its `flex: 1` to
  a real, fixed basis. The final value is `flex: "1 1 4.5rem"`, reached in
  two measured passes (see `design.md` § Decisions). Keep its existing
  `minWidth: 0`. Verify by reading the edited block back and confirming
  `bun run typecheck` reports no new error from this file.
- [x] 1.2 Apply the identical wrap-property swap to `railType`. Give it a
  matching fixed basis too. The final value is `flex: "0 1 3rem"`, added in
  the second pass. Task 2.2's re-check found `railType`'s remaining
  auto-basis still starved a short kind word like "Date"; see `design.md`.
  Verify the same way as 1.1.
- [x] 1.3 Add a `title` attribute carrying the same text to `railName`,
  `railType`, and the Data sources row's own name span, three sites total.
  A sighted user hovering a truncated cell can then read the rest. Task
  2.5's `/impeccable critique` pass prompted this. Verify with `bun run
  typecheck` and by reading the edited spans back.

## 2. Browser verification

- [x] 2.1 Serve the studio, open a process's Fields tab, and pick a field
  with a long label. One example, nested under a group: "Email address
  (requested address)". Narrow the browser viewport to reproduce the
  reported screenshot, roughly a 420-460px content pane. Verify with
  `playwright-cli`: the label truncates with an ellipsis on one line, no
  character standing alone. Confirmed on `it_onboarding`'s live seeded
  draft at 480×900: the row renders "Email address (requested ..." on
  one line. The accessibility tree still carries the full "Email address
  (requested address)" text.
- [x] 2.2 At the same narrow viewport, verify a field's long kind name also
  truncates on one line instead of wrapping. Use a long `option`/format
  label, or a temporary long test label standing in for a localized one.
  Confirmed at 1400×900 on the same draft: `railType`'s "Email address"
  (13 characters) truncates alongside a long `railName`. Before this fix
  it claimed its full width and starved the name instead. See design.md's
  first flex-basis decision, prompted by this exact check. That same
  re-check then surfaced a second, opposite problem, covered below.
- [x] 2.3 At the studio's ordinary, non-narrow viewport, verify a short
  kind name renders fully and legibly. First pass at 1400×900 found even
  "Date" (4 characters) appearing as "D…". The check measured this
  directly, comparing `getBoundingClientRect` against `scrollWidth` across
  the first 7 rows, rather than eyeballing it. Task 1.2's `railType` basis
  addition fixes exactly this. Re-measured after that fix: "Date" and
  "Text" both stay whole, with zero truncation (`scrollWidth ===
  clientWidth`). The worst-case name, "Email address (requested
  address)", stays about the same as before.
- [x] 2.4 At the same narrow viewport, verify a Data sources entry with a
  long `key` truncates on one line. It does not wrap. (`DataSourcesTab`
  reuses the same `railName` style.) Confirmed with a 42-character test
  key, `requested_delivery_address_lookup_service`, removed after the
  check: one line, no wrap. This row has no `railType` sibling, so it had
  headroom to spare.
- [x] 2.5 Run `/impeccable critique` against the Fields tab route, the
  changed screen. Two isolated sub-agent assessments resolved any finding
  it raised, per the skill's own protocol, scoped to the entity rail.
  `design.md` § "Impeccable critique / audit findings" triages the
  results. It applied two findings: task 1.3's tooltip, and the
  `railType` basis fix task 2.3 shares. It disproved one finding, a
  claimed missing "currently open" indicator: the row carries
  `aria-current` and a visible accent box-shadow. Three findings are real
  but sit outside this fix's scope, noted there as follow-ups.
- [x] 2.6 Run `/impeccable audit` against the same route and resolve or
  note any finding it raises. Ran as the detector-and-computed-style half
  of the same critique pass. The overlay-injection step failed on this
  page's CSP, which blocks a cross-origin script exactly as it should. The
  check then fell back to the skill's own prescribed direct computed-style
  inspection. This fix introduces zero findings: the CLI detector's two
  advisories both predate this diff. Computed styles across all 106 rail
  name/kind-name spans on a live 53-field draft show exactly the intended
  `overflow: hidden; white-space: nowrap; text-overflow: ellipsis`, with no
  `aria-label` override anywhere.

## 3. Verification

- [x] 3.1 `bun run typecheck` reports zero errors. It ran once per code
  edit: the wrap-property swap, the `railType` basis fix, and the `title`
  tooltips.
- [x] 3.2 `bun run build` succeeds. It ran once per code edit, the same
  three.
- [x] 3.3 The full `bun test` ran with `DATABASE_URL` set: 4172 pass, 1
  skip, 0 fail. It covered 232 files. The one skip is a pre-existing
  timezone-dependent test, unrelated to this fix. Checking the captured
  log with `sh scripts/gates/silent-green.sh` reported no finding.
  `studio-panelsRailFieldRow.test.tsx` passed unchanged.
- [ ] 3.4 The antislop prose gate covers every Markdown file this fix
  touched: `proposal.md`, `design.md`, `tasks.md`,
  `specs/studio-app/spec.md`. Running the following over that range
  reports zero rising findings:
  `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`.
  `range.sh`'s fallback is `origin/main..HEAD`, a commit range that stays
  blind to uncommitted work (see `gates-cannot-see-uncommitted-work` in
  memory). This needs a commit to exist before it checks anything real.
- [ ] 3.5 The whitespace/CRLF gate runs over the same range. Running the
  following reports zero findings:
  `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh`.
  It carries the same commit-range caveat as 3.4.
