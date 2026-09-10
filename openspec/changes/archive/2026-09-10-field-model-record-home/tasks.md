This change lands third of three. `retire-ponytail-ledger-gate` and
`code-review-record-home` both write into `docs/decisions.md` before it. After
those two, the file carries five top-level headings, and the fifth,
`## Refused simplifications`, runs to the end of the file. Every task here
writes inside `## Open questions` or replaces a code span found by content.
Anchor on heading text, never on a line number. Confirm the state before task
1.1. Verify: `grep -c '^## ' docs/decisions.md` prints 5. Verify:
`grep -q '^## Refused simplifications' docs/decisions.md` exits 0.

The linter runs as `python3`, which `scripts/gates/prose.sh:98` resolves first.
A file's gate count is 0 when the linter exits 0, and otherwise the number of
non-empty lines it prints (`prose.sh`, `lint_at`). The base-count loops below
compute the same number.

## 1. docs/decisions.md: the six items that exist only in the record

Each bullet appends at the end of `## Open questions`, after the ARCH-1 entry
that `code-review-record-home` added there. Write each one self-contained, the
way `docs/decisions.md` states S1 under that heading today. Read the source
passage first, at the line this task names, and keep its argument. A label may
recur inside one bullet, and a bullet may wrap. Each Verify therefore asks
whether the section names the item. A line count would fail on correct work.

- [x] 1.1 Append a bullet on the `richtext` format, from D7
      (`docs/field-model-redesign.md:74-77`) and D20 (`:159-162`). It states
      that a multiline string is still a string. It states that a `richtext`
      value is markup instead. It states the reason that puts `richtext` on the
      `format` axis: a `notification.email` handler must know before it escapes
      the value. It names Markdown storage as the cheaper answer. Verify:
      `sed -n '/^## Open questions/,/^## Decided and built/p' docs/decisions.md | grep -q 'notification.email'`
      exits 0.
- [x] 1.2 Append a bullet on the deferred `image` and `signature` formats, from
      D20 (`docs/field-model-redesign.md:164-166`). Line `:164` is the topic
      sentence: both refine a `file`, and `file` is opaque today. Confirm the
      premise before writing: `JS_TYPE` maps `file` to `"any"`. Cite that line.
      Verify: `grep -n 'file: "any"' src/schema/definition.ts` prints line 407.
      Verify:
      `sed -n '/^## Open questions/,/^## Decided and built/p' docs/decisions.md | grep -q 'signature'`
      exits 0.
- [x] 1.3 Append a bullet on the deferred `slider` and `stars` controls, from
      D21 (`docs/field-model-redesign.md:178-180`). Neither is a native HTML
      control. Each needs its own keyboard and screen-reader work. Nobody has
      asked for either. Verify:
      `sed -n '/^## Open questions/,/^## Decided and built/p' docs/decisions.md | grep -q 'stars'`
      exits 0.
- [x] 1.4 Append a bullet on the `items` key, from D3
      (`docs/field-model-redesign.md:60-61`). A `list` holds strings today, and
      a typed list would add an `items` key. Say how this differs from S1, the
      expense-claim bullet under the same heading: S1 is a repeating sub-table
      of rows and columns, while `items` types the members of one flat list.
      Verify:
      `sed -n '/^## Open questions/,/^## Decided and built/p' docs/decisions.md | grep -q '`items`'`
      exits 0.
- [x] 1.5 Append a bullet for S3, catalog scope, from
      `docs/field-model-redesign.md:255-256`. Reusing one field across several
      processes raises a scoping question, and the catalog is per-process today.
      Carry the label S3, because
      `openspec/changes/archive/2026-08-31-field-model-person-format/proposal.md:85`
      cites it and states no content. Verify:
      `sed -n '/^## Open questions/,/^## Decided and built/p' docs/decisions.md | grep -q 'S3'`
      exits 0.
- [x] 1.6 Append a bullet for S4, hierarchical option sets, from
      `docs/field-model-redesign.md:258-260`. This one is a settled placement,
      not an open shape: a choice tree belongs to the data source that supplies
      the options, and not to the field that binds to that source. Say that, and
      carry the label S4. Verify:
      `sed -n '/^## Open questions/,/^## Decided and built/p' docs/decisions.md | grep -q 'S4'`
      exits 0.
- [x] 1.7 Confirm all six bullets sit above the `## Decided and built` heading
      and that the file still carries five headings. Verify:
      `awk '/^## Decided and built/{exit} /^## Open questions/{f=1} f&&/S4/{n++} END{exit !(n>=1)}' docs/decisions.md`
      exits 0. Verify: `grep -c '^## ' docs/decisions.md` prints 5.
- [x] 1.8 Lint the file. Its gate count is 0 today, so the new lines must be
      clean on their own. Verify:
      `python3 "${ANTISLOP:-$HOME/AI/AntiSlop/antislop.py}" check docs/decisions.md`
      exits 0.

## 2. Move the record

- [x] 2.1 Run
      `git mv docs/field-model-redesign.md openspec/changes/archive/2026-08-30-field-model-type-format-control/`.
      Change no byte inside the file. The two passages that commit `7aaa1049`
      wrote (`:248-249` and `:270`) travel with it, per `design.md`. Verify:
      `git diff --cached -M --numstat | grep field-model-redesign` prints one
      line starting with `0` and `0`, which proves zero changed lines.
- [x] 2.2 Confirm the file landed beside change 1's own artifacts. Verify:
      `ls openspec/changes/archive/2026-08-30-field-model-type-format-control/`
      lists `field-model-redesign.md` next to `proposal.md`, `design.md` and
      `tasks.md`.

## 3. The seven pointers in live documents

Each site names the old path inside a code span. Replace the span, and change no
word around it. Keep the new path unbroken on one line, even where that line
runs past 80 columns. A wrapped code span shifts antislop sentence counts.

Measure each file's base count first. `docs/current-state.md` exits 1 at 619
findings on `main` today, so "exits 0" is out of reach there. The gate blocks
only a rise, and so does task 3.5.

- [x] 3.0 Record the base count of the four files this section touches, at
      `HEAD`, before any edit. The two siblings move `CLAUDE.md` and
      `docs/decisions.md`, so read the numbers off the run and never off a
      note. Verify:
      `for p in CLAUDE.md docs/current-state.md docs/decisions.md docs/roadmap-history.md; do git show "HEAD:$p" > /tmp/base.md; if python3 "${ANTISLOP:-$HOME/AI/AntiSlop/antislop.py}" check /tmp/base.md > /tmp/out.txt 2>&1; then n=0; else n=$(grep -c . /tmp/out.txt); fi; echo "$p $n"; done | tee /tmp/base-live.txt`
      prints four lines, one `<path> <count>` each, and `/tmp/base-live.txt`
      holds them.
- [x] 3.1 Point `CLAUDE.md:331`'s bullet at the archived path, under
      "Where the rest is documented". Keep the bullet's own words, which call it
      a design record and not a spec. Verify:
      `grep -c 'field-model-type-format-control/field-model-redesign.md' CLAUDE.md`
      prints 1.
- [x] 3.2 Replace the span at `docs/current-state.md:17`, inside the
      parenthesis that already names `field-model-type-format-control`. Verify:
      `grep -c 'field-model-type-format-control/field-model-redesign.md' docs/current-state.md`
      prints 1.
- [x] 3.3 Replace the span in both provenance pointers in `docs/decisions.md`,
      in the S1 bullet and in the four-view-shapes bullet. Line numbers moved
      when the siblings landed and move again after task 1, so find them by
      content. Verify:
      `grep -c 'field-model-type-format-control/field-model-redesign.md' docs/decisions.md`
      prints 2.
- [x] 3.4 Replace the span in all three pointers in `docs/roadmap-history.md`,
      in stages 54, 55 and 56. Verify:
      `grep -c 'field-model-type-format-control/field-model-redesign.md' docs/roadmap-history.md`
      prints 3.
- [x] 3.5 Re-lint the four worktree files and compare each against its 3.0
      base. A rise blocks the push, so repair the line that rose. Verify:
      `rc=0; while read -r p b; do if python3 "${ANTISLOP:-$HOME/AI/AntiSlop/antislop.py}" check "$p" > /tmp/out.txt 2>&1; then n=0; else n=$(grep -c . /tmp/out.txt); fi; echo "$p base=$b tip=$n"; [ "$n" -le "$b" ] || rc=1; done < /tmp/base-live.txt; test "$rc" = 0`
      exits 0.

## 4. The ten citations inside three archived changes

Measure each file's base count first, before this section touches it. A path
swap is a code-span swap, and a code span can shift a sentence boundary. Change
no word around the span.

- [x] 4.1 Record the base count of all seven files this section touches, at
      `HEAD`, before any edit. The seven are change 1's `design.md` and
      `proposal.md`, change 2's `design.md` and `proposal.md`, and change 3's
      `design.md`, `proposal.md` and `tasks.md`. Verify:
      `for p in openspec/changes/archive/2026-08-30-field-model-type-format-control/design.md openspec/changes/archive/2026-08-30-field-model-type-format-control/proposal.md openspec/changes/archive/2026-08-31-field-model-person-format/design.md openspec/changes/archive/2026-08-31-field-model-person-format/proposal.md openspec/changes/archive/2026-09-01-field-model-view-note/design.md openspec/changes/archive/2026-09-01-field-model-view-note/proposal.md openspec/changes/archive/2026-09-01-field-model-view-note/tasks.md; do git show "HEAD:$p" > /tmp/base.md; if python3 "${ANTISLOP:-$HOME/AI/AntiSlop/antislop.py}" check /tmp/base.md > /tmp/out.txt 2>&1; then n=0; else n=$(grep -c . /tmp/out.txt); fi; echo "$p $n"; done | tee /tmp/base-archive.txt`
      prints seven lines, one `<path> <count>` each, and
      `/tmp/base-archive.txt` holds them.
- [x] 4.2 In `openspec/changes/archive/2026-08-30-field-model-type-format-control/`,
      shorten the span to the bare filename at `design.md:3`, `design.md:300`
      and `proposal.md:15`. The record now sits in that same directory, so a
      bare `field-model-redesign.md` resolves. Verify:
      `grep -rl 'docs/field-model-redesign' openspec/changes/archive/2026-08-30-field-model-type-format-control/ | wc -l`
      prints 0.
- [x] 4.3 In `openspec/changes/archive/2026-08-31-field-model-person-format/`,
      write the full archive path at `design.md:3` and `proposal.md:13`. Verify:
      `grep -rl 'docs/field-model-redesign' openspec/changes/archive/2026-08-31-field-model-person-format/ | wc -l`
      prints 0.
- [x] 4.4 In `openspec/changes/archive/2026-09-01-field-model-view-note/`, write
      the full archive path at `design.md:3`, `proposal.md:9`, `proposal.md:217`,
      `tasks.md:127` and `tasks.md:129`. Verify:
      `grep -rl 'docs/field-model-redesign' openspec/changes/archive/2026-09-01-field-model-view-note/ | wc -l`
      prints 0.
- [x] 4.5 Re-lint each edited archived file and compare against its 4.1 base.
      A rise blocks the push, so repair the line that rose. Watch
      `design.md:300` of change 1: that sentence already opens with a code span,
      which is the merge case MEMORY names. Verify:
      `rc=0; while read -r p b; do if python3 "${ANTISLOP:-$HOME/AI/AntiSlop/antislop.py}" check "$p" > /tmp/out.txt 2>&1; then n=0; else n=$(grep -c . /tmp/out.txt); fi; echo "$p base=$b tip=$n"; [ "$n" -le "$b" ] || rc=1; done < /tmp/base-archive.txt; test "$rc" = 0`
      exits 0.

## 5. Sweep and gates

- [x] 5.1 Confirm no tracked file outside this change's own directory still
      names the old path. This change's artifacts cite it by design, and the
      two untracked `docs/doc-audit-2026-09-09*` files stay out of scope, since
      `git grep` does not read them. Verify:
      `git grep -l 'docs/field-model-redesign' -- '*.md' ':!openspec/changes/field-model-record-home' | wc -l`
      prints 0.
- [x] 5.2 Confirm nothing outside Markdown changed. `git mv` stages both halves
      of the rename, so read `git status`, never `git diff --name-only`.
      Verify: `git status --porcelain | grep -c '^.. \(src\|packages\|test\|openspec/specs\)/'`
      prints 0.
- [x] 5.3 Run the prose gate over the pushed range. The rename costs zero,
      because the gate reads a renamed file's base count at the old path
      (`scripts/gates/prose.sh:23`). Verify:
      `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` exits
      0.
- [x] 5.4 Run the whitespace gate over the same range. Verify:
      `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh`
      exits 0.
- [x] 5.5 Validate the change. Verify:
      `openspec validate field-model-record-home --strict` exits 0, and accepts
      the zero-delta change on the `skip_specs: true` marker in
      `.openspec.yaml`.

## 6. Verification

This change edits Markdown and moves one file, so the three commands below
prove that no code file moved. The controller runs them once, alone, after the
three record-home changes land. No implementer runs them per task.

- [x] 6.1 Run `bun run typecheck` in the devcontainer. Verify: it exits 0.
- [x] 6.2 Run `bun run build` in the devcontainer. Verify: it exits 0.
- [x] 6.3 Run the full `bun test` in the devcontainer with `DATABASE_URL` set.
      Read the verdict off a named failure, never off a pass count. Capture the
      run and hand the capture to the gate:
      `bun test 2>&1 | tee /tmp/t.log; sh scripts/gates/silent-green.sh /tmp/t.log`.
      Verify: the gate exits 0, and the skip count sits at the floor.
- [x] 6.4 Confirm no browser check applies: no file under `packages/` changed,
      so no screen changes. Verify:
      `git status --porcelain | grep -c '^.. packages/'` prints 0.
