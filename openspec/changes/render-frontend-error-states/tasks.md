## 0. Design pass

- [ ] 0.1 Per `CLAUDE.md`, invoke `/frontend-design:frontend-design` before
  reshaping any screen, and pull in the installed Vercel skills
  (`web-design-guidelines`, `vercel-react-best-practices`,
  `vercel-composition-patterns`) for the error/empty/loading state treatment
- [ ] 0.2 Decide once, for all four packages, how a failed *refresh* (stale
  rows still on screen) differs from a failed *initial load* (nothing to
  show) — this is the one open question in design.md and it must be answered
  before the 25 edits, not during them

## 1. Per-app error vocabulary

- [ ] 1.1 `packages/app` already has `src/errors.ts::describeError` and the
  `withErrorHandling` funnel in `TaskScreen.tsx` — use both as the template
  and do not rewrite them
- [ ] 1.2 Add the admin equivalent: a `describeError`-shaped mapping from
  `error.type` to a localized string, in `packages/admin/src/errors.ts`
- [ ] 1.3 Add the studio equivalent in `packages/studio/src/errors.ts`
- [ ] 1.4 Both map from `error.type` through the app's own catalog and MUST
  NOT display `error.message` — after `correct-api-error-responses` an
  unexpected 500 carries no message at all
- [ ] 1.5 Add the catalog keys each app needs (network failure, server error,
  forbidden, conflict, generic)

## 2. Replace the 25 rethrows

- [ ] 2.1 `packages/admin`: `InstancesScreen.tsx:29-34`, `InstanceScreen.tsx`
  (`:81`, `:96`, `:113`), `OutboxScreen.tsx` (`:39`, `:59`, `:77`, `:90`),
  `TimersScreen.tsx` (`:30`, `:45`), `UsersScreen.tsx` (`:27`, `:46`)
- [ ] 2.2 `packages/app`: `TasksScreen.tsx` (`:47`, `:62`), `StartScreen.tsx`
  (`:36`)
- [ ] 2.3 `packages/studio`: `EditScreen.tsx:148`, `VersionsScreen.tsx:35`,
  `ProcessesScreen.tsx` (`:24`, `:40`, `:53`), `MigrationPlanScreen.tsx:40`
- [ ] 2.4 The three `LoginScreen`s also carry the pattern — check each: a
  failed login must report the failure, and a 401 there is a *credential*
  answer, not a session expiry, so the 401 branch may be wrong in that
  context
- [ ] 2.5 `packages/editor`, if it still exists: apply the same treatment
  mechanically, or skip it if `studio-tools-and-player` has deleted it
- [ ] 2.6 Grep for `else throw` across `packages/*/src` afterwards and confirm
  every remaining hit is deliberate

## 3. Gate the empty states

- [ ] 3.1 Every "no rows" message becomes conditional on
  `items.length === 0 && !loading && !error` — including
  `InstancesScreen.tsx:80` ("No instances match these filters.") and
  `VersionsScreen.tsx:95-96` ("No published versions yet.")
- [ ] 3.2 Read each screen as a whole afterwards: an error banner above a list
  that still says "nothing here" below it is the same defect in a new place

## 4. EditScreen's loading sentinel

- [ ] 4.1 Add an explicit error variant to `EditScreen`'s `record` state
  beside the `"loading"` sentinel
- [ ] 4.2 Render it with a retry and a way back to the process list, so the
  screen is not a dead end
- [ ] 4.3 Confirm no other screen leaves a sentinel in place on failure —
  the same shape may exist elsewhere

## 5. Error boundaries

- [ ] 5.1 Add one `ErrorBoundary` component per package (a class component
  with `getDerivedStateFromError` — this is the one case React still requires
  a class) and mount it around the routed screen
- [ ] 5.2 Comment at the mount site that it catches render-time throws only,
  so a future reader does not delete the per-screen handling as redundant

## 6. DraftToolbar's stale saved-body

- [ ] 6.1 In `packages/studio/src/panels/DraftToolbar.tsx`, add
  `setSavedBody(structuredClone(record.body as Draft));` inside `reload()`,
  immediately after the `replace(record.body as Draft)` call
- [ ] 6.2 `structuredClone`, matching the two existing writes — storing the
  same reference would make `savedBody` follow every later edit and turn the
  dirty gate permanently off, which is the worse defect
- [ ] 6.3 Add the first `DraftToolbar` test: conflict (409) → reload →
  publish, asserting no unsaved-changes prompt; plus reload → edit → publish,
  asserting the prompt returns. `publishGateLogic.ts` is pure and already
  tested and is *not* where the bug is, so a test of it alone does not cover
  this
- [ ] 6.4 If the repo has no DOM test environment, extract the `savedBody`
  transition into a pure reducer beside `publishGateLogic` and test that
  instead — noting in the test that the wiring is what actually failed

## 7. Verification

- [ ] 7.1 Run `bun run typecheck` from the repo root and confirm it passes
- [ ] 7.2 Run the FULL `bun test` suite with `DATABASE_URL` set and confirm it
  passes — check the skip count, not only the pass count
- [ ] 7.3 Induce a real outage for each app: stop the engine (or point the app
  at a dead origin) and walk every screen, confirming each reports the failure
  and none shows an empty-result message or an indefinite `Loading…`
- [ ] 7.4 Repeat with the engine answering 403 and 500 rather than being
  unreachable — those take the same branch and must render the same way
- [ ] 7.5 Exercise the studio conflict flow in a browser: two tabs, save in
  one, save in the other, reload, publish — confirm no prompt
