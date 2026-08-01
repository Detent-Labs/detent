<!-- antislop: allow-file sentence-length em-dash -->

Each of groups 1 to 4 ends with the tree shippable: the new area works, the old
package is gone, and `AreaNav` plus the `/` redirect list only migrated areas.

## 1. The package, the shell, and the app area

- [x] 1.1 Add `packages/web` with one `package.json` (name `web`), one
      `tsconfig.json`, one `index.html`, one `vite.config.ts` carrying the
      `contentSecurityPolicy()` plugin and `server: { port: 5173, strictPort:
      true }`, and `src/main.tsx` importing `form-ui/form-ui.css` once.
- [x] 1.2 Add `src/shell/session.ts`: one storage key, `{token, actorId, roles,
      expiresAt}`, storage injectable. Record the expiry, never gate on it.
- [x] 1.3 Add `src/shell/areas.ts`: the area list with each area's revealing
      role (app none, admin `system:admin`, studio `system:developer`,
      reporting `system:reports`), and the helper that picks an actor's
      landing area.
- [x] 1.4 Add `src/shell/routing.ts`: split the first path segment as the area,
      pass the remainder to an area matcher, prepend the prefix to an area path
      builder, and return the bare prefix for a local `/`. Export the generic
      `useAreaRoute(area, match, toPath)` hook.
- [x] 1.5 Add `src/shell/App.tsx` with the header, the account menu holding
      language, the area switcher and logout, the `/` redirect, the
      unknown-prefix redirect to `/`, and the direct-hit role guard.
- [x] 1.6 Move `LoginScreen` and `ErrorBoundary` into `src/shell/`, and the
      chrome half of `app.css` into `src/shell/`.
- [x] 1.7 Add `src/i18n/` with locale selection and persistence, shared by every
      area.
- [x] 1.8 Move `packages/app/src` to `src/areas/app/`, keeping its `screens/`,
      its `api/` and its `types.ts`. Delete its `login` route case; leave
      `matchRoute`/`routePath` otherwise unchanged.
- [x] 1.9 Load each area's root component through a dynamic import, so the build
      emits one chunk per area.
- [x] 1.10 Move the app package's tests to `packages/web/test/`, merging the
      four-way duplicates into one `session.test.ts`, one `routing.test.ts` and
      one `vite-config.test.ts` as the areas arrive.
- [x] 1.11 Add `test/boundaries.test.ts` asserting no file under
      `src/areas/<a>/` imports from `src/areas/<b>/`, following
      `packages/reporting/test/boundaries.test.ts`.
- [x] 1.12 Keep each area's stylesheet separate and its class prefix intact
      (`app-`, `admin-`, `rep-`, `canvas-`/`studio-`), and assert in the same
      boundary test that no class name is defined in two areas' stylesheets.
- [x] 1.13 Delete `packages/app`.

## 2. The studio area

- [x] 2.1 Widen `src/api/types.ts`'s `ClientError` to the union of every server
      error type, adding studio's seven (`request-shape`, `not-found`,
      `draft-conflict`, `migration-plan`, `publish-validation`,
      `cross-process-validation`, and its `validation` payload). Extend
      `parseErrorBody` in `src/api/client.ts` to map them. Fix whatever
      exhaustive switch in the app area's `errors.ts` the widening breaks.
- [x] 2.2 Point the studio area's API functions at `src/api/`, keeping its own
      route functions and its own domain types in place. `src/api/` itself
      already exists: step 1 created it with `API_BASE`, `AppClientError`,
      `parseErrorBody`, `request` and `login`, because the shell owns the login
      screen and must not import downward from an area.
- [x] 2.3 Move `packages/studio/src` to `src/areas/studio/`, drop its `login`
      route case, and confirm `/studio/processes/:processId/migrate/:from/:to`
      round-trips through the shell unchanged.
- [x] 2.4 Move the studio tests into `packages/web/test/`, folding its
      `session`, `routing` and `vite-config` tests into the shared three.
- [x] 2.5 Delete `packages/studio`.

## 3. The admin area

- [x] 3.1 Move `packages/admin/src` to `src/areas/admin/`, drop its `login`
      route case, and point it at `src/api/` and `src/i18n/`.
- [x] 3.2 Move the admin tests, folding the duplicate three.
- [x] 3.3 Delete `packages/admin`.

## 4. The reporting area

- [x] 4.1 Move `packages/reporting/src` to `src/areas/reporting/`, drop its
      `login` route case, and point it at `src/api/` and `src/i18n/`.
- [x] 4.2 Move the reporting tests. Its `boundaries.test.ts` checks `form-ui`'s
      absence from a manifest that now serves every area, so convert that and
      the matching admin check into import scans over each area's own
      directory; keep the reporting-routes-only and no-mutating-method
      assertions as they are.
- [x] 4.3 Delete `packages/reporting`.

## 5. Cleanup

- [x] 5.1 Update the devcontainer's `CORS_ALLOWED_ORIGINS` to the single dev
      origin.
- [x] 5.2 Drop the `PACKAGE` build argument from `docker/frontend.Dockerfile`
      and build `packages/web`; check its nginx config falls back to
      `index.html` for every area prefix.
- [x] 5.3 Update root scripts and any `--filter` globs that named the four
      packages.
- [x] 5.4 Update `docs/current-state.md`, CLAUDE.md's repository layout,
      `openspec/config.yaml`'s project context, and ROADMAP.md item 12.
- [x] 5.6 Order browser navigations ahead of route matching in
      `src/http/server.ts`, via `static.ts::isNavigationRequest`, because
      `/admin/outbox`, `/admin/timers` and `/admin/users` name both an admin
      screen and a `GET` admin route. Cover it in `test/http-static.test.ts`.
- [x] 5.5 Grep the whole tree for `packages/app`, `packages/admin`,
      `packages/studio` and `packages/reporting`; every remaining hit must be
      an intentional historical reference in an archived change.

## 6. Verification

- [x] 6.1 Run `bun run typecheck` in the devcontainer; it passes with no errors.
- [x] 6.2 Run the FULL `bun test` suite in the devcontainer with `DATABASE_URL`
      set, never a single-file rerun, and confirm the skip count is what a
      DB-backed run should show, not a silent skip of every DB suite.
- [x] 6.3 Run `vite build` for `packages/web` and confirm it emits one chunk per
      area plus the shell.
- [x] 6.4 Start the dev server and walk one screen in each of the four areas,
      signing in once, switching areas from the account menu.
