## Why

The toolchain is spread across Node, corepack/pnpm, tsx, and vitest for what is a
small TypeScript project. Bun collapses runtime, package manager, and test runner
into one tool with native TypeScript execution, removing two dev dependencies and
the corepack indirection. At the same time the project has no declared datastore;
the engine (roadmap item 3) needs one, and Bun's native `Bun.sql` speaks
PostgreSQL without a client dependency, so choosing Postgres now is free to adopt.

## What Changes

- Bun becomes the standard runtime, package manager, and test runner. **BREAKING** for
  contributors: `pnpm install`/`pnpm test` are replaced by `bun install`/`bun test`.
- Drop `tsx` and `vitest` dev dependencies and the `packageManager` pin; `tsc --noEmit`
  remains the type gate (Bun does not typecheck).
- `test/validate.test.ts` imports from `bun:test` instead of `vitest` (identical
  describe/it/expect API; no test logic changes).
- Devcontainer moves to docker-compose: an `app` service (Node 22 base + Bun) and a
  `postgres:16` `db` service with a persistent volume and a `DATABASE_URL` env.
- PostgreSQL is declared the datastore. No engine or DB code exists yet, so this change
  ships the decision and the dev-environment provisioning only — the engine will use
  `Bun.sql` (no client dependency) when built.
- Documentation (`CLAUDE.md`, `openspec/config.yaml` context) updated to match.
- `src/schema/definition.ts` is NOT changed.

## Capabilities

### New Capabilities
- `development-toolchain`: the project's required runtime, package manager, test
  runner, and typecheck tool, and how contributors install, test, and typecheck.
- `persistence`: PostgreSQL as the engine's datastore, accessed via Bun's native
  `Bun.sql`, with `DATABASE_URL` as the connection convention.

### Modified Capabilities
<!-- None: openspec/specs/ is empty; no existing requirements change. -->

## Impact

- Devcontainer: `.devcontainer/Dockerfile`, `.devcontainer/devcontainer.json`, new
  `.devcontainer/docker-compose.yml`.
- Tooling: `package.json` (scripts, devDeps, remove pin), `tsconfig.json` (`types`),
  `test/validate.test.ts` (import), remove `pnpm-lock.yaml` (adds `bun.lock`).
- Docs: `CLAUDE.md`, `openspec/config.yaml`.
- No runtime/product code and no schema contract changes.
- Verification: `bun install`, `bun run typecheck`, `bun test` all green.
