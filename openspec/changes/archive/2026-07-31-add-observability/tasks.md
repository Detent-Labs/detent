## 1. Structured logging module

- [x] 1.1 Create `src/log.ts`: `log.info`/`log.warn`/`log.error`, each
      emitting one JSON line `{ts, level, msg, ...context}`; `error`
      writes via `console.error`, `info`/`warn` via `console.log`.
- [x] 1.2 Read `LOG_LEVEL` once at module load (`debug` < `info` < `warn`
      < `error`, default `info`); gate emission by threshold.
- [x] 1.3 Write `test/log.test.ts`: spy on `console.log`/`console.error`,
      assert JSON shape per level, assert `LOG_LEVEL` gating at each
      threshold.

## 2. Call-site migration

- [x] 2.1 Convert `src/http/errors.ts::mapError`'s unmapped-exception
      log to `log.error("unhandled error", {name, message})`.
- [x] 2.2 Convert `src/http/server.ts::startHttpServer`'s startup banner
      to `log.info`.
- [x] 2.3 Convert `src/http/server.ts::resolveAuthResolver`'s
      dev-resolver warning to `log.warn`.

## 3. New operational log sites

- [x] 3.1 Add `log.error("outbox row dead-lettered", {instanceId,
      actionId, actionType, attempts, lastError})` at
      `src/engine/outbox.ts::drainOutbox`'s dead-letter branch.
- [x] 3.2 Add `log.error("instance faulted", {instanceId, stepId,
      reason: "automatic-cascade-loop"})` at
      `src/engine/transition.ts::markFaulted`.
- [x] 3.3 Add `log.warn("instance migration skipped", {instanceId:
      inst.instanceId, fromVersion, toVersion, reason})` at
      `src/engine/migration.ts::appendSkip`, the site that records a
      `migration.skipped` `InstanceEvent`. `instanceId` is the event's
      top-level field; `fromVersion`/`toVersion`/`reason` are its
      payload — both are already in scope at this call site.

## 4. Metrics queries

- [x] 4.1 Add `getTimerLagStats(db)` to `src/engine/admin-queries.ts`:
      one query over `running` instances with `next_timer_at IS NOT
      NULL`, mirroring `listPendingTimers`'s existing `(body->>'status')
      = 'running' AND next_timer_at IS NOT NULL` filter so the query
      stays backed by `instances_timer_idx`. Return
      `{overdueCount, maxLagSeconds}`; wrap the lag expression in
      `COALESCE(..., 0)` so an empty `FILTER` (nothing overdue) reports
      `0`, not SQL `NULL`.
- [x] 4.2 Add `countInstancesByStatus(db)` to
      `src/engine/admin-queries.ts`: `SELECT body->>'status' AS status,
      count(*)::int AS n FROM instances GROUP BY body->>'status'`,
      mirroring `countOutboxByStatus`'s shape.
- [x] 4.3 Add test cases for both functions alongside
      `countOutboxByStatus`'s existing coverage.

## 5. Metrics endpoint

- [x] 5.1 Create `src/http/metrics.ts`: `handleMetrics(db: SQL =
      sql): Promise<HttpBinaryResult>`, never throws. `HttpResult`
      cannot carry this response: `server.ts`'s `toResponse` always
      `JSON.stringify`s the body and sets `Content-Type:
      application/json` (`server.ts:93-97`), which would corrupt
      Prometheus text-exposition format. Reuse `HttpBinaryResult`
      (`errors.ts:53`, already used by attachment download): `data` is
      the exposition text via `TextEncoder`, `contentType` is
      `"text/plain; version=0.0.4; charset=utf-8"`. Wrap the three
      queries in `try`/`catch`; a failure reports 503 with an empty
      body, not a crash or a false all-zero 200.
- [x] 5.2 Emit `workflow_outbox_backlog{status="..."}` lines from
      `countOutboxByStatus`, one line per present status.
- [x] 5.3 Emit `workflow_timer_overdue_count` and
      `workflow_timer_lag_seconds` from `getTimerLagStats`.
- [x] 5.4 Emit `workflow_instances_faulted` from
      `countInstancesByStatus`'s `faulted` key.
- [x] 5.5 Register `GET /metrics` in `server.ts`'s unauthenticated route
      block alongside `/livez`/`/readyz`, dispatching through
      `toBinaryResponse(result, undefined, null)` (mirroring
      `isBinaryResult`'s branch on the attachment-download route,
      `server.ts:391`), not `toRes`. No `OPTIONS`/CORS branch, matching
      `/livez`/`/readyz`.
- [x] 5.6 Write `test/metrics.test.ts`: unconditional format/shape
      assertions; `test.skipIf(!DB)` value-correctness assertions that
      seed a dead-letter row, an overdue timer, and a faulted instance,
      then check the reported numbers.

## 6. Documentation

- [x] 6.1 Add an "Observability" entry to `docs/current-state.md`.
- [x] 6.2 Flip `ROADMAP.md` stage 15 from NOT STARTED to DONE, naming
      this change.
- [x] 6.3 Add `GET /metrics` to `docs/openapi.yaml`, alongside
      `/livez`/`/readyz` in the unauthenticated-exception list
      (currently at line 17) and as its own path entry, matching
      `/readyz`'s existing shape.

## 7. Verification

- [x] 7.1 Run `bun run typecheck` inside the devcontainer; zero errors.
- [x] 7.2 Run the full `bun test` suite inside the devcontainer with
      `DATABASE_URL` set; confirm the reported skip count matches the
      known baseline (no DB-backed suite silently skipped) and zero
      failures. A single-file rerun is not a substitute; read the
      verdict off the full run.

## 8. Verify-pass follow-up

`/opsx:verify` found a gap in three of the spec's scenarios: dead-lettered
outbox row, faulted instance, skipped migration. Each had a test for the
state change it accompanies, but none for the log line's own content.

- [x] 8.1 `test/outbox.test.ts`'s dead-letter test: spy on
      `console.error`, assert the three `"outbox row dead-lettered"`
      JSON lines (one per action) carry `instanceId`, `actionType`,
      `attempts`, `lastError`.
- [x] 8.2 `test/automatic.test.ts`'s cascade-loop test: spy on
      `console.error`, assert the `"instance faulted"` JSON line
      carries `instanceId`, `stepId`, `reason`.
- [x] 8.3 `test/migration.test.ts`'s "6.4" skipped-instance test: spy on
      `console.log`, assert the `"instance migration skipped"` JSON
      line carries `instanceId`, `fromVersion`, `toVersion`, `reason`.
- [x] 8.4 Re-run `bun run typecheck` and the full `bun test` suite
      inside the devcontainer with `DATABASE_URL` set; confirm zero
      failures.
