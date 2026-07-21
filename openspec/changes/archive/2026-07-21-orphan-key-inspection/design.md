## Context

`remapData` (`src/engine/migration.ts:217-234`) retains any `data` key not covered by
a migration plan's `fieldMap`/`transforms`, even if the target version's field catalog
no longer declares it — documented and tested (`instance-migration` spec, "A field the
target no longer declares is retained"; `test/migration.test.ts` 6.7). That's correct:
dropping would destroy data unrecoverably, and guard-context re-keying already skips
ids the target doesn't declare, so a retained orphan can't be observed or collide at
runtime. But there's no way today to find out how many have accumulated. This change
adds a read-only scan; it does not touch retention behavior.

No admin/introspection precedent exists anywhere in `src/engine` today (checked
`store.ts`, `migration.ts`, `definitions.ts`, `host.ts`) — every exported function
either mutates state or is a background worker. The closest shape to copy is
`migrateInstances` itself: a one-shot, keyset-paginated, `db`/`resolveBody`-injected
function returning ids grouped by outcome for an operator to act on
(`MigrationResult`).

## Goals / Non-Goals

**Goals:**
- Given `processId` + a published `version`, report every instance pinned to that
  version holding a `data` key absent from that version's field catalog, and which
  key ids are orphaned on it.
- Isolate a single unreadable instance row (corrupt/legacy body) from the rest of the
  scan, per the `isolate-worker-poison-rows` convention already applied to the three
  background drains.

**Non-Goals:**
- No pruning/deletion of orphan data. Whether and how to remove a value an operator
  no longer wants is a separate decision with its own risk (the value might still be
  read by a data-export or a future migration's `fieldMap`); this change only makes
  orphans visible.
- No new HTTP/CLI surface. The engine has none yet (headless, library-only); this
  ships as a library function invoked from tests, like every existing engine
  capability.
- No cross-version scan (a single call over every version of a process). An operator
  who wants that calls the function once per version — adding batching here before a
  real caller needs it is speculative.

## Decisions

**Location: `src/engine/migration.ts`, not a new file.** The orphan concept, its
safety argument, and the one existing helper that flattens the field catalog to leaf
ids (`fieldTypeById`, line 46) all already live here. A new module would still need to
import that helper (or duplicate the group-skipping walk); same-file avoids both.

**Reuse `fieldTypeById` for the valid-id set.** It already flattens `FieldDef[]`
depth-first, skips `group` containers, and keys by leaf `FieldId` — exactly "the set
of ids `Instance.data` can legitimately hold" that `remapData`'s orphan check needs.
Its `celType` values aren't needed here; only `.keys()`.

**Signature mirrors `migrateInstances` exactly, not the workers' bare-`resolveBody`
shape.** Two injection shapes coexist in this file: the background workers
(`drainTimers`/`drainResolutions`, in `timers.ts`/`resolution.ts`) take a bare
`resolveBody: ResolveBody = () => undefined` so an unwired worker is inert by
default; `migrateInstances` takes `resolvers: { resolveBody } = createDefinitionStore(db)`
so a one-shot admin call works against the real definitions table with no injection
at all. A scan is a one-shot admin call, not a background loop that must default to
harmless — so it takes the same shape:
`findOrphanKeys(processId: ProcessId, version: number, db: SQL = sql, resolvers: { resolveBody: ResolveBody } = createDefinitionStore(db)): Promise<OrphanKeyScan>`.

**A resolver miss throws, like `registerMigrationPlan`/`migrateInstances` do for an
unpublished version** (`MigrationPlanError`, reused rather than a new error class —
"version is not published" is the identical failure). This is a one-shot admin call
with a caller-supplied `processId`/`version`, not a background loop scanning whatever
happens to be due; an invalid version is caller error, not a transient miss to skip
past silently (the distinction the background workers correctly make the other way).

**No instance-status filter.** `migrateInstances` filters to `status = 'running'`
because only a running instance can be moved. A scan has no such constraint — a
terminal instance's `data` is a permanent record and can carry an orphan exactly like
a running one, so it stays in scope.

**Result shape:**
```ts
type OrphanKeyEntry = { instanceId: string; keys: string[] };
type OrphanKeyScan = { orphans: OrphanKeyEntry[]; unreadable: string[] };
```
Only instances with at least one orphan key appear in `orphans` (empty-result
instances are noise, not signal — mirrors `migrateInstances` never listing untouched
instances). `unreadable` holds ids whose row failed to parse, isolated per-row inside
the pagination loop exactly as `migrateInstances`, `drainTimers`, and
`drainResolutions` isolate a poison row from the rest of their batch.

**Pagination reuses the module's existing `BATCH = 100` constant and keyset-by-id
pattern** (`migrateInstances`, line ~451): `WHERE instance_id > $last AND
body->>'processId' = $processId AND (body->>'version')::int = $version ORDER BY
instance_id LIMIT $BATCH`, advancing `last` unconditionally per row (including
unreadable ones) so a poison row can't stall pagination.

## Risks / Trade-offs

- [A large accumulation of orphans across many instances makes one call return a big
  list] → out of scope for now: no caller exists yet to size against. If it becomes a
  real problem, cap/pagination can be added to the function's own return without a
  breaking signature change (an added optional cursor param).
- [Reusing `MigrationPlanError` for a non-migration failure is a slight naming
  mismatch] → accepted: the alternative is a new near-duplicate error class for one
  message; the existing name is generic enough ("plan/operation against an
  unresolvable version") and this stays inside `migration.ts`.
