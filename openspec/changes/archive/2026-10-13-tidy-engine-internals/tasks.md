# Tasks

## 1. Hash and pin check in resolveBody (B-9)

- [x] 1.1 Add `DefinitionHashMismatch`. Keep the verified hash in each `createDefinitionStore` cache entry. Check each loaded body against its row's `definition_hash` in `resolveBody`, `resolveLatest` and `resolveLatestByContract`. A new test edits a `definitions` row's body and expects a throw. Another test loads an unedited row and expects the body. Verify with the full gated suite.
- [x] 1.2 Add the optional `pinHash` argument to `ResolveBody` and `ResolveBodyFn`. Compare it with the stored hash on every call. A new test expects a throw for a pin that differs from the row. It covers a cache hit and a miss. Verify with the full gated suite.
- [x] 1.3 Pass `inst.definitionHash` as `pinHash` in the timer worker, the spawn, return and cancel-child handlers, and `sweepCancelledChildren`. One new test per path uses a row with a changed hash. The timer test expects the row to leave the scan. The handler tests expect a throw. Verify with the full gated suite.
- [x] 1.4 Check the nine tests that insert into `definitions` or `draft_snapshots` by hand. Fix any whose stored hash differs from its body's hash. Verify with the full gated suite.
- [x] 1.5 Pass `definitionHash` as `pinHash` in the `instance.transition` handler, the `process.start` handler and `redactInstance`. One new test per site uses a row restored with another body and hash. Verify with the full gated suite.

## 2. Draft snapshots stay out of the cache (C-12)

- [x] 2.1 Delete the cache write in the `version < 0` branch of `resolveBody`. A new test resolves a negative version, deletes its `draft_snapshots` row, and expects `undefined` on the next call. Another test expects a published version to stay cached after one read. Verify with the full gated suite.

## 3. Fold the retrofits into the CREATE TABLE statements (B-15)

- [x] 3.1 Move every `ADD COLUMN IF NOT EXISTS` into the `CREATE TABLE` of `outbox`, `instances`, `auth_users`, `data_lists` and `data_list_values`. Keep type, default and generation expression. Delete the `ALTER` statements. Verify with a search for `ADD COLUMN` over `src/` that prints nothing.
- [x] 3.2 Delete the `UPDATE outbox SET field_version` backfill and the `UPDATE instances SET resolve_state` cleanup. Delete the five `DROP INDEX IF EXISTS` lines and the comments that justify only them. Verify with a search for `DROP INDEX` over `src/` that prints nothing. The `automatic-transitions`, `persistence` and `admin-operations-api` deltas reword the live text that required them.
- [x] 3.3 Delete the tests that seed an old-shaped database to assert a repair. They sit in `test/migration.test.ts` around the three retired expression indexes and in `test/worker-scan-plans.test.ts` around `instances_resolve_idx` and `instances_redacted_idx`. Search `test/` for any other test of a column addition or a backfill.
- [x] 3.4 Add a test that two `initSchema` runs change no row. Add a test that `instances` without `redacted_at` and `auth_users` without its three optional columns stay as they are. Lower `scripts/gates/pass-floor.txt` by the number of deleted tests in the same commit. Verify with `sh scripts/test-gated.sh bun test` and compare the pass count with the new floor.
- [x] 3.5 Run the new `initSchema` on an empty database and on the lane's dev database. Confirm that the second run changes nothing. Verify by printing `\d outbox` and `\d instances` from both and comparing the column lists.

## 4. Quote the audit role (B-16)

- [x] 4.1 Capture `quote_ident(current_user)` in `initInstanceAudit`. Drop the literal quotes from the two `GRANT` strings. A new test makes a login role whose name has a `"`, runs `initSchema` as that role, and expects the grants. Verify with the full gated suite.

## 5. Docs and index

- [x] 5.1 Strike this change's entry in the audit index of `docs/decisions.md`. Verify with a search for `tidy-engine-internals` in that index that finds no live entry.
- [x] 5.2 Correct `docs/runbooks/deployment.md`, which says to re-run the schema step after an upgrade that adds a column. State that `initSchema` does not add a column to an existing table. State that an operator provisions the database again. Verify with the prose gate on the host.

## 6. Verification

- [x] 6.1 Run `bun run typecheck` in the devcontainer. Expect exit code 0.
- [x] 6.2 Run `bun run build` in the devcontainer. Expect exit code 0.
- [x] 6.3 Run the full `bun test` suite with `DATABASE_URL` set through `sh scripts/test-gated.sh bun test` and `OPENSPEC_TELEMETRY=0`. Read the pass, skip and fail counts.
- [x] 6.4 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` on the host. Read its exit code.
- [x] 6.5 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh` on the host. Read its exit code.

## Workflow follow-up

- This change has no UI part, so no browser check applies.
- Verify, sync the specs, archive, push, open the PR, and merge on green CI.
