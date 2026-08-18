## 1. Schema change

- [x] 1.1 In `test/validate.test.ts`, add a test using the file's own
  `rejects` helper. Set `d.status` (`processVersion`'s own field, not the
  nested `d.definition`) to `"deprecated"`, then to `"archived"`. Assert
  `processVersion.safeParse` rejects each value. Run this test while the
  enum still carries all four members, and confirm it fails. This is the
  regression test for the invariant 1.2 adds. CLAUDE.md states the rule:
  every invariant that lands ships with a test that rejects a violating
  input.
- [x] 1.2 In `src/schema/definition.ts:197`, narrow `definitionStatus` from
  `z.enum(["draft", "published", "deprecated", "archived"])` to
  `z.enum(["draft", "published"])`.
- [x] 1.3 Re-run the 1.1 test and confirm it now passes against the
  narrowed enum.
- [x] 1.4 In `PONYTAIL-AUDIT.md`, find the "Resolved from the 2026-08-17
  scan" section's finding-40 paragraph stating
  "`definitionStatus`'s two dead members stay filed, unresolved". Extend it
  to record that this change deletes them. Match the format of the
  section's other entries.

## 2. Verification

- [x] 2.1 Run `bun run typecheck` and confirm it reports no errors.
- [x] 2.2 Run the full `bun test` suite with `DATABASE_URL` set. Confirm a
  named pass, and check the skip count as well as the pass count. A run
  with `DATABASE_URL` unset skips the DB-backed suites silently.
- [x] 2.3 Run `bun run build`. Report what it printed.
- [x] 2.4 Run the antislop linter over every Markdown file this change
  touched (`proposal.md`, `design.md`, `tasks.md`, and `PONYTAIL-AUDIT.md`
  once 1.4 lands).
- [x] 2.5 Run `git diff --check` over the changed files, then
  `git ls-files --eol` and confirm no CRLF in the `w/` column for files
  this change adds.
