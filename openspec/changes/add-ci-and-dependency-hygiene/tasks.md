## 1. Manifests

- [ ] 1.1 Move `"zod"` from `devDependencies` to `dependencies` in the root
  `package.json` — same version range, one line moved
- [ ] 1.2 Add `zod` to `packages/app/package.json` `dependencies`
- [ ] 1.3 Add `zod` to `packages/form-ui/package.json` as a
  `peerDependency`, matching how it declares react — `form-ui` is source-only
  and is compiled by its consumer
- [ ] 1.4 Pin `"@marcbachmann/cel-js": "8.0.0"` (drop the caret), matching the
  `"typescript": "5.6.2"` style in the same file
- [ ] 1.5 Regenerate `bun.lock` and confirm `bun install --frozen-lockfile`
  succeeds — CI uses it, so a stale lockfile is a red build
- [ ] 1.6 Confirm no version actually changed: the pin resolves to what the
  lockfile already had

## 2. CI workflow

- [ ] 2.1 Add `.github/workflows/ci.yml`, triggered on `push` and
  `pull_request`
- [ ] 2.2 A `postgres:16` service with the devcontainer's credentials
  (`postgres`/`postgres`, database `workflow_engine`), with a health check so
  the steps do not start before it accepts connections
- [ ] 2.3 Install Bun at the version `.devcontainer/Dockerfile` pins via
  `BUN_VERSION`, with a comment naming that file as the source of truth
- [ ] 2.4 Steps in order: `bun install --frozen-lockfile`, a guard that fails
  if `DATABASE_URL` is unset, `bun run typecheck`, `bun test`
- [ ] 2.5 Set `DATABASE_URL` at the job level so both the guard and the test
  step see the same value
- [ ] 2.6 Run the exact command sequence locally in the devcontainer first and
  fix anything red **before** the workflow lands — a gate that arrives red
  teaches people to ignore it

## 3. Claim/release exclusivity as a real race

- [ ] 3.1 In `test/assignment.runtime-api.test.ts`, add
  `Promise.allSettled([claimStep(id, candidate), claimStep(id, roleActor)])`
  and assert exactly one fulfils and one rejects with `AlreadyClaimedError`.
  Both actors already exist in the file's fixtures
- [ ] 3.2 Assert exactly one `assignment.claimed` row exists in
  `instance_events` — the API-level outcome alone does not prove the record
  is consistent
- [ ] 3.3 Add the mirrored release race
- [ ] 3.4 Model both on `test/timer.test.ts:262`, which is an interleaved
  transaction race that already passes reliably
- [ ] 3.5 Keep the existing sequential test: it covers a different thing (a
  second claim after the first committed) and its weakness was only that it
  was the *only* one

## 4. The negative-only authorization assertion

- [ ] 4.1 Replace `test/http.test.ts:1167-1171`'s `.not.toBe(403)` /
  `.not.toBe(401)` with an exact status and `error.type` assertion
- [ ] 4.2 Assert what the `http-wrapper` spec says an untyped not-found
  produces — 500 with `error.type` `internal` today. If
  `correct-api-error-responses` has landed, assert its typed `NotFoundError`
  mapping instead; the status is unchanged either way
- [ ] 4.3 Keep it paired with the existing role-less 403 test at `:1149-1154`
  — the pair is what proves the two paths differ, which is the property
  `cancelInstance`'s non-disclosure ordering exists to preserve

## 5. Documentation corrections

- [ ] 5.1 `README.md:66` — the test command carries `DATABASE_URL`
  (`DATABASE_URL=postgres://postgres:postgres@db:5432/workflow_engine bun test`),
  with a one-line note that the DB suites skip silently without it
- [ ] 5.2 `docs/current-state.md:539-541` — users are "created and
  role-assigned only from `src/auth/cli.ts`; listing and disable/enable moved
  to HTTP — see the Admin area entry below". The same file already describes
  those routes further down, so the two entries must agree
- [ ] 5.3 `src/auth/cli.ts:2-3` — narrow the comment to creation, role
  assignment and password change; it currently asserts "there is no HTTP route
  for it", which is false and is a comment stating history rather than fact
- [ ] 5.4 `CLAUDE.md` — record beside the "ONE CEL library" rule why the
  dependency is pinned exactly, naming the silent failure mode (guard totality
  turns an evaluation change into `false`, not into a throw)
- [ ] 5.5 `docs/current-state.md` / `ROADMAP.md` — record that CI exists and
  what it runs, since neither mentions CI today

## 6. Verification

- [ ] 6.1 Run `bun run typecheck` from the repo root and confirm it passes
- [ ] 6.2 Run the FULL `bun test` suite with `DATABASE_URL` set and confirm it
  passes — check the skip count, not only the pass count
- [ ] 6.3 Run `bun test` **without** `DATABASE_URL` once and record the skip
  count in the PR description — it is the number that motivates the guard
- [ ] 6.4 Verify the new race tests fail when the row lock is removed, on a
  scratch copy of the tree — never by mutating the shared working tree. This
  is the whole point of the tests: the existing sequential test passes without
  the lock
- [ ] 6.5 Confirm the workflow's first run on a PR is green
