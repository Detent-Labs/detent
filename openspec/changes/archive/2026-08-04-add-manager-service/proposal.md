<!-- antislop: allow-file passive-voice -->
## Why

A company-wide leave request cannot route to the requester's own manager. Every
instance of one definition carries the same candidate list. A frozen definition
knows nothing about the instance that runs it.

Listing `["dept-a:manager", "dept-b:manager"]` lets B's manager approve A's
request. The engine allows it and logs nothing.

The registry seam that fixes this shipped already
(`assignment-strategy-registry`). But `"static"` is still its only entry, and
`auth_users` holds no organizational fact to resolve against. This change
supplies both halves. It is also the first fallible resolver, so it supplies the
failure rules every later strategy inherits.

## What Changes

- A `manager` field on the local account: a pointer to one other account, never
  a tree. No departments, no deputies, no matrix.
- `PATCH /admin/users/:userId/manager`, behind `system:admin`. Plus manager
  editing on the admin users screen that `add-admin-role-editing` reshaped.
- A built-in `org.manager-of-starter` assignment strategy. It resolves the
  manager of `instance.startedBy`, which every instance already records, so the
  engine persists nothing new per instance.
- A resolution deadline bounding every assignment resolver. That includes the
  one on the subprocess-return path, which holds the parent's row lock.
- A failure classification. A resolver that raises, exceeds the deadline, or
  yields nobody leaves `candidates` empty. The entry commits regardless.
- A new `assignment.unresolved` `InstanceEvent` kind. It names the step and the
  reason, so a stalled instance explains itself.

No definition changes and nothing migrates. `"static"` keeps its behaviour and
stays the default.

## Capabilities

### New Capabilities

- `manager-of-starter-assignment`: the `manager` pointer on an account, and the
  built-in `org.manager-of-starter` strategy that reads it.

### Modified Capabilities

- `assignment-strategy-registry`: resolution gains a deadline and a failure
  classification. The carved-out subprocess-return path gains that same bound.
- `runtime-events`: adds the `assignment.unresolved` event kind.
- `local-user-accounts`: the account record gains a `manager` field, and the CLI
  gains a subcommand that sets it.
- `admin-user-management`: the admin API gains a manager route.
- `admin-app`: the Users screen gains a manager control beside its roles editor.

## Impact

- `src/engine/store.ts`: an `auth_users.manager_user_id` column, and an optional
  `events` field on `createInstance`'s opts.
- `src/auth/users.ts`, `src/auth/cli.ts`: the field, its accessors, its CLI verb.
- `src/engine/registry.ts`: the deadline, the failure classification, and the
  widened `resolveStepAssignment` return.
- `src/engine/assignment-strategies.ts` (new): the `org.manager-of-starter`
  entry. It reads the database, so it cannot live in leaf `registry.ts`.
- `src/engine/transition.ts`, `src/engine/subprocess.ts`, `src/runtime/api.ts`:
  the four step-entry call sites. Each records the event in its own transaction.
- `src/schema/definition.ts`: the `assignment.unresolved` event kind.
- `src/http/admin-routes.ts`: the manager route.
- `packages/web/src/areas/admin`: the Users screen, its logic, its API calls and
  its locale strings.
- `test/migration.test.ts`: the one test call site of `resolveStepAssignment`.
- `docs/authoring-guide.md`, `docs/current-state.md`, `CLAUDE.md`, `ROADMAP.md`.
