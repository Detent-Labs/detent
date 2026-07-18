## 1. Tooling and manifest

- [x] 1.1 `package.json`: remove the `packageManager` pin; remove `tsx` and `vitest`
  from devDependencies; replace `@types/node` with `@types/bun`; keep `typescript` and
  `zod`. Set scripts `test` → `bun test`, keep `typecheck` → `tsc --noEmit`.
- [x] 1.2 `tsconfig.json`: change `types: ["node"]` → `["bun"]`. Leave
  `module`/`moduleResolution: NodeNext` and `strict` unchanged.
- [x] 1.3 `test/validate.test.ts`: change the import from `"vitest"` to `"bun:test"`;
  no other change.
- [x] 1.4 Delete `pnpm-lock.yaml`.

## 2. Devcontainer + PostgreSQL

- [x] 2.1 `.devcontainer/Dockerfile`: keep the `typescript-node:22` base; remove
  `corepack enable`; install Bun via its official script with `BUN_INSTALL=/usr/local`
  and a pinned `BUN_VERSION`.
- [x] 2.2 Add `.devcontainer/docker-compose.yml`: `app` service (built from the
  Dockerfile, workspace mounted, `DATABASE_URL` env) and `db` service (`postgres:16`
  with a named volume and POSTGRES_* env).
- [x] 2.3 `.devcontainer/devcontainer.json`: replace `build` with
  `dockerComposeFile`/`service`/`workspaceFolder`; change `postCreateCommand` to
  `bun install`; keep the Claude Code feature and the config volume mount.

## 3. Verification

- [x] 3.1 Run `bun install` (generates `bun.lock`).
- [x] 3.2 Run `bun run typecheck` — no errors.
- [x] 3.3 Run `bun test` — the schema-invariant suite passes.

## 4. Documentation

- [x] 4.1 `CLAUDE.md` — Repository layout: devcontainer line → Bun + Postgres 16;
  package.json line → Bun-managed; add `docker-compose.yml`.
- [x] 4.2 `CLAUDE.md` — Conventions: replace the pnpm/corepack paragraph with Bun
  (`bun install` / `bun test`, `tsc` still the type gate); add a PostgreSQL + `Bun.sql`
  + `DATABASE_URL` convention.
- [x] 4.3 `CLAUDE.md` — Current state: test run command → `bun test`; Roadmap item 3:
  engine persists on PostgreSQL via `Bun.sql`.
- [x] 4.4 `openspec/config.yaml`: update the `context:` Stack line from pnpm/vitest/Node
  to Bun.
