# Proposal

## Why

`GET /processes/:processId/versions/:version` returns an unpublished draft body to any studio role. Each Play in the Player stores the draft body in `draft_snapshots` under a negative version. The route accepts a negative version and resolves that row. A curator holding only `system:templates` can therefore read every draft snapshot of every process. So can a developer who is not on that process's Developer list. `process-templates` and `process-drafts` both forbid this access.

## What Changes

- The version-body route answers 404 for any version below 1, for every actor it admits. A draft snapshot is never readable through this route.
- A published version stays readable by all three studio roles, as before.
- Two new tests reject the old behaviour. After a Play, a curator gets 404 on `versions/-1`. So does a developer who is not on the Developer list.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `process-version-inspection`: a version below 1 names no published row, so the version-body route answers 404. A draft snapshot under that number changes nothing.

## Impact

- `src/http/studio-routes.ts`: `handleGetVersionBody` rejects a version below 1 before it reads the store.
- `test/http-studio.test.ts`: two new tests.
- No web caller changes. Every studio caller passes a published version number.
- `docs/openapi.yaml` stays unchanged. It excludes this route on purpose.
