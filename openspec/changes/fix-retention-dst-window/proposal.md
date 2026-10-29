# Proposal

## Why

The retention sweep computes its cutoff in SQL as
`now() - make_interval(days => N)`. The Postgres session runs in
`Europe/Zurich`, which `scripts/dev-pod.sh` sets. Day arithmetic on a
`timestamptz` keeps the local wall-clock time. A daylight-saving change
inside the window therefore moves the cutoff by one hour. After the autumn change the
sweep redacts an instance one hour late. After the spring change it redacts
one hour early.

The boundary test in `test/retention.test.ts` checks the window to the
minute. It fails on every run from 2026-10-25 to about 2026-11-24. It failed
on Dependabot PRs #90 and #94, and the next push to `main` fails the same way.

## What Changes

- The sweep counts a retention day as 24 hours of elapsed time. The engine
  computes the cutoff from its own clock, as an ISO-8601 UTC string. No
  database session time zone takes part.
- `sweepRetention` takes an optional current instant, which defaults to the
  engine clock. A test can then place a daylight-saving change inside the
  window on any calendar date.
- `retentionSelect` takes the computed cutoff instead of the day count.
- Two new tests pin the boundary across an autumn and a spring change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `data-retention`: adds "One retention day measures 24 hours of elapsed
  time", with a daylight-saving scenario.

## Impact

- `src/engine/retention.ts`, `test/retention.test.ts`,
  `test/worker-scan-plans.test.ts`, `docs/runbooks/deployment.md`.
- No HTTP, schema or definition contract change. The `DATA_RETENTION_DAYS`
  variable keeps its name, type and validation.
- With the sweep on, a redaction can move by up to one hour. That happens
  only while a daylight-saving change sits inside the window.
