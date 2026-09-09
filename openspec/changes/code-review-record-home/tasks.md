Read `design.md` first. It holds every anchor, every measured count, and the
reasoning behind each decision below. `proposal.md` holds the scope.

This change lands second of three. The ponytail change lands first. It adds a
fifth heading, `## Refused simplifications`, at the end of `docs/decisions.md`,
and it removes the `allow-file` directive at line 1. Confirm the heading before
task 1.1: `grep -c "^## " docs/decisions.md` prints 5.

Anchor every edit of `docs/decisions.md` on heading text or on an entry id,
never on a line number. The ponytail change moved every line from `:970` down.
Nothing this change writes lands after the fifth heading.

Order is load-bearing in one place. Every finding lands in `docs/decisions.md`
before any file moves.

## 1. Carry the live findings into docs/decisions.md

- [ ] 1.0 Measure `docs/decisions.md` as the ponytail change left it, before
      any write. Its base for the prose gate is whatever the ponytail change
      committed, so every later task keeps the count where this task finds it.
      Verify: `grep -c "^## " docs/decisions.md` prints 5.
      `grep -c "^## Refused simplifications" docs/decisions.md` prints 1.
      `python3 "${ANTISLOP:-$HOME/AI/AntiSlop/antislop.py}" check docs/decisions.md | wc -l`
      prints a number. Write it down as N.
      `grep -c antislop docs/decisions.md` prints 0, the state the ponytail
      change's task 3.4 verifies. If it prints 1 instead, the directive
      survived. Record that and go on, since the rule holds either way.

- [ ] 1.1 Re-verify the `NotFoundError` finding at the source before writing
      it. It is ARCH-1 of the 2026-08-01 review. Read
      `docs/CODE_REVIEW-2026-08-01.md:426-437`, `src/http/errors.ts:95`, and
      `openspec/changes/archive/2026-07-29-correct-api-error-responses/design.md:65-69`.
      Verify: `grep -n "ctor: NotFoundError" src/http/errors.ts` prints one
      line, and it names `status: 500`.
      `grep -c "Recorded as an open" openspec/changes/archive/2026-07-29-correct-api-error-responses/design.md`
      prints 1.
      `grep -c NotFoundError docs/decisions.md` prints 0.

- [ ] 1.2 Append the `NotFoundError` entry to the tail of `## Open questions`
      in `docs/decisions.md`, above `## Decided and built`. It states the
      question. It decides nothing. It carries no id of its own, because the
      file already holds a 2026-08-18 ARCH-1. It names its source as ARCH-1 of
      the 2026-08-01 review. The entry names `src/http/errors.ts:95` as the
      live anchor, the three spec pins, and the contract cost of a change.
      Verify: `grep -c "errors.ts:95" docs/decisions.md` prints 1.
      `grep -c "http-wrapper/spec.md:215" docs/decisions.md` prints 1.
      `grep -c "http-wrapper/spec.md:1665" docs/decisions.md` prints 1.
      `awk '/^## Open questions/,/^## Decided and built/' docs/decisions.md | grep -c NotFoundError`
      prints at least 1.
      `python3 "${ANTISLOP:-$HOME/AI/AntiSlop/antislop.py}" check docs/decisions.md | wc -l`
      still prints N.

- [ ] 1.3 Re-verify the nine carried findings against the tree. Use the
      anchor table in `design.md`. A finding the tree already closed gets
      recorded as closed, never copied as open.
      Verify: `grep -n "ctor: NotFoundError" src/http/errors.ts` still
      resolves, `grep -c pollForever src/engine/host.ts` prints at least 1,
      `grep -rl rolesVersion src | wc -l` prints 0, and
      `grep -rl "bun audit" .github | wc -l` prints 0.

- [ ] 1.4 Append the nine entries to the tail of the existing
      `## Open from the 2026-08-18 code review` section, after its last
      bullet and above `## Refused simplifications`. One entry per finding,
      each with its severity, its live anchor and one risk sentence. ARCH-2
      records what `test/http-disposition.test.ts` and TEST-1 already cover.
      SEC-9 records the disable-then-re-enable method. Keep every sentence
      under 20 words and free of em-dashes; no rule is silenced in this file.
      Verify:
      `awk '/^## Open from the 2026-08-18/,/^## Refused simplifications/' docs/decisions.md | grep -c "^- \*\*SEC-7:\|^- \*\*SEC-8:\|^- \*\*SEC-9:\|^- \*\*SEC-10:"`
      prints 4.
      `awk '/^## Open from the 2026-08-18/,/^## Refused simplifications/' docs/decisions.md | grep -c "^- \*\*ARCH-2:\|^- \*\*CQ-2:\|^- \*\*DEP-2:\|^- \*\*PERF-1:\|^- \*\*PERF-2:"`
      prints 5.
      `awk '/^## Refused simplifications/,0' docs/decisions.md | grep -c "^- \*\*SEC-\|^- \*\*ARCH-2:\|^- \*\*CQ-2:\|^- \*\*DEP-2:\|^- \*\*PERF-"`
      prints 0.
      `grep -c "^## " docs/decisions.md` still prints 5.
      `python3 "${ANTISLOP:-$HOME/AI/AntiSlop/antislop.py}" check docs/decisions.md | wc -l`
      still prints N.

## 2. Move the record into the archive

- [ ] 2.1 Create `openspec/changes/archive/2026-08-18-code-review-record/`
      and write its `README.md`. It names the four-file chain, the rename
      convention, commit `9fe8fb38` that set it, and commit `0b520cc8` that
      drew the tracked line. It points at `docs/decisions.md` for the live
      findings.
      The file has a prose-gate base of 0, so one error-class finding blocks
      the push.
      Verify: `ls openspec/changes/archive/2026-08-18-code-review-record/`
      lists `README.md`. `grep -c 9fe8fb38 openspec/changes/archive/2026-08-18-code-review-record/README.md`
      prints 1.
      `python3 "${ANTISLOP:-$HOME/AI/AntiSlop/antislop.py}" check openspec/changes/archive/2026-08-18-code-review-record/README.md`
      exits 0.

- [ ] 2.2 Move all four files with `git mv`, one per file, into that
      directory. Change no byte inside any of them.
      Verify: `ls docs/CODE_REVIEW*.md` exits 2 and lists nothing.
      `ls openspec/changes/archive/2026-08-18-code-review-record/` lists five
      files. `git diff --cached -M --stat -- docs openspec/changes/archive`
      shows four renames with no content change.

- [ ] 2.3 Confirm the OpenSpec tooling still reads the tree. `openspec list`
      enumerates active changes only and never reads `archive/`, so the
      `--all` validation is the check that reaches the live specs the entry
      sits beside.
      Verify: `openspec list` exits 0 and prints this change.
      `openspec validate code-review-record-home --strict` exits 0.
      `openspec validate --all --strict` exits 0.

## 3. Retarget the two live pointers

- [ ] 3.1 Replace the two-line `docs/CODE_REVIEW.md` bullet at
      `CLAUDE.md:333-334`. The replacement names both homes: the open
      findings in `docs/decisions.md`, and the record in the archived entry.
      Touch no other line.
      Verify: `grep -c "docs/CODE_REVIEW" CLAUDE.md` prints 0.
      `grep -c "2026-08-18-code-review-record" CLAUDE.md` prints 1.
      `git diff HEAD --stat -- CLAUDE.md` shows two insertions and two
      deletions.

- [ ] 3.2 Retarget the link in the intro paragraph of
      `## Open from the 2026-08-18 code review` in `docs/decisions.md`. Today
      it reads `[`docs/CODE_REVIEW.md`](CODE_REVIEW.md)`, and the sentence
      after it delegates the reasoning and the recommended fix to that file.
      Replace the link target with
      `../openspec/changes/archive/2026-08-18-code-review-record/CODE_REVIEW.md`
      and the link text with that path minus the `../`. The SEC-5 bullet
      cited `docs/CODE_REVIEW.md:281` at `main`; the ponytail change's task
      3.2 drops that citation. If it survived, retarget it the same way.
      Verify: `grep -c "](CODE_REVIEW.md)" docs/decisions.md` prints 0.
      `grep -c "docs/CODE_REVIEW" docs/decisions.md` prints 0.
      `grep -c "2026-08-18-code-review-record" docs/decisions.md` prints 1, or
      2 if the SEC-5 citation survived and was retargeted.
      `python3 "${ANTISLOP:-$HOME/AI/AntiSlop/antislop.py}" check docs/decisions.md | wc -l`
      still prints N.

## 4. Add the spec requirement

- [ ] 4.1 Sync the delta at
      `openspec/changes/code-review-record-home/specs/development-toolchain/spec.md`
      into `openspec/specs/development-toolchain/spec.md`. Place it beside the
      browser-check requirement at `:830`. Match the shape of its siblings.
      Syncing during apply deviates from the house habit of syncing at
      archive. `openspec-archive-change` step 4 then detects "already synced"
      and offers "Archive now". That prompt is expected, not a defect.
      Verify: `grep -c "^### Requirement:" openspec/specs/development-toolchain/spec.md`
      prints 22.
      `grep -c "each land in a named home" openspec/specs/development-toolchain/spec.md`
      prints 1.
      `openspec validate --all --strict` exits 0. The no-argument form
      validates nothing and exits 0 either way.

## 5. Leave the citations alone

- [ ] 5.1 Confirm this change rewrote no archived byte. Eighteen archived
      files name a `CODE_REVIEW` path, and all eighteen stay as they are. The
      `git mv` of task 2.2 stages both halves of each rename, so the moves sit
      in the index and never in the worktree diff. Read them with `--cached`
      and scope the pathspec, so another agent's in-flight edits stay out.
      Verify:
      `git grep -l CODE_REVIEW -- openspec/changes/archive ":!openspec/changes/archive/2026-08-18-code-review-record" | wc -l`
      prints 18.
      `git diff --cached --name-status -M -- docs openspec/changes/archive | grep -c "^R100"`
      prints 4.
      `git diff --cached --name-status -M -- docs openspec/changes/archive | grep -c "^M"`
      prints 0.

## 6. Verification

- [ ] 6.1 Run the prose gate over the pushed range:
      `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`.
      Read the exit code, never the printed line count. The four moves cost
      zero, because the gate reads a renamed file's base count at the old
      path. `docs/decisions.md`, `CLAUDE.md`, the toolchain spec and the new
      `README.md` are the real exposure.
      Verify: the gate exits 0 and names each changed file as checked.

- [ ] 6.2 Run the whitespace gate over the same range:
      `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh`.
      The `< /dev/null` belongs on `range.sh` alone.
      Verify: the gate exits 0.

- [ ] 6.3 Run `bun run typecheck`, then `bun run build`, then the full
      `bun test` with `DATABASE_URL` set, inside the devcontainer. These prove
      that no code file moved. Read the verdict off a named failure.
      Verify: all three exit 0, and the skip count sits at the floor.

- [ ] 6.4 Confirm no browser check applies. This change touches no file under
      `packages/`, so no screen changes. Read the index with a pathspec, as in
      task 5.1, so another agent's worktree edits stay out of the count.
      Verify: `git diff --cached --name-only -M -- packages | wc -l` prints 0.

- [ ] 6.5 Confirm the scope boundary. This change fixes no finding and
      decides no open question.
      Verify: `git diff --cached --name-only -M -- src test | wc -l` prints 0.
