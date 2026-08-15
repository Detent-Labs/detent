## 1. Schema

- [x] 1.1 Add `chainedFrom: instanceId.optional()` to the `instance` Zod
      object in `src/schema/definition.ts`, next to `parent`, with a short
      comment distinguishing it from `parent` (reporting-only, not a
      call-and-return link).

## 2. Store

- [x] 2.1 Add an optional `chainedFrom?: string` to
      `store.ts::createInstance`'s `opts` bag, threaded into the
      `instanceSchema.parse({...})` seed object the same way `opts.parent`
      and `opts.startedBy` already are (spread only when present).

## 3. The process.start handler

- [x] 3.1 Create `src/handlers/process-start.ts`, mirroring
      `src/handlers/notification-email.ts`'s shape: a stateless handler
      that reads `ctx.db` per delivery, no closed-over database handle.
- [x] 3.2 Declare `PROCESS_START_ACTION_TYPE = "process.start"` and
      `processStartConfigSchema = z.object({ processId, inputMapping:
      z.record(fieldId, expression) })`.
- [x] 3.3 In the handler: derive `` `inst_${ctx.idempotencyKey}` `` as the
      target instance id, and load it (mirroring `makeSpawnHandler`'s own
      `loadInstance` check).
- [x] 3.4 If that instance already exists, resolve its own PINNED body via
      `resolveBody(existing.processId, existing.version)`, not
      `resolveLatest`: a redelivery must not adopt a version published
      after the first delivery. Skip straight to 3.9's drive-to-rest.
      This mirrors `makeSpawnHandler`'s own already-exists branch.
- [x] 3.5 Otherwise, resolve the target process's latest published body
      via `createDefinitionStore(ctx.db).resolveLatest(config.processId)`;
      throw (ordinary transient failure) if no published version exists.
- [x] 3.6 Load the acting instance (`ctx.instanceId`) and its own body via
      the same definition store; evaluate `config.inputMapping` with
      `evalFieldMap` over `buildGuardContext(actingBody, actingInstance,
      SYSTEM_ACTOR)`, matching `makeSpawnHandler`'s own call shape.
- [x] 3.7 Record each dropped entry as a `mapping.entry-dropped` event
      (`direction: "input"`) on the ACTING instance, in the same
      transaction as the created instance (mirror `makeSpawnHandler`'s
      `withTransaction`/`dropEvents` pattern).
- [x] 3.8 Resolve the target's initial-step assignment via a freshly
      constructed `createDefaultAssignmentRegistry()` and
      `resolveStepAssignment`, matching `makeSpawnHandler`'s own call
      (no `parent` field, but the same `assignment`/`childEvents` shape
      for an `assignment.unresolved` outcome). Create the instance via
      the low-level `store.ts::createInstance` with `instanceId`, `data`
      (the mapped seed), `chainedFrom: ctx.instanceId`, and no `parent`.
- [x] 3.9 UNCONDITIONALLY, on both the exists-branch (3.4) and the
      created branch (3.8), not only the branch that ran on this
      delivery: drive the instance to rest with `resolveAutomatic`. This
      is the same unconditional call `makeSpawnHandler` makes after its
      own if/else, so a redelivery after a crash between creation and
      drive-to-rest still completes the started instance.
- [x] 3.10 Export a `processStartHandlerDef: HandlerDef` (`{ handler,
      configSchema: processStartConfigSchema }`), matching
      `httpHandlerDef`/`notificationEmailHandlerDef`'s own export shape.

## 4. Registry wiring

- [x] 4.1 Register `PROCESS_START_ACTION_TYPE` /
      `processStartHandlerDef` in `src/engine/host.ts::createDefaultRegistry`,
      alongside `http.request` and `notification.email`. No change to
      `tenantContexts` or `registerSubprocessHandlers`.

## 5. Publish-time validation

- [x] 5.1 Export `collect` from `src/engine/registry-check.ts` (or add a
      `collectActionSites` alias). It already walks the five action
      positions `checkActionRegistry` uses (`onEntry`, `onExit`,
      `onCancel`, a path's `onPath`, a timer's `onFire.actions`).
      `process.start` needs that same five-position coverage: it is an
      action, authorable at any of those positions, not a per-step field
      like `subprocess`, so a step-level walk (the shape
      `validateCrossProcess` uses) would miss four of the five.
- [x] 5.2 Add `validateProcessChaining(body, resolvers)` in
      `src/engine/definitions.ts`, a sibling to `validateCrossProcess`:
      filter the exported `collect(body)` sites to `action.type ===
      PROCESS_START_ACTION_TYPE`, resolve each one's `config.processId`
      via `resolvers.resolveLatest`, and collect a
      `CrossProcessValidationError` issue if it resolves to no published
      version.
- [x] 5.3 In the same function, for a resolved target, check every
      `inputMapping` key against `collectFieldsDeep(target.fields)`
      (not `contract.inputFields` — a chain target declares no
      contract); collect an issue for any key outside that set.
- [x] 5.4 Call `validateProcessChaining` from `publishBody`, at the same
      site as `validateCrossProcess` (after CEL validation, before the
      version-insert), passing the same `createDefinitionStore(db)`.

## 6. Documentation

- [x] 6.1 Change `.claude/rules/process-contract.md`'s "Runtime record"
      section: broaden `mapping.entry-dropped`'s description so it no
      longer reads as subprocess-only ("a subprocess `inputMapping`/
      `outputMapping` entry raised") now that a `process.start` action's
      `inputMapping` can raise the same event.
- [x] 6.2 Add a short paragraph to `docs/authoring-guide.md`, beside its
      existing subprocess section, introducing `process.start` as the
      fire-and-forget alternative: it starts another process without
      waiting, unlike a `subprocess` step's call-and-return.

## 7. Tests

- [x] 7.1 `test/process-chaining.test.ts` (or extend an existing
      engine-level test file): a `process.start` action on a terminal
      step's `onEntry` creates one instance of the target process, with
      no `parent` link.
- [x] 7.2 Redelivering the same `process.start` row creates no second
      instance (deterministic id from the idempotency key).
- [x] 7.3 A redelivery after a crash between creation and drive-to-rest
      still drives the already-created instance to rest: create the
      target instance directly at its deterministic id (bypassing the
      handler, mirroring how `subprocess.test.ts` covers the equivalent
      `makeSpawnHandler` case), redeliver the row, and confirm the
      instance reaches a terminal step it had not reached before.
- [x] 7.4 A `process.start` action authored at each of the four action
      positions besides `onEntry` (`onExit`, `onCancel`, a path's
      `onPath`, a timer's `onFire`) is covered by the same publish-time
      `processId`/`inputMapping` check as `onEntry`.
- [x] 7.5 `inputMapping` seeds the started instance's data; one raising
      entry omits its target and records `mapping.entry-dropped`
      (`direction: "input"`) on the ACTING instance, not the started one.
- [x] 7.6 The started instance's `chainedFrom` equals the acting
      instance's id; cancelling the acting instance afterward does not
      cancel the started instance.
- [x] 7.7 A target process with an all-automatic path to a terminal step
      completes the started instance immediately (drive-to-rest).
- [x] 7.8 A `process.start` action whose `processId` matches no published
      process fails `publishBody` with a cross-process validation error;
      the same action targeting a published, uncontracted process
      publishes successfully.
- [x] 7.9 A `process.start` action mapping into a field outside the
      target's field catalog fails `publishBody`; mapping only into
      declared fields publishes.
- [x] 7.10 A `process.start` delivery that keeps failing dead-letters
      once it exhausts the outbox's retry budget, and the acting
      instance's own record stays unaffected.
- [x] 7.11 Add a `process.start` case to `test/config-descriptor.test.ts`,
      asserting `describeConfigSchema(processStartConfigSchema)` returns
      `undefined` (the same record-typed-field fallback `httpConfigSchema`
      already exercises), so the studio-form-fallback behavior stays
      covered.

## 8. Verification

- [x] 8.1 Run `bun run typecheck` and confirm it passes clean.
- [x] 8.2 Run `bun run build` and confirm it passes clean.
- [x] 8.3 Run the FULL `bun test` suite with `DATABASE_URL` set (never a
      single-file rerun) and confirm every test passes, checking the
      skip count as well as the pass count.
- [x] 8.4 Run the antislop linter over every Markdown file this change
      touched (`.claude/rules/process-contract.md` included) and fix any
      finding.
- [x] 8.5 Run `git diff --check` for trailing whitespace and
      blank-lines-at-EOF.
