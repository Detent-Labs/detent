<!-- antislop: allow-file sentence-length run-ons passive-voice -->
<!-- This design carries forward the approved
     docs/superpowers/specs/2026-07-30-observability-design.md, written in
     this repo's established dense-technical-prose convention (see every
     other design.md under openspec/changes/archive/). Per the
     antislop-targeted-allow-not-file-all memory, a document written end to
     end in that house style may use a named, non-"all" allow-file. -->

## Context

Roadmap #15. No structured logging convention exists today: the codebase
has only a handful of scattered `console.log`/`console.error` calls
(`src/http/errors.ts::mapError`, `src/http/server.ts::startHttpServer`
and `resolveAuthResolver`, and `src/auth/cli.ts`). No metrics endpoint
exists either. See `proposal.md` for the motivation.

This design follows the precedent Roadmap #14a (health/readiness
endpoints) set: a small framework-agnostic module under `src/http/`, no
new package, no new dependency.

## Goals / Non-Goals

**Goals:**
- A dependency-free structured-logging module usable from any part of the
  engine, gated by a process-wide level threshold.
- A `GET /metrics` endpoint exposing the three signals an operator today
  can only find by hand: outbox backlog, timer lag, and faulted-instance
  count.

**Non-Goals:**
- **Distributed tracing.** Needs span propagation through the outbox
  worker and subprocess spawns. No current pain point calls for it.
- **Generic HTTP request metrics** (count/latency/status by route). A
  separate concern from the engine-health signals the roadmap names; it
  also needs route-label cardinality control this design does not cover.
- **A metrics library (prom-client) or a logging library (pino).** The
  Prometheus text format and the logging shape are both simple enough to
  hand-roll, matching the repo's existing no-dependency-for-a-few-lines
  convention (`src/handlers/http.ts`, the health-endpoints design).
- **Authentication on `/metrics`.** Stays unauthenticated, matching
  `/livez` and `/readyz`: a Prometheus scraper carries no JWT, and the
  expected control is a network-level firewall around the scraping
  network, not app-layer auth.
- **Per-module or per-request log-level configuration.** One
  process-wide `LOG_LEVEL` threshold is the whole mechanism.
- **Converting `src/auth/cli.ts`'s console output.** That tool runs
  interactively at a terminal, not as a long-running server process.
  JSON log lines would hurt its usability for no operator benefit.
- **In-process metric aggregation** (counters, histograms held in
  memory). Every value comes fresh from the database on each scrape, the
  same principle `/readyz`'s DB ping already uses, keeping `/metrics`
  stateless and correct across multiple independently scraped server
  instances.

## Decisions

### Structured logging: `src/log.ts`

A tiny wrapper, no dependency:

```
log.info(msg: string, context?: Record<string, unknown>): void
log.warn(msg: string, context?: Record<string, unknown>): void
log.error(msg: string, context?: Record<string, unknown>): void
```

Each call emits one JSON line: `{ts, level, msg, ...context}`. `ts` is
`new Date().toISOString()`. `error` writes through `console.error`
(stderr); `info` and `warn` write through `console.log` (stdout).
Container log collectors (Docker, k8s, journald) capture both streams
regardless, so this split serves local terminal legibility, not
correctness.

A module-level `LOG_LEVEL` env var gates emission: `debug` < `info` <
`warn` < `error`, default `info`. The module reads it once at load, the
same pattern `src/auth/` uses for `AUTH_JWT_SECRET`/`AUTH_ISSUERS`. This
change adds no `debug` call site; the level exists so a future one has
somewhere to go, without a second design.

**Alternative considered:** a logging library (pino). Rejected: the
shape needed (one JSON line, a level threshold) is a few lines, and the
repo's convention is no dependency for that.

### Call-site migration

Convert to `log.*`:
- `src/http/errors.ts::mapError`: `log.error("unhandled error",
  {name, message})`.
- `src/http/server.ts::startHttpServer`: the startup banner becomes
  `log.info`.
- `src/http/server.ts::resolveAuthResolver`: the dev-resolver warning
  becomes `log.warn`.

New call sites, at points an operator today has to find by hand in the
admin UI:
- `src/engine/outbox.ts::drainOutbox`, the dead-letter branch:
  `log.error("outbox row dead-lettered", {instanceId, actionId,
  actionType, attempts, lastError})`.
- `src/engine/transition.ts::markFaulted`: `log.error("instance
  faulted", {instanceId, stepId: repeatedStepId, reason:
  "automatic-cascade-loop"})`.
- `src/engine/migration.ts::appendSkip`, the site that records a
  `migration.skipped` `InstanceEvent`: `log.warn("instance migration
  skipped", {instanceId: inst.instanceId, fromVersion, toVersion,
  reason})`. `instanceId` sits on the event's top level, not its
  payload (`{fromVersion, toVersion, reason}`); both are already in
  scope at the call site, so the log line carries all four rather than
  only `reason`.

Each call sits next to the existing `InstanceEvent`/outcome write it
mirrors: same trigger, same data, streamed to stdout as the event
happens.

`src/auth/cli.ts` stays untouched (see Non-Goals).

### Metrics: `GET /metrics`, `src/http/metrics.ts`

Prometheus text-exposition format (`Content-Type: text/plain;
version=0.0.4; charset=utf-8`). `handleMetrics(db: SQL = sql):
Promise<HttpBinaryResult>`. It never throws: the three queries run
inside a `try`/`catch`. A failure reports 503 with an empty body rather
than a crash or, worse, a false all-zero 200 that would read as
"healthy, nothing overdue": the same signal `/readyz` already gives a
failed DB ping.

**Correction from the approved 2026-07-30 design, found during
proposal review by checking `src/http/server.ts` and `errors.ts`
directly:** the original sketch had `handleMetrics` return `HttpResult`
like `src/http/health.ts`'s handlers. `HttpResult` cannot carry
Prometheus text: `server.ts`'s `toResponse` unconditionally
`JSON.stringify`s `HttpResult.body` and sets `Content-Type:
application/json` (`server.ts:93-97`), which would quote-wrap the
exposition text and mislabel its content type. The repo already solved
this exact problem for attachment download:
`HttpBinaryResult { status, contentType, data: Uint8Array }` plus
`isBinaryResult()`/`toBinaryResponse()` (`errors.ts:53`,
`server.ts:100-109`, `add-instance-attachments`). `handleMetrics`
reuses that type: `data` is the exposition text encoded with
`TextEncoder`, `contentType` is `"text/plain; version=0.0.4;
charset=utf-8"`.

Three gauges, computed fresh on every scrape:
- `workflow_outbox_backlog{status="pending|claimed|dead-letter"} <n>`.
  One line per status present, reusing `countOutboxByStatus`
  (`src/engine/admin-queries.ts`) unchanged. A status with zero rows
  stays absent, matching that function's existing contract.
- `workflow_timer_overdue_count <n>` and `workflow_timer_lag_seconds
  <n>` (the max lag among overdue timers). A new `admin-queries.ts`
  query, `getTimerLagStats(db)`, returns `{overdueCount, maxLagSeconds}`
  from one statement over `running` instances with `next_timer_at IS
  NOT NULL`, mirroring `listPendingTimers`'s existing `(body->>'status')
  = 'running' AND next_timer_at IS NOT NULL` filter (`admin-queries.ts`)
  so both queries stay index-backed by `instances_timer_idx`. The count
  comes from `count(*) FILTER (WHERE next_timer_at < now())`; the lag
  comes from `EXTRACT(EPOCH FROM (now() - min(next_timer_at) FILTER
  (WHERE next_timer_at < now())))`, wrapped in `COALESCE(..., 0)` since
  an empty `FILTER` aggregates to SQL `NULL`, not `0`, when nothing is
  overdue.
- `workflow_instances_faulted <n>`. A new query, `countInstancesByStatus
  (db)`, mirrors `countOutboxByStatus`'s shape: `SELECT body->>'status'
  AS status, count(*)::int AS n FROM instances GROUP BY
  body->>'status'`. This is a general shape, not a single-purpose
  faulted-only query, so a future metric can reuse it for another
  status's count. `/metrics` reads only the `faulted` key.

`server.ts` registers `GET /metrics` in the same unauthenticated block
as `/livez`/`/readyz`, ahead of every auth-dependent route, dispatching
through `toBinaryResponse` (not `toRes`) the same way the attachment
download route already branches on `isBinaryResult`. Neither `/livez`
nor `/readyz` resolves an actor, and neither gets an `OPTIONS`/CORS
branch: an orchestrator or scraper is not a browser request, matching
the existing convention. `/metrics` follows the same convention,
calling `toBinaryResponse(result, undefined, null)` exactly as
`/livez`/`/readyz` call `toResponse(result, undefined, null)`.

`docs/openapi.yaml` documents `/livez` and `/readyz` as unauthenticated
exceptions to its otherwise-customer-facing scope (its own `info.
description`, and the 401 list at line 17). `/metrics` is the same
shape: an unauthenticated, non-`admin/*` route outside the customer
integration surface the document otherwise covers. It gets the same
treatment: named in the 401-exception list, with its own path entry.

**Alternative considered:** in-process counters incremented at each
event site, exposed by reading the accumulator. Rejected per Non-Goals:
a counter resets on process restart and lies about the true backlog: a
fresh-per-scrape database read is the same principle `/readyz` already
uses, and it stays correct with more than one server instance scraped
independently.

## Risks / Trade-offs

- **Unauthenticated `/metrics` exposes operational counts** (backlog
  size, faulted count) to anyone who can reach the port. -> Same trust
  boundary `/readyz` already accepts; mitigation is a network-level
  firewall around the scraping network, documented as a deployment
  concern, not solved in code.
- **A fresh-per-scrape database query adds load** proportional to
  scrape frequency. -> `workflow_outbox_backlog` and the two timer
  gauges stay index-backed (`outbox_claim_idx` covers `outbox.status`;
  `instances_timer_idx` covers `next_timer_at`), matching `/readyz`'s
  existing single-query-per-check budget. `workflow_instances_faulted`
  is the exception: `countInstancesByStatus`'s `GROUP BY
  body->>'status'` has no matching functional index (`instances_
  selection_idx` is a composite on `(processId, version, status)`,
  which a bare `GROUP BY status` cannot use), so it is a full scan of
  `instances` on every scrape. Data retention (Roadmap #20) is opt-in,
  so nothing bounds that table's growth by default. Acceptable at
  today's scale, the same call `instances_selection_idx`'s own
  migration-population scan already made before an index existed for
  it; if scrape load becomes measurable, add a functional index on
  `(body->>'status')` rather than changing the query shape.

## Migration Plan

Purely additive: a new module, a new route, new log lines at existing
call sites. No schema change, no config required to opt in (the
endpoint and the logger are always active; `LOG_LEVEL` only tunes
verbosity). No rollback concern beyond reverting the commit.

## Open Questions

None. The approved design already resolved every scope question during
brainstorming (see Non-Goals).
