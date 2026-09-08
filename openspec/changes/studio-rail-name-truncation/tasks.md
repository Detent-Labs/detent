## 1. Fix the rail row styles

- [x] 1.1 In `packages/web/src/areas/studio/panels/EntityTabs.tsx`, change
  `railName`'s `overflowWrap: "anywhere"` to `whiteSpace: "nowrap"`,
  `overflow: "hidden"`, `textOverflow: "ellipsis"`, and its `flex: 1` to a
  real, fixed basis (final value `flex: "1 1 4.5rem"`, reached in two
  measured passes — see `design.md` § Decisions); keep its existing
  `minWidth: 0`. Verify by reading the edited block back and confirming
  `bun run typecheck` reports no new error from this file.
- [x] 1.2 Apply the identical wrap-property swap to `railType`, and give it
  a matching fixed basis too (final value `flex: "0 1 3rem"`, added in the
  second pass once task 2.2's re-check found `railType`'s remaining
  auto-basis still starved a short kind word like "Date" — see
  `design.md`). Verify the same way as 1.1.
- [x] 1.3 Add a `title` attribute carrying the same text to `railName`,
  `railType`, and the Data sources row's own name span (three sites total),
  so a sighted user hovering a truncated cell can read the rest — prompted
  by the `/impeccable critique` pass in task 2.5. Verify with `bun run
  typecheck` and by reading the edited spans back.

## 2. Browser verification

- [x] 2.1 Serve the studio and open a process's Fields tab on a field whose
  resolved label is long (e.g. "Email address (requested address)") nested
  one level under a group, with the browser viewport narrowed to
  reproduce the reported screenshot (roughly a 420-460px content pane).
  Verify with `playwright-cli`: the label renders truncated on one line
  with an ellipsis, and no character of it stands alone on its own line.
  Confirmed on `it_onboarding`'s live seeded draft at 480×900: the row
  shows "Email address (requested ..." on one line; the accessibility
  tree still carries the full "Email address (requested address)" text.
- [x] 2.2 At the same narrow viewport, verify a field with a long kind name
  (a long `option`/format label, or a temporary long test label standing
  in for a localized one) also truncates on one line rather than wrapping.
  Confirmed at 1400×900 on the same draft: `railType`'s "Email address"
  (13 characters) truncates alongside a long `railName` rather than
  claiming its full width and starving the name — see design.md's first
  flex-basis decision, prompted by this exact check. That same re-check
  then surfaced a second, opposite problem (below).
- [x] 2.3 At the studio's ordinary (non-narrow) viewport, verify a short
  kind name renders in full, not clipped. First pass at 1400×900 showed
  even "Date" (4 characters) rendering as "D…" — measured directly
  (`getBoundingClientRect` vs `scrollWidth`) across the first 7 rows, not
  eyeballed. This is what task 1.2's `railType` basis addition fixes.
  Re-measured after that fix: "Date" and "Text" both render with zero
  truncation (`scrollWidth === clientWidth`); the worst-case name
  ("Email address (requested address)") is materially unchanged.
- [x] 2.4 At the same narrow viewport, verify a Data sources tab entry with
  a long `key` also truncates on one line rather than wrapping
  (`DataSourcesTab` reuses the same `railName` style). Confirmed with a
  42-character test key (`requested_delivery_address_lookup_service`,
  removed after the check): one line, no wrap; this row has no `railType`
  sibling so it had headroom to spare.
- [x] 2.5 Run `/impeccable critique` against the Fields tab route (the
  changed screen) and resolve or note any finding it raises. Ran as two
  isolated sub-agent assessments per the skill's own protocol, scoped to
  the entity rail. Findings triaged in `design.md` § "Impeccable critique
  / audit findings": two applied (task 1.3's tooltip; the `railType`
  basis fix `railType`'s own re-check above shares); one disproven by a
  direct DOM check (a claimed missing "currently open" indicator — the
  row already carries `aria-current` and a visible accent box-shadow);
  three real but out of scope, left as follow-ups, not this change's to
  fix.
- [x] 2.6 Run `/impeccable audit` against the same route and resolve or
  note any finding it raises. Ran as the detector-and-computed-style half
  of the same critique pass (the overlay-injection step failed on this
  page's CSP, which blocks a cross-origin script exactly as it should;
  fell back to the skill's own prescribed direct computed-style
  inspection). Zero findings this change introduces: the CLI detector's
  two advisories both predate this diff; computed styles across all 106
  rail name/kind-name spans on a live 53-field draft show exactly the
  intended `overflow: hidden; white-space: nowrap; text-overflow:
  ellipsis`, with no `aria-label` override anywhere.

## 3. Verification

- [x] 3.1 `bun run typecheck` — zero errors (ran once per code edit: the
  wrap-property swap, the `railType` basis fix, and the `title` tooltips).
- [x] 3.2 `bun run build` — succeeds (ran once per code edit, same three).
- [x] 3.3 Full `bun test` with `DATABASE_URL` set — 4172 pass, 1 skip (a
  pre-existing timezone-dependent test, unrelated to this change), 0 fail,
  across 232 files. `sh scripts/gates/silent-green.sh` on the captured log
  reported no finding. `studio-panelsRailFieldRow.test.tsx` passed
  unchanged.
- [ ] 3.4 Antislop prose gate over every Markdown file this change
  touched (`proposal.md`, `design.md`, `tasks.md`,
  `specs/studio-app/spec.md`): `sh scripts/gates/range.sh < /dev/null | sh
  scripts/gates/prose.sh` reports zero rising findings. `range.sh`'s
  fallback is `origin/main..HEAD` — a commit range, blind to uncommitted
  work (`gates-cannot-see-uncommitted-work` in memory) — so this needs a
  commit to exist before it checks anything real.
- [ ] 3.5 Whitespace/CRLF gate over the same range: `sh
  scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh`
  reports zero findings. Same commit-range caveat as 3.4.
