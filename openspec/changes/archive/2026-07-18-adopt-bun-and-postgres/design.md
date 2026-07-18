## Context

Current toolchain: Node 22 devcontainer, pnpm via corepack, `tsx` as the TS runner,
`vitest` for tests, `tsc --noEmit` for typechecking. The only runtime dependency is
Zod. Tests are a single suite (`test/validate.test.ts`) exercising the schema
invariants. No engine, no datastore, no DB code exists yet. The Claude Code CLI runs
inside the devcontainer and is a Node program.

## Goals / Non-Goals

**Goals:**
- Bun as the single tool for running, installing, and testing.
- Fewer dev dependencies (`tsx`, `vitest` gone) and no corepack indirection.
- PostgreSQL declared as the datastore and available in the dev environment.
- No change to `src/schema/definition.ts` or any test assertion.

**Non-Goals:**
- Writing engine or persistence code (roadmap item 3 owns that).
- Adding a Postgres client library or ORM.
- Replacing `tsc` — Bun does not typecheck; the type gate is unchanged.

## Decisions

**Keep the `typescript-node:22` base and layer Bun on top** (vs. the `oven/bun`
image). The Claude Code CLI is a Node program and the devcontainer feature expects a
Node base; a Bun-only image would break it. Node remaining present does not weaken
"Bun is the standard" — the standard is what the project *uses* (`bun install`/`bun
test`). Bun installs into `/usr/local` (`BUN_INSTALL=/usr/local`) so it is on PATH for
all users, and the install pins an explicit `BUN_VERSION` for reproducibility.

**docker-compose devcontainer** (vs. `build.dockerfile`). Provisioning Postgres needs
a second service, which the single-Dockerfile form cannot express. `app` builds from
the Dockerfile; `db` is `postgres:16` with a named volume; `DATABASE_URL` is injected
into `app`.

**`bun:test` over vitest-under-Bun.** Bun's runner is native and its
describe/it/expect API is identical to what the suite already uses, so the only change
is the import specifier — and it removes the `vitest` dependency entirely.

**tsconfig `types: ["bun"]`, keep NodeNext.** `@types/bun` supplies the Bun global and
`bun:test` module types and transitively pulls node module types, so `node:fs` still
resolves. `module`/`moduleResolution: NodeNext` is read only by `tsc`; the Bun runtime
resolves `.js`→`.ts` itself, so the existing `.js` import specifiers need no change.

**PostgreSQL via `Bun.sql`, decision-only now.** Bun ships a native Postgres client,
so the future engine needs no client dependency. This change records the decision and
provisions the dev database; `DATABASE_URL` is the connection convention.

## Risks / Trade-offs

- Bun install script is unversioned by default → non-reproducible builds. → Pin
  `BUN_VERSION` in the Dockerfile.
- `@types/bun` vs `@types/node` global collisions. → Drop `@types/node`; set
  `types: ["bun"]` so only Bun's ambient types load (node module types stay resolvable).
- Postgres provisioned with no consumer yet (idle service). → Accepted; it is the dev
  environment for the imminent engine work, not shipped runtime.
- Host verification uses the host's Bun (1.3.11), not the container image. → The suite
  is pure TS + Zod + node stdlib; behavior is identical. Container parity is confirmed
  when the devcontainer is rebuilt.

## Migration Plan

1. Update Dockerfile, add `docker-compose.yml`, update `devcontainer.json`.
2. Update `package.json`, `tsconfig.json`, `test/validate.test.ts`; delete
   `pnpm-lock.yaml`.
3. `bun install` (generates `bun.lock`), then `bun run typecheck` and `bun test`.
4. Update `CLAUDE.md` and `openspec/config.yaml` context.

Rollback: restore `pnpm-lock.yaml` and the pnpm/Node files from git; no data migration
is involved (no persisted state yet).

## Open Questions

None. Engine-side persistence details (schema, connection pooling, migrations) are
deferred to roadmap item 3, out of scope here.
