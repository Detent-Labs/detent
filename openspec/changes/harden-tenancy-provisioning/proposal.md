# Proposal

## Why

The 2026-10-10 audit found four defects in multi-tenancy (C-8, C-9, C-14,
C-15). In SaaS mode no token from an external identity provider can reach its
tenant. Per-tenant pools open several times at start and are never ended. An
operator typo can give two tenants one database. The provisioning connection
drops the URL parameters, so `sslmode=require` never reaches it.

## What Changes

- **C-8.** An `AUTH_ISSUERS` entry gains a `tenant` field naming a tenant key.
  In SaaS mode the dispatcher maps an external token's `iss` to that tenant.
  One issuer names exactly one tenant, and several issuers may name the same
  one. In SaaS mode an entry with no `tenant`, or one naming a tenant the
  control plane does not list, fails startup. On-premise ignores the field.
- **C-9.** `createTenantConnections` caches the pending connection per key
  instead of the finished one, so concurrent callers share one pool. A failed
  probe ends its pool before raising. `close()` ends every pool, and the
  server's `stop` calls it.
- **C-14.** `provisionTenant` raises a new `TenantDatabaseTaken` error when
  another tenant holds the URL's host, port and database name. It raises before
  it creates anything. `initControlPlane` adds a unique index on
  `tenants.database_url`, which backstops a concurrent provisioning.
- **C-15.** `createDatabaseFor` copies the URL and replaces only its path, so
  the admin connection keeps `sslmode` and every other parameter.
- `docs/runbooks/deployment.md` documents the `tenant` field.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `multi-tenancy`: an external token resolves to the tenant its issuer names.
  A tenant database belongs to one tenant. A pool opens once per tenant and
  ends with the server. Provisioning keeps the URL parameters.
- `jwt-authentication`: an `AUTH_ISSUERS` entry carries a `tenant`, required
  in SaaS mode.

## Impact

- Code: `src/auth/jwt.ts`, `src/http/server.ts`, `src/tenancy/connections.ts`,
  `src/tenancy/provision.ts`, `src/tenancy/store.ts`.
- Tests: `test/auth-jwt.test.ts`, `test/tenancy-connections.test.ts`,
  `test/tenancy-provision.test.ts`.
- Docs: `docs/runbooks/deployment.md`, and the audit index entry in
  `docs/decisions.md`.
- **BREAKING** for a SaaS deployment that sets `AUTH_ISSUERS`: each entry
  needs a `tenant`. No deployment exists yet, so none breaks.
- The definition contract, `src/schema/definition.ts` and the studio are not
  touched.
