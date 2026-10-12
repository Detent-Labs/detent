# Tasks

## 1. Issuer to tenant (C-8)

- [ ] 1.1 Add `tenant?: string` to `IssuerConfig` and to `parseAuthIssuers`'s schema. Verify `test/auth-jwt.test.ts` parses an entry with and without `tenant`. Verify it rejects a numeric `tenant` with an error naming `AUTH_ISSUERS`.
- [ ] 1.2 Give `tenantKeyOf` the optional issuer map and add `tenantsByIssuer`, per design decision 1. Verify `test/auth-jwt.test.ts` covers a mapped issuer and an unmapped one that returns `undefined`. Verify it covers a local token that still returns its claim, and an external token claiming another tenant.
- [ ] 1.3 Export `startTenancy` with its `issuers`, `control` and `deps` parameters. Map `iss` in `resolveTenantDb` and `tenantOf`, and fail startup per design decision 2. Pass the issuers parsed from `AUTH_ISSUERS` in `startHttpServer`. Verify a new `test/tenancy-issuers.test.ts` shows startup failing for an issuer with no `tenant`. Verify it fails for an unlisted tenant, and that each message names the issuer. Verify an on-premise start ignores the field.
- [ ] 1.4 Document the `tenant` field in `docs/runbooks/deployment.md`, in the `AUTH_ISSUERS` row and in the paragraph on how a request finds its database. Verify both places say each entry needs a `tenant` in SaaS mode.

## 2. Connection pools (C-9)

- [ ] 2.1 Cache the pending promise per key in `createTenantConnections`. End the pool when the probe fails, and make `close()` end every pool, per design decision 3. Correct the file comment "A pool opens lazily". Verify `test/tenancy-connections.test.ts` shows three concurrent `handleFor` calls opening one pool. Verify it shows a refused probe calling `end()` once and leaving no entry. Verify a retry opens a new pool, and `close()` ends every pool.
- [ ] 2.2 Return `close` from `startTenancy` and await it in the `stop` of `startHttpServer`. Verify `test/tenancy-issuers.test.ts` shows the returned `close` ending the pools of two tenants served through `resolveTenantDb`. Verify `stop` awaits it by a `startHttpServer` test in SaaS mode or by reading the line.

## 3. Provisioning (C-14, C-15)

- [ ] 3.1 Keep the URL parameters on the admin connection, per design decision 5. Verify `test/tenancy-provision.test.ts` covers the admin URL for `?sslmode=require` and for a URL with no parameters.
- [ ] 3.2 Add `databaseIdentity`, `TenantDatabaseTaken` and the check in `provisionTenant`, per design decision 4. Verify `test/tenancy-provision.test.ts` covers the typo from the brief and a listed database with another password and `sslmode`. Verify it covers a socket URL with a `host` parameter and a distinct database on the same host that passes. Verify the refused call created no database and listed no tenant.
- [ ] 3.3 Add the unique index on `tenants.database_url` to `initControlPlane`. Verify a DB test inserts one URL under two keys through `insertTenant` and sees the second insert fail. Verify two calls of `initControlPlane` succeed.
- [ ] 3.4 Show `TenantDatabaseTaken` through the CLI. Verify `add-tenant` prints the message and exits 1 for a taken database.

## 4. Verification

- [ ] 4.1 Run `bun run typecheck` in the devcontainer. Report the printed result.
- [ ] 4.2 Run `bun run build` in the devcontainer. Report the printed result.
- [ ] 4.3 Run the FULL `bun test` with DATABASE_URL set through `scripts/test-gated.sh` and `OPENSPEC_TELEMETRY=0`. Report pass, fail and skip counts.
- [ ] 4.4 Run the prose gate and the whitespace gate on the host over the pushed range. Report the printed result.

## Workflow follow-up

- Run `openspec-verify-change`, then `openspec-sync-specs`, then `openspec-archive-change`.
- Strike the `harden-tenancy-provisioning` entry from the audit index in `docs/decisions.md` in the archive commit.
- Merge the pinned `origin/main` SHA, push, open the PR, and merge on green CI.
