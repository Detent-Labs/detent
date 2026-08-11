## Why

The studio area sits behind one coarse role. `system:developer` reaches the
drafts list, the canvas and the form editor. It reaches the Player and the
version list. It reaches migration planning and the registry Tools screen too.
So granting
studio access to a business analyst grants migration planning with it. That
analyst is stage 27's whole target audience. Stage 27a recorded the gap when
the plugin-config form shipped.

## What Changes

- Add an eighth reserved role, `AUTHOR_ROLE = "system:author"`. It implies
  nothing and nothing implies it, the same shape the other seven take.
- Split the studio route gate in `src/http/studio-routes.ts`. Two named
  helpers replace the single `requireEitherStudioRole`:
  - `requireAuthoring` admits `system:author` or `system:developer`. It gates
    the four draft routes, the publish route and `GET /registry`. The publish
    route keeps `system:publish` beside it.
  - `requireStudioRead` admits `system:author`, `system:developer` or
    `system:templates`. It gates the two template reads and the published
    version body.
  - `requireRole(actor, DEVELOPER_ROLE)` stays alone on three routes. Those
    are the two migration-plan routes and the orphan-key scan.
- Widen `GET /registry` without widening the Tools screen. The route serves
  two callers. The Tools screen renders the registry listing. The inspector's
  `StepsPanel` and `DataSourcesPanel` read the same response for the
  plugin-config form. An author who cannot call the route loses no-code
  action config. So the route admits the author role, while `ROUTE_ROLE.tools`
  stays `system:developer`.
- Give each studio screen its own entry in the `ROUTE_ROLE` map stage 27d
  added. The author reaches the drafts list, the `edit` screen, the version
  list and the Player. Migration planning and the Tools screen stay
  `system:developer`. The templates screen stays `system:templates`.
- Add `system:author` to `REQUIRED_ROLE.studio` in `shell/areas.ts`. The area
  then admits three roles rather than two.
- Show the nav buttons the actor's roles reach. Keep `MissingRole` for a
  denied screen. An actor holding only `system:author` lands on the drafts
  list, which that role reads. So the curator's stranded-on-default redirect
  needs no second case.
- Widen two routes outside the studio prefix that studio screens call. Both
  gain `system:author`.
  - `GET /admin/data-lists` fills the data-source panel's `"db.list"` picker.
    It already admits `system:developer` for that reason. No data list write
    moves.
  - `GET /instances/:id/record` renders beside the Player. Its starter fallback
    already admits `system:developer`, and it keeps the starter condition.
- Add `system:author` to the hardcoded `RESERVED_ROLES` list in the admin
  area's Users screen. `admin-app` requires that screen to name the reserved
  roles. So the list has to carry the eighth.
- Seed a demo account holding `system:author`, beside the seven the seed
  script already writes.

No account loses access. `system:developer` keeps every route and every screen
it reaches today. This is a widening.

## Capabilities

### New Capabilities

None. This adds a role to an existing model and re-gates existing routes and
screens.

### Modified Capabilities

- `authorization`: an eighth reserved role, the two studio helper predicates,
  and which routes each one gates.
- `unified-shell`: `REQUIRED_ROLE.studio` admits a third role, and the studio
  `ROUTE_ROLE` requirement names four author-reachable screens.
- `studio-app`: area entry, the per-screen role map, and the nav an actor
  holding only `system:author` sees.
- `studio-tools`: `GET /registry` admits the author role, while the Tools
  screen stays behind `system:developer`.
- `studio-player`: an actor holding `system:author` reaches the Player.
- `process-drafts`: the four draft routes admit `system:author` beside
  `system:developer`.
- `process-templates`: the two template reads admit `system:author`, so an
  author can seed a draft from a template.
- `process-version-inspection`: `GET /processes/:processId/versions/:version`
  admits `system:author`.
- `studio-publish`: `POST /drafts/:processId/publish` requires an authoring
  role plus `system:publish`, rather than `system:developer` plus
  `system:publish`.
- `data-list-administration`: the data list reads admit `system:author`, so
  the data-source panel's picker works for an author.
- `database-seed-script`: an eighth demo user holding `system:author`.

## Impact

Engine and HTTP wrapper:

- `src/auth/authorize.ts`, the new constant.
- `src/http/studio-routes.ts`, the two helpers and the per-route calls.
- `src/http/admin-routes.ts`, the data list read predicate.
- `src/runtime/api.ts`, `getInstanceRecord`'s starter fallback.

Browser package:

- `packages/web/src/shell/areas.ts`, `REQUIRED_ROLE.studio`.
- `packages/web/src/areas/studio/routing.ts`, the `ROUTE_ROLE` values.
- `packages/web/src/areas/studio/root.tsx`, the nav's per-role rendering.
- `packages/web/src/areas/studio/screens/VersionsScreen.tsx`, the
  migration-plan button.
- `packages/web/src/areas/admin/screens/UsersScreen.tsx`, `RESERVED_ROLES`.

Tests:

- `test/auth-authorize.test.ts`, the constant and what it does not imply.
- `test/http-studio.test.ts`, each studio route against each of the three
  roles, admitted and refused.
- `packages/web/test/studio-routing.test.ts`, the `ROUTE_ROLE` values.
- `packages/web/test/session.test.ts`, the area-entry and landing assertions.
- `test/runtime-api.test.ts`, the record read's starter fallback.
- `test/seed-demo-users.test.ts`, the demo account count.

Docs and scripts:

- `docs/current-state.md` and `README.md`.
- `ROADMAP.md`, which records the answer to stage 27a's open question.
- `openspec/config.yaml`, whose context block counts the reserved roles.
- The seed script and `scripts/dev-up.*`.

`docs/openapi.yaml` stays untouched. `http-api-documentation` states that the
document SHALL NOT carry `admin/*`, `drafts/*`, `migration-plans/*` or
`registry`. Every route whose gate moves sits on that list.

Out of scope: the `MissingRole` screen's hardcoded English. Every studio screen
shares that today, and the studio i18n catalog covers it separately.
