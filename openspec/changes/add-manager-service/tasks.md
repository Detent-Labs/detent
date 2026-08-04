<!-- antislop: allow-file passive-voice -->
## 1. The manager field

- [ ] 1.1 Add `manager_user_id text REFERENCES auth_users(user_id) ON DELETE SET NULL` to `initSchema` (`src/engine/store.ts`). Use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, beside the existing ten.
- [ ] 1.2 Add `managerUserId` to `UserSummary` in `src/auth/users.ts`.
- [ ] 1.3 Add the column to every `SELECT` and `RETURNING` there: `listUsers`, `setRolesById`, `setDisabled`.
- [ ] 1.4 Add `setManagerById(userId, managerUserId, db)` and `getManagerOf(userId, db)`.
- [ ] 1.5 Add a manager subcommand to `src/auth/cli.ts`, keyed by email like its siblings.
- [ ] 1.6 Test: the column exists after `initSchema` runs on a pre-existing table.
- [ ] 1.7 Test: a manager pointer round-trips. An id naming no account is refused.
- [ ] 1.8 Test: an account holding `NULL` still logs in and still lists.

## 2. The assignment.unresolved event

- [ ] 2.1 Add `assignmentUnresolvedReason` to `src/schema/definition.ts`. Its members are `resolver-raised`, `timed-out` and `no-candidates`.
- [ ] 2.2 Add the `assignment.unresolved` arm to `instanceEvent`. Payload `{ stepId, reason }`, strict, with no `actions` field.
- [ ] 2.3 Test: the arm parses. A payload with an extra key is rejected. A payload missing `reason` is rejected.

## 3. The deadline and the failure classification

- [ ] 3.1 Widen `resolveStepAssignment` (`src/engine/registry.ts`) to return `{ assignment, unresolved? }`.
- [ ] 3.2 Race `def.resolve(...)` against `ASSIGNMENT_RESOLUTION_TIMEOUT_MS`, defaulting to 5000.
- [ ] 3.3 Classify the three cases: the resolver raised, the deadline expired, the list was empty. Ignore a late answer.
- [ ] 3.4 Keep the unregistered-type path resolving to an empty list. Classify it `no-candidates`.
- [ ] 3.5 Test: a raising resolver, a hanging resolver and an empty resolver each yield empty candidates.
- [ ] 3.6 Test: each of those three carries its own reason. A late answer is not written.
- [ ] 3.7 Test: the environment variable overrides the default.

## 4. Recording the event at the five step-entry sites

- [ ] 4.1 `commitTransition` (`src/engine/transition.ts`): mint the event. Pass it through the `events` field of `StepEntryOpts`.
- [ ] 4.2 `startInstance` (`src/engine/transition.ts`) and `createProcessInstance` (`src/runtime/api.ts`): pass the event into `createInstance` at sequence 0. That function already writes an event list.
- [ ] 4.3 Subprocess spawn (`src/engine/subprocess.ts`): add the event to the drop-event list it already appends. It is recorded on the child.
- [ ] 4.4 Subprocess return (`src/engine/subprocess.ts`): the event lands through `commitTransition` inside the held transaction. Confirm no second transaction opens.
- [ ] 4.5 Adjust the migration call site and `test/migration.test.ts` for the widened return.
- [ ] 4.6 Test: the event commits with the entry, and not without it.
- [ ] 4.7 Test: a successful resolution records none. An unrestricted step records none.
- [ ] 4.8 Test: a creation records the event at sequence 0.
- [ ] 4.9 Adjust existing tests that assert an exact event list where `static` candidates are empty.

## 5. The org.manager-of-starter strategy

- [ ] 5.1 Add `src/engine/assignment-strategies.ts`. It holds the strategy def: config schema `z.object({}).strict()`, resolver reading `getManagerOf(instance.startedBy)`.
- [ ] 5.2 Export `createDefaultAssignmentRegistry(db = sql)` from it. It returns the static entry plus this one.
- [ ] 5.3 Point `src/http/server.ts`'s import of `createDefaultAssignmentRegistry` at the new module. One import line, and no default-parameter expression changes.
- [ ] 5.4 Point `src/http/routes.ts` and `src/http/studio-routes.ts` at the same module.
- [ ] 5.5 Test: the strategy resolves the starter's manager.
- [ ] 5.6 Test: two starters with different managers get different candidates. Neither manager is eligible for the other's instance.
- [ ] 5.7 Test: a starter with no manager resolves to empty with `no-candidates`. So do an absent and an unknown `startedBy`.
- [ ] 5.8 Test: the resolved list does not change when the manager changes afterwards.
- [ ] 5.9 Test: a config carrying any key fails to publish.
- [ ] 5.10 Test: the strategy appears in the registry the studio Tools screen reads.

## 6. The admin route

- [ ] 6.1 Add `PATCH /admin/users/:id/manager` to `src/http/admin-routes.ts`, mirroring the roles route. Gate it on `system:admin`.
- [ ] 6.2 Accept the body `{ managerUserId: string | null }`. Answer 200, 400, 403 and 404 as the delta spec states.
- [ ] 6.3 Reject 400 for an unknown target and for a self-pointer. Do not reject a two-account cycle.
- [ ] 6.4 Test: each of the six scenarios in the `admin-user-management` delta.

## 7. The admin screen

- [ ] 7.1 Add `managerUserId` to the admin area's account type and API module (`packages/web/src/areas/admin/api/types.ts`, `client.ts`).
- [ ] 7.2 Add the manager request to that module.
- [ ] 7.3 Add the manager control to `UsersScreen.tsx` and its logic to `usersLogic.ts`, beside the roles control.
- [ ] 7.4 Offer the other listed accounts plus a clearing choice. Never offer the account being changed.
- [ ] 7.5 Show a rejected change without changing the displayed value.
- [ ] 7.6 Add the locale strings the control needs.
- [ ] 7.7 Test `usersLogic.ts`: the choices exclude the account being changed.
- [ ] 7.8 Test `usersLogic.ts`: a rejection leaves the value, and a success updates it.

## 8. Documentation

- [ ] 8.1 `docs/authoring-guide.md`: the `org.manager-of-starter` strategy, what it resolves, and what an author sees when it resolves to nobody.
- [ ] 8.2 `docs/current-state.md`: the manager field, the second strategy, the deadline and the failure classification.
- [ ] 8.3 `docs/current-state.md`: the new event kind, the new route, and the new screen control.
- [ ] 8.4 `CLAUDE.md`: delete the "second (fallible) assignment strategy" entry from "Decided, not yet built". Its row-lock question is now answered.
- [ ] 8.5 `CLAUDE.md`: add the new event kind to the Runtime record list and correct its count.
- [ ] 8.6 `ROADMAP.md`: mark stage 25c DONE.

## 9. Verification

- [ ] 9.1 `bun run typecheck` inside the devcontainer.
- [ ] 9.2 The full `bun test` with `DATABASE_URL` set. Report the pass count and the skip count.
- [ ] 9.3 The antislop linter on every touched Markdown file.
- [ ] 9.4 `git diff --check`, plus `grep -lI $'\r'` for CRLF.
- [ ] 9.5 A real browser: the admin users screen sets, clears and rejects a manager.
