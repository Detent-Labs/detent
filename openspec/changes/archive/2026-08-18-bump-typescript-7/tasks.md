## 1. Dependency bump

- [x] 1.1 Merge Dependabot PR #17 bumping `typescript` to `7.0.2` in
      `package.json` and `packages/web/package.json`.
- [x] 1.2 Regenerate `bun.lock` against the bumped `typescript` and push it
      as a follow-up commit on the PR branch (Dependabot does not update
      `bun.lock` here).

## 2. Verification

- [x] 2.1 Run `bun run typecheck` (engine, `packages/form-ui`,
      `packages/web`) against TypeScript 7.0.2: 0 errors.
- [x] 2.2 Run `bun run build`: succeeds unchanged.
- [x] 2.3 Run the FULL `bun test` suite with `DATABASE_URL` set: 2741
      pass, 0 fail, 1 unrelated skip (timezone-only, pre-existing).
- [x] 2.4 Confirm the repository's `.githooks/pre-push` hook re-ran the same
      checks on push and passed.

## 3. Record-keeping

- [x] 3.1 Author this OpenSpec change retroactively, since the "tooling or
      infra switch" trigger in `CLAUDE.md` was missed before merging.
