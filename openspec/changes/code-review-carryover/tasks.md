Read `design.md` first, then `tmp/doc-audit/10-carryover.md`. The report holds
the byte-exact anchor and replacement for every correction. The design holds
the five rewritten entries, and the reasoning behind all of them.

This change lands after the audit's Change A. Confirm that first:
`grep -c "^## Decided and built" docs/decisions.md` reports 1.

## 1. docs/decisions.md

- [x] 1.1 Apply report 10's C1, C2 and C3, with the overrides from
      `design.md`. C1 appends the display-name entry at the file's end, and
      its citation reads `src/auth/users.ts:151-152`. C2 then appends the new
      `##` section after C1's last line. Take the SEC-4, SEC-5, CQ-1 and
      ARCH-1 entries from `design.md`, not from the report, and append the
      eleventh entry last.
      C3 corrects one line citation in place. Verify each anchor matches
      exactly once before writing it.
      Verify: `grep -c "^## Open from the 2026-08-18 code review"
      docs/decisions.md` reports 1. `grep -c "^- \*\*SEC-[1-6]:\|^- \*\*TEST-1:\|^- \*\*DEP-1:\|^- \*\*CQ-1:\|^- \*\*ARCH-1:" docs/decisions.md`
      reports 10. `grep -c "compile.ts:1218" docs/decisions.md` reports 1.
      `grep -c "81 dead" docs/decisions.md` reports 1.
      `grep -c "PONYTAIL-DEBT.md:84-87" docs/decisions.md` reports 1.
      `grep -c "users.colName" docs/decisions.md` reports 1.
      `grep -c "users.ts:151-152" docs/decisions.md` reports 1.
      `grep -c "api.ts:1868" docs/decisions.md` reports 1, and
      `grep -c "api.ts:1560" docs/decisions.md` reports 0.
      `grep -c persistSession docs/decisions.md` reports 1, and
      `grep -c "saveSession" docs/decisions.md` reports 0.
      `grep -c "1,791" docs/decisions.md` reports 1.

## 2. docs/CODE_REVIEW.md

- [x] 2.1 Apply report 10's C4, C5 and C6. Three ids move, and nothing else
      in the file moves. Do not re-derive the ids from the top-findings list.
      The detailed findings and the action list are the source.
      Verify: `grep -c "^4\. \*\*SEC-5" docs/CODE_REVIEW.md` reports 1.
      `grep -c "^5\. \*\*SEC-6" docs/CODE_REVIEW.md` reports 1.
      `grep -c "carried as SEC-6" docs/CODE_REVIEW.md` reports 0, and
      `grep -c "carried as SEC-5" docs/CODE_REVIEW.md` reports 1.
      `git diff --stat docs/CODE_REVIEW.md` reports 3 insertions and 3
      deletions.

## 3. Verification

- [x] 3.1 Run the prose gate over the pushed range:
      `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`.
      Both files exit 0 under the linter today, so the gate counts 0 at the
      base. The tip must exit 0 too. Read the exit code, never the printed
      line count.
      Verify: the gate exits 0, and it names both files as checked.
- [x] 3.2 Run the whitespace gate over the same range:
      `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh`.
      Verify: the gate exits 0.
- [x] 3.3 Run `bun run typecheck`, then `bun run build`, then the full
      `bun test` with `DATABASE_URL` set, inside the devcontainer. These
      prove that no code file moved. Read the verdict off a named failure.
      Verify: all three exit 0, and `git diff --stat` names two files.
- [x] 3.4 Confirm that no browser check applies. This change touches no file
      under `packages/`, so no screen changes.
      Verify: `git diff --name-only` lists `docs/decisions.md` and
      `docs/CODE_REVIEW.md` alone.
- [x] 3.5 Confirm the scope boundary. This change fixes none of the ten
      findings, and it deletes no gitignored file.
      Verify: `git status --short` shows no other tracked file, and
      `ls docs/superpowers/specs/` still lists the display-name design.
