# Proposal

## Why

`container/Dockerfile` pins the OpenSpec CLI at 1.9.0. The development host
runs 1.14.3 since 2026-10-20. `scripts/openspec-review-check.ts` validates a
change inside the container with 1.9.0, while a session validates it on the
host with 1.14.3. The two can disagree. On 2026-10-20 the host CLI rejected a
MODIFIED requirement that omitted a base scenario, and the changes of that day
were shaped by it. Whether 1.9.0 runs the same check was never measured.

## What Changes

- `container/Dockerfile` pins `OPENSPEC_VERSION=1.14.3`.
- The pod's image rebuilds on the next `sh scripts/dev-pod.sh up`, which
  replays the pod because the image id changes.
- No behavior of the engine or the web package changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. No spec states the CLI version, so this change sets `skip_specs: true`.

## Impact

- `container/Dockerfile`.
- `test/openspec-review-check.test.ts` runs the CLI through the review-check
  script, so the full suite exercises the new version.
- Ordering: stacks on `rename-docker-dir`.
