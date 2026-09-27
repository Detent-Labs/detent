# Design

## Context

See proposal.md for the gap. `resolveBody` in `src/engine/definitions.ts` reads `draft_snapshots` for a negative version and `definitions` otherwise. The engine needs that fallback. A test instance pins a negative version and rehydrates against it. The HTTP route calls the same `resolveBody` with the parsed version. `parseVersion` in `src/http/routes.ts` accepts any int4, negative numbers included.

## Goals / Non-Goals

**Goals:**

- No HTTP caller reads a draft snapshot body through the version-body route.

**Non-Goals:**

- `resolveBody` and `parseVersion` stay unchanged. The engine and the migration routes rely on both.
- Snapshot retention. Rows in `draft_snapshots` are never deleted. That is a separate question.
- The orphan-key scan route. It needs `system:developer` or a scoped `migrate` grant already.
- `POST /drafts/:processId/instances`. The sibling change `fix-test-instance-developer-list` covers it.

## Decisions

**Answer 404 for `version < 1` in `handleGetVersionBody`, before the store read.** The owner chose this shape over the alternative on 2026-09-27.

- Alternative: admit a negative version for `system:admin` or a Developer-list match, answer 403 otherwise, the way `GET /drafts/:processId` does. Refused. No studio caller reads a snapshot through this route. Every `getVersionBody` call in `packages/web` passes a number from the published version list or from a draft's `baseVersion`. The Player never calls it. The alternative keeps an access path nobody uses, with a second authorization rule on one route.
- Why 404 and not 403: the route serves published versions, and no published version has a number below 1. A 404 matches the existing "no published row" answer. It also answers the same for every role, so the status reveals nothing about whether a snapshot exists.
- Why in the handler and not in `parseVersion`: `parseVersion` also parses the migration routes' version pairs and the instance query filter. The comment on `assertVersionFilter` in `src/runtime/queries.ts` records that a negative filter is legitimate there.

The check runs inside the handler body, after `requireStudioRead`. An actor without a studio role still gets 403 first, as today.

## Risks / Trade-offs

- [A future screen needs a snapshot body over HTTP] → It adds its own route, gated by the Developer list. This route stays published-only.
- [A different handler reaches `resolveBody` with a caller-supplied version] → Out of scope here. A grep for `resolveBody(` under `src/http` during apply confirms this handler is the only HTTP caller.

## Migration Plan

None. No stored data changes. Rollback is a revert of the one handler line.

## Open Questions

None.
