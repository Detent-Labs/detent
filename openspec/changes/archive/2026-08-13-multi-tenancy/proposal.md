## Why

The engine serves one customer per deployment. A shared SaaS deployment needs
many customers behind one process. The same codebase has to keep serving the
on-premise shape unchanged. Stage 24 approved the model and left the
implementation unstarted.

Three things bind a single database into the process today. The route table
captures one handle in about forty closures. Four workers poll one handle for
the life of the process. And a locally-issued token names no tenant, because
`LOCAL_ISSUER` is one module constant shared by every deployment.

## What Changes

- A control-plane `tenants` table holds `id`, `key`, `name` and `databaseUrl`.
  It is the only shared state. No other table gains a tenant column.
- `TENANT_CONTROL_PLANE_URL` turns SaaS mode on. Unset, the server behaves as
  it does today, and every existing suite proves that.
- A CLI provisions a tenant, mirroring `src/auth/cli.ts`. Provisioning creates
  the tenant's database and runs `initSchema` against it.
- **BREAKING for callers of `createServer`.** `Route.handler` takes a fourth
  parameter, `db`, which the dispatcher supplies per request. `createServer`
  still builds the route table once. This follows the pattern the type's own comment already
  documents for `clientAddress`.
- The resolver's `isActiveAccount` callback takes `db` per call, not per
  construction.
- `notification.email`, `org.manager-of-starter` and the `db.list` data source
  take `db` at call time.
  Neither binds it when a caller builds the registry, so one registry serves
  every tenant. This retires the boot-time binding stage 16b recorded and left
  to this stage.
- `startEngine` takes a `TenantSource`: a function answering which tenant
  databases are live now. On-premise it answers one entry, which is today's
  behaviour. Each poll tick walks that list. It skips an unreachable tenant
  with a warning rather than stopping the tick for everyone.
- A locally-issued token carries a `tenant` claim. `/auth/login` mints the
  tenant whose database authenticated the account. The request host picks that
  tenant for the login request itself, the one request holding no token yet.
  An external issuer keeps mapping by `iss`, so this leaves stage 7's dispatch
  alone.

## Capabilities

### New Capabilities

- `multi-tenancy`: the control plane, tenant resolution per request, tenant
  provisioning, the SaaS-mode switch, and the isolation rules that follow.

### Modified Capabilities

- `http-wrapper`: the route table's handler takes `db` per request.
- `jwt-authentication`: a locally-issued token carries its tenant, and the
  account-liveness callback takes `db` per call.
- `local-user-accounts`: login resolves which tenant's database to
  authenticate against.
- `action-handlers`: a handler that reads the database takes `db` from its
  invocation, not from registry construction.
- `assignment-strategy-registry`: the same rule for a strategy.
- `data-source-resolution`: the same rule for a data source. `db.list` reads
  the `data_lists` tables. A handle bound at construction would offer one
  tenant's options to every tenant.
- `persistence`: `initSchema` runs per tenant database, and the control plane
  is a separate schema nothing else shares.

## Impact

- `src/tenancy/`: new. Control-plane schema, tenant lookup, connection map, CLI.
- `src/http/server.ts`: the `Route` type, about forty handler closures, the
  dispatcher, `resolveAuthResolver`, and the SaaS bootstrap.
- `src/auth/jwt.ts`, `src/auth/login.ts`, `src/auth/resolve.ts`: the tenant
  claim and the per-call liveness check.
- `src/engine/host.ts`: `startEngine`'s `TenantSource`, and both registry
  factories losing their `db` parameter.
- `src/handlers/notification-email.ts`, `src/engine/assignment-strategies.ts`,
  `src/engine/host.ts`'s `db.list` entry: `db` moves from the factory to the
  call.
- `src/engine/store.ts`: `initSchema` unchanged in content, invoked per tenant.
- `docs/runbooks/deployment.md`, `docs/openapi.yaml` (the tenant claim),
  `ROADMAP.md`, `docs/current-state.md`.
- `.claude/rules/process-contract.md`: the assignment-context shape.
- No contract change. `src/schema/definition.ts` is not touched: a tenant is a
  deployment fact, never a process one.
