## Context

See proposal.md, section Why. The seam is already in place, and filling it is
the only thing this change has to do. `can` sits in `src/auth/authorize.ts:94`.
Its body is `actor.roles.includes(PERMISSION_ROLE[permission])`, and `void
processId` marks where a grant lands.

Four properties of the existing code shape the approach.

`src/auth/authorize.ts` holds no SQL and imports no database handle. That is
deliberate. `src/auth/jwt.ts` states the same rule for itself, and takes a
callback where it needs the directory.

All six call sites already sit inside `async` functions and already hold a
`SQL` handle. Five of them each take `db: SQL = sql`: `handlePublish`
(`src/http/routes.ts:467`), `handlePublishDraft`, the two migration-plan routes
and the orphan-key scan (`src/http/studio-routes.ts:153`, `:207`, `:227`,
`:246`). `cancelInstance` (`src/runtime/api.ts:1048`) has already loaded the
instance and the handle by the time it asks.

Tenancy is database-per-tenant. `tenants` is the one control-plane table, and
`initControlPlane` creates it apart from `initSchema` on purpose
(`src/tenancy/store.ts:52`). Every tenant-scoped table carries no tenant column,
`auth_users` included.

`Actor.roles` is `string[]`. It reaches the CEL context at `src/cel/eval.ts:83`,
where an authored guard reads it. Nothing in this change touches that shape.
An external issuer's claim reaches it verbatim through `claimToRoles`
(`src/auth/jwt.ts:81`). An Entra ID group therefore lands here as whatever the
`groups` claim emits, an object id by default.

A draft carries its `proc_` id from its first save. `drafts.process_id` is the
table's key (`src/engine/drafts.ts`). The studio names it in `PUT
/drafts/:processId`. ROADMAP.md stage 40 states the opposite, and this change
corrects it there.

## Goals / Non-Goals

**Goals:**

- Fill `can`'s body with the two tests the `authorization` delta states.
  Change nothing else about how a gate asks.
- Keep the cost at zero for an installation that writes no grant.
- Keep the store's write path strict and its read path permissive. A version
  that adds a second scope type must not strand a stored row.

**Non-Goals:**

- The `scope=all` filter and the reporting aggregates. See proposal.md, section
  What Changes.
- A web screen. Same place.
- A CLI subcommand. `src/auth/cli.ts set-roles` exists for the bootstrap case,
  where no admin account holds a token yet. A grant is never
  bootstrap-critical. The global roles it narrows already work on day one. An
  operator writes a grant over HTTP with a session they already hold.
- A deny form, a priority between grants, or a grant that names one account.
  Each one is a policy engine in a small disguise, and the `authorization`
  capability rules a policy engine out.
- A scope read out of a role string. See the decision below.
- A draft-scoped `"author"` permission, and `permissions` booleans on the
  resource views. proposal.md names both as follow-on changes.

## Decisions

### `can` becomes async and takes the handle

`can(actor, permission, processId, db)` returns `Promise<boolean>`.
`requirePermission` follows.

The alternative keeps `can` synchronous and passes it a pre-loaded grant set.
That moves the load to six call sites. The seam exists to avoid exactly that
coupling. Its whole claim is that grant storage moves one module. A pre-load
also reads rows on every gated call. The design below reads none in the common
case.

`requireRole` stays synchronous. It reads `Actor.roles` alone, and 30-odd call
sites use it.

### The global role short-circuits before any query

The two tests run in order: global role, then stored grant. The first is array
membership on `Actor.roles`, and costs nothing. Only the second opens a query.
It runs only where the answer would otherwise be a 403.

An installation with no grants therefore pays no query, and a `system:publish`
holder pays no query either. The query lands on the path that was already about
to refuse. One round trip there is not worth a cache.

`// ponytail: one SELECT per otherwise-refused gate; add a cache when a gate
shows up in a profile.`

### A role string carries no scope

ROADMAP.md stage 40 kept `system:publish@proc_…` in `actor.roles` as a
documented fallback. An earlier draft of this design carried it as a second
test in `can`. The owner dropped it on 2026-08-16.

The code was one line. The commitment was not. A documented string shape needs
three format rules and a length bound Entra dictates. It needs a scenario
guarding the `proc_a@b` case. All of that serves an installation that does not
exist.

It also puts a scope in two places. The whole design rests on the grant table
being the one place. A role string stays what the identity provider says it
is: a principal. An installation that later wants directory-managed scopes
gets its own change. That change puts the line back in, with its rules.

So `can` treats `system:publish@proc_a` as an ordinary role. It matches no
grant unless an operator writes a row naming that exact string. The store
accepts such a row, and the row does nothing useful.

### Every scope type enumerates to a process-id set

`{ type: "process" }` names one id. A later `"label"` or `"owner"` type must
still answer "which process ids does this scope cover" from the store alone.
The `scope=all` listing and every `/reporting/*` route need the set to create
a filter. A type that only answers "does this one id match" would leave the
filter half of stage 40 unbuildable. A predicate over process metadata is such
a type.

The `authorization` delta states the rule. A reviewer then checks a second
type against it at review time, rather than a filter discovering it.

### One table, no surrogate id

```sql
CREATE TABLE IF NOT EXISTS permission_grants (
  role       text  NOT NULL,
  permission text  NOT NULL,
  scope      jsonb NOT NULL,
  PRIMARY KEY (role, permission, scope)
)
```

The triple is the identity. A surrogate `pgrant_` id would be a second name for
a row that already carries one. It would also add an id prefix to the schema and
a mint call. The composite primary key gives the write its
idempotence for free, as `ON CONFLICT DO NOTHING`. It gives the revoke an exact
target.

`jsonb` works in a btree primary key. Postgres normalizes key order inside a
`jsonb` value, so `{"type":…,"config":…}` and `{"config":…,"type":…}` are one
key.

The table goes in `initSchema` (`src/engine/store.ts`), beside `auth_users`,
with no tenant column, for the reason Context states.

### The lookup reads the scope's fields, not the whole value

```sql
SELECT 1 FROM permission_grants
WHERE permission = $1
  AND role = ANY($2)
  AND scope->>'type' = 'process'
  AND scope->'config'->>'processId' = $3
LIMIT 1
```

Matching the extracted fields survives a later version that adds a key to a
scope's `config`. A whole-value equality would match nothing the day that
happens.

The primary key is the index. It is a btree on `(role, permission, scope)`,
and it leads with `role`, the selective column. `permission` holds three
values. An `= ANY` list on a leading key column is an index scan, so the
lookup needs no second index. A `(permission, role)` index would lead with the
weaker column and duplicate what the key already covers.

A second scope type later adds a second branch here. A third adds a resolver.
Neither one moves a call site, which is the property the `{type, config}`
envelope buys.

### `src/auth/grants.ts` holds the SQL, `authorize.ts` holds none

A new module carries the row type, its Zod schema and four functions:
`listGrants`, `writeGrant`, `revokeGrant`, `hasGrant`. `authorize.ts` imports
`hasGrant` alone. The three routes import the other three.

The Zod schema does NOT go in `src/schema/definition.ts`. That file is the
definition contract. A permission grant is an installation concern, and never
appears in a `ProcessBody`. Putting it there would change the contract as a side
effect of another task.

The scope schema is strict on write and lenient on read. `writeGrant` parses
against a discriminated union of one member. An unknown `type` therefore answers
`400`. `listGrants` returns the stored `jsonb` and parses it again nowhere. A
row an older release cannot interpret therefore stays listable and revocable.

### The store does not check that the process exists

ROADMAP.md stage 40 leaves one gap open. A scoped grant names an existing
process id. The publish route mints a new process, where that id is fresh. A
first publish therefore stays a global question.

The gap is narrower than the roadmap says. The draft carries the id from its
first save. An operator reads it off the draft and writes the grant before
anybody publishes.

This design closes that gap with neither a foreign key nor an existence check.
Two reasons rule both out. A check creates an ordering trap. An operator
provisioning a new process could not write its grant until after somebody
publishes the process once. That first publish is the call the grant was meant
to admit. A foreign key to `definitions` would also give version deletion and
retention a new edge to honour.

So an operator MAY pre-write a grant for an id nobody has published, and that
grant admits the first publish. Where nobody wrote one, the roadmap's statement
holds unchanged. The id is fresh, no grant names it, and the global role
decides.

### A grant is not cached and rides in no token

`admin-user-management` states that a role change does not reach an
already-issued token. Roles ride in the token's claim, which is why. A grant
does not ride there. The engine reads it per call from the store. So a write
admits on the next call. A revoke refuses on the next call.

That asymmetry belongs in the spec rather than in a reader's inference. The two
surfaces sit next to each other in an operator's mind.

## Risks / Trade-offs

**A grant holder pays an instance load on cancel.**

A `system:cancel-any` holder does not. The design accepts that, and the spec
already states it. `cancelInstance` asks the global question before the load.
It asks the scoped question after the load, because the process id arrives with
the instance. The slow path is the one that used to answer with a refusal.

**`can` going async is a breaking signature change, one commit after the seam
shipped.**

It stays contained. Six call sites, all already `async`, all already holding the
handle. `tsc --noEmit` finds every one. One silent failure mode remains: a
missed `await` on a `Promise<boolean>` inside an `if`. It fails open. Task 5.5
rejects a role-less, grant-less actor at each of the six, which catches it.

**A typo in `permission` or `role` stores a grant that admits nobody.**

The route validates `permission` against the three the `Permission` type
defines. Anything else answers `400`. `role` stays free text on purpose. An
installation grants to a directory group whose name the engine cannot know. A
grant written before that group exists is valid and inert. `GET
/admin/permission-grants` shows a grant that admits nobody.

**The grant list discloses which processes exist, and which role names a
deployment uses.**

`system:admin` gates the list, and the spec states that reason.

**A grant to an Entra ID group lists as a GUID.**

The `groups` claim emits object ids by default, and `claimToRoles` passes them
through. The grant row then names the GUID, and `GET /admin/permission-grants`
shows it. The store is right to hold the id, since that is what the token
carries. A later operator screen settles how a GUID reads. It takes a label
the operator types, or a lookup. This change does not decide which.

**A grant holder reaches publish over HTTP alone.**

The studio shows its publish control to a `system:publish` holder, because the
web areas read `actor.roles`. This change leaves that as it is. The fix is
server-computed `permissions` booleans on the resource views. proposal.md names
it as a follow-on change. Until it lands, a grant works over HTTP alone.

**A grant widens access, so a bad row escalates privilege rather than locking
somebody out.**

Two bounds hold it. A grant reaches only the three process-scoped permissions.
It never reaches `/admin/*`, `/reporting/*` or the studio surface. The spec
carries a scenario for that. A revoke also takes effect at once, because nothing
caches a grant.

### The pure authorization test file splits

`test/auth-authorize.test.ts` claims purity in its header, and it earns that
today. `can` reads an array and answers.

Test 2 reads the store on every false answer. So `can({roles: ["employee"]},
"publish", …)` reaches `hasGrant` and touches `sql`, which throws where
`DATABASE_URL` is unset (`src/engine/store.ts:45`). The file therefore splits.
The role constants, `requireRole` and the export canary stay pure. The `can`
and `requirePermission` tests move behind `test.skipIf(!DB)`.

Two alternatives lose more. A `db: SQL = sql` default would make `src/auth`
import the engine's handle. That is the dependency this module has kept out,
and the false path would still query. Marking the whole file `skipIf(!DB)`
would drop the pure `requireRole` coverage that the capability's oldest
scenarios rest on.

The export canary needs no change. This change adds no export to
`src/auth/authorize.ts`. Both `can` and `requirePermission` keep their names
and gain a signature. `hasGrant` lives in `grants.ts` and stays out of that
list.

## Open Questions

None blocking. Two questions wait, and each has a named owner.

The `scope=all` filter decides how a scope enumerates against a query rather
than against one id. Stage 40 keeps it, and the `authorization` delta states
the constraint any later scope type meets.

The operator screen decides how an Entra ID object id reads to a person. A
grant to a group names the id the `groups` claim emits, and the list shows it.
That question stays with `admin-app`, together with the screen itself.

## Migration Plan

`initSchema` creates the table on the next start. `CREATE TABLE IF NOT EXISTS`
makes that idempotent, the pattern every other table here uses. Nothing
backfills. An empty table is exactly today's behavior, which is the "no caller
gains or loses access" property.

Rollback is a redeploy of the previous release. The table survives, unread, and
the previous `can` answers what it answered before. No stored grant becomes
invalid, so a roll-forward picks them all up again.
