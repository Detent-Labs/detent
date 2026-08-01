## 1. The view carries the assignment

- [x] 1.1 Add `assignment?: AssignmentState | null` to `InstanceView`
      (`src/runtime/api.ts:89`), next to `status`. Use the same shape
      `InstanceSummary` declares at `api.ts:130`, not a new one.
- [x] 1.2 Return `instance.assignment` from `getInstanceView`
      (`api.ts:687`). Pass it through unchanged for every status, unlike
      `availablePaths`, which stays empty for a non-running instance.
- [x] 1.3 Add a test for the three scenarios in
      `specs/runtime-api/spec.md`: an assignment-bearing step carries
      candidates and claimant, an assignment-less step omits the field, and a
      completed instance still reports its assignment while `availablePaths`
      stays empty.
- [x] 1.4 Mirror the field on the web type
      (`packages/web/src/areas/app/api/types.ts:29`). The admin and studio
      areas declare their own `InstanceView`; leave those alone, since
      neither reads the field in this change.

## 2. Decision logic

- [x] 2.1 Add `packages/web/src/areas/app/screens/claimLogic.ts` with a pure
      `resolveClaimControls(status, assignment, actorId, actorRoles)`
      returning a discriminated result for the five states in
      `specs/end-user-app/spec.md`: `none`, `claimable`,
      `blocked-not-candidate`, `blocked-claimed-by-other`, and `mine`. The
      result carries no actor id. Any `status` other than `running` returns
      `none`. Treat an absent and a `null` `assignment` alike.
- [x] 2.2 Include the candidate test in that module, matching
      `isEligibleCandidate` (`src/engine/transition.ts:76`): the actor id or
      any of the actor's roles appears in `candidates`. Comment why the web
      package repeats it rather than importing it (see `design.md`).
- [x] 2.3 Add `packages/web/test/claimLogic.test.ts` covering all five states,
      plus a role-matched candidate, an empty `candidates` list, a `null`
      `assignment`, and a completed instance that still carries a claim.
      Follow the pure-logic pattern of `packages/web/test/inboxLogic.test.ts`.

## 3. Copy

- [x] 3.1 Add `task.claimBlockedNotCandidate` and
      `task.claimBlockedClaimedByOther` to
      `packages/web/src/areas/app/catalog.ts`, in both `en` and `de`. Match
      the register the file already uses: second person, sentence case, plain
      verbs. Neither string interpolates an actor id. `error.alreadyClaimed`
      is the wording precedent for the second one.
- [x] 3.2 Keep `error.notACandidate` unchanged. It answers a rejected request;
      the new entries describe a state before any request.

## 4. Screen wiring

- [x] 4.1 Add `actorId: string` and `actorRoles: string[]` to
      `TaskScreenProps` and pass them from the app area root
      (`areas/app/root.tsx:44`), the same way `TasksScreen` already receives
      the id.
- [x] 4.2 Replace the `claimedByMe` boolean with the result of
      `resolveClaimControls`, computed from the loaded view. Remove the
      `setClaimedByMe(false)` reset in `applyView` (`TaskScreen.tsx:60`) and
      its comment.
- [x] 4.3 Render the claim controls from that result. Render nothing for
      `none`. Render Release and Delegate-to for `mine`, as today.
- [x] 4.4 For the two blocked states render the Claim button with
      `aria-disabled="true"`, no click handler, and `aria-describedby` linking
      it to the visible reason text. Do not use the `disabled` attribute and
      do not use a `title` tooltip.
- [x] 4.5 Render `PathButtons` (`TaskScreen.tsx:282`) for `mine` **and** for
      `none`. An assignment-less step has no claim to gate on, and today that
      gate makes such a task unfinishable.
- [x] 4.6 Confirm the existing claim-error handling still applies. A claim
      that fails between load and click keeps its current path through
      `errors.ts`.

## 5. Verification

- [x] 5.1 Run `bun run typecheck` in the devcontainer.
- [x] 5.2 Run the full `bun test` in the devcontainer with `DATABASE_URL`
      set. Read the verdict off named failures and the skip count, not the
      pass count.
- [x] 5.3 Open the task screen for
      `inst_8072be05-c538-4767-970c-ec8193a34a8a` (process `Test-process`,
      no step declares an assignment). Confirm it renders no claim control
      and does render the path-submit buttons.
- [x] 5.4 Check whether `docs/current-state.md` now states anything false
      about the end-user app (near line 825) or about `InstanceView`. Update
      it only if it does.
- [x] 5.5 Run `openspec validate fix-claim-affordance --strict`.
