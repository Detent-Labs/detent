## Why

An instance records its starter, and `loadInstanceForActor` lets that starter
read it for the whole run. So a participant holding an instance id reads it.
A participant looking for it finds nothing.

`GET /instances` offers two scopes. `scope=all` demands `system:admin`.
`scope=mine` forces the inbox predicate, which matches a claim or a candidacy,
never a start. The app area carries no screen that would list a started case
either. Roadmap stage 35 names the gap.

## What Changes

- Add a third scope to `GET /instances`: `scope=started`. It forces
  `startedBy` to the resolved actor, the way `scope=mine` forces `assignedTo`.
  It needs no role.
- A caller SHALL NOT pair `scope=started` with an explicit `startedBy`, the
  rule `scope=mine` already carries for `assignedTo`.
- Add a "Cases I started" screen to the app area at `/app/started`. Its nav
  entry sits beside My tasks and Start a process.
- The screen lists every status, newest first, and links each row to the task
  screen that already exists.

The engine's read needs no change, so `instance-query` carries no delta.
`InstanceListFilter.startedBy` and its SQL predicate both ship today. That
spec already states the filter.

Nothing about who may read, comment on, or cancel an instance changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `http-wrapper`: `GET /instances` accepts `scope=started`, which derives
  `startedBy` from the caller's credential and needs no role.
- `end-user-app`: the app area carries a fourth route, `/app/started`, and the
  screen behind it.
## Impact

- Changed: `src/http/routes.ts` (`parseScope`, `handleListInstances`),
  `docs/openapi.yaml` (the `scope` enum on `GET /instances`).
- Changed: `packages/web/src/areas/app/routing.ts`, `root.tsx`,
  `api/client.ts`, `app.css`, and the area's catalog for the new wording.
- Changed: one stale comment in `packages/web/src/areas/admin/api/types.ts`,
  which enumerates the scopes that can answer with a degraded item.
- New: `packages/web/src/areas/app/screens/StartedScreen.tsx` and its logic
  module.
- Tests: a route test per scope rule, and a logic test for the screen's own
  view model.
- Docs: `docs/current-state.md`, `docs/browser-checks.md`, `ROADMAP.md`.
- A browser check: the screen lists a case the participant started, in both
  locales.
