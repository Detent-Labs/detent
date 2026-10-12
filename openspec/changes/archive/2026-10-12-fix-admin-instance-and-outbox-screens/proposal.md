# Proposal

## Why

The 2026-10-10 audit found three places where an admin screen states
something the engine does not hold, or acts without asking.

Alice claims a step of `expense_approval` and submits. The instance moves on.
The engine writes an unclaimed assignment and no `assignment.released` event.
The operator opens `/admin/instances/<id>`.

The header derives its claim from
the record and prints "Claimed by alice". `GET /instances/:id` returns no
claimant. With more than 200 record elements, the screen loads only page 1.
"Transition seq" then shows the 200th element's value (F-2).

The same screen finds its timer by scanning the first 200 rows of
`GET /admin/timers`. An instance whose timer sorts after place 200 prints "No
timer armed" while one runs (F-9).

On `/admin/outbox`, Discard sets a dead letter to `discarded` with no
question. Requeue works only from `dead-letter`, so the side effect never goes
out (F-10).

## What Changes

- The instance screen reads the claim from `view.assignment` and the base
  locale from `view.baseLocale`. The extra `listProcesses` call goes away.
- `InstanceView` gains a required `transitionSeq: number`. The screen prints
  it and drops `deriveFromRecord`.
- `GET /admin/timers` accepts an `instanceId` filter. `listPendingTimers`
  takes the same filter. The screen asks for its own instance with `limit` 1.
  `TIMERS_SCAN_LIMIT` and its `ponytail:` comment go away.
- Discard on a dead-letter row asks through `window.confirm` first. The text
  says the discard is final and no retry follows. The new catalog key is
  `outbox.discardConfirm`, in EN and DE.

The owner ruled on 2026-10-12 for all three choices. Timers get a filter, and
`InstanceView` carries no timer data. `transitionSeq` joins `InstanceView`.
Discard uses a native confirm, with no dialog component.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `admin-app`: the instance header states claim and `transitionSeq` from the
  instance view, and its timer from the filtered timers read. The outbox
  screen confirms Discard as well as Retry.
- `admin-operations-api`: `GET /admin/timers` and `listPendingTimers` accept
  an `instanceId` filter.
- `runtime-api`: `InstanceView` carries `transitionSeq`. The requirements for
  the view's fields live here. `instance-query` does not hold them.

## Impact

- `src/runtime/instances.ts`: one field on `InstanceView`.
- `src/engine/admin-queries.ts` and `src/http/admin-routes.ts`: the filter.
- `docs/openapi.yaml`: `transitionSeq` in the instance view schema. The
  document leaves out `/admin/timers`, as `http-api-documentation` requires.
- `packages/web/src/areas/admin/`: `api/types.ts`, `api/client.ts`,
  `screens/InstanceScreen.tsx`, `screens/OutboxScreen.tsx`, and the admin EN
  and DE catalogs. The app and studio types of `InstanceView` stay as they are.
- `test/` and `packages/web/test/`: the new tests. `docs/browser-checks.md`:
  one entry for the browser walk.
- `docs/decisions.md`: strike the audit index entry for this change.
