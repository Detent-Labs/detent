# Tasks

Read `design.md` first. The delta specs under `specs/` hold the scenarios.
Every group lands its own tests.

## 1. The instance view carries transitionSeq

- [ ] 1.1 Add `transitionSeq: number` to `InstanceView`. In `getInstanceView`
      (`src/runtime/instances.ts`), set it from `instance.transitionSeq`.
      Verify: a DB test in `test/` shows a view after three transitions
      carries 3, and a completed and a cancelled instance still carry theirs.
- [ ] 1.2 Add `transitionSeq` as an integer property of the `InstanceView`
      schema in `docs/openapi.yaml`, and list it in that schema's `required`
      array. Verify: `git grep -n transitionSeq docs/openapi.yaml` lists the
      schema, and `test/openapi-exclusions.test.ts` passes in the full suite.

## 2. The timers filter

- [ ] 2.1 Give `listPendingTimers` an optional `instanceId` in its page
      argument, as one predicate beside the cursor predicate, and read it in
      `handleAdminListTimers` (`src/engine/admin-queries.ts`,
      `src/http/admin-routes.ts`). Verify: DB tests cover a timer sorting
      after place 200 found with `limit` 1, a running instance with no timer,
      a completed instance and an unknown id, each returning no items and no
      cursor.

## 3. The instance screen

- [ ] 3.1 Add `assignment`, `baseLocale` and `transitionSeq` to the admin
      `InstanceView` type, and an `instanceId` option to `listPendingTimers`
      in `api/client.ts` (`packages/web/src/areas/admin/api/`). Verify:
      `bun run typecheck` passes.
- [ ] 3.2 In `InstanceScreen.tsx`, drop `deriveFromRecord`,
      `TIMERS_SCAN_LIMIT`, its `ponytail:` comment, the `listProcesses` call
      and the `baseLocale` state. Read the claim from
      `view.assignment?.claimedBy`, `transitionSeq` from the view, the step
      label locale from `view.baseLocale`, and the timer from
      `listPendingTimers(token, { instanceId, limit: 1 })`. Verify:
      `git grep -n "deriveFromRecord\|TIMERS_SCAN_LIMIT"` finds nothing under
      `packages/web`, and `bun run typecheck` passes.
- [ ] 3.3 Add `instanceHeaderLogic.ts` beside the screen, exporting
      `claimantOf(view)`. It returns `view.assignment?.claimedBy` or null, and
      the screen's claim line calls it. Verify:
      `packages/web/test/admin-instanceHeaderLogic.test.ts` covers a claimed
      view, an unclaimed one, `assignment: null` and an absent `assignment`.

## 4. The outbox Discard confirmation

- [ ] 4.1 Add `outbox.discardConfirm` to the EN and DE admin catalogs in
      `packages/web/src/i18n/catalogs/admin.ts`. State that the discard is
      final, that the side effect never goes out and that no retry follows.
      Verify: the catalog parity test passes with the new key.
- [ ] 4.2 Call `window.confirm(t(locale, "outbox.discardConfirm"))` first in
      `doDiscard` (`OutboxScreen.tsx`) and return on a decline. Verify:
      `bun run typecheck` passes. `packages/web` has no DOM test library, so
      the walk in 5.2 declines and accepts the dialog and reads the network
      log.

## 5. The browser check and the index

- [ ] 5.1 Add the Discard confirmation and the header values to
      `docs/browser-checks.md` with the `Source:` line the other entries
      carry. Verify: the entry names a pass condition for each step.
- [ ] 5.2 Run the browser walk on the production build. Claim an
      `expense_approval` step and submit it, then read the header on
      `/admin/instances/<id>`. Arm more than 200 timers or confirm the filter
      by request, then read the timer. Decline and accept the Discard
      confirmation in EN and DE. Run `/impeccable critique` and
      `/impeccable audit` on both routes. Verify: the run record prints each
      step's result.
- [ ] 5.3 Strike the `fix-admin-instance-and-outbox-screens` entry from the
      audit index in `docs/decisions.md`. Verify:
      `git grep -n fix-admin-instance-and-outbox-screens docs/decisions.md`
      finds nothing.

## 6. Verification

- [ ] 6.1 Run `bun run lint`, then `bun run typecheck`, then `bun run build`, then the full `bun test` with `DATABASE_URL` set, through `sh scripts/test-gated.sh bun test` in the devcontainer. Verify: all four exit 0 with 0 failures and a skip count at the floor.
- [ ] 6.2 Run the antislop linter on every Markdown file the change touched. Verify: `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` exits 0.
- [ ] 6.3 Run the whitespace gate. Verify: `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh` exits 0.
