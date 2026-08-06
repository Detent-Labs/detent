# Tasks

## 1. Repair the ignore file

- [ ] 1.1 Rewrite `.dockerignore` so every recurring name carries the `**/`
  prefix, and so the root-only paths join it. The measured content is:

  ```
  **/node_modules
  **/dist
  **/.git
  **/test
  **/.env
  .devcontainer
  .claude
  .worktrees
  docs
  openspec
  tmp
  ```

- [ ] 1.2 Confirm the file keeps no bare `node_modules`, `.git`, `test` or
  `.env` entry. A bare entry is what caused the defect.

## 2. Add the lint

- [ ] 2.1 Write `test/dockerignore.test.ts`. Export a pure check from it. The
  check takes a pattern list plus a set of observed relative paths. It returns
  the bare entries whose name occurs at more than one depth.
- [ ] 2.2 Add the tree case. It walks the working tree, skips any directory
  `.dockerignore` already excludes, and runs the check over what remains.
- [ ] 2.3 Add the required-entry case: `**/node_modules`, `**/.git`, `**/.env`,
  `.claude` and `.worktrees` must all appear.
- [ ] 2.4 Add the rejecting case. Feed the check the pre-fix pattern list
  (`node_modules`, `**/dist`, `.git`, `.devcontainer`, `docs`, `test`,
  `**/test`) with the observed path
  `packages/form-ui/node_modules/@types/react`. Assert it reports
  `node_modules`.
- [ ] 2.5 Keep the walk bounded, so the case stays fast on a tree that holds
  nine agent worktrees.

## 3. Change the documentation

- [ ] 3.1 Extend the docker-image entry in `docs/current-state.md`. Give what
  the ignore file excludes, why the recursive form is load-bearing, and the
  measured context size.
- [ ] 3.2 Do not touch `docs/authoring-guide.md`. This change alters no rule
  that guide states.

## 4. Verification

- [ ] 4.1 Run `bun run typecheck`. Report what it printed.
- [ ] 4.2 Run the FULL `bun test` suite with `DATABASE_URL` set, inside the
  devcontainer. Report the pass count and the skip count, never the pass count
  alone. A single-file rerun is not the signal.
- [ ] 4.3 Build the engine image for real, on a tree where `bun install` has
  run. The command is `docker build -f docker/engine.Dockerfile .`. Report the
  context size the transfer printed and the final exit status.
- [ ] 4.4 Build the frontend image for real:

  ```
  docker build -f docker/frontend.Dockerfile \
    --build-arg VITE_API_URL=https://api.example.com .
  ```

  Confirm the built `index.html` and the built JavaScript both carry that
  origin.
- [ ] 4.5 Confirm the engine image holds no `/app/.env`.
- [ ] 4.6 Confirm `bun install --production --frozen-lockfile` succeeded inside
  the engine image.
- [ ] 4.7 Run the antislop linter over every Markdown file this change touched.
- [ ] 4.8 Run `git diff --check` for trailing whitespace.
- [ ] 4.9 Run `git ls-files --eol`. Read the `w/` column for CRLF.
