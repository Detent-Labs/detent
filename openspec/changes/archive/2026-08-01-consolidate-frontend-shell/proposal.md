<!-- antislop: allow-file sentence-length run-ons passive-voice em-dash synonym-rotation -->

## Why

An installation must present itself as one system at one address, not four
systems with four ports and four logins. Today `packages/app`,
`packages/admin`, `packages/studio` and `packages/reporting` are four
independently-built Vite SPAs, each with its own `session.ts`, `routing.ts`,
`LoginScreen.tsx`, `ErrorBoundary.tsx`, `app.css`, `main.tsx`, `index.html` and
`vite.config.ts`. A user with two roles logs in twice, at two addresses, and
holds two unrelated tokens in two `localStorage` keys.

`serve-web-assets` (roadmap #12 step 0) already gave the engine a static root
to serve one bundle from. This change produces that bundle. It is steps 1 to 5
of ROADMAP.md item 12, whose design was decided 2026-08-01.

The end state is smaller than today, not larger: one `vite.config.ts`, one
`index.html`, one `main.tsx`, one routing module, one session module, one
`LoginScreen`, one `ErrorBoundary`. Twelve of the 39 frontend test files (four
each of `session.test.ts`, `routing.test.ts`, `vite-config.test.ts`) become
three.

## What Changes

- **BREAKING** for anyone bookmarking a frontend: the four dev origins
  (`localhost:5173`-`5176`) become one, and every URL gains an area prefix.
  `/tasks/:id` becomes `/app/tasks/:id`, and Studio's `/processes/:id/edit`
  becomes `/studio/processes/:id/edit`.
- **BREAKING** for a logged-in browser: the four `localStorage` session keys
  (`app.session`, `admin.session`, `studio.session`, `reporting.session`)
  become one. Everyone logs in once more, once.
- One new workspace package `packages/web`, named `web` because `form-ui`
  already occupies the shorter name. `packages/app`, `packages/admin`,
  `packages/studio` and `packages/reporting` are deleted.
- Layout: `src/main.tsx`; `src/shell/` (prefix routing, session, `LoginScreen`,
  `ErrorBoundary`, `AreaNav`, chrome CSS); `src/api/` (`API_BASE`,
  `ClientError`, `parseErrorBody`, authenticated fetch); `src/i18n/` (locale
  selection and persistence; catalogs stay per area); and
  `src/areas/{app,admin,studio,reporting}/`, each keeping its own `screens/`
  and its own `api/` route functions and `types.ts`.
- One rule keeps the merge from tangling, and it is expressible as a path
  pattern: an area never imports from another area, only upward into `shell/`,
  `api/`, `i18n/`.
- URL scheme: `/login`; `/app/*`, `/admin/*`, `/studio/*`, `/reporting/*`. `/`
  redirects by role client-side, never as a server 302, because the engine must
  not need to know its own outward address. An unknown prefix redirects to `/`.
- Role gating mirrors what the HTTP layer already enforces: app needs only a
  session, admin `system:admin`, studio `system:developer`, reporting
  `system:reports`. It is display logic only. The server still answers 403 on a
  direct hit, and no backend change is needed.
- The area switcher sits in the account menu beside language and logout, lists
  only the other permitted areas, and is absent for an actor with one area. A
  participant sees no trace of the consolidation.
- Route-level `React.lazy` gives one chunk per area, so a participant never
  downloads the Studio canvas.
- `packages/form-ui` stays a separate package. It is imported from two sides
  for the whole migration and must not move.

## Capabilities

### New Capabilities

- `unified-shell`: the one package and its URL scheme, prefix routing, the
  single session with roles and expiry, client-side role gating and the `/`
  redirect, the area switcher, per-area lazy chunks, and the
  areas-never-import-areas boundary.

### Modified Capabilities

- `end-user-app`, `admin-app`, `studio-app`, `reporting-app`: each states that
  its area is its own workspace package with its own login, session and
  routing. All four now name one package, one login and one session, and keep
  every screen requirement unchanged.
- `frontend-security-headers`: the policy is emitted by one Vite config for one
  package, not four.
- `development-toolchain`: one dev server on one port replaces the four fixed
  ports 5173-5176, and the workspace has one fewer frontend package to
  typecheck, not four more.
- `production-docker-images`: the frontend image no longer builds one package
  per invocation, because exactly one package produces a bundle.
- `form-ui`, `spa-accessibility`, `studio-canvas`, `studio-player`,
  `studio-tools`: requirement text names source paths under the four old
  packages; those paths move under `packages/web/src/areas/`.

## Impact

- Created: `packages/web` (one `package.json`, `vite.config.ts`, `index.html`,
  `tsconfig.json`, plus `src/` and `test/`).
- Deleted: `packages/app`, `packages/admin`, `packages/studio`,
  `packages/reporting`.
- Roughly 11,800 lines of frontend source move. Most move verbatim; the changed
  parts are the shell, the four route tables losing their `login` case, and
  import paths.
- Root `package.json` (workspace globs already cover `packages/*`), the
  devcontainer's `CORS_ALLOWED_ORIGINS`, `docker/frontend.Dockerfile` and its
  nginx config, `docs/current-state.md`, CLAUDE.md's repository layout,
  `openspec/config.yaml`'s project context, and ROADMAP.md item 12.
- Unchanged: every engine module, every HTTP route, `packages/form-ui`, and
  `WEB_ROOT`'s default, which already points at `packages/web/dist`.
