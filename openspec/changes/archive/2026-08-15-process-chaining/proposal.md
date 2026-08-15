## Why

An offer process reaches its terminal step and must start a procurement
process from the data it collected. It must not wait for that process to
finish. A `subprocess` step already exists. It is call-and-return: the
parent parks until the child reaches a terminal step bound to an outcome.
Nothing in the engine expresses "start this other process and move on."

Stage 39 names this gap. Item 14 of the open-work queue
(`tmp/open-work-priority.md`) is the only remaining engine-side item there.

## What Changes

- New action handler, type `process.start`. It dispatches through the
  ordinary outbox action seam, the same seam `http.request` and
  `notification.email` already use. It does not use the reserved `core.`
  prefix the subprocess spawn/return pair uses. This action is
  author-visible and belongs on an ordinary step's `onEntry`, or any other
  action position.
- Config shape `{ processId, inputMapping }`. `inputMapping` reuses
  `SubprocessSpec.inputMapping`'s shape: one CEL expression per target field
  on the started process, evaluated the same way. When an entry raises, the
  engine omits it rather than failing the whole start. It records the
  omission as a `mapping.entry-dropped` event on the SOURCE instance,
  direction `"input"`.
- The started instance's id is deterministic. It derives from
  `inst_${idempotencyKey}`, reusing the outbox row's own per-delivery
  idempotency key, which is already unique and stable across redelivery. So
  a redelivered chain-start resolves to the same instance instead of
  creating a second one. This needs no new id-derivation helper.
- The started instance carries a new, reporting-only backlink,
  `chainedFrom`. This is distinct from the existing `parent` field.
  `parent` drives subprocess cancel-cascade and return dispatch. Reusing it
  for a fire-and-forget chain would cancel-cascade the chained instance
  wrongly. It would also misroute the instance into the subprocess-return
  path once it reaches its own terminal step.
- The engine resolves the chain target at start time to whatever is
  currently the newest published version of `processId`. It uses no pin, no
  contract, no `versionBinding`. A chain target declares no
  `ProcessContract`. Unlike a subprocess child, its `inputMapping` targets
  resolve against its full field catalog, not a declared input surface.
- New publish-time check, alongside the existing subprocess cross-process
  validation. A `process.start` action's `processId` must resolve to a
  published process. Every `inputMapping` target must be one of that
  process's declared fields.
- Failure handling: the outbox already retries a failed delivery and then
  dead-letters it. That path covers a failed chain-start with no new
  mechanism. The source instance is already completed when this action
  runs. This is because `planStepEntry` enqueues the terminal step's
  `onEntry` actions in the same commit that sets its status. No
  source-instance state remains to fail into.

## Capabilities

### New Capabilities

- `process-chaining`: the `process.start` handler. It spawns a
  linked-but-independent instance on delivery. It derives a deterministic
  instance id under at-least-once dispatch. It evaluates `inputMapping` and
  reports drops. It writes the `chainedFrom` backlink and drives the
  started instance to rest.

### Modified Capabilities

- `cross-process-validation`: adds a publish-time check for `process.start`
  actions. The `processId` must resolve to a published process. Every
  `inputMapping` target must lie within that process's field catalog.

## Impact

- `src/schema/definition.ts`: new `chainedFrom` optional field on
  `Instance`.
- `src/handlers/`: new `process-start.ts` handler. It mirrors the shape of
  `notification-email.ts`: stateless registration, `ctx.db` read per
  delivery. It does not use the per-tenant-closure shape `subprocess.ts`
  uses. This follows `action-handlers`' existing rule: take the database
  handle from the invocation context.
- `src/engine/host.ts::createDefaultRegistry`: registers the new handler
  alongside `http.request` and `notification.email`.
- `src/engine/store.ts::createInstance`: accepts an optional `chainedFrom`
  in its `opts` bag. It threads that value into the persisted instance the
  same way it already threads `parent` and `startedBy`.
- `src/engine/definitions.ts::validateCrossProcess`, or a sibling function
  called from the same site in `publishBody`: the new `process.start`
  publish-time check.
- No schema change to `SubprocessSpec`, `ProcessContract`, or any existing
  action type. No API or route change. Reporting on `chainedFrom` stays out
  of scope for this change. The field exists and is queryable; a dedicated
  report is future work, the way item 13 was for `columnMapping`.
