## Why

The Studio Versions screen decides whether to offer "Plan migration" from a
static role list, `ROUTE_ROLE.migrate` (`system:developer` only). It does not
ask `can(actor, "migrate", processId, db)`, the process-scoped seam the
migration-plan routes already enforce. An author holding a scoped `migrate`
grant for one process can never see the control. The route it leads to would
accept the call.

This is stage 40's third and last open piece (ROADMAP.md). An audit of every
client-side role check in `packages/web` scoped it down to this one spot.
Publish and Cancel already render unconditionally and let the server's 403
carry the real gate. Area entry stays global-role-only, by decision. Migration
Plan is the one place left where a client role check disagrees with the
server.

## What Changes

- `GET /drafts/:processId` returns one new field, `canPlanMigration:
  boolean`. The engine computes it via the already-shipped `can(actor,
  "migrate", processId, db)`.
- The Studio Versions screen reads that field for its "Plan migration"
  control. It no longer reads the role-derived `mayPlanMigration` prop
  threaded down from `ROUTE_ROLE`.
- `ROUTE_ROLE.migrate` (`packages/web/src/areas/studio/routing.ts`) widens
  from `["system:developer"]` to `AUTHORING`: `system:developer` or
  `system:author`. A grant-holding author can then navigate to the migrate
  route at all. Reaching the route no longer implies permission to use it.
  The widened screen falls back to the same 403 handling Publish and Cancel
  already use. That handling stays in place, graceful and in place, for an
  actor holding neither the role nor a grant.
- `studio-app`'s existing rule refuses the migration screen to any
  author-only actor outright. The rule now admits that author, the same
  way it already admits the versions screen and the player. Reaching the
  screen no longer depends on a process-specific grant. Whether the
  actor's action on that screen succeeds stays a `studio-migration-planning`
  question.
- `studio-migration-planning`'s spec text names `system:developer` as the
  sole gate on its three routes. The routes have enforced the grant path
  too since the permission-seam change shipped; that change never touched
  this file. This proposal states the rule the code already runs:
  `system:developer` or a scoped grant.
- `Tools` (`ROUTE_ROLE.tools`) stays unchanged. It names no process, so no
  grant type applies to it.
- Server-side enforcement stays unchanged. `requirePermission(actor,
  "migrate", ...)` on the three migration-plan routes keeps its current
  shape. This proposal only makes the client's show-or-hide decision agree
  with what that check already allows.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `process-drafts`: `GET /drafts/:processId`'s response gains
  `canPlanMigration`, a field beyond what the matching `PUT` sent.
- `studio-app`: the migration screen joins the four screens an author-only
  actor already reaches. It drops the earlier unconditional refusal of
  that actor. Whether the actor's action there succeeds stays outside
  this capability.
- `studio-migration-planning`: states the access rule the three
  migration-plan and orphan-key routes already enforce. The rule is
  `system:developer` or a scoped `migrate` grant for the named process, not
  `system:developer` alone. This closes a spec-to-code drift the
  permission-seam change left behind.

## Impact

- `src/http/studio-routes.ts` (`handleGetDraft`): compute and attach
  `canPlanMigration`.
- `packages/web/src/areas/studio/api/types.ts`: add the field to the draft
  response type.
- `packages/web/src/areas/studio/screens/VersionsScreen.tsx`: source
  `mayPlanMigration` from the draft response instead of a prop.
- `packages/web/src/areas/studio/root.tsx`: no longer threads a
  `ROUTE_ROLE`-derived boolean into `VersionsScreen` for this purpose.
- `packages/web/src/areas/studio/routing.ts`: widen `ROUTE_ROLE.migrate`.
- `openspec/specs/process-drafts/spec.md`,
  `openspec/specs/studio-app/spec.md`,
  `openspec/specs/studio-migration-planning/spec.md`: delta specs.
- `test/http-studio.test.ts`, `packages/web/test/studio-routing.test.ts`:
  test coverage for the new field and the widened route.
- `docs/decisions.md`, `tmp/open-work-priority.md`: close stage 40's third
  open piece, beside `ROADMAP.md`.
- Test coverage: an author with a scoped `migrate` grant sees and can use
  the control. An author with neither the role nor a grant sees neither. A
  direct call from that second actor still gets the server's existing 403.
