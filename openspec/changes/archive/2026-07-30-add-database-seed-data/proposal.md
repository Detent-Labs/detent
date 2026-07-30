<!-- antislop: allow-file em-dash -->
## Why

A fresh database starts empty, on devcontainer spin-up or in any new
environment. No example process, no demo user, no sample instance.
`CLAUDE.md` already documents the resulting pain. `bun test`'s `beforeEach`
truncates `definitions`, `instances`, and `auth_users` in the same Postgres
the dev server reads. A developer then re-creates demo state by hand after
every test run. An idempotent seed script replaces that manual step.

## What Changes

- Add `scripts/seed.ts`. It publishes the three `examples/*.json` process
  definitions, child-first for the subprocess pair. It provisions one demo
  user per reserved role (`system:publish`, `system:cancel-any`,
  `system:admin`, `system:developer`). It calls `src/auth/users.ts` and
  `src/engine/definitions.ts::publishBody` directly, not the CLI.
- Add a `"seed"` script to the root `package.json` (`bun run seed`),
  alongside the existing `"serve"` entry.
- Idempotency: re-running against an already-seeded database updates
  existing rows, or no-ops. It never duplicates a process or a user.
  `publishBody` scopes its hash dedup to a fixed `processId`. The script
  therefore looks up an existing process by `key` first, rather than
  minting a fresh id on every run. User provisioning looks up by email
  before it creates a row.

## Capabilities

### New Capabilities
- `database-seed-script`: an idempotent `bun run seed` script. It publishes
  the repo's example process definitions. It provisions one demo account
  per reserved role, against a fresh or an already-seeded database.

### Modified Capabilities
(none — this adds a new entry point over existing publish and user-management
behavior; no requirement of either changes)

## Impact

- New file: `scripts/seed.ts` (follows the existing `scripts/demo-expense-approval.ts`
  convention: plain `main()`, `initSchema()` first, relative `.js`-suffixed
  imports).
- `package.json`: one new `"seed"` script entry.
- No schema change, no HTTP route change, no change to any published
  capability's requirements.
