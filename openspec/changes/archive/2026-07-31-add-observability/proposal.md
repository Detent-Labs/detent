## Why

Roadmap #15. No structured logging convention exists today: only a
handful of scattered `console.log`/`console.error` calls. No metrics
endpoint exists either. An operator can see outbox backlog, timer
latency, and faulted-instance rate only by hand. The admin area's
Operations screens are the only way today (Roadmap #10).

The 2026-07-30 design
(`docs/superpowers/specs/2026-07-30-observability-design.md`) approved
this scope; this proposal carries it into implementation.

## What Changes

- Add `src/log.ts`: a dependency-free structured-logging module
  (`log.info`/`log.warn`/`log.error`), one JSON line per call
  (`{ts, level, msg, ...context}`), gated by a process-wide `LOG_LEVEL`
  env var (default `info`).
- Convert three existing `console.*` call sites to `log.*`:
  `src/http/errors.ts::mapError`, `src/http/server.ts::startHttpServer`,
  `src/http/server.ts::resolveAuthResolver`.
- Add three new `log.*` call sites at points an operator today has to
  find by hand. They sit at `src/engine/outbox.ts::drainOutbox`'s
  dead-letter branch, `src/engine/transition.ts::markFaulted`, and the
  `migration.skipped` event site in `src/engine/migration.ts`.
- Add `GET /metrics` (`src/http/metrics.ts`, `handleMetrics`): an
  unauthenticated Prometheus text-exposition endpoint computed fresh
  from the database on every scrape. It follows the same
  framework-agnostic handler pattern `src/http/health.ts` already set
  (Roadmap #14a). Three gauges: `workflow_outbox_backlog{status}`
  (reuses `countOutboxByStatus`), `workflow_timer_overdue_count` /
  `workflow_timer_lag_seconds` (new `getTimerLagStats` query), and
  `workflow_instances_faulted` (new `countInstancesByStatus` query,
  general-shaped, not faulted-only).
- Register `GET /metrics` in `server.ts`'s unauthenticated route block,
  alongside `/livez`/`/readyz`.

## Capabilities

### New Capabilities
- `observability`: structured logging convention (`src/log.ts`) plus
  the `GET /metrics` Prometheus-text endpoint exposing outbox backlog,
  timer overdue count/lag, and faulted-instance count.

### Modified Capabilities
(none. This adds a new capability, not a change to `http-wrapper`,
`transactional-outbox`, `instance-migration`, or
`transition-execution`'s documented requirements. Only their internal
logging changes.)

## Impact

- New files: `src/log.ts`, `src/http/metrics.ts`, `test/log.test.ts`,
  `test/metrics.test.ts`.
- Modified files: `src/http/errors.ts`, `src/http/server.ts`,
  `src/engine/outbox.ts`, `src/engine/transition.ts`,
  `src/engine/migration.ts`, `src/engine/admin-queries.ts` (two new
  query functions), `test/admin-queries.test.ts` (or wherever
  `countOutboxByStatus` is already covered), `docs/openapi.yaml`
  (documents `GET /metrics` alongside `/livez`/`/readyz`).
- No new dependency, no new package, no schema change.
- `docs/current-state.md` gains an "Observability" entry;
  `ROADMAP.md` stage 15 flips from NOT STARTED to DONE.
