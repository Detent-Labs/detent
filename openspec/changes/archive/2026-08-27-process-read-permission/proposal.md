## Why

Suppose a department needs to read one process's instances in bulk. Today an
installation has one way to say yes: `system:admin`. That role also cancels any
instance, retries dead outbox rows, administers users and maintains data lists.
A reporting audience needs the bulk read alone. It is the one operator power
nobody can grant on its own.

The three process-scoped permissions cover writes: `publish`, `cancel`,
`migrate`. None covers a read. So the instance-data-tables design in
`docs/decisions.md` rests on a grant nothing carries. That feature stays
blocked until a read grant exists.

## What Changes

- `Permission` (`src/auth/authorize.ts`) gains a fourth member, `read`.
  `PERMISSION_ROLE` maps it to `ADMIN_ROLE`. `can` keeps the
  short-circuit-then-grant order it already runs.
- `grantSchema.permission` (`src/auth/grants.ts`) accepts `read`. An operator
  then writes, lists and revokes a read grant through the three routes that
  already exist. No route changes.
- `GET /instances` with `scope=all`, or with `scope` omitted, moves to the
  process-scoped gate. A caller holding `ADMIN_ROLE` sees no difference. A
  caller without it names a `processId` and holds a `read` grant over it.
  Otherwise the route answers 403.
- Nothing breaks, and no migration step follows. Every account that ran the
  unfiltered listing yesterday holds `ADMIN_ROLE`. That role short-circuits the
  new gate before `can` reads a row. An installation that writes no grant keeps
  every answer it had.

Out of scope, deliberately:

- The three reporting aggregate routes keep `requireRole(actor,
  REPORTS_ROLE)`. A `read` check there would strip access from every
  `system:reports` holder lacking `system:admin`. That access returns only once
  an operator writes a grant per process. This tightening carries a migration
  step, so it earns its own change.
- No result-set predicate. `scope=all` without `ADMIN_ROLE` names one process.
  It does not return instances from every process the caller holds a grant
  over. Nobody has asked for a listing spanning processes, and a report reads
  one process.
- `GET /instances/:instanceId/record` keeps its own gate. That gate already
  rests on the caller's relationship to the instance, not a flat role test.

## Capabilities

### New Capabilities

None. This change widens a seam that already exists.

### Modified Capabilities

- `authorization`: the `Permission` type carries four values, not three.
  `PERMISSION_ROLE` maps `read` to `ADMIN_ROLE`. The operator-role rule stops
  naming the unfiltered listing as a flat `ADMIN_ROLE` gate.
- `http-wrapper`: the `scope=all` route rule moves to the process-scoped gate.
  It gains the rule that a caller without the reserved role names a
  `processId`.
- `permission-grant-administration`: the accepted `permission` values become
  four. A body naming `read` now reaches the store instead of a 400.

### Unchanged, though nearby

- `instance-query` keeps every word. `listInstances` is a Runtime API Layer
  read, and its behavior holds. The gate this change moves sits in the route
  above it.
- `admin-app` keeps every word. Its instances screen calls `scope=all` while
  holding `ADMIN_ROLE`. That role short-circuits the new gate.

## Impact

- `src/auth/authorize.ts`: the `Permission` union and the `PERMISSION_ROLE`
  map.
- `src/auth/grants.ts`: the `permission` enum in `grantSchema`.
- `src/http/routes.ts`: the `scope=all` branch. It turns async against `db`. A
  request naming a `processId` goes through the read gate. A request naming
  none keeps the `ADMIN_ROLE` test it has.
- `test/`: the grant and authorization suites gain a read case. The HTTP
  listing suite gains three outcomes: admin, granted non-admin, and granted
  non-admin with no `processId`.
- `docs/decisions.md`: its `scope=all` paragraph records this shape already.
  That paragraph needs a status line once the work lands.
- No schema change, no definition contract change, no UI change.
