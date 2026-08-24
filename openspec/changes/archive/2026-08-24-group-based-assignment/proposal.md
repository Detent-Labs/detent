## Why

The built-in `static` assignment strategy takes a literal list of user ids
typed into each step's config. Reusing the same people across many steps or
processes means duplicating that list by hand everywhere it appears. A
personnel change means hunting down and editing every step that hardcoded an
id.

No group or team concept exists anywhere in the codebase today. This
change adds one: a groups store an author references by id. The engine
resolves it live at every step entry. A membership change therefore touches
the groups store alone and needs no republish of any process.

## What Changes

- Add a `groups` store (`group_id`, `name`, a `scope` of `{ type: "global" }`
  or `{ type: "processes", processIds: string[] }`, and a member list of user
  ids), parallel to `auth_users`. It is independent of `auth_users.roles`, an
  unrelated free-text permission tag `src/auth/grants.ts` reads. This change
  does not touch `roles`.
- Add a deletion guard: the store refuses a delete while any PUBLISHED
  process's `allowedGroups` still references the group.
- Add `ProcessBody.allowedGroups`, an optional `string[]` field (a
  definition-contract change). It lists the group ids a process's steps
  may reference in an assignment config. This needs an `examples/` sweep.
  It needs updates to `docs/authoring-guide.md` and
  `.claude/rules/authoring-invariants.md`.
- Add a new assignment strategy, `org.group-members` (config: `{ groupId:
  string }`), living beside `org.manager-of-starter` in
  `src/engine/assignment-strategies.ts` since it needs `ctx.db`. It resolves
  a group's CURRENT members live on every resolution, and filters out
  disabled accounts. It resolves to an empty array, never a throw, when the
  referenced group no longer exists.
- Add a pure structural publish-time check: every step whose strategy is
  `org.group-members` needs its `config.groupId` in the process's own
  `allowedGroups`.
- Add a database-backed scope publish-time check: every entry in
  `allowedGroups` must name a group that exists. That group's scope must
  also permit this process. This is a hard publish rejection. The check
  runs at the same placement `validateReferences` already occupies in
  `publishBody`, after the hash-hit idempotent no-op return. A
  byte-identical re-publish therefore stays a no-op even if a group's scope
  changed since.
- Add `/admin/groups*` HTTP routes: list, create, rename, set members, set
  scope, delete. `system:admin` gates them, like `/admin/users*`.

Explicitly deferred, not built here:

- A live Studio draft-edit-time authorization check on adding a group to
  `allowedGroups`. Design.md's rationale documents it as future work only.
- Any user interface. A separate change, `admin-groups-screen`, already
  depends on this one's API. Another agent is authoring it in parallel.
- Mixing literal candidates and a group reference in one step's assignment
  config. `static` keeps taking only literal ids. `org.group-members` takes
  only a `groupId`.

## Capabilities

### New Capabilities

- `group-administration`: the groups store, its scope model, the deletion
  guard, and the `/admin/groups*` admin API routes.
- `group-based-assignment`: the `org.group-members` assignment strategy and
  its live-resolution runtime behavior.
- `group-scope-validation`: the database-backed publish-time check that
  every `allowedGroups` entry names a group that exists and whose scope
  permits the publishing process. A third DB-resolving publish-time check,
  alongside `cross-process-validation`'s `validateCrossProcess` and
  `validateProcessChaining`.

### Modified Capabilities

- `definition-contract`: adds the `allowedGroups` field to `ProcessBody`,
  and the structural `groupId`-in-`allowedGroups` compile-pass check. The
  database-backed group-scope check lives under the new
  `group-scope-validation` capability instead (see New Capabilities). It
  runs inside `publishBody`, not `compileProcessBody`, at the same
  placement `cross-process-validation`'s own DB-resolving checks already
  occupy.
- `assignment-strategy-registry`: corrects a pre-existing factual error in
  the base spec. `AssignmentContext` has always carried a required `db`
  field (`src/engine/registry.ts`). One base-spec requirement still states
  no connection or transaction handle travels in the context. This change
  is the second strategy to use `ctx.db`, after `org.manager-of-starter`.
  It corrects the drift instead of adding a third strategy atop an
  inaccurate spec.

## Impact

- `src/engine/store.ts`: `initSchema` gains the `groups` table.
- `src/auth/groups.ts` (new): the groups store's reads and admin writes,
  mirroring `src/auth/users.ts`'s conventions.
- `src/schema/definition.ts`: `ProcessBody` gains an optional
  `allowedGroups: string[]` field.
- `src/schema/compile.ts`: a new structural check joins `structuralIssues`.
- `src/engine/definitions.ts` (`publishBody`): a new database-backed check
  joins the publish path, after the hash-hit no-op return.
- `src/http/errors.ts`: registers the new `GroupScopeValidationError` in
  `ISSUES_ERRORS`, mirroring `RegistryValidationError`.
- `src/engine/assignment-strategies.ts`: the `org.group-members` strategy
  joins `createDefaultAssignmentRegistry`.
- `test/assignment-manager-strategy.test.ts`,
  `test/http-studio.test.ts`: each hardcodes the shipped assignment
  registry's exact key list (`["static", MANAGER_OF_STARTER_STRATEGY_TYPE]`
  and `["static", "org.manager-of-starter"]` respectively); both need
  updating once `org.group-members` becomes a third entry.
- `src/http/admin-routes.ts`, `src/http/server.ts`: new `/admin/groups*`
  routes.
- `examples/`, `docs/authoring-guide.md`,
  `.claude/rules/authoring-invariants.md`, `.claude/rules/process-contract.md`:
  updated for the new field and the two new checks.
- `docs/current-state.md`, `docs/decisions.md`: the assignment-strategy
  roster grows from two entries to three.
- `packages/web/src/areas/studio/draft/load-guard.ts`: schema-sync only
  (the load-time key/shape check gains `allowedGroups`), not a UI or
  screen change.
- `packages/web/src/api/client.ts`, `packages/web/src/areas/studio/errors.ts`,
  `packages/web/test/studio-publishErrors.test.ts`: the new
  `GroupScopeValidationError`'s `group-scope-validation` type joins the
  publish-error classifier alongside the six existing publish-time error
  classes. Its located group-id/reason detail then reaches the developer
  instead of falling through to a generic message. Like the load-guard
  touch above, this is classifier plumbing, not a UI or screen change. It
  changes no rendered surface, and adds no new user-facing string.
  `admin-groups-screen`, a separate and parallel change, adds the actual
  UI.
