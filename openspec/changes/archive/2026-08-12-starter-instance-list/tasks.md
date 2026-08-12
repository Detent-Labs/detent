## 1. The route

- [x] 1.1 `src/http/routes.ts`: widen `parseScope` to accept `"started"`, and
  keep any other value a request error
- [x] 1.2 `src/http/routes.ts`: in `handleListInstances`, refuse
  `scope=started` paired with an explicit `startedBy`, the way `scope=mine`
  refuses an explicit `assignedTo`
- [x] 1.3 `src/http/routes.ts`: derive `startedBy` from the resolved actor
  under `scope=started`. Leave `assignedToRoles` and `includeDegraded` unset.
  Keep reading `assignedTo` from the query string, which narrows the page
  conjunctively and reaches nothing outside what the caller started
- [x] 1.4 Confirm `scope=started` reaches no `requireRole` call

## 2. Route tests

- [x] 2.1 A caller holding no reserved role gets 200 from
  `GET /instances?scope=started`
- [x] 2.2 The page carries the caller's own started instances alone, never
  another actor's
- [x] 2.3 The page carries an instance whose current step names another actor
  as its only candidate
- [x] 2.4 The page carries a completed instance and a cancelled one
- [x] 2.5 `scope=started&startedBy=<id>` is a request error, and reads nothing
- [x] 2.6 `scope=started&assignedTo=<other>` answers 200 and narrows the page,
  rather than refusing the pair
- [x] 2.7 Run the existing `scope=mine` and `scope=all` tests in
  `test/http.test.ts` and confirm each passes unchanged

## 3. The API documentation

- [x] 3.1 `docs/openapi.yaml`: add `started` to the `scope` enum on
  `GET /instances`, and rewrite the `description` above it. That prose
  enumerates the two scopes today and would otherwise contradict the enum
- [x] 3.2 `docs/openapi.yaml`: state that the route answers 400 for a
  `startedBy` combined with `scope=started`, beside the note `assignedTo`
  already carries for `scope=mine`

## 4. The screen

- [x] 4.1 `areas/app/routing.ts`: add `{ name: "started" }` to `Route`, match
  `/started`, and build its path
- [x] 4.2 `areas/app/api/client.ts`: add the `scope=started` listing call,
  beside the `scope=mine` one
- [x] 4.3 `i18n/catalogs/app.ts`: add the screen's keys in `en` and `de`. They
  cover the nav entry, the heading, the column headings, the empty state and
  the load-more control
- [x] 4.4 Add `areas/app/screens/startedLogic.ts`: the pure view model, the
  convention `inboxLogic.ts` already sets
- [x] 4.5 Map each instance status onto a stamp tone `app.css` already ships.
  `design-language.md` fixes the tone count, so this adds no new one. Add a
  status-stamp class only where an existing tone carries the wrong meaning
- [x] 4.6 Add `areas/app/screens/StartedScreen.tsx`. It renders register rows
  in `createdAt` order, a status stamp per row, and the identifying content as
  the control. It states an empty result in words. It puts an error note where
  the list would sit, and takes load-more from the returned cursor
- [x] 4.7 `areas/app/root.tsx`: render the screen for the new route and add
  its nav entry beside My tasks and Start a process
- [x] 4.8 `areas/admin/api/types.ts`: rewrite the `DegradedInstanceSummary`
  comment. It says a degraded item appears under the admin scope alone and
  names `scope=mine`; a third scope makes that list incomplete

## 5. Screen tests

- [x] 5.1 A `startedLogic.ts` test for the view model, asserted without
  rendering a component
- [x] 5.2 An `areas/app/routing.ts` test: `/started` matches, and `routePath`
  round-trips it
- [x] 5.3 The catalog parity test already covers the new keys in both
  locales. Confirm that rather than adding a second test

## 6. Documentation

- [x] 6.1 Add a `docs/current-state.md` section naming the new scope, the
  screen and what stayed unchanged
- [x] 6.2 Add a `docs/browser-checks.md` entry. A participant starts a case,
  finds it on the new screen, opens it, and reads the screen in both
  locales
- [x] 6.3 Record the work in `ROADMAP.md` stage 35

## 7. Verification

- [x] 7.1 `bun run typecheck`
- [x] 7.2 `bun run build`
- [x] 7.3 Full `bun test` with `DATABASE_URL` set. Report the pass, skip and
  fail counts
- [x] 7.4 The antislop linter over every Markdown file this change touched
- [x] 7.5 `git diff --check`, and `git ls-files --eol` for a CRLF worktree
  file
- [x] 7.6 Run the browser check from 6.2 against a real browser
