## Why

An author who may publish the expense process holds `system:publish`. That role
publishes every other process too. `system:cancel-any` cancels any instance of
any process. Nobody can write down a grant for one process.

ROADMAP.md stage 40 split the repair in two. The seam shipped on 2026-08-15 as
`process-scoped-permission-seam`. It put `can(actor, permission, processId)` and
`requirePermission` in `src/auth/authorize.ts`, over `"publish"`, `"cancel"` and
`"migrate"`. Six call sites ask through it. Its body is still the global-role
check, and `processId` reaches no branch. This change fills that body.

## What Changes

- A new `permission_grants` table stores one row per grant. A row maps a role
  string to a permission and a scope. One row covers every holder of
  `finance-authors`. An operator with 12 finance processes therefore writes 12
  rows, where naming the scope inside the role would take 72 directory
  assignments.
- A scope carries the `{ type, config }` envelope the definition contract
  already gives plugins. `{ type: "process", config: { processId } }` is the
  only type this change ships.
- `can` answers true on either of two tests. It runs them in this order: the
  global role, then a matching grant row. It reads no scope out of a role
  string. A role string is a principal the identity provider names. The grant
  table is the one place a scope lives.
- **BREAKING** for in-process callers. `can` and `requirePermission` become
  `async` and take the `SQL` handle, because the third test reads the database.
  All six call sites are already `async` and already hold a handle. No HTTP
  caller changes.
- The global role short-circuits before any query. An actor holding
  `system:publish` today reaches the same answer over the same zero queries.
- Every scope type enumerates to a finite set of process ids from the store
  alone. `{ type: "process" }` does so trivially. The rule binds any later
  type, because the `scope=all` filter needs the set, not a per-id answer.
- Three operator routes administer grants: `GET /admin/permission-grants`,
  `POST /admin/permission-grants` and `POST /admin/permission-grants/revoke`.
  `system:admin` gates all three, like every other `/admin/*` route.
- No account gains or loses access on the day this lands. An installation that
  writes no grant row keeps today's behavior exactly.

ROADMAP.md stage 40 named `system:publish@proc_…` in `actor.roles` as a
documented fallback for an installation that manages every grant in its
directory. This change drops it. It is a second way to say one thing, and no
installation asked for it. A documented shape is a commitment where one line
of code is not. An installation that wants it later asks for it then.

Four pieces of stage 40 stay out. Each has a stated reason.

- **The `scope=all` filter stays out.** ROADMAP.md names it the expensive part.
  It puts the work in `instance-query` rather than in authorization. `GET
  /instances` and every `/reporting/*` route aggregate across processes. A
  scoped grant therefore turns a gate into a query predicate there. That is a
  second problem with its own capability, and nothing here regresses while it
  waits. Those routes keep `system:admin` and `system:reports` unchanged.
- **No web screen.** The three routes are the grant surface. An operator screen
  reaches `packages/web`, its i18n catalog and `admin-app`. A UI change is never
  trivial here. Such a screen also has one question of its own to settle.
  Entra ID's `groups` claim emits object ids, so a grant to such a group lists
  as a GUID.
- **The four draft routes stay global.** ROADMAP.md stage 40 said a draft holds
  no `proc_` id to name. That is wrong. `drafts.process_id` is the table's key,
  and `PUT /drafts/:processId` names it from the first save. The draft routes
  are therefore scopeable. A draft-scoped `"author"` permission is where a
  multi-team installation gets the most. It moves the four draft call sites
  and filters the drafts list, so it is its own change.
- **The web areas keep reading `actor.roles`.** The studio shows its publish
  control to a `system:publish` holder. An actor whose only permission comes
  from a grant therefore reaches publish over HTTP alone. That holds until a
  later change puts server-computed `permissions` booleans on the resource
  views. That change is the one that stops a second client-side gate from
  growing.

## Capabilities

### New Capabilities
- `permission-grant-administration`: the operator's HTTP surface over the grant
  store, covering list, grant and revoke. It sits beside
  `data-list-administration`, which already carries its own `/admin/*`
  sub-surface as a separate capability.

### Modified Capabilities
- `authorization`: `can` reads a grant store instead of ignoring `processId`.
  Two requirements change and three join them. "A process-scoped gate asks one
  function" retires. "A process-scoped gate asks one function over two tests"
  replaces it.
- `http-wrapper`: the `POST /processes` gate. Its requirement states the role
  and pins the three-argument synchronous call. Both move to `can` over its
  two tests, and the gate's placement after the parse does not move.
- `studio-publish`: the `POST /drafts/:processId/publish` gate. Its
  requirement pairs `system:publish` with an authoring role. A grant now
  substitutes for the first, and the authoring role stands unchanged. Its central rule is the one this change reverses:
  a scoped grant is precisely a `processId` that changes the answer. The "no
  role implies another" rule stays untouched, and so do the eight global role
  constants.

## Impact

- `src/auth/authorize.ts`: `can` and `requirePermission` gain a `db` argument
  and an `async` signature. The `PERMISSION_ROLE` map stays module-private.
- `src/auth/grants.ts` (new): the grant row shape, its Zod schema, and the four
  store functions the routes and `can` call. The SQL lives here, so
  `authorize.ts` keeps holding none.
- `src/engine/store.ts`: `initSchema` gains the `permission_grants` table. It
  takes no tenant column. Tenancy is database-per-tenant, the shape `auth_users`
  uses.
- `src/http/admin-routes.ts` and `src/http/server.ts`: three route handlers and
  three route table rows.
- Six call sites gain `await` and a handle: `handlePublish`,
  `handlePublishDraft`, `handleGetMigrationPlan`, `handlePutMigrationPlan`,
  `handleGetOrphanKeys` and `cancelInstance`.
- `test/auth-authorize.test.ts` splits. `src/auth/authorize.ts` exports the
  same twelve names, so the export canary stays as it is. The role constants
  and `requireRole` stay pure. Every `can` and `requirePermission` test moves
  behind `test.skipIf(!DB)`, because test 2 reads the store on every false
  answer.
- `openspec/specs/http-wrapper/spec.md` and
  `openspec/specs/studio-publish/spec.md` each state the publish rule this
  change reverses. Both take a delta.
- This change leaves `docs/authoring-guide.md` alone. A grant is an installation
  concern, and the guide teaches the definition contract.
- `ROADMAP.md` stage 40 records the storage half as done. It names what the
  `scope=all` filter, the draft scope and the `permissions` booleans still
  owe.
