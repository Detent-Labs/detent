## Context

Three workers poll a batch and loop over it:

- `drainResolutions` (resolution.ts) claims up to 100 `pending`/lease-expired instances `FOR UPDATE SKIP
  LOCKED`, then per row: `parseInstance` (l.78), `resolveBody` (l.79), and — inside a try (l.84) —
  `resolveAutomatic`; the catch requeues the row to `pending`.
- `drainTimers` (timers.ts) selects up to 100 running instances with `next_timer_at <= now()` `ORDER BY
  next_timer_at`, then per row: `parseInstance` (l.37), `resolveBody` (l.38), due-timer selection, and —
  inside a try (l.44) — `fireTimer`.
- `drainOutbox` (outbox.ts) claims up to 100 due rows, then per row: `parseAction` (l.138), a try around
  the handler run (l.145-149), then the tx2 mark transaction `db.begin(...)` (l.153-197) that CASes the
  row delivered/dead-letter/pending, applies the writeback, and appends the `ActionOutcome`.

In all three, at least one statement that can throw for a single bad row sits **outside** the per-row
try, so it propagates out of the pass. The batch is then abandoned: claimed rows stay claimed and wait a
full lease (30s) before any other worker retries them.

## Goals / Non-Goals

**Goals:**
- One poison row (unparseable body, resolver throw, transient tx2 error, corrupt action) is isolated to
  itself; every other row in the same batch is still processed.
- No happy-path behavior change; the isolation is purely on the failure path.
- Each of the three workers carries a spec requirement stating the guarantee, with a rejecting test.

**Non-Goals:**
- Self-healing a stale `next_timer_at` (see Decisions — not cleanly reproducible).
- Clearing the inert faulted `resolve_state` flag, or the unrelated Minor findings.
- Any change to claim/lease/backoff/idempotency mechanics — only where the try boundary sits.

## Decisions

**Move the throwing statements inside the existing per-row boundary; keep the existing recovery.** Each
worker already has the right recovery for a failed row — resolution requeues to `pending`, timers leaves
`next_timer_at` due, outbox leaves the row `claimed` for lease reclaim. The only change is widening the
try so a parse/resolve/tx2 failure lands in that recovery instead of unwinding the loop.

- *resolution.ts*: `parseInstance` and `resolveBody` move inside the try; the catch's `requeue(row.instance_id)`
  already handles it (requeue keys on `row.instance_id`, available without parsing).
- *timers.ts*: the try widens to cover `parseInstance` + `resolveBody` + due-timer selection. The `if
  (!body) continue` / `if (!dueTimer) continue` early-outs stay inside it (a `continue` in a try is fine).
  A thrown row is caught and skipped; `next_timer_at` stays due, exactly as the current lost-OCC-race
  comment already documents for `fireTimer` failures.
- *outbox.ts*: `parseAction` + the tx2 `db.begin(...)` are wrapped in a try/catch. On an unexpected throw
  the row is left `claimed` (tx1's claim already committed) and reclaimed after its lease — the same
  outcome the loop already relies on for a crashed worker. The catch must not itself mark the row, to
  avoid a second write racing the aborted tx2.

**Why not a shared helper?** Three loops with three different recovery actions and three different claim
models. A `forEachIsolated` abstraction would have to thread all three; inlining one try each is the
smaller, clearer diff. (ponytail: extract only if a fourth worker appears.)

**Testing the outbox tx2 boundary.** `drainOutbox` takes an injected `DeliverFn`. A poison is produced by
returning a patch whose fieldId breaks the tx2 jsonb path literal (`{data,<fid>}::text[]` with a `fid`
containing `}` → malformed array literal → Postgres throws inside tx2), deterministically, while a good
row's handler returns `{}`. Assert the good row reaches `delivered` and the poison row stays `claimed`.

## Risks / Trade-offs

- [A poison row is re-fetched every pass (1 of 100 slots) forever] → Acceptable: an unparseable body or
  corrupt action is a genuine operational corruption, not a transient. Isolation prevents starvation; it
  does not (and should not silently) repair corruption. The row remains visible via its stuck state.
- [Widening the outbox try could swallow a bug that should surface] → The catch is per-row and leaves the
  row claimed (not delivered/dead-lettered), so a real defect still manifests as a stuck row and a lease
  churn, not a silent success.

## Migration Plan

Pure code change to the failure path; no schema, no data, no stored-definition migration. Rollback is
reverting the try boundaries.

## Open Questions

- **Stale `next_timer_at` self-heal (deferred).** `minFireAt` filters to unfired timers and
  `next_timer_at` is recomputed on every commit and every fire, so a due-but-unfireable `next_timer_at`
  is not cleanly reproducible; the corrupt-body head-of-scan case is covered by the timers fix here.
  Left to a separate change if it ever proves reachable.
- **Inert faulted `resolve_state='pending'` (deferred).** The resolution claim gates on `status='running'`,
  so a faulted instance is never claimed — the flag is inert, not starvation. Different root; out of scope.
