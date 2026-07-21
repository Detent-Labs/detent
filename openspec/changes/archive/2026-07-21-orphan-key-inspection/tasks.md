## 1. migration.ts

- [x] 1.1 Add `OrphanKeyEntry` and `OrphanKeyScan` types near `MigrationResult`.
- [x] 1.2 Add `findOrphanKeys(processId, version, db = sql, resolvers = createDefinitionStore(db)):
  Promise<OrphanKeyScan>` (mirrors `migrateInstances`' signature shape, not the
  workers' bare-`resolveBody` default): resolve the body via `resolvers.resolveBody`
  (throw `MigrationPlanError` on a miss, matching `registerMigrationPlan`/
  `migrateInstances`), build the valid-id set via `fieldTypeById(body.fields).keys()`,
  then keyset-paginate `instances` filtered to `body->>'processId' = processId AND
  (body->>'version')::int = version` (no status filter), `ORDER BY instance_id LIMIT
  BATCH`, advancing `last` per row.
- [x] 1.3 Per row inside the loop: parse in a try/catch; on failure push to
  `unreadable` and continue; on success, compute `Object.keys(data).filter(k =>
  !validIds.has(k))` and push an `OrphanKeyEntry` to `orphans` only if non-empty.
- [x] 1.4 Export `findOrphanKeys`, `OrphanKeyEntry`, `OrphanKeyScan`.

## 2. Specs

- [x] 2.1 Sync `specs/orphan-key-inspection/spec.md`'s ADDED requirements into
  `openspec/specs/orphan-key-inspection/spec.md` (new capability file).

## 3. Tests

- [x] 3.1 `test/migration.test.ts` (or a new file): migrate an instance so a field
  drops from the catalog (mirrors the existing 6.7 "orphan retention" setup), then
  assert `findOrphanKeys` reports that instance id and key. (Implemented directly
  against a seeded instance rather than via a live migration — the scan only cares
  about the current pin vs. `data`, and retention-via-migration is already covered
  by 6.7; also covers the group-id scenario in the same test, 7.1.)
- [x] 3.2 Assert an instance whose `data` keys all match the catalog is absent from
  `orphans`. (7.2)
- [x] 3.3 Assert a terminal (non-running) instance pinned to the scanned version with
  an orphan key is still reported. (7.3)
- [x] 3.4 Seed one row with an unparseable `body` among readable pinned instances;
  assert it lands in `unreadable` and the readable ones still resolve correctly. (7.4)
- [x] 3.5 Assert calling with an unpublished `{processId, version}` throws
  `MigrationPlanError` and scans nothing. (7.5)

## 4. Verify

- [x] 4.1 `bun run typecheck` passes.
- [x] 4.2 `bun test` with `DATABASE_URL` set passes (full suite, not skipped): 404
  pass, 0 fail (was 399 before this change's 5 new tests).
