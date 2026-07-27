## 1. Engine: InstanceSummary gains labels and step-entry time

- [x] 1.1 Add `currentStepEnteredAt` to the `instance` Zod schema (`src/schema/definition.ts`), written at every step entry alongside `currentStepId` — `planStepEntry`/`applyStepEntry` in `src/engine/transition.ts` and `createInstance`'s seed in `src/engine/store.ts` — the same place `startedAt`/`startedBy` already live in the instance body, not a separate DB column
- [x] 1.2 Add `currentStepEnteredAt`, `processLabel`, `stepLabel`, `processBaseLocale` to the `InstanceSummary` type and its `listInstances` query in `src/runtime/api.ts` (`toSummary` now resolves the pinned version body via the cached definition store and copies the raw `LocalizedText` maps plus `body.baseLocale` — no server-side locale resolution; `processBaseLocale` was added during Phase 3 once the app's inbox needed a real fallback locale to resolve labels against, not just the active locale)
- [x] 1.3 Test: `listInstances` returns `currentStepEnteredAt` reflecting the current step's entry, updated by a transition rather than fixed at creation
- [x] 1.4 Test: `listInstances` resolves `processLabel`/`stepLabel`/`processBaseLocale` from the pinned version body, and never includes any other part of that body
- [x] 1.5 (discovered while implementing) `Instance.startedBy` was declared, filtered on, and read everywhere but never actually written by `createInstance`/`createProcessInstance` — fixed by threading `startedBy` through `store.ts::createInstance`'s opts and setting it from `actor.id` in `runtime/api.ts::createProcessInstance`; required for tasks 3.x to have any effect at all

## 2. Engine: scope=mine filter

- [x] 2.1 (revised) No engine-level change needed: `listInstances`' existing `assignedTo` filter already implements the exact inbox predicate `scope=mine` needs, so translating `scope=mine` into `assignedTo=<actor.id>` belongs entirely at the HTTP boundary — see 2.2
- [x] 2.2 Wire `scope=mine` through the `GET /instances` route in `src/http/routes.ts`: derive the actor from the already-resolved `Actor` and set `filter.assignedTo` from it, rejecting any request that pairs `scope=mine` with an explicit `assignedTo`
- [x] 2.3 Test: `scope=mine` returns the same instances as `assignedTo=<actor.id>` for the calling actor
- [x] 2.4 Test: a request cannot use `scope=mine` to see another actor's instances; `scope=mine` + explicit `assignedTo` is a 400; an unknown `scope` value is a 400

## 3. Engine: starter may cancel their own case

- [x] 3.1 (revised) The authorization decision lives in `runtime/api.ts::cancelInstance`, not the route handler: try `requireRole(actor, CANCEL_ANY_ROLE)` first (unchanged fast, load-free path); only on that failure, load the instance and accept `instance.startedBy === actor.id`. A role-less caller's failure — whether the load fails (nonexistent instance) or `startedBy` doesn't match — collapses to the same `AuthorizationError`, preserving the pre-existing "no role → opaque 403 regardless of instance existence" guarantee an existing test already locked in
- [x] 3.2 Test: an actor carrying `system:cancel-any` is authorized with no instance-existence-dependent rejection, matching pre-change behavior (including for a nonexistent instance)
- [x] 3.3 Test: the instance's own starter, lacking `system:cancel-any`, can cancel it
- [x] 3.4 Test: an actor who neither carries the role nor started the instance is rejected with `403`/`"authorization"`, identically whether or not the target instance exists (updated the pre-existing non-starter/no-role test, which had been using the instance's own starter as the rejected actor — no longer valid now that starters are authorized)

## 4. packages/form-ui: package scaffold

- [x] 4.1 Create `packages/form-ui` as a Bun workspace package with a source-only `exports` map (no build step), depending on `workflow-engine` (`file:../..`) for `LocalizedText`/`resolveLocalizedText`/field types, `react`/`react-dom` as peer deps, no dependency on `packages/app` or `packages/editor`
- [x] 4.2 `packages/form-ui` is auto-discovered by the root `workspaces: ["packages/*"]` glob — no root `package.json` edit needed

## 5. packages/form-ui: extract field rendering

- [x] 5.1 Moved `packages/editor/src/player/FieldInput.tsx` into `packages/form-ui/src/FieldForm.tsx`, preserving the shared select/multiselect option-list branch and shared free-text-fallback branch unchanged; the wire types (`WireField`/`ResolvedViewField`/`AvailablePath`/`SubmissionIssue`) moved to `packages/form-ui/src/types.ts` too, since both consumers need the identical shape
- [x] 5.2 Added `locale`/`baseLocale` props threaded through `FieldForm`/`FieldInput`, resolved via a new `resolveText` helper (`src/locale.ts`, wrapping the engine's `resolveLocalizedText`) — replaces the editor-only `firstLocalizedText` for field/option labels
- [x] 5.3 (revised) The editor had no source-level CSS at all for the `player-*` classes (verified: no `.css` file or import anywhere in `packages/editor/src`) — nothing existed to move. Added a minimal structural stylesheet (`src/form-ui.css`, `ponytail`-marked) as a placeholder; real visual design lands with the end-user app screens in Phase 3 and flows back into this file
- [x] 5.4 Per-field validation error display carried over unchanged (it already existed in the moved `FieldInput.tsx`); the unmatched-issue surfacing stays the consuming app's job (already true in the editor's `PlayerView`'s `GenericError`, replicated by the end-user app in Phase 3) rather than a `form-ui`-internal concern
- [x] 5.5 Extracted a `PathButtons` component (`src/PathButtons.tsx`) from the JSX that used to live inline in `PlayerView.tsx`, and `editableFieldIds`/`filterToEditable` (`src/submit.ts`) from `packages/editor/src/player/store.tsx`
- [x] 5.6 Tests: `test/field-form.test.tsx` (moved + locale-fallback cases added), `test/path-buttons.test.tsx`, `test/submit.test.ts` — 24/24 pass. (No `order`-sorting test: `ResolvedViewField` carries no explicit order field: the array's own order IS the render order, already preserved by the existing `.map()`.)

## 6. packages/editor: repoint Player at form-ui

- [x] 6.1 `packages/editor/package.json` depends on `"form-ui": "file:../form-ui"`; `PlayerView.tsx` now imports `FieldForm`/`PathButtons` from `"form-ui"` (passing `locale="en"`); `store.tsx`'s `editableFieldIds`/`filterToEditable` now delegate to `form-ui`'s versions; `types.ts` re-exports the wire types from `form-ui` instead of declaring its own
- [x] 6.2 Deleted `packages/editor/src/player/FieldInput.tsx` and its superseded test `packages/editor/test/player-field-input-rendering.test.tsx` (equivalent coverage now lives in `packages/form-ui/test/`)
- [x] 6.3 `bun run typecheck` passes across the workspace (engine + form-ui + editor); full `bun test`: 874 pass / 4 fail (the 4 are pre-existing, unrelated Playwright/mermaid-isomorphic browser-binary failures in `graph-view-rendering.test.tsx`, confirmed present before this change too) — no editor Player test regressed

## 7. packages/app: scaffold and routing

- [x] 7.1 Created `packages/app` (React + Vite + TS, mirrors `packages/editor`'s config); auto-discovered by the root `workspaces: ["packages/*"]` glob
- [x] 7.2 `src/routing.ts`: `matchRoute`/`routePath` (pure) + `useRoute()` (History API, popstate listener, no library dependency)
- [x] 7.3 Test: `test/routing.test.ts` — all four routes, decode/encode of the instance id, unknown-path fallback, round-trip

## 8. packages/app: login and session

- [x] 8.1 `src/screens/LoginScreen.tsx` posts to `/auth/login`, persists `{token, actorId}` via `src/session.ts`, navigates to `/`
- [x] 8.2 `src/api/client.ts`'s `request()` attaches `Authorization: Bearer`; each screen catches `AppClientError` with `status === 401` and calls `onUnauthorized` (App.tsx's `logout`), which clears the session and navigates to `/login` — no expiry tracking
- [x] 8.3 Test: `test/session.test.ts` (persistence round-trip, corrupt-JSON safety) — the 401-triggers-logout path is exercised live (see Verification note) rather than mocked, since it's one line per screen wired to `session.ts`'s already-tested primitives

## 9. packages/app: my tasks screen

- [x] 9.1 `TasksScreen.tsx`: loads on mount and on `window` `focus`; a Refresh button and post-submission (`TaskScreen` navigates back to `/`, which remounts `TasksScreen`) also trigger a load — never a timer
- [x] 9.2 Row renders `processLabelOf`/`stepLabelOf` (resolved via `form-ui`'s `resolveText` against `processBaseLocale`) and a waiting-time badge derived from `waitingSince`
- [x] 9.3 `src/screens/inboxLogic.ts`: `filterByProcess`/`sortItems`/`groupItems`, all pure, operating over the already-loaded array
- [x] 9.4 Cursor-driven "load more" + i18n caveat string, appends to the loaded set
- [x] 9.5 Test: `test/inboxLogic.test.ts` (21 cases: filter/sort/group/claim-predicates, non-mutation); the "never sends assignedTo" contract lives in `src/api/client.ts::listMyTasks`, which only ever sets `scope`/`limit`/`cursor` params
- [x] 9.6 (found by a second `/openspec-verify-change` pass, fixed) `waitingLabel` (the row's waiting-time text) was hardcoded English ("just now", "m"/"h"/"d") regardless of the active locale — the one piece of UI chrome that bypassed the `en`/`de` catalog entirely, contradicting the localization requirement. Moved it into `inboxLogic.ts` as a pure, locale-aware function (`now` passed in rather than read via `Date.now()`, so it stays testable) using new `tasks.waitingJustNow`/`tasks.waiting{Minutes,Hours,Days}Suffix` catalog keys; unit-locale suffixes (`m`/`h`/`d`) are kept identical across `en`/`de` as a deliberate, universally-understood-shorthand choice, not an oversight. Test: `test/inboxLogic.test.ts` (4 new cases, incl. the `de`-vs-`en` "just now" distinction)

## 10. packages/app: task screen

- [x] 10.1 `TaskScreen.tsx`: `getInstanceView` on mount, rendered via `form-ui`'s `FieldForm` with the app's active `locale`; always starts read-only (`claimedByMe` local state, not derived from server data — `InstanceView`'s wire shape carries no assignment info, matching `editor-player`'s existing `InstanceView`)
- [x] 10.2 Claim/Release wired to `claimedByMe` toggling the editable state and which action buttons show
- [x] 10.3 Successful submit navigates to `{name: "tasks"}`
- [x] 10.4 "Discard case" always rendered, calling `cancelInstance`; authorization is enforced server-side (task 3.1) — a non-starter sees the mapped `authorization` error, not a hidden button, since the client cannot cheaply know `startedBy` without a dedicated field
- [x] 10.5 Test: covered at the logic layer (`errors.test.ts`) plus a live end-to-end pass (see Verification) — no jsdom/testing-library in this project's conventions (`renderToStaticMarkup` only), so interactive claim/submit sequences aren't unit-tested, matching how `editor`'s own `PlayerView.tsx` has no direct test today
- [x] 10.6 (found by `/openspec-verify-change`, fixed) Three real bugs in `TaskScreen.tsx`'s error handling: (a) a failed initial load rendered a blank screen — the `{outcome && ...}` banner sat below an `if (!view) return <main />` early-return that fired first; restructured so the back button and outcome banner always render, and the form/actions render only when `view` is loaded; (b) the `notFound` state built for this case was unreachable dead code (`withErrorHandling` swallows every `AppClientError` internally, so the `.catch()` that set it never fired) — removed, folded into the general fix; (c) on `not-claimant`/`not-claimed` outcomes, `claimedByMe` was never reset to `false`, leaving Release/submit visible after the server said the claim was gone — now reset alongside setting the outcome. Re-verified live: a direct load of `/tasks/:badId` now shows the error + a working "Back to my tasks" link instead of a blank page; the full claim→fill→submit flow still passes with 0 console errors
- [x] 10.7 (found by `/openspec-verify-change`, fixed) `form-ui`'s "an unmatched validation issue SHALL still be surfaced" requirement had no implementation in `packages/app` — `TaskScreen.tsx` grouped every issue by `fieldId` into a map `FieldForm` queries, so an issue for a field outside the current view was silently dropped. Added the same `fieldIds`/`unmatchedIssues` partition the editor's `PlayerView.tsx` already does, rendered as a summary list under a new `task.unmatchedIssues` catalog string
- [x] 10.8 (found by `/openspec-verify-change`, fixed) The "Discard case" authorization failure showed the engine's raw technical message (`actor 'x' may not cancel instance 'y'`) instead of end-user copy; `errors.ts` now maps `authorization` to a dedicated localized `error.authorization` string instead of passing the server message through. Test added in `errors.test.ts`
- [x] 10.9 (found by a second `/openspec-verify-change` pass, fixed) `withErrorHandling`'s `reload-moved-on` branch called `getInstanceView` again with no guard of its own — if that reload also failed (the instance is gone by the time of the retry), the exception would escape the catch block as an unhandled rejection instead of degrading to the outcome message already set. Wrapped in its own try/catch; not separately unit-tested (interactive double-fault path, same testing-convention limit as 10.5)

## 11. packages/app: start-a-process screen

- [x] 11.1 `StartScreen.tsx`: `GET /processes`, each row via `resolveText(p.label, locale, p.baseLocale)`
- [x] 11.2 Click calls `createInstance` then navigates to `{name: "task", instanceId}` — no pre-instance preview
- [x] 11.3 Verified live (see Verification) rather than unit-tested, for the same reason as 10.5

## 12. packages/app: localization

- [x] 12.1 `form-ui`'s `resolveText` used throughout (`inboxLogic.ts`, `StartScreen.tsx`) for process/step `LocalizedText`, with `processBaseLocale`/`baseLocale` as the fallback
- [x] 12.2 `src/i18n/catalog.ts` (`locale → key → text`, `en`+`de`) and `src/i18n/locale.ts` (`navigator.language` detection, persisted override); header `<select>` in `App.tsx` calls `changeLocale`
- [x] 12.3 Test: `test/locale.test.ts` (7 cases: detection, fallback, persistence, catalog lookup)
- [x] 12.4 (discovered while implementing) `InstanceSummary` didn't carry a base locale to fall back against for inbox rows — added `processBaseLocale` to the type/`toSummary` (engine, task 1.2) and to the `instance-query` delta spec, rather than resolving inbox labels with no real fallback

## 13. packages/app: error handling

- [x] 13.1 `src/errors.ts::describeError` maps every non-validation `ClientError` variant to the design's table; `validation` is deliberately excluded and handled by `form-ui`'s per-field attachment instead (`TaskScreen.tsx` builds `issuesByField` from `AppClientError.error.issues`)
- [x] 13.2 Test: `test/errors.test.ts` (7 cases, one per mapped condition plus the message-fallback rule)

## 14. Verification

- [x] 14.1 `bun run typecheck` across the workspace (engine + `form-ui` + `editor` + `app`): clean, no errors
- [x] 14.2 Full `bun test` with `DATABASE_URL` set: **916 pass, 4 fail** (one more pass than the first run — the `authorization`-mapping test added in 10.8) — the 4 failures are pre-existing and unrelated (`packages/editor/test/graph-view-rendering.test.tsx`, missing Playwright browser binary in the container; confirmed present before this change too, in Phase 1's baseline run)
- [x] 14.3 (added) Live browser verification, not in the original task list: seeded a real process + user inside the devcontainer, ran the full flow in an actual browser (Playwright) against the real HTTP server — login → empty inbox → Start a process → claim → fill → submit → back to inbox (empty again, case reached its terminal step) → locale switch to `de` with the whole UI translating. No console errors at any step. One layout nit found and fixed live (the task-screen "Back"/stamp-badge row needed `display: block` to stack instead of collide) — screenshots are not persisted (gitignored `.playwright-cli/`; scratch seed scripts were deleted after use, not committed)
- [x] 14.4 (added) `/openspec-verify-change` ran against the completed change and found 3 CRITICAL + 1 WARNING + 1 SUGGESTION (see tasks 10.6-10.8); all fixed and re-verified live — a direct load of a nonexistent task URL now shows an error + working back link instead of a blank screen, and the full claim→fill→submit flow was re-run end to end with 0 console errors after the fixes (re-seeding was needed since the intervening full `bun test` run truncated the dev database's `auth_users`/`definitions` tables, per this project's documented shared-DB test convention)
- [x] 14.5 (added) A second, independent `/openspec-verify-change` pass (deliberately re-checking areas the first pass covered less deeply — `TasksScreen`/`StartScreen`/`App`/`LoginScreen`) found one more real WARNING (task 9.6: `waitingLabel` bypassed the locale catalog entirely) and one SUGGESTION (task 10.9: an unguarded double-fault in the reload-on-conflict path); both fixed and covered where the project's testing conventions allow. Full `bun test`: **920 pass, 4 fail** (same 4 pre-existing, unrelated failures)
