# Proposal

## Why

Two one-off scripts fill relations for data older than their features. The
first is `scripts/backfill-instance-principals.ts`. It derives principal
sets for instances older than `instance_principals`. The second is
`scripts/backfill-process-access-roles.ts`. It seeds Developer lists for
processes older than `process_access_roles`.

The engine has written both relations from the start of each record for a
while now. The demo at `detent.org` started fresh on 2026-10-29 and reseeds
every night. No other installation exists. No database older than either
feature remains. Both scripts, one test and two runbook sections describe work
nobody can run.

## What Changes

- Delete `scripts/backfill-instance-principals.ts` and
  `scripts/backfill-process-access-roles.ts`.
- Delete `test/backfill-process-access-roles.test.ts`, which holds two tests.
- Delete the `backfill-process-access-roles` entry from `package.json`.
- Delete the runbook sections "The instance-visibility backfill" and "The
  process-access-roles rollout migration" from `docs/runbooks/deployment.md`.
- Lower the pass floor in `scripts/gates/pass-floor.txt` by 2, with a note.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

<!-- antislop: allow passive-voice -->
<!-- The quoted text is the live requirement's heading, which the delta must name verbatim. -->
- `instance-visibility-set`: removes "Existing instances are backfilled once".
  "The direct read consults the set" drops the case of an instance the
  backfill never reached.
- `process-access-roles`: removes "A rollout migration seeds every existing
  process's Developer list".

## Impact

- The three deleted files, `docs/runbooks/deployment.md`, `package.json` and
  `scripts/gates/pass-floor.txt`.
- No engine, HTTP or definition contract behavior changes.
