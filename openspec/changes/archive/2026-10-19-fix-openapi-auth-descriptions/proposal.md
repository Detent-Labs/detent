# Proposal

## Why

The customer document `docs/openapi.yaml` lists the right routes, but its
parameter and authorization text lags the code. An integrator who trusts it
reads a 403 where the code answers 200, and misses two query values. The
2026-10-10 audit found this as H-1, H-2 and H-3.

## What Changes

- `GET /instances`: the `scope` enum gains `visible`, and a `kind`
  parameter appears. State that `scope=all` with a `processId` also admits a caller
  who holds `read` on that process.
- `POST /instances/{instanceId}/submit`: on a step with an assignment, only
  the claimant may submit. Without an assignment, the starter or
  `system:admin` may submit.
- `GET /instances/{instanceId}` and the comment and attachment routes: one
  short visibility statement per route, plus a pointer to the governing
  requirement in `openspec/specs/authorization`. The owner chose this form
  on 2026-10-19.
- `POST /processes` and `POST /instances/{instanceId}/cancel`: name the
  stored grant beside the role. The cancel entry also names the starter's
  cancellable-step condition.
- The `observability` tag no longer says "Unauthenticated".
- The document header says every instance route runs through the Runtime API
  Layer. It states the SaaS-mode 401 and 503 answers once, and names the
  three routes that never send them.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `http-api-documentation`: one added requirement. An authorization
  statement names every path that admits a caller, and the document states
  the SaaS-mode tenant answers.

## Impact

`docs/openapi.yaml`, the `http-api-documentation` spec, and the audit index
in `docs/decisions.md`. No code, API or
dependency changes. `test/openapi-exclusions.test.ts` already reads the
document and stays as it is: `widen-test-guards` covered G-10.
