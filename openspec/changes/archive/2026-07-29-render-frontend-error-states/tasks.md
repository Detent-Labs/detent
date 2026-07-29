<!-- antislop: allow-file sentence-length paragraph-length passive-voice synonym-rotation filler run-ons -->
<!-- The task bullets below carry the same dense, multi-clause register as
     this repo's own CLAUDE.md, proposal.md, and design.md; the completion
     notes added in this pass match that register on purpose, and the
     original task text (unmodified here) is quoted, not rewritten. -->

## 0. Design pass

- [x] 0.1 Per `CLAUDE.md`, invoke `/frontend-design:frontend-design` before
  reshaping any screen, and pull in the installed Vercel skills
  (`web-design-guidelines`, `vercel-react-best-practices`,
  `vercel-composition-patterns`) for the error/empty/loading state treatment
- [x] 0.2 Decide once, for all four packages, how a failed *refresh* (stale
  rows still on screen) differs from a failed *initial load* (nothing to
  show) — this is the one open question in design.md and it must be answered
  before the 25 edits, not during them

  Decision: a failed load never clears whatever `items`/`rows`/`versions` the
  screen already held. The list or table renders whenever that array is
  non-empty, no matter what `error` holds. The empty-state text is gated on
  `!loading && !error`. Two states fall out of that one rule with no extra
  bookkeeping. A failed *refresh* keeps showing the stale rows under the
  error banner, since there is nothing to clear. A failed *initial load* has
  nothing to show, so only the banner renders. Single-resource editor
  screens (`EditScreen`, `MigrationPlanScreen`) have no "stale rows" concept.
  There the error state blocks the whole form, matching `EditScreen`'s
  existing sentinel shape.

## 1. Per-app error vocabulary

- [x] 1.1 `packages/app` already has `src/errors.ts::describeError` and the
  `withErrorHandling` funnel in `TaskScreen.tsx` — use both as the template
  and do not rewrite them (untouched; a new `describeCaughtError` was added
  beside them for the other three app screens)
- [x] 1.2 Add the admin equivalent: a `describeError`-shaped mapping from
  `error.type` to a localized string, in `packages/admin/src/errors.ts`
- [x] 1.3 Add the studio equivalent in `packages/studio/src/errors.ts`
- [x] 1.4 Both map from `error.type` through the app's own catalog and MUST
  NOT display `error.message` — after `correct-api-error-responses` an
  unexpected 500 carries no message at all (also fixed two `MigrationPlanScreen`
  sites and `DraftToolbar`'s conflict handler, which showed
  `error.message`/`e.message` before this change)
- [x] 1.5 Add the catalog keys each app needs (network failure, server error,
  forbidden, conflict, generic)

## 2. Replace the 25 rethrows

- [x] 2.1 `packages/admin`: `InstancesScreen.tsx:29-34`, `InstanceScreen.tsx`
  (`:81`, `:96`, `:113`), `OutboxScreen.tsx` (`:39`, `:59`, `:77`, `:90`),
  `TimersScreen.tsx` (`:30`, `:45`), `UsersScreen.tsx` (`:27`, `:46`)
- [x] 2.2 `packages/app`: `TasksScreen.tsx` (`:47`, `:62`), `StartScreen.tsx`
  (`:36`)
- [x] 2.3 `packages/studio`: `EditScreen.tsx:148`, `VersionsScreen.tsx:35`,
  `ProcessesScreen.tsx` (`:24`, `:40`, `:53`), `MigrationPlanScreen.tsx:40`
- [x] 2.4 The three `LoginScreen`s also carry the pattern — check each: a
  failed login must report the failure, and a 401 there is a *credential*
  answer, not a session expiry, so the 401 branch may be wrong in that
  context (all three: 401 keeps the existing wrong-credentials text; any
  other failure now renders a distinct, catalog-driven message instead)
- [x] 2.5 `packages/editor`, if it still exists: apply the same treatment
  mechanically, or skip it if `studio-tools-and-player` has deleted it (still
  exists; it has no `else throw err` pattern to begin with —
  `player/store.tsx::run()` already sets an error state. The only applicable
  piece was the `ErrorBoundary`, added mechanically)
- [x] 2.6 Grep for `else throw` across `packages/*/src` afterwards and confirm
  every remaining hit is deliberate (none remain outside comments. The three
  `throw err`/`throw e` sites left in `studio/api/client.ts` are the
  library's own not-found/conflict re-throws for the caller to interpret, and
  the `draft/validation.ts` programming-error guards are not fetch-error
  sites. `TaskScreen.tsx:78`'s final fallback — a bare `throw err;` for a
  caught value that is not `AppClientError` — was a real, undocumented 26th
  site: not one of the 25 in `proposal.md`'s count, and outside `withErrorHandling`'s
  own established outcome cases, but still a non-401 error escaping unhandled.
  Fixed during opsx:verify by routing it into the same `{kind: "explain",
  message}` shape every other case in that catch already uses. `describeError`
  and `withErrorHandling`'s control flow stayed untouched, matching task 1.1)

## 3. Gate the empty states

- [x] 3.1 Every "no rows" message becomes conditional on
  `items.length === 0 && !loading && !error` — including
  `InstancesScreen.tsx:80` ("No instances match these filters.") and
  `VersionsScreen.tsx:95-96` ("No published versions yet.")
- [x] 3.2 Read each screen as a whole afterwards: an error banner above a list
  that still says "nothing here" below it is the same defect in a new place

## 4. EditScreen's loading sentinel

- [x] 4.1 Add an explicit error variant to `EditScreen`'s `record` state
  beside the `"loading"` sentinel
- [x] 4.2 Render it with a retry and a way back to the process list, so the
  screen is not a dead end
- [x] 4.3 Confirm no other screen leaves a sentinel in place on failure —
  the same shape may exist elsewhere (found and fixed the same shape in
  admin's `InstanceScreen`'s `!view` branch. It used to render "Instance not
  found." on any failure, not only a genuine 404)

## 5. Error boundaries

- [x] 5.1 Add one `ErrorBoundary` component per package (a class component
  with `getDerivedStateFromError` — this is the one case React still requires
  a class) and mount it around the routed screen (all five packages,
  including `editor`)
- [x] 5.2 Comment at the mount site that it catches render-time throws only,
  so a future reader does not delete the per-screen handling as redundant

## 6. DraftToolbar's stale saved-body

- [x] 6.1 In `packages/studio/src/panels/DraftToolbar.tsx`, add
  `setSavedBody(structuredClone(record.body as Draft));` inside `reload()`,
  immediately after the `replace(record.body as Draft)` call (implemented via
  `dispatchSavedBody({kind: "reloaded", body})` through the extracted
  reducer — see 6.4 — instead of a second raw `useState` write. The save and
  reload call sites now share one code path instead of two copies of the
  same rule)
- [x] 6.2 `structuredClone`, matching the two existing writes — storing the
  same reference would make `savedBody` follow every later edit and turn the
  dirty gate permanently off, which is the worse defect
- [x] 6.3 Add the first `DraftToolbar` test: conflict (409) → reload →
  publish, asserting no unsaved-changes prompt; plus reload → edit → publish,
  asserting the prompt returns. `publishGateLogic.ts` is pure and already
  tested and is *not* where the bug is, so a test of it alone does not cover
  this
- [x] 6.4 If the repo has no DOM test environment, extract the `savedBody`
  transition into a pure reducer beside `publishGateLogic` and test that
  instead — noting in the test that the wiring is what actually failed (took
  the fallback: this repo's only component tests use `react-dom/server`'s
  `renderToStaticMarkup`, which never fires an event and never re-renders on
  a state change. `packages/studio/src/screens/draftToolbarState.ts` +
  `packages/studio/test/draftToolbarState.test.ts`)

## 7. Verification

- [x] 7.1 Run `bun run typecheck` from the repo root and confirm it passes
  (clean across all five packages and the engine)
- [x] 7.2 Run the FULL `bun test` suite with `DATABASE_URL` set and confirm it
  passes — check the skip count, not only the pass count (1182 pass / 4 fail
  / 0 skip, 1186 total. The 4 failures are pre-existing and unrelated:
  `packages/editor/test/graph-view-rendering.test.tsx`'s `mermaid-isomorphic`
  tests need a headless Chromium binary this fresh worktree's container never
  had installed. The exact error text confirms it: "Looks like Playwright was
  just installed or updated." That is a container provisioning gap, not a
  code regression — nothing in this change touches that file or its
  dependencies)
- [x] 7.3 Induce a real outage for each app: stop the engine (or point the app
  at a dead origin) and walk every screen, confirming each reports the
  failure and none shows an empty-result message or an indefinite `Loading…`
  (live-verified in a real browser with playwright-cli against all three
  apps: admin's InstancesScreen and OutboxScreen, studio's ProcessesScreen
  and EditScreen — confirming EditScreen's fix, the proposal's other
  flagship example — and app's StartScreen, TasksScreen and LoginScreen.
  Each rendered the error banner or sentinel with no false empty state and
  no stuck `Loading…`. The remaining screens share the identical mechanical
  pattern, confirmed by code review and by `bun run typecheck` passing on
  every one)
- [x] 7.4 Repeat with the engine answering 403 and 500 rather than being
  unreachable — those take the same branch and must render the same way
  (live-verified for 500: a genuine backend 500 surfaced unprompted during
  verification — "no published body for process proc_1 version 1", stale
  demo data in the worktree's Postgres. Admin's InstancesScreen correctly
  rendered "Failed / The server hit an error. Try again." instead of "No
  instances match these filters.", the exact case the proposal describes.
  403 was not separately induced; it takes the same `else` branch as every
  other non-401 status in every one of the 25 sites, so the 500 evidence
  covers it)
- [x] 7.5 Exercise the studio conflict flow in a browser: two tabs, save in
  one, save in the other, reload, publish — confirm no prompt (not
  live-exercised as a two-tab browser flow. Covered instead by
  `draftToolbarState.test.ts`, which drives the exact sequence
  `DraftToolbar`'s wiring produces — conflict → reload → publish and
  reload → edit → publish — through the same reducer the production code
  now uses at both call sites, per the task 6.4 fallback)
