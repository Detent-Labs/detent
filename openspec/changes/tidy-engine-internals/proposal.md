# Proposal

## Why

The 2026-10-10 audit found four small engine defects. None affects a user today (B-9, B-15, B-16, C-12). The timer worker resolves an instance's body and never compares the body's hash with the instance's pin. Every server start scans the whole `outbox` table to backfill a column that no database lacks. Each fix is cheap now.

## What Changes

- **B-9:** `resolveBody` hashes each body it loads. It compares the result with the row's `definition_hash`, once per entry. A caller with an instance passes its pinned hash as an optional third argument. `resolveBody` refuses a body with another hash. The timer worker, the subprocess handlers and the cancel sweep pass that argument.
- **B-15:** `initSchema` drops its retrofits for databases that predate a column or an index. Every `ADD COLUMN IF NOT EXISTS` moves into its `CREATE TABLE`. Two data-fixing `UPDATE` statements go. So do five `DROP INDEX IF EXISTS` lines. **BREAKING:** a local database from before this change that lacks a column stays broken. The developer drops `pgdata` and seeds it again.
- **B-16:** the audit grants name the engine's role through Postgres's `quote_ident`. A `"` in the role name no longer breaks the statement.
- **C-12:** `resolveBody` keeps no draft snapshot in its cache. The cache then holds published bodies only. A Player run no longer adds an entry that lives until restart.

The owner ruled on 2026-10-12 that the `initSchema` start-up lock stays out of this change. It keeps its own entry in `docs/decisions.md`. The owner also ruled that B-15 deletes every retrofit, including the five `DROP INDEX` lines. The reporting half of B-15 (history read twice) belongs to `harden-reporting-export-and-queries`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `definition-store`: `resolveBody` checks the loaded body's hash and an optional caller pin. It keeps no draft snapshot in its cache.
- `persistence`: `initSchema` runs no retrofit. The redaction column, the six generated columns and the data list columns sit in their `CREATE TABLE`. The retired-index requirement goes. The audit grants quote the role name.
- `local-user-accounts`: the `auth_users` table has `manager_user_id`, `display_name` and `locale` from its `CREATE TABLE`.
- `manager-of-starter-assignment`: the `manager_user_id` column comes with the table.

## Impact

- `src/engine/definitions.ts` (`createDefinitionStore`), `src/engine/resolution.ts` (the `ResolveBody` type), `src/engine/transition.ts` (`ResolveBodyFn` and the cancel sweep), `src/engine/timers.ts` and `src/engine/subprocess.ts`.
- `src/engine/store.ts` (`initSchema` and `initInstanceAudit`).
- Specs: the four capabilities above.
- Tests: the nine fixtures that insert into `definitions` or `draft_snapshots`, the tests of the retired retrofits, and `scripts/gates/pass-floor.txt`.
- `docs/runbooks/deployment.md`, which tells operators to re-run the schema step after an upgrade that adds a column.
- `docs/decisions.md` loses this change's audit index entry.
- `docs/authoring-guide.md` stays as it is, because no authoring rule changes.
- No definition-contract change, no HTTP change, no dependency change.
