## Why

`instance-query-data-source` shipped on 2026-08-29. It lets a field's option
list come from the instances of another process. The worked case is a Laptop
Inventory process holding one instance per device. An onboarding step offers
the devices whose own instance stands on the shelf step.

Nothing moves the picked device's instance off that shelf step. The option
list never shrinks. The next participant sees the same laptop again, so the
reading half is decorative. The entry in `docs/decisions.md` calls this "The
missing half" and records that the transition action ships. Only its packaging
stayed open.

Three author-visible handlers live in `src/handlers/`: `http.request`,
`notification.email` and `process.start`. The engine-owned spawn and return
pair sits beside them. Today `process.start` creates an instance, and the
subprocess pair drives a new child. No action type transitions an instance that
already exists.

An author can reach `POST /instances/:id/submit` through `http.request` today.
That path leaves the transaction. It authenticates as the configured credential
rather than as the participant. Its outbox idempotency key guards the HTTP call
rather than the business effect. It is not the path to recommend for a
first-class capability.

## What Changes

- A fourth author-visible action handler, `instance.transition`, in
  `src/handlers/instance-transition.ts`. It reads an instance id out of the
  acting instance's own data. It loads that instance and drives it along one
  named manual path.
- Its config carries three flat string keys. The key `processId` names the
  target process. The key `instanceIdField` names a field of the acting
  instance whose value is the target instance's id. The key `pathId` names the
  manual path to take on the target. All three are flat, so
  `config-descriptor.ts` generates the studio's form with no hand-written
  surface.
- The handler drives the target through the existing
  `executeManualTransition`, as `SYSTEM_ACTOR`. The target path's guard
  therefore evaluates against `system`, never against a participant who is
  nobody inside the target process.
- A new `InstanceEvent` kind, `instance.transitioned-by-action`, appended on
  the target instance inside the transition's own commit. It carries the
  acting instance id, the action id, the idempotency key and the path id. It
  serves two purposes at once: it is the attribution record, and it is the
  redelivery guard.
- Publish validates `pathId` and the path's source step against the versions
  of the target process holding live instances. It reports rather than
  rejects, matching the rule `instance.query` already follows for its own
  step references.
- Publish rejects an `instance.transition` action whose author holds no
  `read` permission on the target process. That extends the existing
  `"instance.query"` read-grant check, renamed
  `validateCrossProcessReadGrant`, rather than adding a second one. Mutating
  another process's instance is a stronger reach than reading it; it does not
  ship with a weaker gate.
- A refused transition dead-letters as a `PermanentError` instead of
  consuming five retries. A target that has already left the path's source
  step will never return to it, so a retry cannot help. A lost optimistic-
  concurrency race on the target's own transition dead-letters the same way.
  The outbox can deliver two acting instances' rows at once, which makes that
  race reachable. The engine never retries it as an ordinary transient
  failure.
- `PublishFinding.referenceKind` admits `"path"`, and `dataSourceId` becomes
  optional, because an action-site finding names no data source.

**Not in this change:** a computed target instance. The config names a field,
not an expression. Nothing asks for a computed one, and a field is the exact
shape `instance.query` already writes an option's value into.

## Capabilities

### New Capabilities
- `instance-transition-action`: the `instance.transition` action type. It
  covers the config and the resolution of the target instance. It covers the
  actor and guard rule, the idempotency under at-least-once delivery, and the
  failure classification.

### Modified Capabilities
- `cross-process-validation`: publish resolves an `instance.transition`
  action's `processId` and `pathId` into its target process. It rejects an
  unresolved process. It reports an unresolved path, under the same
  live-version rule the `instance.query` references follow. It also rejects
  the action when its author holds no `read` grant on the target process.
  That extends the existing `"instance.query"` read-grant requirement rather
  than adding a parallel one.
- `runtime-events`: the `instance.transitioned-by-action` event kind, its
  payload, and the instance the engine appends it on.
- `definition-store`: `PublishFinding` gains `"path"` as a `referenceKind`
  and makes `dataSourceId` optional, so a finding can name an action site.

## Impact

- **New file:** `src/handlers/instance-transition.ts`.
- **`src/engine/registry.ts`:** a fourth exported action type constant,
  `INSTANCE_TRANSITION_ACTION_TYPE`, homed here for the reason
  `PROCESS_START_ACTION_TYPE` is. The file `definitions.ts` needs the constant
  for its own publish check. Defining it in the handler file would cycle.
- **`src/engine/definitions.ts`:** a new `validateInstanceTransitionReferences`
  walk beside `validateProcessChaining`, plus the widened `PublishFinding`.
  This change renames `validateInstanceQueryReadGrant` to
  `validateCrossProcessReadGrant`, and collects `instance.transition` action
  sites there too.
- **`src/schema/definition.ts`:** one new `InstanceEvent` kind. This touches
  the definition contract file, but adds no authored surface. An event kind is
  a runtime record, so `examples/` and `docs/authoring-guide.md` need no sweep
  for it. The action type itself needs a guide entry.
- **`src/engine/host.ts`:** registers the handler in the default registry.
- **`packages/web/src/areas/studio/api/types.ts`:** widens the hand-mirrored
  `PublishFinding` (`dataSourceId` optional, `referenceKind` gains `"path"`)
  to match the engine type before any consumer can compile against it.
- **`packages/web/src/areas/studio/panels/ProcessHeaderBar.tsx`:** one
  fallback where it renders `f.dataSourceId`, now that the field is optional.
- **`docs/authoring-guide.md`:** the new action type, and the convention
  binding a picked instance id to the transition that follows it.
- **`docs/decisions.md`:** the aggregated-data-source entry's "missing half"
  paragraph closes. Its "two participants picking the same device" open
  question moves to its named resolution.
- **`docs/current-state.md`:** the action-handlers list gains the fourth
  handler, beside `http.request`, `notification.email` and `process.start`.
- **`ROADMAP.md`:** unchanged. No stage line names this work, the same way
  none names the `instance.query` half it completes.
- **New test coverage:** `bun:test` cases for the event kind. Cases for the
  handler's seven permanent refusals: the six named checks, plus a lost OCC
  race converted from `ConcurrencyConflict`. Cases for its redelivery and its
  collision behavior, the collision covered both sequentially and genuinely
  concurrently. Cases for the four new publish-time checks: process
  reference, field reference, path report and read grant.
