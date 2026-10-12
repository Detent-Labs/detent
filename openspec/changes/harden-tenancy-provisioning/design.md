# Design

## Context

In SaaS mode `tenantKeyOf` (`src/auth/jwt.ts`) returns a locally issued
token's `tenant` claim, and for any other token its raw `iss`. The dispatcher
(`startTenancy` in `src/http/server.ts`) looks that string up in
`tenants.key`. A key matches `^[a-z][a-z0-9_-]*$` and an `iss` is a URL, so the
lookup never hits. `startHttpServer` builds the JWT resolver from
`AUTH_ISSUERS` and the tenancy seams separately, and the tenancy side never
sees the issuer list.

`createTenantConnections` (`src/tenancy/connections.ts`) caches a finished
pool in a `Map<string, SQL>`. The outbox, resolution, timers and retention
workers each tick 500 ms after start, and each calls `handleFor` for every
listed tenant. All four find the map empty and open a pool. The last one wins,
and the rest drop out of reach without `end()`. A refused probe drops its pool
the same way.

`provisionTenant` checks the key and never the database. `createDatabaseFor`
leaves an existing database alone on purpose, so re-provisioning onto a
prepared database works. It builds the admin URL from protocol, credentials
and host, so every URL parameter disappears.

## Goals / Non-Goals

**Goals:**
- An external token reaches exactly the tenant its issuer names in `AUTH_ISSUERS`.
- One pool per tenant. A failed probe and a server stop both end it.
- No two tenants list one database.
- The provisioning admin connection carries the tenant URL's parameters.

**Non-Goals:**
- One issuer serving several tenants through a claim. The owner ruled one
  issuer per tenant on 2026-10-12. A later change can add a per-issuer tenant
  allowlist without breaking this mapping.
- Pool eviction. The `ponytail:` comment in `connections.ts` keeps naming it.
- The per-email login limiter (C-7), which belongs to
  `postgres-login-rate-limit`.

## Decisions

**1. `tenant` is a field on the issuer entry, and startup builds the mapping
once.** `IssuerConfig` gains `tenant?: string`. `tenantKeyOf` takes an
optional `ReadonlyMap<string, string>` from `iss` to tenant. For an external
`iss` it returns the map's entry, or `undefined` when the map has none. It no
longer returns the raw `iss`. It never reads the `tenant` claim of an external
token, because the issuer's own entry decides. A token that claims another
tenant cannot move itself. A helper `tenantsByIssuer(issuers)` in `jwt.ts`
builds the map.

*Alternative:* read a tenant claim from the external token. That makes the
IdP's claim the isolation boundary, so it needs a per-issuer allowlist and a
claim name. The owner chose the static mapping.

**2. Startup validates the mapping in `startTenancy`.** `startHttpServer`
parses `process.env.AUTH_ISSUERS` again and hands the list to `startTenancy`.
In SaaS mode it raises when an entry has no `tenant`. It also raises when
`tenantByKey` finds no row for an entry's tenant. Both messages name the
issuer. It also raises when an `iss` appears twice. The resolver would verify
against the first entry while the map kept the last. A request with a Bearer
token takes its tenant from the token alone. The host serves only a request
with no token. The check runs after `initControlPlane` and before
`Bun.serve`, so a bad mapping never serves a request. A second parse of one
string costs little. It cannot disagree with the first. `parseAuthIssuers` keeps `tenant`
optional, because on-premise has no tenants. The check sits in `startTenancy`
for the same reason: only SaaS mode runs it.

`startTenancy` is exported. Its arguments are `(issuers, control =
controlPlane(), deps = {})`. `deps` passes through to `createTenantConnections`. A test then
drives the startup check and the pool shutdown with a test control plane and
an injected `connect`, without `TENANT_CONTROL_PLANE_URL`.

*Alternative:* make the Zod schema demand `tenant` whenever
`TENANT_CONTROL_PLANE_URL` is set. Then `parseAuthIssuers` reads the SaaS
flag, and a unit test of the parser depends on the environment.

**3. The connection map caches the pending promise.** `pools` becomes
`Map<string, Promise<SQL>>`. The first `handleFor(key)` for a key stores the
promise of the whole open sequence: lookup, connect, probe. Later callers,
including the other workers, await the same promise. A rejection removes the
entry, but only while the map still holds that promise. The next call then
retries. The probe's `catch` calls `db.end()` before it raises
`TenantUnreachable`. It ignores an error from `end()`, because the probe
already failed.

`close()` becomes async. It empties the map and awaits every entry it held, so
the close ends a pool that is still opening too. A rejected entry has no pool
to end. `startTenancy` returns the `close`. The `stop` of `startHttpServer`
awaits it after `engine.stop()`.

*Alternative:* a lock around the open. A promise cache does the same job with
no extra state.

**4. Provisioning compares a database identity, not the URL string.**
`databaseIdentity(url)` returns `host:port/database`. A `host` query parameter
replaces the hostname for a socket URL. The port defaults to 5432. The hostname
is lowercase. `provisionTenant` lists the tenants after the key check
and before it creates anything. When one has the same identity it raises
`TenantDatabaseTaken(key, owner)`. It skips a stored URL that does not parse.
A URL with another password or `sslmode` still names the same database. A
string compare would miss the typo this guards against.

`initControlPlane` adds `CREATE UNIQUE INDEX IF NOT EXISTS
tenants_database_url_key ON tenants (database_url)`. The index compares the
string, so it only backstops the exact-URL race. The application check
carries the typo case. A control plane that already holds two equal URLs makes
the index statement fail. Startup and the CLI then fail loudly. No
deployment exists, so no such plane exists.

*Alternative:* the check alone. A concurrent provisioning could then slip
between the read and the insert. The owner chose both.

**5. The admin URL copies the tenant URL and replaces the path.**
`createDatabaseFor` builds `const admin = new URL(databaseUrl)` and sets
`admin.pathname = "/postgres"`. Credentials, host, port and every parameter
stay. A URL with no credentials still works, since `URL` emits none.

## Risks / Trade-offs

- [A SaaS deployment's `AUTH_ISSUERS` needs a `tenant` on every entry] → No
  deployment exists. The runbook documents the field, and startup names the
  offending issuer.
- [`tenantKeyOf` without a map returns `undefined` for an external token. It
  used to return the `iss`] → The only caller is `startTenancy`, which
  passes the map. A test pins the new answer.
- [The identity compare misses two names for one host, such as `localhost` and
  `127.0.0.1`] → The unique index and the operator's own care cover the rest.
  The check targets the typo and ignores DNS equivalence.
- [A pending-promise map hands every waiter the same rejection] → Each waiter
  raises `TenantUnreachable` for the same cause, as before. The entry is gone
  by the next tick.

## Migration Plan

The first server start after this change needs two things in a SaaS
deployment. Each `AUTH_ISSUERS` entry gains a `tenant`. The control plane
has no two rows with one `database_url`. The unique index builds on that
start. No data moves and no rollback step exists. Reverting the code leaves
the index, which does no harm.

## Open Questions

None. The owner settled both questions on 2026-10-12.
