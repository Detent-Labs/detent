## Why

Each of the three background workers processes a batch of rows in a loop, but a per-item failure is
raised outside the per-item error boundary — so one bad row throws out of the whole pass and starves
every other due row in that batch until its lease elapses. The migration operation already solved this
for its own loop ("Each instance SHALL be processed in its own transaction inside its own error
boundary ... so one unreadable row cannot starve the batch"); the three workers have the gap it closed.

## What Changes

- **resolution.ts** (`drainResolutions`): move `parseInstance(row.body)` and `resolveBody(...)` inside
  the per-instance try. A row whose body fails to parse or whose resolver throws is requeued
  (`resolve_state='pending'`) and the pass continues, instead of aborting and stalling every other
  claimed instance for its 30s lease.
- **timers.ts** (`drainTimers`): widen the per-row try to cover `parseInstance`, `resolveBody`, and
  due-timer selection. Because the scan is `ORDER BY next_timer_at`, a corrupt-body row with the
  earliest `next_timer_at` sits at the head of every 500ms pass and re-throws forever; isolating it
  lets the rest of the batch fire.
- **outbox.ts** (`drainOutbox`): wrap the per-row body (`parseAction` + the tx2 mark transaction) in a
  try/catch. A transient DB error in the tx2 CAS/writeback/`appendOutcome`, or a corrupt action row,
  currently aborts the pass; isolating it leaves that row `claimed` (reclaimed after its lease) and lets
  the loop continue.
- A fault-isolation requirement + scenario added to each of the three owning capabilities, mirroring
  the instance-migration wording.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `writeback-reresolution`: re-resolution isolates a poison instance per-row instead of aborting the pass.
- `timers`: the timer scan isolates a poison instance per-row instead of aborting the pass.
- `transactional-outbox`: outbox delivery isolates a poison row's mark/writeback instead of aborting the pass.

## Impact

- `src/engine/resolution.ts`, `src/engine/timers.ts`, `src/engine/outbox.ts` — per-row error boundaries.
- `openspec/specs/{writeback-reresolution,timers,transactional-outbox}/spec.md` — one new requirement each.
- `test/` — a poison-row-among-good-rows test per worker.
- No schema/contract change. No behavior change on the happy path; only the failure path is isolated.
- Explicitly **out of scope** (deferred, see design): the stale-`next_timer_at` self-heal, the inert
  faulted `resolve_state` flag, and the unrelated Minor findings.
