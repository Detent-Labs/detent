## 1. ROADMAP.md

- [x] 1.1 Append eight `## Done` table rows, stages 46-53, one per archived
      change (`instance-audit-log-chain`, `instance-query-core`,
      `redactable-field-flag`, `instance-audit-log-view`,
      `instance-data-tables`, `instance-query-data-source`,
      `instance-transition-action`, `studio-play-draft-instance`), citing
      each row's change name(s) and capability spec(s) as recorded in its
      archived `openspec/changes/archive/<date>-<name>/specs/` directory.
      Verify: `grep -c "^| 4[6-9]\|^| 5[0-3]" ROADMAP.md` reports 8, and the
      table has no duplicate or skipped number in that range.

## 2. docs/current-state.md

- [x] 2.1 Add a `## Report Builder` section (or comparable title) covering
      `instance-data-tables`/`reporting-data-tables`, at the file's end,
      matching the style of the existing `## Instance audit log
      (instance-audit-log-chain)` section. Verify: `grep -n
      "instance-data-tables" docs/current-state.md` finds the new section.
- [x] 2.2 Add a `## Draft test instances` section (or comparable title)
      covering `draft-test-instances`, same placement and style, headed
      `(\`studio-play-draft-instance\`)` per the file's change-name
      convention. Verify: `grep -n "studio-play-draft-instance"
      docs/current-state.md` finds the new section.

## 3. docs/decisions.md

- [x] 3.1 Rewrite the "Open, deliberately" bullet claiming `instance.query`
      has no hand-written form, to state it shipped at
      `packages/web/src/areas/studio/panels/shared/InstanceQueryForm.tsx`.
      Verify: `grep -n "InstanceQueryForm" docs/decisions.md` finds the
      reference.
- [x] 3.2 Rewrite the "Open, deliberately" bullet claiming a step-filtered
      source instance's held reference is unresolved, to state it shipped
      at `src/engine/instance-query-source.ts:145-153`. Verify: `grep -n
      "instance-query-source.ts:145" docs/decisions.md` finds the
      reference.
- [x] 3.3 Confirm the "Instance data tables" entry's own "Shipped
      2026-08-28" line stays untouched (out of this change's scope).
      Verify: `git diff docs/decisions.md` shows no change on that line.

## 4. tmp/offene-items.md

- [x] 4.1 Update item 21's Status cell in the Teil 1 table from `BACKLOG`
      to the OpenSpec cycle state matching this change's own progress at
      commit time. Verify: `grep -n "21 | Buchhaltung" tmp/offene-items.md`
      shows the updated cell.

## 5. Verification

- [x] 5.1 Run `bun run typecheck` inside the devcontainer and confirm it
      exits 0 (proves no accidental code touch). The devcontainer's `app`
      container initially failed to start (`docker compose up` hung on
      container creation past 30 minutes and hung again after one Docker
      Desktop restart); a second `docker compose down && up` cycle after
      that restart succeeded, all three containers came up healthy, and
      `bun run typecheck` exits 0 (`tsc --noEmit`, `form-ui`, `web` all
      exit 0). `git diff --stat` against this branch's base confirms only
      the four documentation files this change lists changed; no `src/`,
      `packages/`, or `test/` file changed.
- [x] 5.2 Run `bun run build` inside the devcontainer and confirm it
      exits 0. Confirmed: `web build` completes and exits 0.
- [x] 5.3 Run the full `bun test` suite inside the devcontainer with
      `DATABASE_URL` set and confirm 0 fail, checking the skip count
      against the known baseline (no new skips). Confirmed: 3483 pass, 1
      skip (`a picked day spans that day in local time, not in UTC` — a
      pre-existing, environment-dependent skip unrelated to this change),
      0 fail, 10218 expect() calls across 190 files.
      `scripts/gates/silent-green.sh` against the captured run output
      exits 0.
- [x] 5.4 Run the antislop gate
      (`sh scripts/gates/range.sh | sh scripts/gates/prose.sh`) and the
      whitespace gate (`sh scripts/gates/whitespace.sh < /dev/null`) and
      confirm both exit 0 over the four changed files. Both exit 0.
