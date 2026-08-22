## 1. Script

- [ ] 1.1 Write `scripts/openspec-task-status.ts`. Usage:
      `bun run scripts/openspec-task-status.ts <change-name>`. It reads
      `openspec/changes/<change-name>/tasks.md`, groups each `- [ ]`/`- [x]`
      checkbox line with its indented continuation lines (mirror the
      block-flushing approach in `openspec-review-check.ts`'s `checkTasks`,
      without importing it), and prints one JSON object to stdout:
      `{ "total": n, "done": n, "incomplete": n, "browserTasks": [{"line": n,
      "text": "..."}] }`. A task block counts as a browser task if its joined
      text matches `/\b(browser|manual UI walkthrough|playwright-cli)\b/i`.
- [ ] 1.2 Handle the no-`tasks.md`-file case: print
      `{ "total": 0, "done": 0, "incomplete": 0, "browserTasks": [] }` and
      exit 0, matching the skill's existing "no tasks file: proceed without
      warning" behavior.
- [ ] 1.3 Handle a missing/unknown change name: exit 2 with a usage message
      on stderr, matching `openspec-review-check.ts`'s own exit-code
      convention (0 clean run, 2 usage/environment error).

## 2. Test

- [ ] 2.1 Add `test/openspec-task-status.test.ts`, following
      `test/openspec-review-check.test.ts`'s pattern: spawn the script
      against fixtures in a temp directory, no database, no `skipIf`.
- [ ] 2.2 Case: a tasks.md with a mix of done/incomplete boxes, asserting the
      counts.
- [ ] 2.3 Case: an incomplete task naming "playwright-cli" on a continuation
      line (not the checkbox line itself), asserting it lands in
      `browserTasks` — this is the multi-line case the block-flush parsing
      exists for.
- [ ] 2.4 Case: no tasks.md file at all, asserting the all-zero JSON and
      exit 0.
- [ ] 2.5 Case: an unknown change name, asserting exit 2.

## 3. Skill wiring

- [ ] 3.1 Change `.claude/skills/openspec-archive-change/SKILL.md` step 3 to
      run `bun run scripts/openspec-task-status.ts <name>` and parse its
      JSON, instead of instructing a manual read-and-count of `tasks.md`.
      Keep the confirm/refuse branching logic (ordinary incomplete tasks vs.
      the stricter browser-task refusal) unchanged in substance.

## 4. Verification

- [ ] 4.1 Run `bun run typecheck`.
- [ ] 4.2 Run the full `bun test` suite with `DATABASE_URL` set. Confirm the
      new test file's cases pass and the skip count did not rise.
- [ ] 4.3 Run the antislop linter over every Markdown file this change
      touched or added.
