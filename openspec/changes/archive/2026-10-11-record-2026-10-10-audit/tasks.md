Read `design.md` first. It holds the layout and the label glossary. It also
holds the prose gate method, the security cut and the fidelity script.
`proposal.md` holds the scope.

This audit has two homes, as `development-toolchain` requires. The open
findings land in `docs/decisions.md`, in the section "Open from the
2026-10-10 audit (one OpenSpec change each)". The audit document lands in
`openspec/changes/archive/2026-10-10-audit-record/`.

The sources are German files in `tmp/audit-2026-10-10/`. Groups 1 to 10 each
translate one source into one file of the record. They write disjoint files.
Run the fidelity script from the scratchpad, never from `tmp/`.

Every translation task ends with these checks. The linter prints nothing for
the file. The fidelity script lists no missing id and no missing anchor, apart
from the security cut. The file has no CR byte and no trailing space. It
contains no `allow-file` and names no home-directory path.

## 1. Translate the report and the ledger

- [x] 1.1 Translate `tmp/audit-2026-10-10/bericht.md` into `AUDIT.md` in the
      record directory. The Sources section names the record's own files. The
      security cut applies to C-1, C-2, C-3, C-8, D-1, D-3, D-8, G-5 and G-12.
      Verify: the common checks pass, and the file holds all 131 ids.
- [x] 1.2 Translate `tmp/audit-2026-10-10/verify-ledger.md` into
      `verify-ledger.md`. Keep every quoted program output verbatim. Verify: the
      common checks pass. The D-1 line states the mechanism and the quoted
      response, and omits the request body.

## 2. Translate area A

- [x] 2.1 Translate `tmp/audit-2026-10-10/reports/A.md` into `reports/A.md`.
      Verify: the common checks pass. The file holds the ids A-1 to A-9.

## 3. Translate area B

- [x] 3.1 Translate `tmp/audit-2026-10-10/reports/B.md` into `reports/B.md`.
      Verify: the common checks pass. The file holds the ids B-1 to B-16.

## 4. Translate area C

- [x] 4.1 Translate `tmp/audit-2026-10-10/reports/C.md` into `reports/C.md`.
      Apply the security cut to C-1, C-2, C-3 and C-8. Verify: the common checks
      pass. The file holds the ids C-1 to C-19.

## 5. Translate area D

- [x] 5.1 Translate `tmp/audit-2026-10-10/reports/D.md` into `reports/D.md`.
      Apply the security cut to D-1, D-3 and D-8. Verify: the common checks pass.
      The file holds the ids D-1 to D-10.

## 6. Translate area E1

- [x] 6.1 Translate `tmp/audit-2026-10-10/reports/E1.md` into `reports/E1.md`.
      Verify: the common checks pass. The file holds the ids E1-1 to E1-13.

## 7. Translate area E2

- [x] 7.1 Translate `tmp/audit-2026-10-10/reports/E2.md` into `reports/E2.md`.
      Verify: the common checks pass. The file holds the ids E2-1 to E2-20.

## 8. Translate area F

- [x] 8.1 Translate `tmp/audit-2026-10-10/reports/F.md` into `reports/F.md`.
      Verify: the common checks pass. The file holds the ids F-1 to F-18.

## 9. Translate area G

- [x] 9.1 Translate `tmp/audit-2026-10-10/reports/G.md` into `reports/G.md`.
      Apply the security cut to G-5 and G-12. Verify: the common checks pass.
      The file holds the ids G-1 to G-13.

## 10. Translate area H

- [x] 10.1 Translate `tmp/audit-2026-10-10/reports/H.md` into `reports/H.md`.
      Verify: the common checks pass. The file holds the ids H-1 to H-12.

## 11. Write the record README

- [x] 11.1 Write `README.md` in the record directory, after `AUDIT.md` exists.
      It states what the record is, the audited commit `5f41cd8a`, the date and
      the method. It quotes the checks table of `AUDIT.md` with its results.
      Verify: `grep -c "4999 pass" README.md` prints at least 1, and the linter
      prints nothing.
- [x] 11.2 State in the README that every line number is a historical anchor
      of `5f41cd8a`. Add the nine owner rulings of 2026-10-10. Add the owner
      ruling on the security cut and the coordinator rulings on the payload
      cut, the prose gate and the originals. Verify: the README names all
      thirteen, and a reader finds the line-number sentence.
- [x] 11.3 Name in the README the file list, the evidence tags and the point
      where the live findings sit. State what the record leaves out. Verify:
      every file in the record directory appears in the README, and the link to
      `docs/decisions.md` resolves.

## 12. Write the audit index in docs/decisions.md

- [x] 12.1 Measure the antislop count of `docs/decisions.md` before any write.
      Verify: the command `python ~/AI/AntiSlop/antislop.py check docs/decisions.md`
      prints N lines. Write N down.
- [x] 12.2 Add the section "Open from the 2026-10-10 audit (one OpenSpec change
      each)" directly above `## Refused simplifications`. Write the intro
      paragraph from design decision 6. Verify: `grep -c "^## " docs/decisions.md`
      prints one more than before, and the section sits last among the open
      ones.
- [x] 12.3 Write the 36 entries in plan order, then `postgres-login-rate-limit`.
      Use the shape from design decision 6. Take each sentence and each anchor
      from the translated record. Give the nine security ids a risk sentence
      with no trigger recipe. Verify: the section holds 36 bullets, and each
      bullet names a change with a brief under `tmp/briefs/`. Every anchor path
      resolves with `git ls-files`.
- [x] 12.4 Check that the index covers every finding. Verify: every id of
      `AUDIT.md` appears in the section. B-14 appears twice, under
      `fix-handler-assignment-registry` and `remove-dead-exports`. C-4 and C-6
      name D-2 and F-6.
- [x] 12.5 Check the count again. Verify: the linter prints N lines for
      `docs/decisions.md`, the same N as in task 12.1.

## 13. Verification

- [x] 13.1 Run `openspec validate record-2026-10-10-audit`. Verify: it prints
      that the change is valid.
- [x] 13.2 Run `bun run typecheck`, then `bun run build`, then the full
      `bun test` through `scripts/test-gated.sh` in the devcontainer. Set
      `DATABASE_URL` and `OPENSPEC_TELEMETRY=0`. Verify: each exits 0, and the
      log shows the pass and skip counts.
- [x] 13.3 Run the prose gate over the push range. Verify: the command
      `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` exits 0
      and names no file.
- [x] 13.4 Run the whitespace and machine-path gates over the same range.
      Verify: `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh`
      exits 0, and so does `sh scripts/gates/machine-paths.sh`.
- [x] 13.5 Record that no browser check applies. Verify: `git diff --stat
      origin/main` names no file under `packages/`, `src/` or `test/`.
