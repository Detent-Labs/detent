# Tasks

## 1. Player: drop a late record answer (E1-8)

- [x] 1.1 In `screens/PlayerScreen.tsx`, hold one `createLatestGate` in `useState`. `loadRecord` takes `next()`, and `loadMoreRecord` takes `current()`.
- [x] 1.2 A stale answer writes no record, cursor or record error, whether the request succeeds or not. Verify with `bun run typecheck` in the devcontainer.

## 2. Tools: drop a late catalog answer (E1-8)

- [x] 2.1 In `screens/ToolsScreen.tsx`, hold one `createLatestGate` in `useState`. `selectProcess` and `selectCatalog` each take `next()`.
- [x] 2.2 A stale answer writes no versions, draft flag, fields or catalog error. Verify with `bun run typecheck` in the devcontainer.

## 3. Migration plan: report rows the plan cannot hold (E1-9)

- [x] 3.1 In `screens/migrationPlanLogic.ts`, `checkPlan` reports two `fieldMap` rows with one source, two `stepMap` rows with one source, and two `transforms` rows with one target. Every row in a collision gets the error. Set the function's doc comment to the new rule count.
- [x] 3.2 In `panels/MigrationSpecEditor.tsx`, a transforms row draws its errors the way a map row does: `describedBy`, `invalid` and the error paragraph.
- [x] 3.3 In `test/studio-migrationPlanLogic.test.ts`, add one test per new rule that rejects a colliding pair. Add one test that passes two distinct rows. Verify with the full suite in group 5.

## 4. Templates: confirm a replacement (E1-10)

- [x] 4.1 In `screens/TemplatesScreen.tsx`, `create` asks through `confirm()` when `items` holds the trimmed key, before `setCreating(true)`. A cancel returns and keeps the form. Use the prompt text from `design.md`.
- [x] 4.2 Verify with `bun run typecheck` in the devcontainer.

## 5. Verification

- [x] 5.1 Run `bun run typecheck` in the devcontainer. Expect exit code 0.
- [x] 5.2 Run `bun run build` in the devcontainer. Expect exit code 0.
- [x] 5.3 Run the full `bun test` suite with `DATABASE_URL` set through `sh scripts/test-gated.sh bun test` and `OPENSPEC_TELEMETRY=0`. Read the pass, skip and fail counts.
- [x] 5.4 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` on the host. Read its exit code.
- [x] 5.5 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh` on the host. Read its exit code.
- [x] 5.6 Do a browser check on the production bundle. Delay one Player record answer and one Tools catalog answer with a route intercept. Confirm that each screen drops it.
- [x] 5.7 In the browser, add two field-map rows with one source and read both errors. Press Create on an existing template key and cancel the prompt.
- [x] 5.8 Add one entry to `docs/browser-checks.md` for the delayed-answer check in 5.6 and one for the template prompt in 5.7. Check them with the prose gate in 5.4.
- [x] 5.9 Run `/impeccable critique` and `/impeccable audit` against the templates and migration-plan screens.

## Workflow follow-up

- Verify, sync the specs, and archive. Delete this change's audit index entry in `docs/decisions.md`.
- Push, open the PR, and merge on green CI.
