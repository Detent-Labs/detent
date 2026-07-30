## 1. Engine: `delegateClaim`

- [x] 1.1 In `src/engine/transition.ts`, generalize `updateAssignment`'s
      hardcoded `payload: { actorId: actor.id }` (confirmed at its
      `InstanceEvent` construction site) into a per-call payload. Add a
      new parameter carrying the payload value (or a payload-building
      callback), and update its two existing callers, `claimStep` and
      `releaseClaim`, to keep passing `{ actorId: actor.id }` unchanged.
- [x] 1.2 Add `delegateClaim(instanceId, actor, toActorId, db)`, next to
      `claimStep`/`releaseClaim`. It calls `updateAssignment` with a
      guard requiring `assignment.claimedBy === actor.id` (reusing
      `NotClaimantError`), a next-state computer that sets `claimedBy =
      toActorId`, refreshes `claimedAt`, and leaves `candidates`
      untouched, the event kind `"assignment.delegated"`, and payload `{
      fromActorId: actor.id, toActorId }`.

## 2. Schema: new event kind

- [x] 2.1 In `src/schema/definition.ts`, add `assignment.delegated` to the
      `InstanceEvent` discriminated union, payload `{ fromActorId:
      string, toActorId: string }` (`.strict()`, matching every sibling
      kind).
- [x] 2.2 Add a case to `test/events.test.ts` for the new kind: the schema
      parses a valid `assignment.delegated` event, and rejects a payload
      missing either actor id.

## 3. Runtime API Layer

- [x] 3.1 In `src/runtime/api.ts`, add `delegateClaim(instanceId, actor,
      toActorId, db?)`. Mirror `claimStep`/`releaseClaim`'s non-running
      detection (confirmed at lines ~659-674): call the engine's
      `delegateClaim`, and if the instance came back unchanged with
      `status !== "running"`, throw `InstanceNotRunningError`.
- [x] 3.2 Add delegate cases to `test/assignment.runtime-api.test.ts`:
      successful delegation by the claimant, `NotClaimantError` for a
      non-claimant, a delegate target absent from `candidates` still
      succeeding, and `InstanceNotRunningError` on a non-running
      instance.
- [x] 3.3 Add delegate cases to `test/assignment.engine.test.ts` for the
      engine-level `delegateClaim`: successful delegation, non-claimant
      rejection, and the non-running silent no-op.

## 4. HTTP wrapper

- [x] 4.1 In `src/http/routes.ts`, add a `delegateBodySchema = z.object({
      toActorId: z.string().min(1) })` (plain `z.string()` would accept
      an empty string; `submitBodySchema` sits right above as the
      pattern to follow). Add `handleDelegate(instanceId, req, resolver,
      db)`, following `handleClaim`'s `guarded(...)` shape: resolve the
      actor, `parseJsonBody(req, delegateBodySchema)`, call
      `delegateClaim`, and return `200` with the updated instance.
- [x] 4.2 Wire `POST /instances/:instanceId/delegate` and its `OPTIONS`
      preflight in `src/http/server.ts`, alongside the existing `/claim`
      and `/release` routes (confirmed at lines ~239-249, 323-329).
- [x] 4.3 Confirm `src/http/errors.ts` already maps `NotClaimantError` to
      403 and `InstanceNotRunningError` to 409 (confirmed at lines
      ~69, 78). Both do, reused from claim/release; no new mapping is
      needed.
- [x] 4.4 Add delegate cases to `test/http.test.ts`: successful
      delegation, 403 for a non-claimant, 400 for a missing `toActorId`,
      409 for a non-running instance, and 204 for the `OPTIONS`
      preflight.

## 5. `packages/app`: Task screen

- [x] 5.1 Add a `delegate(instanceId, toActorId, token)` call to
      `packages/app/src/api/client.ts`, following `claim`/`release`'s
      exact shape but with a JSON body, matching `submitPath`'s
      `content-type`/`body` pattern: `POST /instances/:id/delegate`.
- [x] 5.2 In `packages/app/src/screens/TaskScreen.tsx`, add local state
      for a target-actor-id text input and a `doDelegate` handler
      following the existing `doRelease` pattern (`withErrorHandling` ->
      call -> update state). Render a "Delegate to" control next to
      Claim/Release, shown only when `claimedByMe` is true.
- [x] 5.3 After a successful delegation, call `setClaimedByMe(false)` (the
      delegating user no longer holds the claim) so Release and
      path-submit actions disappear for them, matching how `doRelease`
      already resets this state.

## 6. `packages/admin`: Instance screen

- [x] 6.1 In `packages/admin/src/screens/InstanceScreen.tsx`,
      `deriveFromRecord` derives the displayed claimant by scanning the
      record for `assignment.claimed` (sets `claimedBy`) and
      `assignment.released` (clears it) only. Add a third case: `if
      (el.kind === "event" && el.event.kind === "assignment.delegated")
      claimedBy = el.event.payload.toActorId;`. Without this, the screen
      shows a stale claimant after any delegation, since neither of the
      two existing event kinds fires when a claim moves by delegation.

## 7. Documentation

- [x] 7.1 Update CLAUDE.md's "Runtime record" section: it names all ten
      `InstanceEvent` kinds by name and states the set is additive.
      Add `assignment.delegated` as the eleventh, describing what it
      records and that it enqueues no actions, matching the style of the
      other nine non-`timer.fired`/`subprocess.spawn-enqueued` entries.
- [x] 7.2 After archiving this change, edit
      `openspec/specs/runtime-events/spec.md`'s Purpose section: its
      kind-enumeration table currently lists ten rows and must gain an
      `assignment.delegated` row. The delta mechanism does not update
      this table automatically, since it is prose/Purpose content, not a
      Requirement.

## 8. Verification

- [x] 8.1 Run `bun run typecheck` inside the devcontainer, and confirm a
      clean exit.
- [x] 8.2 Run the full `bun test` suite inside the devcontainer with
      `DATABASE_URL` set. Confirm the reported skip count matches the
      count from before this change, so the DB-backed suites ran rather
      than skipped, and confirm the full run is green.
