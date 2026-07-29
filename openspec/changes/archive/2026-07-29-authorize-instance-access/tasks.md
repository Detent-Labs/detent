<!-- antislop: allow-file -->
## 1. Authorize the instance-read path

- [x] 1.1 In `src/runtime/api.ts`, import `isEligibleCandidate` from
  `../engine/transition.js` (already exported at `transition.ts:75`) and
  `ADMIN_ROLE`/`AuthorizationError` from `../auth/authorize.js` — the latter
  two are already imported for `cancelInstance`
- [x] 1.2 Split `getInstanceView`'s load into the two-path shape
  `cancelInstance` uses: an `ADMIN_ROLE` caller loads directly (a missing
  instance surfaces as today's not-found); every other caller loads inside a
  `try` whose `catch` throws `AuthorizationError`, so nonexistent and
  not-permitted collapse to one answer
- [x] 1.3 After the load, reject with `AuthorizationError` unless one of:
  `ADMIN_ROLE`, `instance.startedBy === actor.id`,
  `instance.assignment?.claimedBy === actor.id`, or
  `isEligibleCandidate(actor, instance.assignment?.candidates ?? [])` —
  `isEligibleCandidate` takes a non-optional array, so the `?? []` is required
- [x] 1.4 Confirm the rejection happens before `resolveFields` runs, so no
  data source is resolved for a caller who may not read the instance

## 2. Add the assignment-less submit floor

- [x] 2.1 In `submitAndTransition` (`api.ts:586`), add the `else` arm to the
  existing `if (instance.assignment)`: when the assignment is unset, throw
  `AuthorizationError` unless `instance.startedBy === actor.id` or the actor
  carries `ADMIN_ROLE`
- [x] 2.2 Keep the check where the claim check already is — before
  `validateSubmissionData`, inside the locked transaction — so a rejected
  submission touches nothing
- [x] 2.3 Leave `claimStep`/`releaseClaim` untouched: both already reject a
  step with no declared assignment

## 3. Tests

- [x] 3.1 `test/http.test.ts`: `GET /instances/:id` as a third-party
  authenticated actor is 403 with `error.type` `authorization`, mirroring the
  existing record-route 403 test
- [x] 3.2 `test/http.test.ts`: the same route for a nonexistent instance id,
  as that same actor, is also 403 — the non-disclosure pair
- [x] 3.3 `test/runtime-api.test.ts`: `getInstanceView` succeeds for the
  starter, for the current claimant, for an eligible candidate (by id and by
  role), and for an `ADMIN_ROLE` actor with no other relationship
- [x] 3.4 `test/runtime-api.test.ts`: an actor who was a candidate on a step
  the instance has since left is rejected — advance the instance, then read
  as that actor
- [x] 3.5 `test/assignment.runtime-api.test.ts`: on a step with no declared
  assignment, the existing `outsider` fixture's `submitAndTransition` throws
  `AuthorizationError`, while the starter's succeeds. The existing
  no-assignment test at `:134` submits as the actor that created the
  instance, so it stays green as the starter case — do not weaken it, add the
  outsider counterpart beside it
- [x] 3.6 Confirm no existing test relied on reading an instance view as an
  unrelated actor; if one does, it is asserting the removed behavior and must
  be changed deliberately, not patched to keep passing

## 4. Documentation

- [x] 4.1 `docs/current-state.md`: in the authorization/runtime-API entries,
  record that `GET /instances/:id` is relationship-authorized (admin /
  starter / claimant / current candidate) and that an assignment-less step's
  submission requires starter or admin — both currently describe the open
  behavior
- [x] 4.2 Check `README.md` and `packages/app`'s notes for any statement that
  an instance view is readable with a token alone; correct it if present

## 5. Verification

- [x] 5.1 Run `bun run typecheck` from the repo root (engine plus every
  workspace package) and confirm it passes
- [x] 5.2 Run the FULL `bun test` suite with `DATABASE_URL` set, from the
  repo root, and confirm it passes — never a single-file rerun; check the
  skip count, not only the pass count, since the DB-backed suites are
  `test.skipIf(!DB)` and skip silently without the variable
- [x] 5.3 Verify each new rejecting test actually fails without the fix, on a
  scratch copy of the tree — never by mutating the shared working tree
