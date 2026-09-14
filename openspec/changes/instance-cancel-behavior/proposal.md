## Why

Today the starter can cancel any running instance, at any step. Nothing today lets a process owner turn that off. Consider a CapEx approval that has already reached the CEO's step. Its submitter should no longer be able to cancel it. The engine, though, cannot express that today.

Process owners need two levers. One is a process-wide switch: mark a whole kind of request never participant-cancellable. The other is a per-step override: block cancellation once an instance reaches a given step.

Neither lever may weaken the existing operator escape hatch. An administrator or a process-scoped grant holder must still be able to cancel any instance regardless. That escape hatch keeps an abandoned or stuck instance from becoming a permanent orphan nobody can clean up.

## What Changes

- Add two optional definition-contract fields: `ProcessBody.cancellable` (default `true`) and `Step.cancellable` (default: inherits `ProcessBody.cancellable`). Either may override the other in either direction; the two fields validate independently.
- These fields gate `cancelInstance`'s existing starter-bypass path (`instance.startedBy === actor.id`). A starter may no longer cancel an instance sitting on a step where the effective `cancellable` resolves to `false`.
- Nothing changes for the `system:cancel-any` fast path or the per-process `cancel` grant path (`can(actor, "cancel", processId)`). An operator with either can always cancel a running instance, no matter what `cancellable`/`Step.cancellable` say. This is a hard, non-negotiable guarantee. Without it, a step that turns off participant cancellation would create an instance no one can ever clean up.
- `getInstanceView`'s `InstanceView` gains `canCancel: boolean`. It resolves through the same predicate `cancelInstance` uses: role, grant, starter identity, and the new cancellable gate together. This keeps the read model and the write-path authorization from drifting apart. It reports `false` for a non-`running` instance.
- Studio gains no-code authoring for both fields. The Steps tab's step page gets a toggle for `Step.cancellable`. The header bar's `⋮` menu's existing "Process, saved with the draft" group gets one more row, for `ProcessBody.cancellable`. That group already edits `key` and `baseLocale` in place. Neither field needs a new tab or dialog.
- The participant app's "Discard case" control on the Task screen reflects `canCancel`. It stays visible, becomes `disabled`, and gains an explanation line beneath it (`/impeccable shape`-confirmed treatment; see design.md).
- By design, this change leaves the admin app's own cancel action untouched. It already runs through the `system:cancel-any` path, which this change deliberately never gates.

## Capabilities

### New Capabilities

None. This change only extends six existing capabilities.

### Modified Capabilities

- `cancellation`: adds the `ProcessBody.cancellable`/`Step.cancellable` schema fields and their default/inheritance rule. It also clarifies that the existing "every non-terminal step is cancellable" requirement describes the transition *mechanism*. Whether a given actor may invoke it is the `authorization` capability's concern.
- `authorization`: the "An instance's starter may cancel it without the reserved role" requirement's starter-bypass condition gains the cancellable gate. It also adds scenarios proving the `system:cancel-any` and per-process `cancel`-grant paths stay unconditional even on a non-cancellable step.
- `runtime-api`: `getInstanceView`'s returned `InstanceView` gains a `canCancel: boolean` field.
- `studio-step-page`: adds a `Step.cancellable` toggle to the step page.
- `studio-process-tabs`: adds a `ProcessBody.cancellable` checkbox to the header bar's `⋮` menu's existing "Process, saved with the draft" group.
<!-- Why: "end-user-app" is the fixed OpenSpec capability id for the
     participant-facing app; renaming it here would desync this list from
     the actual capability directory. It shares no concept with "operator",
     the unrelated admin-area role this proposal also names. -->
<!-- antislop: allow synonym-rotation -->
- `end-user-app`: the Cancel control's visibility/enabled state now reflects `InstanceView.canCancel`.

## Impact

- **Schema**: `src/schema/definition.ts` (`ProcessBody`, `Step`), no `compile.ts` change (no cross-field invariant).
- **Engine / Runtime API**: `src/runtime/api.ts` (`cancelInstance`, `getInstanceView`) gains a new shared, pure predicate; only the starter-fallback branch changes behavior.
- **HTTP**: no new route and no new error shape. Rejection stays the existing `AuthorizationError` → `403`.
- **Studio UI**: `packages/web/src/areas/studio/panels/StepPage.tsx` (+ `sectionsFor.ts`), `packages/web/src/areas/studio/panels/ProcessHeaderBar.tsx` (one more row in the existing first `⋮`-menu group).
- **Participant UI**: `packages/web/src/areas/app/screens/TaskScreen.tsx` (the "Discard case" control).
- **Tests**: `test/cancel.test.ts` (schema) and `test/cancel.runtime.test.ts` (engine). The runtime suite includes a regression case proving the admin/grant bypass survives a non-cancellable step. Both new UI surfaces also get a browser check.
- **Docs**: `docs/authoring-guide.md` gains the two fields.
