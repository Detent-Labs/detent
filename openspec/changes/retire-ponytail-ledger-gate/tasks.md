## 1. Delete the gate and its three call sites

- [x] 1.1 Delete `scripts/gates/ponytail-ledger.sh` and
      `scripts/ponytail-ledgers.sh`. Verify:
      `test ! -e scripts/gates/ponytail-ledger.sh` exits 0. Verify:
      `test ! -e scripts/ponytail-ledgers.sh` exits 0. Verify:
      `ls scripts/gates | wc -l` prints 8. The directory holds nine entries
      today, `_lib.sh` and `skip-floor.txt` among them.
- [x] 1.2 Delete line 50 of `.githooks/pre-push`, which reads
      `sh "$GATES/ponytail-ledger.sh"`. Leave the `# Stage 1: the host gates.`
      comment above it. Verify: `grep -c ponytail .githooks/pre-push` prints 0.
      Verify: `sh -n .githooks/pre-push` exits 0.
- [x] 1.3 In `.github/workflows/check.yml`, delete the two-line step at `:50-51`
      named `ponytail-ledger-fresh`. In the comment at `:21`, change "The four
      gates" to "The three gates". Verify:
      `grep -c ponytail .github/workflows/check.yml` prints 0. Verify:
      `grep -q "The three gates" .github/workflows/check.yml` exits 0. Verify,
      in the devcontainer, where `pyyaml` is absent and Bun 1.3.11 parses YAML:
      `bun -e 'Bun.YAML.parse(await Bun.file(".github/workflows/check.yml").text())'`
      exits 0.
- [x] 1.4 In `CLAUDE.md`, delete the `ponytail-ledger-fresh` table row at `:195`.
      In the sentence below the table, change "The first four" to "The first
      three". Add one sentence under Conventions naming the `ponytail:` marker
      convention and pointing at `openspec/specs/push-gate-checks/spec.md`.
      Verify: `grep -c ponytail-ledger CLAUDE.md` prints 0. Verify:
      `grep -q "The first three" CLAUDE.md` exits 0. Verify:
      `grep -q "ponytail:" CLAUDE.md` exits 0.

## 2. The spec delta

- [ ] 2.1 Apply this change's delta to
      `openspec/specs/push-gate-checks/spec.md`. Append the requirement
      "The `ponytail:` marker is the deferral record" after the last
      requirement, at the end of the file. Verify:
      `grep -q "the deferral record" openspec/specs/push-gate-checks/spec.md`
      exits 0. Verify:
      `grep -c "^### Requirement:" openspec/specs/push-gate-checks/spec.md`
      prints 9. Verify: `openspec validate retire-ponytail-ledger-gate --strict`
      exits 0.
- [x] 2.2 Confirm the spec file still measures antislop exit 0. Verify:
      `python3 "${ANTISLOP:-$HOME/AI/AntiSlop/antislop.py}" check openspec/specs/push-gate-checks/spec.md`
      exits 0.

## 3. docs/decisions.md

- [x] 3.1 Add finding 11 as a bullet under the existing heading
      `## Decided, not yet built (each needs its own OpenSpec change)`. Write it
      from `design.md`'s Decision 6, which carries the code citations this change
      verified. Anchor on the heading text, never on a line number. Verify:
      `grep -q "Bun.serve" docs/decisions.md` exits 0. Verify:
      `grep -q "server.ts:884" docs/decisions.md` exits 0. Verify:
      `grep -q "createServer" docs/decisions.md` exits 0.
- [x] 3.2 Rewrite the SEC-5 bullet per `design.md`'s Decision 8. Drop the
      `PONYTAIL-DEBT.md:84-87` citation, the
      `scripts/gates/ponytail-ledger.sh:22` citation and the
      `docs/CODE_REVIEW.md:281` citation. Keep the marker location, the risk,
      the Postgres constraint and the runbook gap, the last one attributed to
      the 2026-08-18 code review by date. Verify:
      `grep -c PONYTAIL docs/decisions.md` prints 0. Verify:
      `grep -q "login.ts:49" docs/decisions.md` exits 0. Verify:
      `grep -q "SEC-5" docs/decisions.md` exits 0. Verify:
      `grep -c "CODE_REVIEW.md:281" docs/decisions.md` prints 0.
- [x] 3.3 Re-resolve every citation in `design.md`'s Decision 5 against the
      tree before writing it out. For each entry, run `git grep -n <symbol>`
      on the symbol the entry names and confirm the file it cites. Where an
      entry keeps a line number, confirm that line by `sed -n`. Correct the
      entry in `design.md` where the tree has moved, and drop a line number
      wherever the symbol name alone identifies the site. Verify:
      `git grep -n 'toggleVariant="disclosure"' -- packages/web/src/areas/studio/panels/PathsPanel.tsx`
      exits 0. Verify:
      `git grep -n 'export function parseJsonb' -- src/engine/host.ts` exits 0.
      Verify: `sed -n '74p' scripts/gates/prose.sh | grep -q 'name-status -M'`
      exits 0. Verify:
      `sed -n '44p' scripts/gates/whitespace.sh | grep -q 'name-only'` exits 0.
- [x] 3.4 Append the new top-level section
      `## Refused simplifications (kept so the next sweep does not re-propose them)`
      at the end of the file. Write all 46 entries from `design.md`'s
      Decision 5, as re-resolved in 3.3. Keep the proposal, the refusal reason
      and the measurement in each. Carry across neither of the source's two
      `allow-directive` comments. Verify:
      `grep -q "^## Refused simplifications" docs/decisions.md` exits 0.
      Verify: `grep -c "^## " docs/decisions.md` prints 5. Verify:
      `grep -c antislop docs/decisions.md` prints 1: the one hit is the file's
      own line-1 directive, which stays. The copied record adds none.
- [x] 3.5 Confirm the file still measures antislop exit 0. Its base is 0, so any
      error-class finding blocks the push. Verify:
      `python3 "${ANTISLOP:-$HOME/AI/AntiSlop/antislop.py}" check docs/decisions.md`
      exits 0.

## 4. Repoint the six dead citations

- [x] 4.1 In `openspec/specs/field-expression-map-consolidation/spec.md:16`,
      replace the finding-1 reference with the archived change
      `2026-07-26-shared-field-expression-map-editor`. Leave every `SHALL` and
      every `#### Scenario` byte-identical. Verify:
      `grep -c PONYTAIL openspec/specs/field-expression-map-consolidation/spec.md`
      prints 0. Verify:
      `grep -q shared-field-expression-map-editor openspec/specs/field-expression-map-consolidation/spec.md`
      exits 0.
- [x] 4.2 In `openspec/specs/engine-poll-loop-consolidation/spec.md:16`, replace
      the finding-2 reference with `2026-07-27-dedupe-engine-poll-loops`. Verify:
      `grep -c PONYTAIL openspec/specs/engine-poll-loop-consolidation/spec.md`
      prints 0. Verify:
      `grep -q dedupe-engine-poll-loops openspec/specs/engine-poll-loop-consolidation/spec.md`
      exits 0.
- [x] 4.3 In `openspec/specs/auth-token-lifetime-consolidation/spec.md:15`,
      replace the finding-7 reference with `2026-07-27-dedupe-auth-token-lifetime`.
      Verify:
      `grep -c PONYTAIL openspec/specs/auth-token-lifetime-consolidation/spec.md`
      prints 0. Verify:
      `grep -q dedupe-auth-token-lifetime openspec/specs/auth-token-lifetime-consolidation/spec.md`
      exits 0.
- [x] 4.4 In `openspec/specs/field-tree-check-consolidation/spec.md:11`, replace
      the findings-65-and-66 reference with
      `2026-08-18-field-tree-check-consolidation`. This file measures antislop
      exit 0, so keep the replacement error-clean. Verify:
      `grep -c PONYTAIL openspec/specs/field-tree-check-consolidation/spec.md`
      prints 0. Verify:
      `python3 "${ANTISLOP:-$HOME/AI/AntiSlop/antislop.py}" check openspec/specs/field-tree-check-consolidation/spec.md`
      exits 0.
- [x] 4.5 In `src/pagination.ts:5`, replace the finding-9 reference with the
      archived change `2026-07-29-correct-api-error-responses`, whose commit
      added the file. This is a comment change inside the module doc block, and
      it touches no code. Verify: `grep -c PONYTAIL src/pagination.ts` prints
      0. Verify: `grep -q correct-api-error-responses src/pagination.ts` exits
      0.
- [x] 4.6 In `docs/current-state.md:2657`, replace the finding-9 reference with
      the same archived change. That file sits at gate count 619, and it exits
      1, so every printed line counts. Keep the count at or below 619. Verify:
      `grep -c PONYTAIL docs/current-state.md` prints 0. Verify:
      `python3 "${ANTISLOP:-$HOME/AI/AntiSlop/antislop.py}" check docs/current-state.md | wc -l`
      prints 619 or less.
- [x] 4.7 Sweep the tree for a surviving reference to either deleted script.
      The pathspec excludes the archive, this change's own directory, and the
      two `docs/CODE_REVIEW*` files. The archive keeps its history, this
      change names the scripts by design, and the sibling code-review change
      moves both review files into the archive unchanged. The live
      `push-gate-checks` spec names the retired rule on purpose, so the sweep
      matches the script paths and not the rule name. Verify:
      `git grep -l "scripts/gates/ponytail-ledger.sh\|scripts/ponytail-ledgers.sh" -- . ":!openspec/changes/archive" ":!openspec/changes/retire-ponytail-ledger-gate" ":!docs/CODE_REVIEW*"`
      prints nothing.

## 5. Verification

- [ ] 5.1 Run `bun run typecheck` in the devcontainer and confirm it exits 0. It
      proves the `src/pagination.ts` comment change broke no code. Then run
      `git status --porcelain -- src packages test` and confirm one entry,
      `src/pagination.ts`.
- [ ] 5.2 Run `bun run build` in the devcontainer and confirm it exits 0.
- [ ] 5.3 Run the full `bun test` in the devcontainer with `DATABASE_URL` set,
      and confirm 0 failures. Read the verdict off a named failure, never off a
      pass count. Capture the run and hand the capture to the gate:
      `bun test 2>&1 | tee /tmp/t.log; sh scripts/gates/silent-green.sh /tmp/t.log`.
      Confirm the gate exits 0.
- [x] 5.4 Confirm the hook still runs with one gate fewer. Verify:
      `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh`
      exits 0. Verify:
      `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` exits 0.
      Verify: `sh scripts/gates/machine-paths.sh` exits 0.
- [x] 5.5 Check the worktree bytes of every changed path. Run
      `git ls-files --eol` over them and confirm every row reads `w/lf`. Run
      `grep -rnE '[[:blank:]]+$'` over the same paths and confirm no hit. Run
      `tail -c 2` on each and confirm no file ends in a blank line.
- [x] 5.6 Run `openspec validate retire-ponytail-ledger-gate --strict` and
      confirm it exits 0.

The two range-based push gates belong to the controller, who commits. Both read
committed content. Run them after the commit and before the push:
`sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`, then
`sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh`. The
`< /dev/null` belongs on `range.sh` alone, never on the consumer.
