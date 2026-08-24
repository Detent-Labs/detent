## Why

`group-based-assignment` (a separate, parallel change) adds a groups store, a
deletion guard, and `/admin/groups*` routes to the engine. It ships no
operator-facing screen for any of it. An operator cannot create a group, add
members, set its scope, or resolve a blocked deletion. The routes exist with
no screen to reach them. This change adds that screen.

**Dependency**: this change requires `group-based-assignment` to reach
implementation first. It treats that change's output as a given API. That
output has three pieces. The first is the groups store: `group_id`, `name`,
a `scope` of `{ type: "global" }` or `{ type: "processes", processIds:
string[] }`, and a member list. The second is the deletion guard. The third
is the `/admin/groups*` routes: list, create, rename, set members, set
scope, delete.

This change adds no engine, schema, or API surface of its own.
`group-based-assignment`'s own tasks must finish before this change's tasks
can start. Nothing in this change's task list runs before that.

## What Changes

- Add a `GroupsScreen` to the admin area (`/groups`), gated by `system:admin`
  like every other Operations screen. It lists groups: name, scope, member
  count. It offers create, rename, delete, and inline member add and delete.
  It also offers scope editing, switching a group between global and a
  specific process list. The inline-edit interaction mirrors the one
  `UsersScreen` already uses for roles.
- Add a process-filter picker to the same screen. It follows the plain-select
  pattern `MigrationsScreen` already uses. The picker narrows the visible
  groups to global groups plus groups scoped to the selected process. A
  group created while the filter is active pre-fills its scope to that one
  process.
- Surface the deletion guard's refusal in the screen. A published process
  reference can block a delete. When it does, the screen names which
  process or processes block it.
- Add one link inside Studio's process-identity header bar, "Manage
  assignment groups for this process." The link opens the admin
  `GroupsScreen`, pre-filtered to the current process through a query
  parameter. Studio duplicates no group CRUD of its own.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `admin-app`: adds the Groups screen. It covers list, create, rename,
  delete with the deletion-guard message, inline member editing, scope
  editing, and the process-filter picker. It follows the existing
  Operations-screen conventions: refresh on focus, no polling, the
  `system:admin` gate.
- `studio-canvas`: adds the "Manage assignment groups for this process"
  link to the process-identity header bar's `⋮` menu. The link sits under
  the existing "Process, saved with the draft" group.

## Impact

- New files: `packages/web/src/areas/admin/screens/GroupsScreen.tsx` and a
  `groupsLogic.ts` module beside it, mirroring `usersLogic.ts` and
  `migrationsLogic.ts`. New i18n catalog keys land in the admin area's
  catalog, `packages/web/src/i18n/catalogs/admin.ts`. A new `groups` route
  and tab land in
  `packages/web/src/areas/admin/routing.ts` and `root.tsx`. New functions in
  `packages/web/src/areas/admin/api/client.ts` call the
  `group-based-assignment` change's `/admin/groups*` routes.
  `packages/web/test/admin-groupsLogic.test.ts` is new too, a sibling to
  `admin-usersLogic.test.ts` and `admin-migrationsLogic.test.ts`.
<!-- antislop: allow sentence-length run-ons -->
<!-- The linter's known code-span merge bug inflates both the counted sentence length and the counted clause count below, since several sentences here start or end right beside a code span; none actually runs three clauses or past 20 words. -->
- Modified files: `packages/web/src/areas/studio/panels/ProcessHeaderBar.tsx`
  gains the new link and the `processId`/`go` props it needs.
  `packages/web/src/areas/studio/root.tsx` gains the `go` plumbing too: it
  currently passes `navigate`, derived from `go`, into `EditScreen`, but
  never `go` itself, and must pass `go` alongside it.
  `packages/web/src/areas/studio/screens/EditScreen.tsx` gains the same
  prop, threaded through its `EditScreenProps` and `EditorAreaProps`
  interfaces down to `EditorArea`. See `design.md` for that path.
  `packages/web/src/areas/admin/api/types.ts` gains `GroupSummary`,
  `GroupScope` and `GroupPage`. `packages/web/src/i18n/catalogs/studio.ts`
  gains the new link's label key. `packages/web/src/api/types.ts` gains a
  `group-referenced` `ClientError` variant, and `packages/web/src/api/client.ts`
  gains the matching `parseErrorBody` branch, both needed so a structured
  409 from the group-delete guard reaches the screen at all.
  `packages/web/test/admin-routing.test.ts` gains the new `groups` route's
  `matchRoute`/`routePath` coverage too. `docs/current-state.md`'s Unified
  shell routing passage gains a sentence naming the new query-parameter
  precedent this `groups` route introduces.
  `packages/web/src/areas/admin/app.css` gains `.admin-name-editor` and
  `.admin-name-input`, styled like `.admin-field`'s text input, for the
  rename editor's prose-face styling (task 3.7).
- No changes touch `src/schema`, `src/engine`, `src/http`, or any other
  engine-side path. This change calls routes `group-based-assignment`
  defines. It defines none itself.
