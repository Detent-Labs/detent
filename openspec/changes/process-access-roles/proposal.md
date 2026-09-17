## Why

Today any `system:developer` or `system:author` holder reaches every process draft. Standing read access to a whole process needs an admin to write a row into the installation-wide `permission_grants` table. Neither a process developer nor a business stakeholder can grant either one without an admin.

## What Changes

- New capability: per-process **Developer**, **Owner** and **Reader** lists. Each list holds users, groups, or both. Storage follows `instance_principals`: a principal is a `user_xxx` or `group_xxx` id. The engine matches it against the actor's own id and group membership. The role-string `permission_grants` table names roles, not individual users or groups, so this change does not extend it.
- **BREAKING**: editing an existing process's draft now needs one more thing beyond `system:developer`/`system:author`. The actor must be on that process's Developer list. Today, any holder of those two roles reaches every draft. An actor holding `system:admin` still overrides this, for a process with no Developer. The drafts list now returns only the drafts on the actor's own Developer list. An actor holding `system:admin` still sees every draft.
- **BREAKING**: creating a brand-new process needs the new `system:create` role, on top of `system:developer`/`system:author`. A new process is the first save under a processId with no draft and no published version. The engine adds the creator to that process's Developer list on creation.
- New global role `system:owner`: the eligibility rule for the Owner list. It plays the same part `system:developer`/`system:author` play for the Developer list. `system:owner` implies nothing else, matching every existing reserved role.
- A Developer-list member manages both the Developer list and the Owner list for their process.
- Owner is otherwise an informational label. The one exception: only an Owner-list member manages the process's Reader list.
- Reader-list membership does not need a role. A Reader is a plain user or group, since a Reader is often a business consumer with no studio access. A Reader gets standing read access to the process. `authorization`'s existing `can(actor, "read", processId, db)` check gains this as a third, additive test. The existing `ADMIN_ROLE` test and the existing `permission_grants` "read" row both stay.
- A one-time migration seeds every existing process's Developer list at rollout. It adds every current `system:developer`/`system:author` holder to every process. No existing process becomes unreachable the moment this ships.
- Deferred: a dedicated, non-studio surface for a pure Owner (one holding only `system:owner`, no studio access) to manage the Reader list. Reader-list management stays inside Studio in this change. It helps only an Owner who can also open Studio.

## Capabilities

### New Capabilities
- `process-access-roles`: per-process Developer/Owner/Reader storage. It covers eligibility, principal matching, list-management routes, and their authorization. It also covers the one-time migration for existing processes.

### Modified Capabilities
- `authorization`: two new reserved roles, `system:create` and `system:owner`. `can(actor, "read", processId, db)` gains a third, additive test against the process's Reader list.
- `process-drafts`: the four draft routes change their gate. Today they need `DEVELOPER_ROLE` or `AUTHOR_ROLE` alone. Reaching an existing process now also needs the actor on its own Developer list. An admin bypasses both checks and reaches every existing process alone. Creating the first draft for a new process also needs `system:create`, and that requirement applies to an admin too. The `listDrafts`/`GET /drafts` route narrows to the actor's own Developer-listed processes, and `system:admin` still sees all there too.
- `studio-app`: a new Access surface manages a process's Developer/Owner/Reader lists. A Developer or an Owner on that process can reach it. The process list narrows to the processes that list the actor as Developer or Owner. `system:admin` still sees all.

## Impact

- New database tables for process principals (Developer/Owner/Reader), plus their access functions under `src/auth/`.
- Changed files: `src/auth/authorize.ts` (`Permission`/`PERMISSION_ROLE`/`can`), `src/engine/drafts.ts` (create-vs-edit split, auto-add the creator as Developer), `src/http/studio-routes.ts` (draft-route gating, new list-management routes), `packages/web/src/areas/studio` (new Access panel, narrowed process list).
- Breaking for existing installations: every process needs the rollout migration before this ships. Without it, every non-admin account loses draft access to every process it did not write.
