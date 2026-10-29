# Tasks

## 1. One root bun entry with a React group

- [x] 1.1 In `test/gates.test.ts`, change the Dependabot rules as design.md D1 and D2 state:
  - `BUN_DIRECTORIES` becomes `["/"]`.
  - `dependabotProblems` reports `a bun entry for <directory>` for each `bun` entry outside `/`.
  - It reports `no group holds react, react-dom, @types/react and @types/react-dom` when no group on the root `bun` entry lists all four.
  - The group rule runs only when a root `bun` entry exists (design.md D2). The fixture "an npm entry in place of the root bun entry" keeps its two expected messages.
  - Replace the two fixtures that delete a member entry. One new fixture adds a `/packages/web` `bun` entry.
  - Add one fixture that deletes the group from the root entry.
  - Run the full suite as in task 3.2. "the real Dependabot file breaks none of the Dependabot rules" must fail by name on the unchanged file.
- [x] 1.2 In `.github/dependabot.yml`, delete the `/packages/form-ui` and `/packages/web` entries. Add the `react` group from design.md D2 to the root entry. Run the full suite as in task 3.2. Every test named "the Dependabot rules reject …" must pass, and so must the real-file test.

## 2. Land the seven bumps

- [x] 2.1 Change the manifests to the design.md table's "Manifest change" column. Change `vite`, `@dagrejs/dagre` and `lucide-react` in `packages/web/package.json`. Change `@playwright/test` in `package.json`. Leave `@types/bun` at `^1.3.14`.
- [x] 2.2 Run the two commands of design.md D3 in the devcontainer:
  - `sh scripts/dev-exec.sh bun update react react-dom @types/react @types/react-dom @vitejs/plugin-react`
  - `sh scripts/dev-exec.sh bun install`
  - Restore any manifest range that `bun update` rewrote. `git diff -- package.json packages/*/package.json` must show only the four lines from 2.1.
  - `bun.lock` must hold every target version from the design.md table, and `@types/bun@1.3.14`.
  - On the host, `sh scripts/gates/lockfile.sh` must exit 0.
- [x] 2.3 Run `sh scripts/dev-exec.sh bun run scripts/thirdparty.ts --write`. `git diff --stat THIRDPARTY.md` must show changes only for the bumped packages and their new transitive entries.
- [x] 2.4 Run `sh scripts/dev-exec.sh bun audit --audit-level=high`. Record its exit status.

## 3. Verification

- [ ] 3.1 Run `sh scripts/dev-exec.sh bun run typecheck`, `sh scripts/dev-exec.sh bun run lint` and `sh scripts/dev-exec.sh bun run build`. Record each exit status.
- [ ] 3.2 With no dev server running, run the full `bun test` with `DATABASE_URL` set through `sh scripts/dev-exec.sh sh scripts/test-gated.sh bun test`. Record the summary lines and the gate's verdict.
- [ ] 3.3 Run `sh scripts/dev-exec.sh bun run test:tz`. Record its summary.
- [ ] 3.4 Commit first, then run these on the host. Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` and the same pipeline with `whitespace.sh`. Then run `sh scripts/gates/machine-paths.sh`. Record what each printed.

## Workflow follow-up

- Run `openspec-review-change`, then start apply without asking (owner's rule).
- After apply: verify, sync, archive, push, open a PR, merge once CI is green.
- The CI `e2e` job is this change's browser check (design.md D4).
