<!-- antislop: allow-file passive-voice -->
<!-- The REMOVED block keeps the delta grammar the live specs use. -->

# Spec Delta

## REMOVED Requirements

### Requirement: A rollout migration seeds every existing process's Developer list

**Reason**: The migration seeded Developer lists for processes older than
`process_access_roles`. The demo started fresh on 2026-10-29. No other
installation exists, so no such process remains.

**Migration**: None. `scripts/backfill-process-access-roles.ts`, its test and
its runbook section go away. A database older than `process_access_roles`
would need the script from the repository history.
