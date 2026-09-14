## Why

Today every running instance can be cancelled by its starter, at any step, with no way for a process owner to say otherwise. A CapEx approval that has already reached the CEO's step should no longer be cancellable by the person who submitted it — but the engine offers no way to express that. Process owners need two levers: a process-wide switch ("this kind of request is never participant-cancellable") and a per-step override ("not cancellable once it reaches this step"), without weakening the existing operator escape hatch that lets an administrator or a process-scoped grant holder cancel any instance regardless — that escape hatch is what keeps an abandoned or stuck instance from becoming a permanent orphan nobody can clean up.

## What Changes

- Add two optional definition-contract fields: `ProcessBody.cancellable` (default `true`) and `Step.cancellable` (default: inherits `ProcessBody.cancellable`). Either may override the other in either direction; no cross-field validation is added.
- `cancelInstance`'s existing starter-bypass path (`instance.startedBy === actor.id`) is gated by these fields: a starter may no longer cancel an instance sitting on a step where the effective `cancellable` resolves to `false`.
- The `system:cancel-any` fast path and the per-process `cancel` grant path (`can(actor, "cancel", processId)`) are explicitly unaffected — an operator with either can always cancel a running instance, no matter what `cancellable`/`Step.cancellable` say. This is a hard, non-negotiable guarantee: without it, a step that turns off participant cancellation would create an instance no one can ever clean up.
- `getInstanceView`'s `InstanceView` gains `canCancel: boolean`, resolved through the same predicate `cancelInstance` uses (role, grant, starter identity, and the new cancellable gate together), so the read model and the write-path authorization cannot drift apart. It reports `false` for a non-`running` instance.
- Studio gains no-code authoring for both fields: a toggle in the Steps tab's step page for `Step.cancellable`, and one more row in the header bar's `⋮` menu's existing "Process, saved with the draft" group (which already edits `key` and `baseLocale` in place) for `ProcessBody.cancellable` — no new tab or dialog needed.
- The end-user app's "Discard case" control on the Task screen reflects `canCancel`: stays visible, becomes `disabled`, and gains an explanation line beneath it (`/impeccable shape`-confirmed treatment; see design.md).
- The admin app's own cancel action is unaffected by design — it already runs through the `system:cancel-any` path, which this change deliberately never gates.

## Capabilities

### New Capabilities

None. This change extends six existing capabilities; no new capability is introduced.

### Modified Capabilities

- `cancellation`: adds the `ProcessBody.cancellable`/`Step.cancellable` schema fields and their default/inheritance rule; clarifies that the existing "every non-terminal step is cancellable" requirement describes the transition *mechanism*, while whether a given actor may invoke it is the `authorization` capability's concern.
- `authorization`: the "An instance's starter may cancel it without the reserved role" requirement's starter-bypass condition gains the cancellable gate; adds scenarios proving the `system:cancel-any` and per-process `cancel`-grant paths remain unconditional even when the current step is not cancellable.
- `runtime-api`: `getInstanceView`'s returned `InstanceView` gains a `canCancel: boolean` field.
- `studio-step-page`: adds a `Step.cancellable` toggle to the step page.
- `studio-process-tabs`: adds a `ProcessBody.cancellable` checkbox to the header bar's `⋮` menu's existing "Process, saved with the draft" group.
- `end-user-app`: the Cancel control's visibility/enabled state now reflects `InstanceView.canCancel`.

## Impact

- **Schema**: `src/schema/definition.ts` (`ProcessBody`, `Step`), no `compile.ts` change (no cross-field invariant).
- **Engine / Runtime API**: `src/runtime/api.ts` (`cancelInstance`, `getInstanceView`) — a new shared, pure predicate; only the starter-fallback branch changes behavior.
- **HTTP**: no new route and no new error shape — rejection stays the existing `AuthorizationError` → `403`.
- **Studio UI**: `packages/web/src/areas/studio/panels/StepPage.tsx` (+ `sectionsFor.ts`), `packages/web/src/areas/studio/panels/ProcessHeaderBar.tsx` (one more row in the existing first `⋮`-menu group).
- **End-user UI**: `packages/web/src/areas/app/screens/TaskScreen.tsx` (the "Discard case" control).
- **Tests**: `test/cancel.test.ts` (schema), `test/cancel.runtime.test.ts` (engine — including a regression case proving the admin/grant bypass survives a non-cancellable step), a browser check for both new UI surfaces.
- **Docs**: `docs/authoring-guide.md` gains the two fields.
