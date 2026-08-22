## 1. Extract the shared module

- [ ] 1.1 Create `scripts/openspec-spec-diff.ts`. Move
      `normalizeHeading`, the `RequirementEntry` interface,
      `extractRequirements` (whose return type is `RequirementEntry[]`),
      `extractBaseTitles`, `levenshtein` (the private helper `closest`
      depends on), and `closest`, from
      `scripts/openspec-review-check.ts` into it, unchanged. Export
      `normalizeHeading`, `RequirementEntry`, `extractRequirements`,
      `extractBaseTitles`, and `closest`; `levenshtein` stays a private
      helper in the new module, exactly as it is a private helper in
      the current one.
- [ ] 1.2 Change `scripts/openspec-review-check.ts` to `import { ... }
      from "./openspec-spec-diff"` for those four names, deleting its
      own copies. Its `RequirementEntry` interface and its
      `main`/output logic stay in place, unchanged.

## 2. Confirm the extraction is behavior-preserving

- [ ] 2.1 Run `test/openspec-review-check.test.ts` before task 1 and
      record the result.
- [ ] 2.2 Run it again after task 1.2. Every case must pass exactly as
      before, with identical output. A pass with a changed message
      counts as a failure of this task.

## 3. Add the CLI entry point

- [ ] 3.1 In `scripts/openspec-spec-diff.ts`, add a `main(name: string)`
      that reuses the loop `openspec-review-check.ts`'s own `main`
      already runs over `openspec/changes/<name>/specs/**/spec.md`
      against `openspec/specs/<cap>/spec.md`. For each delta
      requirement, print one line: its kind (ADDED/MODIFIED/REMOVED),
      its spec file, its title, and `(matched)` or `(unmatched)`
      against the base spec, with the `closest` hint on an unmatched
      MODIFIED or REMOVED entry.
- [ ] 3.2 Reuse the existing `baseTitles === null` (no base spec yet)
      handling from `openspec-review-check.ts`'s `main`: every delta
      requirement there prints as ADDED, with no match check.
- [ ] 3.3 Gate the CLI so importing the module has no side effect:
      `if (import.meta.main) { process.exit(await main(process.argv[2])); }`
      at the bottom of the file, following
      `scripts/openspec-review-check.ts`'s own `process.exit(await
      main())` pattern but conditioned on `import.meta.main`.
- [ ] 3.4 Missing or unknown change name: print a usage message to
      stderr and exit 2, matching
      `scripts/openspec-review-check.ts`'s own exit-code convention.

## 4. Test the CLI

- [ ] 4.1 Add `test/openspec-spec-diff.test.ts`, following
      `test/openspec-review-check.test.ts`'s pattern: fixtures in a
      temp directory, no database, no `skipIf`.
- [ ] 4.2 Case: a MODIFIED requirement whose header matches the base
      spec exactly, asserting `(matched)`.
- [ ] 4.3 Case: a MODIFIED requirement whose header does not match any
      base header, asserting `(unmatched)` and a `closest` hint.
- [ ] 4.4 Case: a capability with no base spec yet, asserting every
      delta requirement prints as ADDED with no match check.
- [ ] 4.5 Case: an unknown change name, asserting exit 2.

## 5. Skill wiring

- [ ] 5.1 Change `.claude/skills/openspec-archive-change/SKILL.md` step
      4 to run `bun run scripts/openspec-spec-diff.ts <name>` and read
      its output, instead of comparing delta and base specs by eye.
      Keep the sync-prompt branching logic (sync now vs. archive
      without syncing) unchanged in substance.

## 6. Verification

- [ ] 6.1 Run `bun run typecheck`.
- [ ] 6.2 Run the full `bun test` suite with `DATABASE_URL` set. Confirm
      both the existing `openspec-review-check` tests and the new
      `openspec-spec-diff` tests pass, and the skip count did not rise.
- [ ] 6.3 Run the antislop linter over every Markdown file this change
      touched or added.
