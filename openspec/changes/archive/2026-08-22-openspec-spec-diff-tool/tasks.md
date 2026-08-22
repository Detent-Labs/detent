## 1. Record the baseline

- [x] 1.1 Run `test/openspec-review-check.test.ts` and record the result
      before any extraction begins.

## 2. Extract the shared module

- [x] 2.1 Create `scripts/openspec-spec-diff.ts`. Move
      `normalizeHeading`, the `RequirementEntry` interface,
      `extractRequirements` (whose return type is `RequirementEntry[]`),
      `extractBaseTitles`, `levenshtein` (the private helper `closest`
      depends on), and `closest`, from
      `scripts/openspec-review-check.ts` into it, unchanged. Export
      `RequirementEntry`, `extractRequirements`, `extractBaseTitles`,
      and `closest`; `normalizeHeading` and `levenshtein` stay private
      helpers in the new module, exactly as they are private helpers in
      the current one.
- [x] 2.2 Change `scripts/openspec-review-check.ts` to `import {
      extractRequirements, extractBaseTitles, closest } from
      "./openspec-spec-diff"`, and delete its own copies of every moved
      symbol: `normalizeHeading`, `levenshtein`, the `RequirementEntry`
      interface, `extractRequirements`, `extractBaseTitles`, and
      `closest`. Its `main`/output logic stays in place, unchanged.

## 3. Confirm the extraction is behavior-preserving

- [x] 3.1 Run `test/openspec-review-check.test.ts` again after task 2.2.
      Every case must pass exactly as before, with identical output. A
      pass with a changed message counts as a failure of this task.

## 4. Add the CLI entry point

- [x] 4.1 In `scripts/openspec-spec-diff.ts`, add a `main(name: string)`
      that mirrors the loop `openspec-review-check.ts`'s own `main`
      already runs over `openspec/changes/<name>/specs/**/spec.md`
      against `openspec/specs/<cap>/spec.md`. Resolve `openspec/` from
      `process.cwd()`, as review-check's `REPO_ROOT` does — not from
      `import.meta.dir`. For each delta requirement, print one line:
      its kind (ADDED/MODIFIED/REMOVED), its spec file, its title, and
      `(matched)` or `(unmatched)` against the base spec, with the
      `closest` hint on an unmatched MODIFIED or REMOVED entry.
- [x] 4.2 Mirror the existing `baseTitles === null` (no base spec yet)
      handling from `openspec-review-check.ts`'s `main`: every delta
      requirement there prints as ADDED, with no match check.
- [x] 4.3 Gate the CLI so importing the module has no side effect:
      `if (import.meta.main) { process.exit(await main(process.argv[2])); }`
      at the bottom of the file. This mirrors review-check's
      `process.exit(await main())`, but the new `main` takes the change
      name as an argument instead of reading `process.argv[2]` itself.
- [x] 4.4 Missing or unknown change name: print a usage message to
      stderr and exit 2, matching
      `scripts/openspec-review-check.ts`'s own exit-code convention.
- [x] 4.5 Exit 0 on every successful run, including a diff that reports
      unmatched MODIFIED or REMOVED headers. A non-match is data in the
      output, not a failure; reserve exit 2 for a missing or unknown
      change name.
- [x] 4.6 When `openspec/changes/<name>/specs/` is absent or holds no
      delta spec file, print nothing and exit 0, so empty output reads
      as "no delta specs".

## 5. Test the CLI

- [x] 5.1 Add `test/openspec-spec-diff.test.ts`, following
      `test/openspec-review-check.test.ts`'s pattern: fixtures in a
      temp directory, no database, no `skipIf`.
- [x] 5.2 Case: a MODIFIED requirement whose header matches the base
      spec exactly, asserting `(matched)`.
- [x] 5.3 Case: a MODIFIED requirement whose header does not match any
      base header, asserting `(unmatched)` and a `closest` hint.
- [x] 5.4 Case: a capability with no base spec yet, asserting every
      delta requirement prints as ADDED with no match check.
- [x] 5.5 Case: an unknown change name, asserting exit 2.
- [x] 5.6 Case: a change whose diff reports an unmatched MODIFIED header
      still exits 0.
- [x] 5.7 Case: a change with no `specs/` directory, asserting no
      output and exit 0.

## 6. Skill wiring

- [x] 6.1 Change `.claude/skills/openspec-archive-change/SKILL.md` step
      4 to keep its `existingOutputPaths` gate (if no delta specs,
      proceed without sync prompt), and when delta specs exist, run
      `bun run scripts/openspec-spec-diff.ts <name>` and read its
      output instead of comparing delta and base specs by eye. An
      unmatched MODIFIED or REMOVED entry with a `closest` hint is the
      "renames" category of step 4's summary. Keep the sync-prompt
      branching logic (sync now vs. archive without syncing) unchanged
      in substance.
- [x] 6.2 Widen `.claude/skills/openspec-archive-change/SKILL.md`'s
      frontmatter `allowed-tools` from `Bash(openspec:*)` to also grant
      `Bash(bun run scripts/openspec-spec-diff.ts:*)`, so the skill can
      run the command task 6.1 wires in.
- [x] 6.3 Add `"openspec:spec-diff": "bun run
      scripts/openspec-spec-diff.ts"` to `package.json`'s `scripts`
      block, mirroring the existing `openspec:review-check` entry.

## 7. Verification

- [x] 7.1 Run `bun run typecheck`.
- [x] 7.2 Run the full `bun test` suite with `DATABASE_URL` set. Confirm
      both the existing `openspec-review-check` tests and the new
      `openspec-spec-diff` tests pass, and the skip count did not rise.
- [x] 7.3 Run the antislop linter over every Markdown file this change
      touched or added.
