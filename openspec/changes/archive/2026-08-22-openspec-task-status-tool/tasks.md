## 1. Script

- [x] 1.1 Write `scripts/openspec-task-status.ts`. Usage:
      `bun run scripts/openspec-task-status.ts <change-name>`. It reads
      `openspec/changes/<change-name>/tasks.md`, groups each `- [ ]`/`- [x]`
      checkbox line with its indented continuation lines (mirror the
      block-flushing approach in `openspec-review-check.ts`'s `checkTasks`,
      without importing it), and prints one JSON object to stdout. Add a
      one-line comment on the block-flushing code noting it mirrors, and
      deliberately doesn't import, `checkTasks`.
      The JSON object:
      `{ "total": n, "done": n, "incomplete": n, "browserTasks": [{"line": n,
      "text": "..."}] }`. Each `browserTasks` entry's `line` is the 1-based
      line number of the checkbox line and its `text` is the joined block
      text. An incomplete task block counts as a browser task if its joined
      text matches `/\b(browser|manual UI walkthrough|playwright-cli)\b/i`.
- [x] 1.2 Handle the no-`tasks.md`-file case: print
      `{ "total": 0, "done": 0, "incomplete": 0, "browserTasks": [] }` and
      exit 0, matching the skill's existing "no tasks file: proceed without
      warning" behavior.
- [x] 1.3 Handle a missing/unknown change name: exit 2 with a usage message
      on stderr, matching `openspec-review-check.ts`'s own exit-code
      convention (0 clean run, 2 usage/environment error).
- [x] 1.4 Handle a `tasks.md` the script cannot read (for example, the path
      is a directory): exit 2 with a message on stderr, the same as an
      unknown change name.
- [x] 1.5 Add a matching `"openspec:task-status": "bun run
      scripts/openspec-task-status.ts"` entry to `package.json`, next to the
      existing `"openspec:review-check"` entry.

## 2. Test

- [x] 2.1 Add `test/openspec-task-status.test.ts`, following
      `test/openspec-review-check.test.ts`'s pattern: spawn the script
      against fixtures in a temp directory, no database, no `skipIf`.
- [x] 2.2 Case: a tasks.md with a mix of done/incomplete boxes, asserting the
      counts.
- [x] 2.3 Case: an incomplete task naming "playwright-cli" on a continuation
      line (not the checkbox line itself), asserting it lands in
      `browserTasks` with the checkbox line number and the joined block text —
      this is the multi-line case the block-flush parsing exists for.
- [x] 2.4 Case: a complete (`- [x]`) task naming "browser", asserting it does
      not land in `browserTasks` — locks in that only incomplete tasks trigger
      the stricter refusal.
- [x] 2.5 Case: no tasks.md file at all, asserting the all-zero JSON and
      exit 0.
- [x] 2.6 Case: an unknown change name, asserting exit 2.
- [x] 2.7 Case: a `tasks.md` path that is a directory, asserting exit 2.

## 3. Skill wiring

- [x] 3.1 Change `.claude/skills/openspec-archive-change/SKILL.md` step 3 to
      run `bun run scripts/openspec-task-status.ts <name>` and parse its
      JSON, instead of instructing a manual read-and-count of `tasks.md`.
      Keep the confirm/refuse branching logic (ordinary incomplete tasks vs.
      the stricter browser-task refusal) unchanged in substance.
- [x] 3.2 Drop the skill's entire `allowed-tools:` frontmatter line, whatever
      Bash patterns it lists at the time, so step 3 may run `bun`, matching
      `openspec-review-change/SKILL.md`, which runs a Bun script and carries
      no `allowed-tools` line.

## 4. Verification

- [x] 4.1 Run `bun run typecheck`.
- [x] 4.2 Run the full `bun test` suite with `DATABASE_URL` set. Confirm the
      new test file's cases pass and the skip count did not rise.
- [x] 4.3 Run `sh scripts/gates/prose.sh < /dev/null` (defaults to
      `origin/main..HEAD`), the push gate's prose check, over the Markdown
      this change touched or added.
