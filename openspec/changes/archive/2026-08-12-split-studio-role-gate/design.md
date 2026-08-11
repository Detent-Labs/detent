## Context

See `proposal.md` for motivation. What follows is the ground the approach rests
on.

The studio area already carries a per-screen role map. Stage 27d added
`ROUTE_ROLE` to `packages/web/src/areas/studio/routing.ts` when the templates
screen landed. It mirrors the admin area's map. Area entry reads
`REQUIRED_ROLE` in `packages/web/src/shell/areas.ts`, which already carries a
set of roles per area.

Server-side, `src/http/studio-routes.ts` calls `requireRole(actor,
DEVELOPER_ROLE)` in nine handlers. One helper, `requireEitherStudioRole`, admits
`system:templates` or `system:developer` on three reads. The comment above it
states its own design rule. It names one specific pair, so a later route cannot
reach for it and quietly widen itself.

Two facts about the current wiring shape the approach.

`GET /registry` has two consumers, not one. `ToolsScreen` calls it directly.
`panels/shared/useRegistry.ts` also calls it. `StepsPanel` and
`DataSourcesPanel` consume that hook. They build the plugin-config form inside
the canvas inspector from it.

`GET /processes/:processId/versions` needs a session and no role at all
(`src/http/routes.ts::handleListVersions`). Its sibling, the version body,
needs a studio role.

## Goals / Non-Goals

**Goals:**

- One reserved role that reaches the authoring subset and nothing else.
- Each studio screen and each studio route states its own admitting roles.
- No account loses a route or a screen.

**Non-Goals:**

- No role hierarchy. `authorization` states that no reserved role implies
  another, and this change does not open that question.
- No new authoring screen and no new route. Only the gates move.
- No i18n work. `MissingRole` keeps its hardcoded English, which every studio
  screen already shares.

## Decisions

### The role is `system:author`

`docs/authoring-guide.md` already addresses a "process author". `CLAUDE.md`
names the studio's audience the developer. So `author` names the new job
without colliding with the old one.

Rejected: `system:analyst`, which ties the role to one organization's job
title. Rejected: `system:studio`, which names the area rather than the work. It
would then have to explain why a template curator inside the same area does not
hold it.

### The change widens; it never narrows

`system:developer` still reaches every route and screen it reaches today. The
new role adds a second admitting role on the authoring subset.

Rejected: making `system:developer` the migration-and-registry role only, and
moving authoring wholly to `system:author`. That reads cleaner. It also breaks
every seeded account, every existing test and every deployment on the day it
lands. The gain is a tidier role table. The cost is a migration nobody asked
for.

### Two named predicates, no general `requireAnyRole`

`src/http/studio-routes.ts` gets:

- `requireAuthoring(actor)`, admitting `AUTHOR_ROLE` or `DEVELOPER_ROLE`.
- `requireStudioRead(actor)`, admitting those two or `TEMPLATES_ROLE`. This
  renames `requireEitherStudioRole` and adds one role to it.

`requireRole(actor, DEVELOPER_ROLE)` stays in place on the three migration
routes.

A general `requireAnyRole(actor, roles)` would let a new route assemble its own
role set inline. No reviewer reads such a line as a policy decision. The
existing helper's comment already rejects that, and this change keeps the rule.

### `GET /registry` widens while the Tools screen does not

The route and the screen carry different gates on purpose. An author who cannot
call the route loses the plugin-config form. That author falls back to a raw
JSON textarea for every action config. Granting exactly that capability is why
the role exists.

The Tools screen is a different thing. It shows the running server's registry
listing beside a CEL scratchpad, for a developer inspecting a deployment. It
stays behind `system:developer`.

Rejected: splitting `GET /registry` into an author-facing schema route and a
developer-facing listing route. Two routes over one map, to gate a response a
developer already reads in full, buys nothing.

### The author reaches the version list, not migration planning

`GET /processes/:processId/versions` already answers any session. Refusing the
versions screen to an author would hide a list they can read with `curl`. The
version body read widens to match, so the diff works.

Migration planning is the line. It rewrites the state of every running instance
on a version, and it stays behind `system:developer`.

`VersionsScreen` carries a button that navigates to the migration screen
(`VersionsScreen.tsx:227`). That button SHALL render only for an actor holding
`system:developer`. Without that, an author meets a refusal screen from a
control the product offered them.

### The studio `ROUTE_ROLE` map carries a set, the admin map keeps one string

Four studio screens admit two roles each. One string per screen no longer
expresses the map. The studio map becomes `Record<Route["name"], readonly
string[]>`, and `root.tsx` checks membership rather than equality.

The admin area's map stays a single string. Its two roles partition its screens
cleanly, so a set there would be a shape with no second element. Changing it
would touch a file this change has no other reason to open.

Rejected: keeping one string per studio screen and granting `system:author` to
every developer account. That is implication by another name, and
`authorization` forbids it.

### `MissingRole` names the roles, plural

The component takes the screen's role list and states it. A screen admitting two
roles must not name only one. An author denied the Tools screen would otherwise
read that they need a role they may already hold.

### No second stranded-on-default redirect

An actor holding only `system:author` lands on `processes`, which the map
admits. The existing curator redirect covers the only stranding case there is.

### Two routes outside the studio prefix widen with it

The studio area calls two routes that no studio prefix covers. Both already
carry `system:developer` for the studio's sake, and both refuse an author until
this work lands.

`GET /admin/data-lists` fills the `"db.list"` picker in the data-source panel
(`areas/studio/api/client.ts:190`). Its read predicate sits at
`src/http/admin-routes.ts:407`. Without the author role there, an author cannot
bind a field to a data list. That binding is a no-code path the role exists to
open.

`GET /instances/:id/record` renders beside the Player, and `studio-player`
requires that panel. `src/runtime/api.ts:1049` admits it on `DEVELOPER_ROLE`
plus `instance.startedBy === actor.id`. Without the author role there, an
author drives a working form beside a 403 panel.

Both widen by adding one role to an existing predicate. Neither data list write
moves, and neither fallback drops its starter condition.

Rejected: routing the picker through a new studio-prefixed proxy route. That
adds a second way to read one table, to avoid naming one role in one predicate.

### `docs/openapi.yaml` stays untouched

`http-api-documentation` states the document SHALL NOT carry `admin/*`,
`drafts/*`, `migration-plans/*` or `registry`, with a scenario asserting their
absence. Every route whose gate moves sits on that list. The one documented
route this work touches, `GET /processes/:processId/versions`, keeps its
session-only gate.

## Risks / Trade-offs

- **A screen the author reaches calls a route the author does not.** → Walk the
  calls each screen makes before implementing. Cover the walk with the route
  tests in `test/http-studio.test.ts`. The known set: the process list calls
  `GET /drafts`, `GET /processes` and `GET /templates`. The editor calls the
  draft routes and `GET /registry`. The versions screen calls `GET
  /processes/:id/versions` and the version body. The Player calls the
  participant instance routes, which need a session and no reserved role.
- **A denied screen still shows in the nav.** → The nav renders per role
  already. The Tools button gains the same treatment the templates button has.
- **The seeded account set drifts from the reserved role set.** →
  `test/seed-demo-users.test.ts` already reads `DEMO_USERS`, and
  `database-seed-script` states the rule. Add the row in this change.
- **Docs state "seven reserved roles" in several files.** →
  `openspec/config.yaml`, `README.md` and `docs/current-state.md` each carry a
  role list. The tasks name all three.
- **The admin Users screen hardcodes the reserved roles.** → Add the eighth
  entry to `RESERVED_ROLES`. That screen must name the reserved roles, per
  `admin-app`. The requirement itself names no count, so it needs no delta.
- **A browser walk is the only check that catches an offered-then-refused
  control.** → The last change earned that lesson. Walk the studio area four
  times. Walk it as an author, as a developer, as a curator, and as an account
  holding two of the three.

## Migration Plan

No schema change and no data migration. `auth_users.roles` is already a plain
`string[]`. The new role therefore needs no column and no backfill.

Existing accounts keep every role they hold. They reach everything they reached.
An operator grants the new role with `src/auth/cli.ts set-roles`. A local
database gets its author demo account from the seed script.

Rollback is a revert. Nothing persists that a revert would strand. No account
holding `system:author` gains anything from the old code, and no account loses
anything it had.

## Open Questions

None block the work. Two sit beyond it, and neither changes a spec, the
approach or a task here.

- Should a later stage serve the reserved role list from a route? Three files
  hardcode it today, so `UsersScreen.tsx` and `src/auth/authorize.ts` drift.
  The answer does not change what this work builds.
- Does `system:author` belong in the multi-tenancy design's role model
  (`open-work-priority.md` item 5)? That design keeps roles per tenant
  database, so an eighth role rides along unchanged.
