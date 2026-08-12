## Context

See `proposal.md` for motivation. This file is the design of record, and it is
deliberately self-contained.

One note on provenance. Stage 24 names
`docs/superpowers/specs/2026-07-30-multi-tenancy-design.md`. That file is not on
this machine. `.gitignore` covers `docs/superpowers/`, so it never reached git
and no clone can recover it. The roadmap entry preserves its decisions, and this
file cites them as settled rather than re-deciding them.

A local copy sits at
`docs/superpowers/specs/2026-08-12-multi-tenancy-design.md`. Nothing here
depends on it, for the reason the paragraph above gives. A reader needs this
file and `ROADMAP.md` stage 24, both of which git carries.

The state that shapes the approach:

- `createServer` (`src/http/server.ts`) builds one route table. About forty
  handler closures capture the single `db` from the enclosing scope.
- `Route.handler` already takes a third parameter, `clientAddress`, that one
  route reads. Its own comment states the pattern: a closure may declare fewer
  parameters than the type gives it.
- `startEngine` (`src/engine/host.ts`) starts four pollers on one handle, and
  registers the subprocess handlers against it.
- `resolveAuthResolver(..., db)` binds the `isActiveAccount` callback.
- `createDefinitionStore(db)` holds a per-database cache.
- `createDefaultRegistry(db)` and `createDefaultAssignmentRegistry(db)` bind
  their db-reading plugins. Stage 16b added the first of those and recorded it
  as this stage's to settle.
- `src/auth/jwt.ts` declares `LOCAL_ISSUER = "bps"` as a module constant.
- Every function that touches the database already takes a `db` argument. Zero
  call sites query the module-level `sql` directly.

## Goals / Non-Goals

**Goals:**

- One process serves many tenants, with no table gaining a tenant column.
- The on-premise shape stays byte-for-byte in behaviour, proven by the existing
  suite running with SaaS mode off.
- Both seams stay swappable, since the tenant-scale target is open.

**Non-Goals:**

- Cross-tenant billing, usage dashboards, self-service signup, per-tenant
  quotas. Stage 24 put all four out of scope.
- Migrating an on-premise deployment into the control plane.
- Any contract change. A tenant is a deployment fact, never a process one.

## Decisions

### Thread `db` through the route table

`Route.handler` gains a fourth parameter. The dispatcher resolves the tenant
and gets that tenant's handle. It passes that handle to the route's own
closure. `createServer` still builds the table once, so no request allocates
anything per-tenant.

This follows the pattern the type's own comment documents for `clientAddress`.
A handler needing no database declares three parameters and ignores the fourth.

This change rejects two alternatives. One `createServer` per tenant needs no
handler change. It duplicates the table, three registries, the definition-store
cache and the resolver per tenant. Tenant count then becomes a memory cost.
`AsyncLocalStorage` needs no signature change at all. It hides the handle at the
call site, against the convention this repository enforces everywhere else.

### Unbind the plugins, and drop the `db` parameter from both registry factories

`notification.email` and `org.manager-of-starter` take `db` from their
invocation context rather than from a factory argument. `HandlerContext` gains
`db`; `AssignmentContext` gains `db`.

This is the cleaner half of a debt stage 16b named. That change made
`notificationEmailHandlerDef(db = sql)` a factory. Its Risks section recorded
that a boot-time binding is wrong under one database per tenant. This change
retires the binding rather than working around it.

`createDefaultRegistry` and `createDefaultAssignmentRegistry` therefore lose
their `db` parameter, returning to a no-argument call. That is a smaller public
surface than they carry today.

### A `TenantSource` for the workers

`startEngine` takes `() => Promise<TenantHandle[]>`. On-premise it answers one
entry holding the process `db`. In SaaS mode it reads the control plane.

Each poll tick walks the list. A refused connection skips that tenant with one
warning and the tick continues. The worker count stays four whatever the tenant
count, which is what the open scale target requires.

This change rejects one `startEngine` per tenant as the shape. It stays
reachable inside this seam: a source of one entry is exactly on-premise.

`createDefinitionStore` moves inside the per-tenant step, since its cache is
per-database by nature.

### The `tenant` claim, and the host at login

A locally-issued token carries `tenant`. `/auth/login` resolves its tenant from
the request host. It verifies the password against that tenant's `auth_users`,
then mints the key.

An external issuer keeps mapping by `iss`. `LOCAL_ISSUER` stays one constant,
which is the whole reason the claim exists.

This change rejects host-based routing on every request. It duplicates what the
token already carries, and it breaks a client reaching the API by address. It
also rejects a required `X-Tenant` header. That puts an authorization-relevant
value where a caller sets it freely, beside a token carrying verified claims.

### The connection map is the one shared surface

Nothing shares a database. The single crossing point is the key-to-connection
lookup. A wrong entry there is the whole isolation fault. It therefore gets the
heaviest test in this change. It caches by key, with the control-plane row as
its only source.

## Risks / Trade-offs

- **The route-table change touches about forty call sites at once.** → Each is
  mechanical, and the compiler finds every one. The suite with SaaS mode off is
  the regression gate. It must stay green throughout.
- **A per-tenant connection pool grows with tenant count.** → Accepted. The map
  opens a pool lazily per tenant, and this design does not solve eviction. Name
  it if tenant count ever makes it real.
- **One tick walking N databases takes longer than one walking one.** → The
  work per tenant is a bounded query. A refused connection costs one try rather
  than a stall. A tick that misses its interval is the signal to shard the
  workers, not to change this seam.
- **`HandlerContext` and `AssignmentContext` gain a database handle.** → It
  widens two plugin contracts. Both already document that such a plugin uses
  the shared pool. This replaces an implicit dependency with a declared one.
- **A tenant provisioned before a schema change needs `initSchema` re-run.** →
  The idempotent `ADD COLUMN IF NOT EXISTS` convention already makes that safe.
  This change makes that convention load-bearing rather than merely tidy, which
  the persistence delta states.

## Migration Plan

- Step 1 adds the control plane and the CLI with SaaS mode off. Nothing running
  changes.
- Step 2 threads `db` and unbinds the plugins. Still inert: with the variable
  unset the dispatcher supplies the process handle every time.
- Step 3 turns SaaS mode on and swaps the tenant source.
- Rollback at any step is a code revert. The control-plane database is separate,
  so leaving it in place costs nothing.
- No data migration. An existing deployment is one tenant that never registers.

## Open Questions

None that change this design, the specs, or the task breakdown. The
tenant-scale target stays open on purpose. This design picks both seams above so
that either end of it works without a rewrite.
