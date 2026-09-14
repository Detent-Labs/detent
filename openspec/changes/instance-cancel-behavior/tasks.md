## 1. Schema

- [ ] 1.1 Add `ProcessBody.cancellable?: boolean` and `Step.cancellable?: boolean` to `src/schema/definition.ts` and verify `bun run typecheck` passes and every file under `examples/` still parses unchanged.
- [ ] 1.2 Add the three schema-level scenarios from the `cancellation` spec delta to `test/cancel.test.ts`. They are: unset process defaults cancellable, a step overrides its process's default, a step widens past a process-wide ban. Verify those new cases pass.

## 2. Engine authorization (`src/runtime/api.ts`)

- [ ] 2.1 Add the pure helper `isCancellableAtStep(body, step): boolean` and a direct unit test covering its three cases, and verify it passes.
- [ ] 2.2 Extract one shared async predicate, parallel to the existing `requireSubmitAuthority`. It composes the role check, the `can(actor, "cancel", processId, db)` grant check, the starter check, and `isCancellableAtStep`. This keeps `cancelInstance` and `getInstanceView` from drifting apart.
- [ ] 2.3 Wire the predicate into `cancelInstance`'s existing starter-fallback branch only. The `CANCEL_ANY_ROLE` fast path and the grant branch stay untouched. Verify every existing case in `test/cancel.runtime.test.ts` still passes unmodified.
- [ ] 2.4 Add three new runtime cases from the `authorization` spec delta. The engine refuses a starter at a non-cancellable step. A `system:cancel-any` holder and a per-process `"cancel"` grant holder both still succeed there, the regression test for the hard guarantee. An actor may hold only `system:admin` (no `system:cancel-any`, no grant) and also be the instance's own starter. The engine refuses that actor too, exactly like any other starter. Verify `test/cancel.runtime.test.ts` passes with `DATABASE_URL` set.
- [ ] 2.5 Wire the predicate into `getInstanceView` as `canCancel`. Add the four scenarios from the `runtime-api` spec delta as new runtime tests. Verify they pass with `DATABASE_URL` set.
- [ ] 2.6 Add a `ponytail:` comment at the predicate's definition. Name the deferred "who besides the starter may cancel" extension point. Also add a comment at `src/engine/transition.ts`'s `cancelInstance` definition. State that every participant/operator-facing caller MUST use the `runtime/api.ts` wrapper, never this primitive directly, so the admin-bypass guarantee keeps holding.

## 3. Studio UI: step page

- [ ] 3.1 Add the Cancellable section to the step page's leading column (`packages/web/src/areas/studio/panels/StepPage.tsx` + `sectionsFor.ts`). Render it for task and subprocess steps only. It holds a `<select>`: "Inherit from process" / "Cancellable" / "Not cancellable", writing `Step.cancellable` (absent key for the inherit state). Add a muted note beneath it naming the resolved effective outcome when an author picks "Inherit".
- [ ] 3.2 Run `bun run typecheck` and `bun run build` for `packages/web` and verify both succeed.

## 4. Studio UI: header bar

- [ ] 4.1 Add the `ProcessBody.cancellable` checkbox row to `ProcessHeaderBar.tsx`'s existing "Process, saved with the draft" `⋮`-menu group, beside `key`/`baseLocale`, with the same `disabled={!structureActive}` gating.
- [ ] 4.2 Run `bun run typecheck` and `bun run build` for `packages/web` and verify both succeed.

## 5. End-user UI

- [ ] 5.1 Add the sibling i18n catalog key for the "why a participant cannot discard it anymore" explanation (DE/EN). Place it beside `task.discardCase`, following design.md's confirmed copy pattern.
- [ ] 5.2 Wire `TaskScreen.tsx`'s "Discard case" control. Render it only while `status` is `"running"`, matching the existing Claim/Release/Delegate-to precedent for a non-running instance. Disable it when `canCancel` is `false`. In that state, also render the explanation as visible text beneath it, never a `title` tooltip. Verify one more case: a real 403 from a stale `canCancel: true` (a concurrent transition between load and click). It must still render the screen's existing generic failure treatment, never a silent no-op.
- [ ] 5.3 Run `bun run typecheck` and `bun run build` for `packages/web` and verify both succeed.

## 6. Docs

- [ ] 6.1 Add the two new fields (`ProcessBody.cancellable`, `Step.cancellable`) to `docs/authoring-guide.md`. This follows `CLAUDE.md`'s rule that a changed authoring rule updates the guide in the same commit.

## 7. Design QA

- [ ] 7.1 Run the mechanical design detector over the changed web UI (`impeccable detect --json <changed targets>`) and fix any findings it reports.
- [ ] 7.2 Run `/impeccable critique` and `/impeccable audit` against the Steps tab, the process header bar, and the Task screen. Fix material findings, per `CLAUDE.md`'s UI verification rule.

## 8. Browser check

- [ ] 8.1 Use a production build; dev mode's Studio crashes on first validation. Manually walk through these steps. An author sets a step to not-cancellable and publishes. A participant starts an instance and reaches that step. Confirm the explanation text appears and "Discard case" stays disabled. Confirm an actor holding `system:cancel-any` (or a per-process `"cancel"` grant) can still cancel that same instance.

## 9. Verification

- [ ] 9.1 Run `bun run typecheck` and verify it passes.
- [ ] 9.2 Run `bun run build` and verify it passes.
- [ ] 9.3 Run the FULL `bun test` suite with `DATABASE_URL` set; never a single-file rerun. Verify it passes, with the skip count unchanged from before this change.
- [ ] 9.4 Run the antislop prose gate over the pushed range (`sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`). Run it against every Markdown file this change touched, including the OpenSpec artifacts and `docs/authoring-guide.md`. Verify it reports no rise.
- [ ] 9.5 Run the whitespace/CRLF/blank-at-eof gate over the same range (`sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh`) and verify it passes.
