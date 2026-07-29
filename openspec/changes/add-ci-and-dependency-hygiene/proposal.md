# Make the guardrails machine-enforced instead of remembered

## Why

This repo invests unusually heavily in guardrails — 546 `test.skipIf(!DB)`
sites over real Postgres, `tsc --strict` fanned out across every workspace
package, publish-time validation suites, and a standing rule that every
invariant ships with a test that rejects a violating input. **Nothing runs any
of it automatically.** There is no `.github/` directory and `git ls-files`
matches no workflow, pipeline or git-hook file of any kind (checked for GitHub
Actions, GitLab, Azure Pipelines, CircleCI, Jenkins, husky — zero hits).
Neither `ROADMAP.md` nor `docs/current-state.md` mentions CI, so this is
unowned rather than deferred.

Two repo-specific failure modes sharpen this past the generic complaint:

- `bun test` **without** `DATABASE_URL` silently skips the DB-backed suites —
  the majority of the suite — and reports a meaningless green. `CLAUDE.md`
  calls this out in bold; `README.md:64-68` nevertheless prescribes a bare
  `bun test`, so following the README produces exactly the false green the
  convention exists to prevent.
- `bun run typecheck` is a separate command because Bun does not typecheck, so
  a type error passes `bun test` cleanly.

Three smaller items belong with it because they are the same category — things
that are true by convention and false in the files:

- **`zod` is a runtime dependency declared as a devDependency.** Six modules
  under `src/` import it as a value (`schema/definition.ts`, `engine/host.ts`,
  `engine/registry.ts`, `engine/registry-check.ts`, `handlers/http.ts`,
  `http/errors.ts`), and the root `exports` map publicly exposes `./schema`,
  whose five entry points all transitively reach `definition.ts`. So every
  consumer of `workflow-engine/schema` needs zod at runtime — including
  `packages/form-ui/src/locale.ts`, consumed by `packages/app`, whose manifest
  declares no zod at all. `bun install --production`, or the slim engine image
  ROADMAP stage 14 will build, yields `Cannot find module "zod"` on first
  import. It is a mis-declared contract, so stage 14 will inherit it rather
  than surface it.
- **`@marcbachmann/cel-js` is the one load-bearing dependency not pinned
  exactly** (`^8.0.0`, resolved to 8.0.0). `CLAUDE.md` makes it maximally
  load-bearing on purpose ("one CEL library for both the editor and the
  engine"), backing publish-time type-checking *and* runtime evaluation, while
  `typescript` is pinned to `5.6.2` and Bun to a `BUN_VERSION` in the
  Dockerfile. The lockfile is committed, so a plain `bun install` does not
  drift — this needs `bun update`, a lockfile-invalidating manifest edit, or
  an install with no lockfile. What makes it worth pinning anyway is the blast
  radius: guard evaluation is wrapped in `try { ... } catch { return false }`
  and the transform path degrades to a recorded drop, so an
  evaluation-semantics change does not throw — it silently reroutes or parks
  already-published, immutable bodies whose `definitionHash` guarantees the
  body never changed. That is the hardest class of regression to attribute.
- **Two documentation claims are false.** `docs/current-state.md:539-541` says
  in the present tense that users "are administered only from `src/auth/cli.ts`
  … no HTTP route creates, modifies or lists them", while
  `src/http/server.ts:319-329` registers `GET /admin/users`,
  `POST /admin/users/:id/disable` and `POST /admin/users/:id/enable` — and the
  same file's later entry describes exactly those routes. The stale claim is
  duplicated in code at `src/auth/cli.ts:2-3`, against `CLAUDE.md`'s "comments
  state facts" convention.

And two test gaps that CI would otherwise lock in as green:

- **Claim exclusivity is tested only sequentially.**
  `test/assignment.runtime-api.test.ts:96-101` claims, then claims again,
  expecting `AlreadyClaimedError` — which passes even if `claimStep`'s
  `SELECT ... FOR UPDATE` is removed entirely, because the second call reads
  state the first already committed. The `assignment-claim-enforcement` spec
  *already* has the scenario ("Two actors racing to claim the same unclaimed
  step resolve to exactly one winner"); the suite demonstrably knows how to
  write it (`runtime-api.test.ts:652`, `outbox.test.ts:297`,
  `timer.test.ts:262`, `migration.test.ts:942` are all genuine interleaved
  races) — just not for the one whose failure mode is a security property.
- **One authorization test asserts only what the response is *not*.**
  `test/http.test.ts:1167-1171` asserts `.not.toBe(403)` and `.not.toBe(401)`,
  so it passes for 200, 400, 404 or 500. It is the sole negative-only status
  assertion in a file where every other authorization test pins an exact
  status and `error.type`.

## What Changes

- `.github/workflows/ci.yml` on push and PR: a `postgres:16` service with the
  compose credentials, `bun install --frozen-lockfile`, `bun run typecheck`,
  and `bun test` with `DATABASE_URL` set. The job fails if `DATABASE_URL` is
  unset, so the silent-skip rule is machine-enforced rather than documented.
- `zod` moves to `dependencies`; `packages/app` declares it; `packages/form-ui`
  declares it as a `peerDependency`, matching how it declares react.
- `@marcbachmann/cel-js` is pinned exactly, with the reason recorded next to
  `CLAUDE.md`'s "one CEL library" rule so an upgrade is a deliberate commit
  that re-runs `test/cel.test.ts`.
- The claim and release exclusivity tests become real interleaved races.
- The negative-only cancel-authorization assertion becomes an exact one.
- `README.md`'s test command carries `DATABASE_URL`;
  `docs/current-state.md:539-541` and `src/auth/cli.ts:2-3` stop claiming
  there is no HTTP user-administration route.

## Capabilities

### Modified Capabilities

- `development-toolchain`: adds a requirement that the toolchain's checks run
  automatically on every push and pull request with the database present, and
  a requirement that a runtime import is a declared runtime dependency in the
  manifest of the package that imports it.

## Impact

- New: `.github/workflows/ci.yml`.
- `package.json` (root), `packages/app/package.json`,
  `packages/form-ui/package.json` — dependency declarations only; `bun.lock`
  is regenerated but no version changes.
- `test/assignment.runtime-api.test.ts` — two new race tests;
  `test/http.test.ts:1167-1171` — one tightened assertion.
- `README.md`, `docs/current-state.md`, `src/auth/cli.ts` — three corrections.
- **CI will be red on its first run if anything is already broken.** That is
  the point, and it should be run locally once before the workflow lands so
  the first push is not a surprise.
- No engine behavior change; no contract change.
