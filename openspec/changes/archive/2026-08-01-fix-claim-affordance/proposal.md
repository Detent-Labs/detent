## Why

The task screen renders the Claim button unconditionally. A step that
declares no `assignment` has nothing to claim. The click therefore returns
403 `not-assigned` (`NotAssignedError`, `src/engine/transition.ts:915`). The
engine refuses an action the screen should never have offered. Observed on
`inst_8072be05-c538-4767-970c-ec8193a34a8a`, process `Test-process` v1, where
no step declares an assignment.

The screen cannot do better today. `InstanceView` carries no assignment
(`src/runtime/api.ts:89`). No consumer of `getInstanceView` can therefore
tell a claimable step from an assignment-less one. The screen guesses with a
local boolean seeded to `false` on every mount. A user who claims a task, leaves it
and returns therefore sees Claim a second time. The click then hits
`AlreadyClaimedError` on that user's own claim, because `transition.ts:916`
tests `claimedBy !== undefined` and not identity.

One gap causes both faults. The view does not report the claim state, so
every screen that offers claim controls has to guess.

## What Changes

- `getInstanceView` returns the instance's `assignment`, in the shape
  `InstanceSummary` already carries. The Runtime API Layer already reads that
  value to authorize the caller.
- The task screen derives its claim controls from that field and the
  authenticated actor id. One decision covers five states:

  | Assignment state | Claim controls |
  |---|---|
  | absent | none |
  | present, unclaimed, actor is a candidate | Claim, enabled |
  | present, unclaimed, actor is not a candidate | Claim, disabled, visible reason |
  | present, claimed by another actor | Claim, disabled, visible reason |
  | present, claimed by the actor | Release and Delegate-to |

  The table applies to a running instance. Any other status renders no claim
  control, because claim, release and delegate all refuse a non-running
  instance.

- A step with no assignment gets its path-submit buttons directly, with no
  claim first. The engine accepts a submission there from the instance
  starter or from a holder of `system:admin`. Today the screen gates those
  buttons on the same boolean it gates Claim on. No one can finish such a
  task through the screen at all.
- The screen shows the reason for a disabled Claim as visible text. It does
  not use a `title` tooltip. A `disabled` button suppresses pointer events,
  touch devices have no hover, and assistive technology skips disabled
  controls.
- New app-area catalog entries hold the disabled reasons, in both `en` and
  `de`.

This change touches no engine check. `claimStep` remains the trust boundary.
A caller reaches the API without this screen, so the client-side candidate
test governs presentation only. It never enforces anything.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `runtime-api`: `getInstanceView` gains `assignment` on its returned
  `InstanceView`. The existing requirement never ruled the field out. This
  therefore adds a requirement rather than changing one. Authorization,
  `fields` and `availablePaths` stay as they are.
- `end-user-app`: the requirement "Task screen opens with an explicit Claim
  step" conditions the Claim button on an unclaimed task. That leaves an
  assignment-less step offering a control the engine cannot honour, and
  withholding the submit buttons it would honour. The requirement gains the
  five-state decision and the submission exception for an assignment-less
  step. It gains the visible-reason rule for a disabled Claim. It also gains
  the rule that the screen derives claim presentation from the loaded view.

`http-wrapper` needs no delta. It requires `GET /instances/:instanceId` to
return the `InstanceView` as the JSON body with no envelope, and
`routes.ts:152` passes the value through unchanged. A new field on the view
reaches the response without a rule changing.

## Impact

- `src/runtime/api.ts`: the `InstanceView` type and the object
  `getInstanceView` returns.
- `packages/web/src/areas/app/api/types.ts`: the mirrored `InstanceView`.
- `packages/web/src/areas/app/screens/TaskScreen.tsx`: the claim controls,
  the submit-button condition, and their initial state.
- `packages/web/src/areas/app/catalog.ts`: new `en` and `de` entries.
- Tests for the new view field and for all five claim states.

Nothing changes in the engine, the HTTP wrapper, the schema, or the database.
The JSON process-definition contract stays untouched. `InstanceView` is a
runtime response type, not the definition contract in
`src/schema/definition.ts`.
