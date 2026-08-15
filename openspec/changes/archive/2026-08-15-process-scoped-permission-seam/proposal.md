## Why

Every role this engine defines is global. `requireRole` reads one line. Does
`Actor.roles` hold the string?

One installation may want to grant publish on the expense process and withhold
it on the payroll process. Nobody can write that grant down today. `ROADMAP.md`
stage 40 designed the answer on 2026-08-15. That pass found nobody blocked, so
the storage half waits for its trigger.

One piece is worth landing ahead of that trigger. It is the smallest piece. Six
call sites hold a process id and ask a bare global question about it. A later
change to grant storage rewrites all six. Behind one function it rewrites one.

## What Changes

- `src/auth/authorize.ts` gains two functions. `can(actor, permission,
  processId)` answers a predicate. `requirePermission(actor, permission,
  processId)` throws the existing `AuthorizationError` when `can` answers
  false. Three permissions cover the six sites: `"publish"`, `"cancel"` and
  `"migrate"`.
- The whole body of `can` is today's global-role check. A `PERMISSION_ROLE` map
  names the reserved role that gates each permission now.
  - `"publish"` takes `PUBLISH_ROLE`
  - `"cancel"` takes `CANCEL_ANY_ROLE`
  - `"migrate"` takes `DEVELOPER_ROLE`

  The `processId` argument reaches no branch.
- Five gates swap `requireRole` for `requirePermission`:
  - `handlePublish` and `handlePublishDraft`
  - `handleGetMigrationPlan` and `handlePutMigrationPlan`
  - `handleGetOrphanKeys`
- `cancelInstance` keeps its load-free fast path. It asks `can` in the branch
  that already holds the loaded instance, beside the `startedBy` test. A scoped
  grant has to answer in that branch, because the process id arrives with the
  instance.
- **BREAKING for one response code.** `POST /processes` reads its target
  `processId` out of the request body. Its gate therefore moves behind the JSON
  parse and the shape check. A caller who lacks `system:publish` and sends a
  malformed body now reads 400 where it read 403. Every other publish response
  stays as it is. No caller gains or loses access.
- `requireRole` stays exported, and gates every site that holds no process:
  - every `/admin/*` route
  - the reporting routes
  - the four draft routes and the two template routes
  - the `scope=all` gate on `GET /instances`

## Capabilities

### New Capabilities

None. This adds no behaviour and no surface a caller can reach.

### Modified Capabilities

- `authorization`: adds the process-scoped permission seam as a requirement. It
  also narrows the requirement that rules out an extension point.
  `requirePermission` is a direct check in that same module. It is not the
  plugin registry that requirement forbids.
- `http-wrapper`: the `POST /processes` role gate moves behind the body parse.
  Today's requirement puts that gate ahead of the parse. The property that
  requirement protects survives the move. The gate still precedes the
  definition store, the registry and the CEL check.

## Impact

Code: `src/auth/authorize.ts`, `src/http/routes.ts`,
`src/http/studio-routes.ts`, `src/runtime/api.ts`.

Two doc comments state the old publish ordering and the old studio gate map.
Both sit in the files above. One heads `src/http/studio-routes.ts`, and one
heads `handlePublish`.

Tests: `test/auth-authorize.test.ts` holds `can`'s own cases. Its exports canary
gains the two new names. The publish and cancel suites hold the ordering.

Docs: `docs/current-state.md` states that the publish gate runs before the body
parse. That sentence moves with the gate.

No schema, no table, no migration, no HTTP route, no UI, no dependency. The
definition contract does not move. `Actor.roles` keeps its shape, which matters
because `src/cel/eval.ts` puts that array in every guard's context.

Five things stay out of scope. This list names them, so the review does not
read an omission as an oversight.

- grant storage of any kind
- any scope value, and any `{type, config}` scope registry
- the `scope=all` filter on `GET /instances`
- every `/reporting/*` route
- every UI surface that reads a role

The last three turn a gate into a query filter. That is the expensive half, and
stage 40 leaves it behind its trigger.
