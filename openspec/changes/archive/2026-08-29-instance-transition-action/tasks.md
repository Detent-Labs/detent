## 1. The event kind

- [x] 1.1 Add the `instance.transitioned-by-action` kind to the
  `instanceEvent` union in `src/schema/definition.ts`. Payload:
  `byInstanceId`, `actionId`, `idempotencyKey`, `pathId`. Verify `bun run
  typecheck` passes.
- [x] 1.2 Add a `bun:test` case asserting the new kind parses, and that a
  payload missing `idempotencyKey` fails to parse.
- [x] 1.3 Add the row to the kind table in `openspec/specs/runtime-events/
  spec.md`'s Purpose. Update its count to thirteen.

## 2. The action type and its handler

- [x] 2.1 Export `INSTANCE_TRANSITION_ACTION_TYPE` from
  `src/engine/registry.ts`, beside `PROCESS_START_ACTION_TYPE`. Verify no
  import cycle: `bun run build` passes.
- [x] 2.2 Write `src/handlers/instance-transition.ts` with its config schema
  (`processId`, `instanceIdField`, `pathId`, all flat strings) and its
  `HandlerDef`. Use plain `z.string()` for all three, never the branded id
  schemas from `src/schema/definition.ts`: each of those carries a `.regex()`.
  In `config-descriptor.ts`, `describeString` returns `undefined` for any
  pattern-constrained property. One such property takes the WHOLE config back
  to the raw JSON textarea. That drops the generated form this action's config
  exists to get. Publish (3.3-3.5) and delivery (2.4) check referential
  validity separately.
- [x] 2.3 Implement the redelivery lookup first: one query on
  `instance_events` for this target and this idempotency key. Return success
  on a hit.
- [x] 2.4 Implement the six permanent refusals: empty field, unloadable
  target, wrong process, non-manual `pathId`, wrong current step, non-running
  status. Each raises `PermanentError` naming the fact. Check the path's
  trigger before calling `executeManualTransition`. A non-manual `pathId`
  left uncaught reaches `commitManualTransition`'s own plain `Error`. The
  outbox retries that instead of dead-lettering.
- [x] 2.5 Build one `AssignmentRegistry` per delivery, passed to the
  transition call (`process-start.ts`'s own shape). The redelivery lookup and
  the target's own load take none: neither resolves an assignment. Drive the
  target through `executeManualTransition` as `SYSTEM_ACTOR`, targeting the
  loaded TARGET instance, passing the event through its `events` argument.
- [x] 2.6 Catch `GuardRefused` and rethrow as `PermanentError` naming the
  path. Also catch `ConcurrencyConflict` (`src/engine/transition.ts`) from the
  same `executeManualTransition` call and rethrow it as a `PermanentError`
  naming the collision. A lost OCC race here means a concurrent writer
  already moved the target. The outbox otherwise classifies that as transient
  (`e instanceof PermanentError` in `outbox.ts`). Its own
  `FOR UPDATE SKIP LOCKED` claiming lets two acting instances' rows reach this
  call at once. The race is reachable, not theoretical.
- [x] 2.7 Register the handler in `src/engine/host.ts`'s default registry.
  Verify `GET /registry` lists the new type.

## 3. Publish-time validation

- [x] 3.1 Widen `PublishFinding` in `src/engine/definitions.ts`:
  `referenceKind` admits `"path"`, `dataSourceId` becomes optional.
- [x] 3.2 Add `validateInstanceTransitionReferences` beside
  `validateProcessChaining`. It walks `collect(body)` for the new type.
- [x] 3.3 Reject an unresolved `processId`, excepting a self-targeting
  action, mirroring `validateInstanceQueryReferences`'s own exception.
- [x] 3.4 Reject an `instanceIdField` the publishing body's own catalog does
  not declare.
- [x] 3.5 Report `pathId` against the versions holding live instances, reusing
  `liveVersionCounts`. Wire the call into `publishBody`.
- [x] 3.6 Add `bun:test` cases for each of 3.3, 3.4 and 3.5, including the
  no-live-instances case that reports rather than stays silent.
- [x] 3.7 Rename `validateInstanceQueryReadGrant` to
  `validateCrossProcessReadGrant`. Extend the `processId`s it collects to
  include every `instance.transition` action's `config.processId`, found via
  the same `collect(body)` walk `validateInstanceTransitionReferences` uses,
  alongside the existing `"instance.query"` data-source collection. The
  rename touches neither the permission checked (`read`) nor the call site in
  `publishBody`.
- [x] 3.8 Add `bun:test` cases for the read grant. Publishing rejects an
  author who holds no `read` grant on the target an `instance.transition`
  action names. An author holding `read`, or the reserved operator role,
  publishes normally. A publish supplying no actor skips the check.

## 4. Studio

- [x] 4.1 Confirm `config-descriptor.ts` generates the config form from the
  flat schema. No hand-written form if it does.
- [x] 4.2 Widen the hand-mirrored `PublishFinding` in
  `packages/web/src/areas/studio/api/types.ts:45`: `dataSourceId?: string`,
  `referenceKind: "step" | "field" | "path"`. Verify `bun run typecheck`
  passes for `packages/web`.
- [x] 4.3 Add the `f.dataSourceId ?? f.loc` fallback in
  `packages/web/src/areas/studio/panels/ProcessHeaderBar.tsx:305`, now that
  4.2 makes `dataSourceId` optional there.
- [x] 4.4 Assert that fallback in `bun:test`. Render `ProcessHeaderBar` under
  `renderToStaticMarkup` with one action finding and one data-source finding.
  The first line names the `loc`, the second still names the data source id.
  `development-toolchain`'s split rule puts this here rather than in
  `docs/browser-checks.md`: the fallback is text this component renders.

## 5. Engine tests

- [x] 5.1 End-to-end DB test: an acting instance submits and the action fires.
  The target instance moves, and the event lands on it.
- [x] 5.2 Assert the event is on the target and absent from the acting
  instance.
- [x] 5.3 Redelivery test: deliver the same row twice, assert the target
  moved once and the second delivery succeeded.
- [x] 5.4 Collision test: two acting instances, one target. Assert the second
  dead-letters on its first delivery, not its fifth. Include a genuinely
  concurrent variant: both deliveries load the target before either commits.
  Drive it with `Promise.all` over both handler invocations. That variant
  reaches the `ConcurrencyConflict` path from 2.6, which the sequential case
  never does.
- [x] 5.5 Guard-refusal test: assert a permanent failure naming the path, and
  the target unmoved.
- [x] 5.6 Non-manual-path test: `pathId` names an automatic path. Assert a
  permanent failure on the first delivery, not a retry.
- [x] 5.7 Assert the acting instance keeps its own progress when the delivery
  fails permanently.
- [x] 5.8 Assert a target reached by the action continues along an automatic
  path in the same delivery.
- [x] 5.9 Cover the four refusals 5.5 and 5.6 leave untested, one test each.
  Those are an empty `instanceIdField` and a target id that loads nothing. The
  other two are a target of another process and a cancelled target. Each
  asserts a dead-letter on the first delivery, the message naming the fact,
  and no movement.
- [x] 5.10 Assert the actor and the sequence the spec names. A guard reading
  `actor.id == "system"` passes and one reading the submitting participant's
  id refuses, which is what pins the system actor. The event carries the seq
  its accompanying transition advances to, and the target rests at that seq.

## 6. Documentation

- [x] 6.1 Add the action type to `docs/authoring-guide.md`, with the laptop
  case pairing `instance.query` and this action.
- [x] 6.2 Update `docs/current-state.md` where it lists the shipped action
  handlers. Confirm each named symbol still exists first.
- [x] 6.3 Close the "missing half" paragraph in `docs/decisions.md`. Record
  the collision resolution there.
- [x] 6.4 Update `ROADMAP.md` if a stage line covers this work.

## 7. Verification

- [x] 7.1 Run `bun run typecheck`, then `bun run build`. Report what each
  printed.
- [x] 7.2 Run the full `bun test` with `DATABASE_URL` set. Pipe it through
  `scripts/gates/silent-green.sh` and report the skip count.
- [x] 7.3 Run `sh scripts/gates/range.sh | sh scripts/gates/prose.sh`. Commit
  first. Both sides of that gate read committed content. A run over an
  uncommitted tree prints "the push changes no Markdown" and checks nothing.
  Every file here is new, so its base count is 0. Any finding in one is a
  rise.
- [x] 7.4 Run `sh scripts/gates/whitespace.sh < /dev/null`.
- [x] 7.5 Browser check: open the studio, add the action to a step, confirm
  the generated config form renders and publishes. Record the walk in
  `docs/browser-checks.md`, beside the `instance.query` form's own entry.
  Task 4.4 and the `config-descriptor.ts` assertion cover what a test can see.
  The entry covers the form-versus-JSON precedence, which neither can.
