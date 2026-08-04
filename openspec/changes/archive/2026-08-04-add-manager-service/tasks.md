<!-- antislop: allow-file passive-voice -->
## 1. The manager field

- [x] 1.1 Add `manager_user_id text REFERENCES auth_users(user_id) ON DELETE SET NULL` to `initSchema` (`src/engine/store.ts`). Use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, beside the existing ten.
- [x] 1.2 Add `managerUserId` to `UserSummary` in `src/auth/users.ts`.
- [x] 1.3 Add the column to every `SELECT` and `RETURNING` there: `listUsers`, `setRolesById`, `setDisabled`.
- [x] 1.4 Add `setManagerById(userId, managerUserId, db)` and `getManagerOf(userId, db)`.
- [x] 1.5 Add a manager subcommand to `src/auth/cli.ts`, keyed by email like its siblings.
- [x] 1.6 Test: the column exists after `initSchema` runs on a pre-existing table.
- [x] 1.7 Test: a manager pointer round-trips. An id naming no account is refused.
- [x] 1.8 Test: an account holding `NULL` still logs in and still lists.

## 2. The assignment.unresolved event

- [x] 2.1 Add `assignmentUnresolvedReason` to `src/schema/definition.ts`. Its members are `resolver-raised`, `timed-out` and `no-candidates`.
- [x] 2.2 Add the `assignment.unresolved` arm to `instanceEvent`. Payload `{ stepId, reason }`, strict, with no `actions` field.
- [x] 2.3 Test: the arm parses. A payload with an extra key is rejected. A payload missing `reason` is rejected.

## 3. The deadline and the failure classification

- [x] 3.1 Widen `resolveStepAssignment` (`src/engine/registry.ts`) to return `{ assignment, unresolved? }`.
- [x] 3.2 Race `def.resolve(...)` against `ASSIGNMENT_RESOLUTION_TIMEOUT_MS`, defaulting to 5000.
- [x] 3.3 Classify the three cases: the resolver raised, the deadline expired, the list was empty. Ignore a late answer.
- [x] 3.4 Keep the unregistered-type path resolving to an empty list. Classify it `no-candidates`.
- [x] 3.5 Test: a raising resolver, a hanging resolver and an empty resolver each yield empty candidates.
- [x] 3.6 Test: each of those three carries its own reason. A late answer is not written.
- [x] 3.7 Test: the environment variable overrides the default.

## 4. Recording the event at the four step-entry sites

- [x] 4.1 `commitTransition` (`src/engine/transition.ts`): mint the event. Pass it through the `events` field of `StepEntryOpts`, the seam `migration.ts:520` already uses.
- [x] 4.2 Add an optional `events?: InstanceEvent[]` to `createInstance`'s opts (`src/engine/store.ts:383`). Append it to the list that function already builds, before `appendInstanceEvents` at `store.ts:506`.
- [x] 4.3 `startInstance` (`src/engine/transition.ts`) and `createProcessInstance` (`src/runtime/api.ts`): pass the event through that new field, at sequence 0.
- [x] 4.4 Subprocess spawn (`src/engine/subprocess.ts`): pass the child's event through the same new field, with `instanceId: childId`, `version: childVersion` and `transitionSeq` 0. Do NOT add it to the parent's `dropEvents` list, which carries `instanceId: parent.instanceId`.
- [x] 4.5 Subprocess return (`src/engine/subprocess.ts`): the event lands through `commitTransition` inside the held transaction. Confirm no second transaction opens.
- [x] 4.6 Adjust `test/migration.test.ts:119` for the widened return. Migration itself calls no resolver: it passes `assignment: { carry: true }` (`migration.ts:519`), which stays unchanged.
- [x] 4.7 Test: the event commits with the entry, and not without it.
- [x] 4.8 Test: a successful resolution records none. An unrestricted step records none.
- [x] 4.9 Test: a creation records the event at sequence 0.
- [x] 4.10 Test: a spawned child's event carries the child's id, not the parent's.
- [x] 4.11 Adjust existing tests that assert an exact event list where `static` candidates are empty.

## 5. The org.manager-of-starter strategy

- [x] 5.1 Add `src/engine/assignment-strategies.ts`. It holds the strategy def: config schema `z.object({}).strict()`, resolver reading `getManagerOf(instance.startedBy)`.
- [x] 5.2 Export `createDefaultAssignmentRegistry(db = sql)` from it. It returns the static entry plus this one.
- [x] 5.3 Point `src/http/server.ts`'s import of `createDefaultAssignmentRegistry` at the new module. One import line, and no default-parameter expression changes.
- [x] 5.4 Point `src/http/routes.ts` and `src/http/studio-routes.ts` at the same module.
- [x] 5.5 Test: the strategy resolves the starter's manager.
- [x] 5.6 Test: two starters with different managers get different candidates. Neither manager is eligible for the other's instance. Run it through `createProcessInstance`: `startInstance` passes `startedBy: undefined` and would resolve to nobody.
- [x] 5.7 Test: a starter with no manager resolves to empty with `no-candidates`. So do an absent and an unknown `startedBy`.
- [x] 5.8 Test: the resolved list does not change when the manager changes afterwards.
- [x] 5.9 Test: a config carrying any key fails to publish.
- [x] 5.10 Test: the strategy appears in the registry the studio Tools screen reads.
- [x] 5.11 Test: the registry `serve` defaults to resolves `org.manager-of-starter`. Two factories share the name, so a wrong import is otherwise silent.

## 6. The admin route

- [x] 6.1 Add `PATCH /admin/users/:id/manager` to `src/http/admin-routes.ts`, mirroring the roles route. Gate it on `system:admin`.
- [x] 6.2 Accept the body `{ managerUserId: string | null }`. Answer 200, 400, 403 and 404 as the delta spec states.
- [x] 6.3 Reject 400 for an unknown target and for a self-pointer. Do not reject a two-account cycle.
- [x] 6.4 Test: each of the six scenarios in the `admin-user-management` delta.

## 7. The admin screen

- [x] 7.0 Invoke `/frontend-design:frontend-design` first, plus `web-design-guidelines`, `vercel-react-best-practices` and `vercel-composition-patterns`. CLAUDE.md requires this before reshaping a screen.
- [x] 7.1 Add `managerUserId` to the admin area's account type and API module (`packages/web/src/areas/admin/api/types.ts`, `client.ts`).
- [x] 7.2 Add the manager request to that module.
- [x] 7.3 Add the manager control to `UsersScreen.tsx` and its logic to `usersLogic.ts`, beside the roles control.
- [x] 7.4 Offer the other listed accounts plus a clearing choice. Never offer the account being changed.
- [x] 7.5 Show a rejected change without changing the displayed value.
- [x] 7.6 Give the control an accessible name identifying its account, as the roles input already carries.
- [x] 7.7 Add the locale strings the control needs.
- [x] 7.8 Test `usersLogic.ts`: the choices exclude the account being changed.
- [x] 7.9 Test `usersLogic.ts`: a rejection leaves the value, and a success updates it.
- [x] 7.10 The pending-edit rule is component state, not `usersLogic` (the roles editor's equivalent is unit-tested nowhere either). Verified in the browser instead, per 9.5.

## 8. Documentation

- [x] 8.1 `docs/authoring-guide.md`: the `org.manager-of-starter` strategy, what it resolves, and what an author sees when it resolves to nobody.
- [x] 8.2 `docs/current-state.md`: the manager field, the second strategy, the deadline and the failure classification.
- [x] 8.3 `docs/current-state.md`: the new event kind, the new route, and the new screen control.
- [x] 8.4 `CLAUDE.md`: delete the "second (fallible) assignment strategy" entry from "Decided, not yet built". Its row-lock question is now answered.
- [x] 8.5 `CLAUDE.md`: add the new event kind to the Runtime record list and correct its count.
- [x] 8.6 `CLAUDE.md`: state that the assignment resolver is deadline-bounded, and that the subprocess-return lock is bounded rather than hoisted.
- [x] 8.7 `ROADMAP.md`: mark stage 25c DONE.

## 9. Verification

- [x] 9.1 `bun run typecheck` inside the devcontainer.
- [x] 9.2 The full `bun test` with `DATABASE_URL` set. Report the pass count and the skip count.
- [x] 9.3 The antislop linter on every touched Markdown file.
- [x] 9.4 `git diff --check`, plus `grep -lI $'\r'` for CRLF.
- [x] 9.5 A real browser: the admin users screen sets, clears and rejects a manager.
