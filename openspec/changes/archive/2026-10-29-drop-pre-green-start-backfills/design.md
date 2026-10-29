# Design

## Context

See proposal.md. `createInstance` in `src/engine/store.ts` appends the
starter and the initial candidates to `instance_principals` in the creating
transaction. Every step entry, claim, delegation and spawn appends too. The
first publish of a process adds its developer to `process_access_roles`.

The live specs still demand the two migrations.
<!-- antislop: allow passive-voice -->
<!-- The quoted text is the live requirement's heading, which the delta must name verbatim. -->
"Existing instances are backfilled once" sits in `instance-visibility-set`.
"A rollout migration seeds every existing process's Developer list" sits in
`process-access-roles`.
"The direct read consults the set" also names an instance the backfill never
reached as a case outside its guarantee.

The pass floor in `scripts/gates/pass-floor.txt` is 5201. A full run passes
about 6400 tests. The project rules ask a change that deletes tests on purpose
to lower the floor in the same commit.

## Goals / Non-Goals

**Goals:**

- No script, test, runbook section or spec requirement for data nobody holds.

**Non-Goals:**

- Changing how the engine writes `instance_principals` or
  `process_access_roles`.
- Removing any other script under `scripts/`.

## Decisions

### D1. Remove the requirements, keep the history

The two requirements go as REMOVED, each with a reason and a migration note.
The scripts stay reachable in the git history. That is the recovery path if an
old database ever turns up.

### D2. The direct read loses one exception

"The direct read consults the set" lists three cases outside the agreement
between the list and the direct read. The third is an instance the backfill
never reached. Creation records the starter, so that case needs a database
older than the feature. The delta drops the case and says "Two cases". It also
rewords three scenario lines, which now say "has no claim".

### D3. The pass floor drops by the deleted tests

The floor drops from 5201 to 5199, with a note line above the integer naming
the two deleted tests. That keeps the floor's own rule.

## Risks / Trade-offs

- [An old database turns up after all] → The scripts sit in the git history.
  Restoring one is a revert of one file.

## Migration Plan

1. Implement and verify on `drop-pre-green-start-backfills`, sync, archive.
2. Push, open a PR, merge on the owner's go.
3. Rollback: revert the merge.

## Open Questions

None.
