## Why

Migrating a parked subprocess parent off its wait-state silently corrupts or orphans its child.
`migrateOne` unconditionally repoints every linked child's `parent.stepId` to the new step whenever
the parent's step changes, with no check on whether that child is still live. Relocating a subprocess
step onto another subprocess step lets the old child's return wrongly drive the parent off the new step
(applying the new step's `outputMapping` to the wrong child, orphaning the genuinely-spawned new child);
relocating onto a non-subprocess step makes the old child's return dead-letter (`return: not a subprocess
step`), orphaning the child forever. No spec requirement governs this repair, and no plan validation
constrains it.

## What Changes

- Remove the unconditional child-link repoint in `migrateOne` (`src/engine/migration.ts`).
- Add a **live-child gate**: before committing a relocation that vacates a subprocess-typed step,
  skip the instance this invocation if that step has a live linked child (child `status = 'running'`,
  OR the child has any undelivered outbox row — a terminal child whose return is still in flight).
  The skip is transient: the instance retries and migrates on a later invocation once the child settles.
- Add a third `MigrationSkipReason` value, `child-in-flight`, and extend its doc-comment to distinguish
  three causes (two transient, one rule-property).
- When the vacated step has no live child (none ever linked, or the child is terminal AND fully
  delivered — including the parked-forever `outcome-unmatched` case), migrate normally and do **not**
  repoint the link. A settled child's stale `parent.stepId` is provably inert: the only other reader,
  `cancelInstance`'s cascade sweep, keys on `parent.instanceId` + `status = 'running'`, never on
  `parent.stepId`.
- Rewrite the four `test/migration.test.ts` tests that currently assert the buggy repoint as correct,
  and add coverage for the settled-child pass-through and the retry-once-settled path.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `instance-migration`: a new requirement gating relocation of a subprocess parent with a live child
  (transient skip), and an extension of the skip-reason requirement from two causes to three.

## Impact

- `src/engine/migration.ts` — `migrateOne`: remove the repoint block; add the live-child gate before commit.
- `src/schema/definition.ts` — `migrationSkipReason` enum gains `child-in-flight`; doc-comment updated.
- `openspec/specs/instance-migration/spec.md` — new requirement + scenarios; skip-reason requirement extended.
- `test/migration.test.ts` — four tests rewritten, new settled-child and retry-once-settled scenarios added.
- No schema-contract wire change beyond the additive enum value; no migration of stored definitions.
