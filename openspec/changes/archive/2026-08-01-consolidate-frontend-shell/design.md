<!-- antislop: allow-file sentence-length run-ons passive-voice em-dash synonym-rotation -->

## Context

See proposal.md - Why. Four facts from the code shape the approach.

The four `routing.ts` modules are structurally identical: a `Route` union, a
pure `matchRoute(path)`, a pure `routePath(route)`, and a copy of the same
30-line `useRoute` History-API hook. All four assume they own `/`
(`routePath({name:"processes"})` returns `"/"` in Studio, `"/"` for `tasks` in
app).

The four `session.ts` modules are the same file with a different storage key.
Three of the four already carry `roles`; only `packages/app` does not.
`POST /auth/login` returns `{token, expiresAt, actor: {id, roles}}`
(`src/auth/login.ts:101`), so `expiresAt` is available and currently discarded
by all four.

The four `api/client.ts` modules each define `API_BASE`, a `ClientError`
subclass, `parseErrorBody` and an authenticated `request`. Their `types.ts`
files repeat nine type names, but mostly not as duplication: each package
declares only the fields it reads, off different endpoints with different
projections.

`serve-web-assets` already serves any single-page bundle from `WEB_ROOT`, whose
default is `packages/web/dist`. Nothing in the engine has to change here.

## Goals / Non-Goals

**Goals:**

- One package, one build, one login, one session, one address.
- A boundary that a reviewer can check mechanically: an area imports only
  upward.
- Intermediate states that ship. `AreaNav` and the `/` redirect list only
  already-migrated areas, and an area not yet migrated stays reachable on its
  old Vite port.

**Non-Goals:**

- Folding `packages/form-ui` in as `src/form/`. It is imported from two sides
  for the whole migration. That is a separate decision after this change.
- Merging the per-area `api/types.ts` domain types. Only `ClientError`,
  `LoginResponse` and `Actor` move up. Pairs that currently look identical stay
  separate, because they are projections of different endpoints and will drift.
- A router dependency. The hand-written History-API hook already works and
  shrinks from four copies to one.
- Any server-side redirect or any backend change at all.
- Preserving old bookmarks or old sessions. See Migration Plan.

## Decisions

### The shell strips the prefix; the four route tables are not rewritten

ROADMAP.md item 12 records, as a finding confirmed against the code, that all
four `matchRoute`/`routePath` pairs are "rewritten, not moved - the largest
hidden cost, and it falls on every step alike". That is avoidable, and this
design avoids it.

The shell owns `location.pathname`. It splits off the first segment as the
area, hands the remainder to that area's own `matchRoute`, and prepends the
prefix to whatever that area's own `routePath` returns:

```
/studio/processes/p1/edit  ->  area "studio", local "/processes/p1/edit"
/studio                    ->  area "studio", local "/"
routePath({name:"processes"}) === "/"  ->  "/studio"
```

Each area keeps its `Route` union, its `matchRoute` and its `routePath`
verbatim, still pure and still tested without a DOM. One generic hook in
`shell/` binds them:

```ts
useAreaRoute<R>(area: Area, match: (path: string) => R, toPath: (route: R) => string)
```

The only edit to an area's route table is deleting its `login` case, which the
shell now owns. Studio's `/processes/:processId/migrate/:from/:to`, which the
roadmap calls the hardest routing case, needs no attention at all: it is
matched by the same regex against the same relative path it sees today.

Alternative considered: teaching each `matchRoute` its own prefix, as the
roadmap assumed. Rejected. It rewrites four working, tested modules, it repeats
the prefix constant in eight places, and it makes every route regex longer for
no behavioural gain.

This finding does not change the ordering the roadmap chose. Studio stays
second, because it remains the largest client and the one most likely to
surface an integration problem while only two areas hang off the shell.

### `ClientError` is one union of every server error type, not three shared names

Found while extracting the shared client: the four `ClientError` declarations
are not the same type wearing four names. The app area declares eleven
variants; the studio area declares nineteen, seven of them
(`request-shape`, `not-found`, `draft-conflict`, `migration-plan`,
`publish-validation`, `cross-process-validation`, plus its own use of
`validation`) that the app area has never heard of. Each package mapped the
subset of server error types its own screens could provoke, and collapsed the
rest into `internal`.

So `ClientError` moves up as the **union of every server error type**, not as a
lowest common denominator. That is what the wire carries: the engine
can answer any area with any of them. Each area keeps its own describer, whose
default branch already covers a variant it does not render specially.

The cost is that widening the app area's union turns any exhaustive `switch`
over it into a compile error, which is the right place to learn it. The
alternative, keeping `ClientError` per area and making the shared `request`
generic over it, buys nothing: the parsing step would still have to know every
variant to produce any of them.

`LoginResponse` and `Actor` move up unchanged. Every domain type stays per
area.

### An area prefix can collide with an API prefix, so navigations are ordered first

Found by serving the real build: `/admin/outbox`, `/admin/timers` and
`/admin/users` are each both an admin screen and a `GET` admin route. Under
`serve-web-assets`' rule that assets sit behind every API route, a reload or a
shared link to those three screens answers `401` JSON instead of the shell.
Three of the admin area's six screens were unreachable by URL.

The fix is to order **navigation** requests ahead of route matching. A browser
top-level navigation carries `Sec-Fetch-Mode: navigate`; a page's own `fetch`
never does. Only navigations take the new path, so the admin area's own request
for `/admin/outbox` still reaches the admin route, unchanged.

Alternative considered: renaming the admin area's prefix. Rejected, it changes
the decided URL scheme to work around a solvable ordering problem, and
`/reporting` would be the next collision.

Alternative considered: moving the engine's `/admin/*` routes. Rejected as a
breaking API change to fix a frontend concern.

The cost is that an API caller sending `Accept: text/html` with no `Sec-Fetch-*`
receives the shell rather than its route's JSON. That is why the test is this
narrow. It carries deltas on `web-asset-serving` and `http-wrapper`.

### One session, one key, roles and expiry included

`shell/session.ts` persists `{token, actorId, roles, expiresAt}` under one key.
`roles` comes from the login response's `actor.roles`, which three of the four
packages already store. `expiresAt` is new to the persisted shape but gates
nothing: `end-user-app` requires, with its own scenario, that the frontend run
no client-side expiry check and treat a `401` as the sole signal that a session
has ended. Recording the value and not consulting it keeps that requirement
intact while matching the shape ROADMAP.md item 12 states. A change that wants
to act on it has the value already and one requirement to revisit.

The four old keys are not read and not migrated. Everyone logs in once more,
once. Writing a migration path for four dev-and-early-installation
`localStorage` keys would cost more than the one login it saves.

### Role gating is display logic, checked in one place

`shell/areas.ts` declares, per area, the role that reveals it: app none beyond
a session, admin `system:admin`, studio `system:developer`, reporting
`system:reports`. The same table drives `AreaNav`, the `/` redirect and the
guard on a direct `/admin/...` hit.

It is display logic only. The server still answers 403, and this change adds no
backend enforcement, because the HTTP layer already has it.

An actor whose roles permit exactly one area sees no switcher at all, so a
participant sees no trace of the consolidation. Current location shows in the
URL prefix and the document title, not as a label in the header.

### One chunk per area, by route-level `React.lazy`

Each area exposes one lazily-imported root component. This is what answers the
bundle-size objection the roadmap's earlier draft raised against a single
package: a participant loading `/app` never downloads the Studio canvas.

`React.lazy` is React's own API. It needs no dependency and no Vite
configuration: Vite code-splits on the dynamic `import()` it compiles to.

### An area never imports from another area

The one structural rule. It is expressible as a path pattern, so a test can
enforce it: no file under `src/areas/<a>/` may import from `src/areas/<b>/` for
`a !== b`. Shared code moves up into `shell/`, `api/` or `i18n/`, or it stays
duplicated on purpose.

`packages/reporting/test/boundaries.test.ts` already does this kind of
source-scanning check for that package, so the pattern is established here
rather than invented.

The rule holds on day one: no file in any of the four packages imports from
another of them today, so the merge starts compliant rather than needing a
cleanup pass first.

Two of that test's assertions have to change form. It checks that `form-ui` is
absent from `packages/reporting/package.json`, and the admin spec checks the
same for `packages/admin`. One manifest now serves every area, and the app area
does need `form-ui`, so both checks become import scans over the area's own
directory. The delta specs for `admin-app` and `reporting-app` say so.

### The nginx frontend image stays, minus its `PACKAGE` build argument

`docker/frontend.Dockerfile` keeps working and keeps its nginx config. Its
`PACKAGE` build argument goes away, because there is exactly one package to
build.

Alternative considered: deleting the image, now that `serve-web-assets` lets
the engine serve the bundle from `WEB_ROOT`. Rejected as out of scope. That
change's own design states it adds a second, single-origin option rather than
replacing the nginx path, and which one an installation uses is a deployment
decision this change has no reason to make for it.

### `base: "/"` and no absolute URLs in the build

A reverse proxy in front stays possible. That is what forbids absolute URLs in
the build, forbids a server-side `/` redirect, and is why `WEB_ROOT` being
absent has to stay a supported configuration. `VITE_API_URL` keeps working for
dev against the container's engine, which is also why `CORS_ALLOWED_ORIGINS`
keeps a dev entry.

CSP needs no new work. The policy is a build-time `<meta>` tag from
`vite.config.ts`'s `contentSecurityPolicy()`, and same-origin is already its
`connect-src 'self'` default. One config now emits it instead of four.

## Risks / Trade-offs

- **A half-migrated tree has two frontends for the same audience.** Steps 1 to 4
  each delete one old package as they land, and `AreaNav` and the `/` redirect
  list only migrated areas. An unmigrated area keeps its own port and its own
  session key until its step runs.
- **Every frontend URL changes.** No redirect from an old path is provided.
  Acceptable: the old paths lived on four dev origins that are going away
  anyway, so a redirect would have nowhere to live.
- **One build means one deploy for all four audiences.** This is the delivery
  rule the design accepts, not a defect: an installation always installs
  everything and gates areas by role.
- **Twelve specs carry requirement text naming the old package paths.** Missing
  one leaves a main spec quietly wrong. The task list names each spec, and the
  final task greps the whole `openspec/specs/` tree for the four old paths.
- **A merge of four `app.css` files could collide on class names.** Measured
  before committing to the approach: across the four stylesheets' 153 distinct
  class names there is no collision at all. Each package already prefixes its
  own (`app-`, `admin-`, `rep-`, and Studio's `canvas-`/`studio-`). The one
  apparent overlap, `app-stamp`, is a comment in `packages/admin/src/app.css`
  referring to the app's rule, not a second definition. The shell still owns the
  chrome CSS and each area keeps its own stylesheet, so the property is
  preserved rather than relied on by luck.

## Migration Plan

Step order follows ROADMAP.md item 12, and each step leaves the tree shippable:

1. `packages/web` with `shell/` plus `areas/app`; delete `packages/app`. This
   step carries the prefix-routing contract and the consolidated session.
2. `areas/studio`; extract `src/api/` here, from the largest client (278 lines,
   against app's 166). Delete `packages/studio`.
3. `areas/admin`. Delete `packages/admin`.
4. `areas/reporting`. Delete `packages/reporting`.
5. Cleanup: root scripts, the devcontainer's `CORS_ALLOWED_ORIGINS`,
   `docker/frontend.Dockerfile` and its nginx config, `docs/current-state.md`,
   CLAUDE.md's repository layout, `openspec/config.yaml`, and ROADMAP.md item
   12.

Rollback: each step is one commit that adds an area and deletes one package.
Reverting a step restores that package and its port.

Sessions and bookmarks do not migrate. See Decisions.

## Open Questions

- Should `packages/form-ui` fold in as `src/form/`? Deliberately after this
  change, per the roadmap. It changes no requirement here and no task in this
  list.
