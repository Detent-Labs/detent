## Why

`src/http/server.ts` states every route twice. The `OPTIONS` preflight
if-chain at lines 289-396 restates the method and the path shape of each
route. The handler chain at lines 399-598 states both again. The file holds
88 `req.method ===` comparisons across 690 lines.

The ponytail audit has reported this for five scans in a row. The file grew
at every one of them. The second copy already drifted. The four
`/reporting/*` routes have a handler branch and no preflight branch, so
`OPTIONS /reporting/processes` falls through to the 404. The `http-wrapper`
spec requires a preflight answer on every route except `GET /livez` and
`GET /readyz`, so that gap is a defect, not a decision.

## What Changes

- Replace both if-chains in `createServer` with one ordered
  `{ method, pattern, handler }[]` table that the dispatcher iterates.
- Derive the preflight answer from that table. Match the path, collect the
  methods the table holds for it, then answer `204` with those methods. The
  parallel preflight chain goes away.
- `OPTIONS` on the four `/reporting/*` routes starts answering `204`, which
  the `http-wrapper` spec already requires. No other route's status, body,
  header or authorization changes.
- Name `GET /metrics` beside `GET /livez` and `GET /readyz` in the spec's
  list of routes that answer no preflight. All three answer a probe, not a
  browser, and all three already bypass CORS in the code.
- Record the table-driven dispatch as a structural requirement, so the two
  parallel chains cannot grow back.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `http-route-handling-consolidation`: a new requirement that route dispatch
  reads one table. The preflight answer derives from that table rather than
  from a second hand-kept chain.
- `http-wrapper`: the preflight requirement's exclusion list gains
  `GET /metrics`, and a scenario covers the `/reporting/*` preflight the
  current code misses.

## Impact

- `src/http/server.ts`, `createServer` only. Route order, path shapes,
  handler arguments and the three probe routes stay as they are.
- `test/http.test.ts`, `test/http-admin.test.ts`, `test/http-studio.test.ts`,
  `test/auth-server.test.ts`, `test/health.test.ts`. The 35 existing
  `Access-Control-Allow-Methods` assertions are the regression net. They pin
  the exact header value, including its method order, so the table must emit
  the same strings.
- `docs/current-state.md`. One line there states that each route needs its
  own preflight entry. This change removes that rule.
- `openspec/specs/http-route-handling-consolidation/spec.md`. Its Purpose
  names two files, and the new requirement governs a third.
- No change to `routes.ts`, `admin-routes.ts`, `studio-routes.ts`,
  `reporting-routes.ts`, `health.ts` or `metrics.ts`.
