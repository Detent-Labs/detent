## Why

Migration deliberately retains a `data` key whose field the target catalog no longer
declares — dropping it would destroy data (`instance-migration` spec, "A field the
target no longer declares is retained"). That's the correct default, but nothing
today lets an operator find out how many such orphan keys have accumulated, on which
instances, or under which key ids — so they cannot be reviewed or pruned. This closes
the last item in the `orphan-key inspection tooling` line of `NEXT_STEPS.md`.

## What Changes

- A new read-only, on-demand scan: given a `processId` + published `version`, list
  every instance pinned to that version whose `data` holds a key not declared by that
  version's field catalog (leaf fields only — a `group` field is a UI container, never
  a data key). No instance status filter: a terminal instance's data is a permanent
  record and can carry orphans same as a running one.
- Follows the existing `migrateInstances` shape deliberately: keyset-paginated over
  the `instances` table, ids grouped for operator action rather than a bare count.
- Per-row fault isolation, matching the `isolate-worker-poison-rows` convention: a
  row whose body fails to parse is reported separately (`unreadable`) instead of
  aborting the scan.
- Read-only. No pruning, no data mutation, no new instance state, no schema change.
  Deciding how (or whether) to prune an orphan is deliberately left to the operator —
  the retention behavior itself doesn't change, only its visibility.

## Capabilities

### New Capabilities
- `orphan-key-inspection`: a read-only scan reporting, for a given process version,
  which running-or-terminal instances hold `data` keys absent from that version's
  field catalog, and which instance rows could not be read.

### Modified Capabilities
<!-- none: instance-migration's retention behavior is unchanged, only newly visible -->

## Impact

- `src/engine/migration.ts`: new exported function alongside `migrateInstances`,
  reusing the existing field-catalog flattening helper. No changes to `remapData` or
  migration behavior.
- `test/migration.test.ts` (or a new `test/orphan-keys.test.ts`): a scan test seeding
  a migrated instance with a retained orphan key, plus a poison-row isolation test.
- No API surface exists yet for this engine (headless, library-only) — this ships as
  a library function invoked from tests, matching every other engine capability today.
