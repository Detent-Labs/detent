## Context

See `proposal.md` for motivation. `docs/decisions.md` carries the design
pass this change realizes. Its entry is "Instance audit log: a
tamper-evident change record for field data".

That entry names "all five body-writing sites (`transition.ts`,
`outbox.ts`, `subprocess.ts`, claim/release, `retention.ts`)". Reading
the code corrects it in two places. The corrected list is what this
change plumbs.

- `migrateOne` (`src/engine/migration.ts`) owns no `UPDATE instances`. It
  commits through `applyStepEntry` (`src/engine/transition.ts:381`), the
  statement a participant's submit also uses. Migration is therefore not
  a separate site. Telling the two apart is what the source setting is
  for.
- Claim, release and delegate write `body.assignment`
  (`transition.ts:1009`), never `body.data`. `markFaulted`
  (`transition.ts:768`) writes `body.status`. A timer fire stamps
  `body.timers[n].fired` (`transition.ts:885`). The cancel sweep sets its
  own flag (`transition.ts:614`).
- The resolution worker (`resolution.ts:61`, `resolution.ts:114`) and the
  out-of-scan timer push (`timers.ts:35`) write promoted columns beside
  the body. None of these seven statements writes an audit row, because
  none changes field data.
- `createProcessInstance` reaches `INSERT INTO instances`
  (`src/engine/store.ts:675`), which the entry omits. Start-form data and
  seeded `FieldDef.default` values arrive there.

The statements that can write an audit row:

| Statement | Source |
|---|---|
| `store.ts:675` `INSERT INTO instances` | `creation` |
| `transition.ts:381` `applyStepEntry` | `submit`, or `migration` |
| `outbox.ts:311` action writeback | `writeback` |
| `subprocess.ts:213` return writeback | `subprocess-return` |
| `retention.ts:38` redaction wipe | `redaction` |

The `creation` source covers three callers of `createInstance`. A
participant creating an instance reaches `runtime/api.ts:943`. A
subprocess spawn and the `process.start` handler both reach
`seeded-create.ts:91`. The third caller is `transition.ts:722`.

The instance's own parent link is where a reader tells a spawned child
from a top-level one. The actor comes from `opts.startedBy`. A spawn
supplies none, so a spawned child's creation entries carry the source
and a null actor.

Two further constraints shape the approach. `transition.ts` relies on
optimistic concurrency rather than `SELECT … FOR UPDATE`. And the repo's
canonicalizer `src/schema/canonical-json.ts` runs in TypeScript, never
in SQL.

## Goals / Non-Goals

**Goals:**

- One audit row per changed field. The rows come from below every
  statement, rather than from beside each of them.
- A chain a later verification can check without trusting the
  application.
- Redaction that keeps working, from the first row this change writes.

**Non-Goals:**

- No reader. This change ships no route, no runtime API and no screen. A
  reader reaches the log through `psql`.
- No cross-instance redaction. A request arrives as "this person's data",
  never as an instance id. Finding every instance holding that person
  needs query machinery that does not exist.
- No performance work beyond a single index. See the volume risk below.

## Decisions

### The relation's shape

`instance_audit` carries `PRIMARY KEY (instance_id, seq)`. That pair is
an entry's identity, and it is the order a replay reads in. The primary
key creates the `(instance_id, seq)` index the persistence capability
requires. No second index follows it. The DDL in `store.ts` carries the
source comment naming that index's two readers, the way the existing
indexes there do.

Beside the key the relation holds `transition_seq`, `field_id`, `op`,
`value`, `actor`, `source`, `reason`, `at`, `salt`, `value_hash`,
`prev_hash` and `hash`. The `reason` column is null on a `set` row. A
`redact` row carries the redaction's stated reason. `value_hash`,
`prev_hash` and `hash` are `NOT NULL`. The `at` column is `timestamptz
NOT NULL DEFAULT now()`. `salt` and `value` are nullable: a redaction
clears the pair together.

### The trigger diffs `body.data`, and fires on insert as well

A plpgsql function `instance_audit_diff()` walks `NEW.body->'data'`
against `OLD.body->'data'` for each row `instances` takes. It writes a
row per differing key. On insert `OLD` is null, so every key differs.

The alternative was writing rows from TypeScript at the five call sites.
That reads better and tests more easily. It also fails the one property
this change exists for. A sixth site added later is complete only if its
author remembers.

`FOR EACH ROW` rather than a statement trigger. The per-instance chain
needs each row's own predecessor.

<!-- antislop: allow sentence-length synonym-rotation -->
<!-- The `WHEN` clause is quoted verbatim: its SQL tokens count as prose words, and its literal UPDATE reads as a synonym for change. -->
Two triggers, not one. `instance_audit_insert_trg` fires `AFTER INSERT`
and carries no `WHEN` clause, since every key of a new row's data
differs. `instance_audit_update_trg` fires `AFTER UPDATE` and carries
`WHEN (OLD.body->'data' IS DISTINCT FROM NEW.body->'data')`. Both call
`instance_audit_diff()`, so the diff has a single implementation.

A combined `AFTER INSERT OR UPDATE` trigger could carry neither clause.
Its `WHEN` may not reference `OLD`, so the guard would live in the
function body instead. The split moves that comparison into the
executor's `WHEN` evaluation. The seven non-data writes the Context
lists then never enter plpgsql.

### Actor and source arrive through `set_config`

A trigger sees `OLD` and `NEW`. It cannot see which TypeScript function
called it. Each write path therefore calls
`SELECT set_config('detent.actor', $1, true)` inside its own
transaction, before its statement, and the matching `detent.source`
beside it. The trigger reads them with
`nullif(current_setting('detent.actor', true), '')`.

That second argument returns null on a connection that never wrote the
placeholder. A connection that wrote it in an earlier transaction resets
it to the empty string instead. The trigger therefore wraps the read in
`nullif(…, '')`, and both cases reach the column as NULL. Measured on
Postgres 16.14, the reset lands the empty string whether that earlier
transaction committed or rolled back.

The engine runs on a pool, and every write path writes both
placeholders. So the empty string is what an unattributed write reads on
nearly every connection. Without the `nullif`, the null-actor query this
capability's spec promises returns nothing.

An `Actor.id` is never the empty string, so the `nullif` collapses no
value a resolver can hand it.

The consequence is deliberate, and the spec states it. The row is
complete by construction. The attribution is not. A path that forgets the
call writes a null actor and a full field-change record. A query finds
that, unlike a missing row.

Rejected: a `current_user`-based actor, which names the database role
rather than the person. Also rejected: threading an actor column through
every statement. That puts the burden back on each call site and gives up
nothing.

That `true` argument scopes the setting to the transaction, not to the
statement. The helper `withTransaction` joins an open transaction as a
savepoint when its handle is already inside one; on the plain pooled
`db` handle it opens a fresh top-level transaction instead, since the
pooled client carries no `.savepoint` method for `withTransaction` to
find. `createSeededInstance` runs outside any enclosing transaction —
`outbox.ts` deliberately runs every handler outside a transaction
(`drainOutbox`'s `deliver` call precedes its `db.begin` mark block) — so
its own `withTransaction(db, ...)` call opens that fresh top-level
transaction, not a savepoint of any "spawnSubprocess transaction."
`createInstance`'s own `withTransaction` nests as a savepoint inside
THAT transaction instead. The setting lives only for the lifetime of
`createSeededInstance`'s own transaction; `makeSpawnHandler`'s later
`resolveAutomatic` call runs on the raw pooled `db` again, after that
transaction has committed, and any transition it commits opens its own
new transaction with its own `set_config` call immediately before its
own statement. No stale attribution can cross between them. Every site
sets both values immediately before its own statement, rather than
once per transaction.

Every call runs on the enclosing transaction handle, never on the pooled
`db` handle. Five of the six sites already sit inside a
`withTransaction` callback; `outbox.ts`'s sits inside a bare `db.begin`
block, which hands the same kind of transaction-scoped `tx` handle. On
`db` it would run in an implicit transaction of its own, on whichever
connection the pool handed it. The setting would be gone before the
statement it was meant to attribute.

Nothing in `src/` sets a session variable today. The helper lands beside
`withTransaction`, and six call sites use it over the five statements
above. Both `commitTransition` and `migrateOne` reach `applyStepEntry`,
which is what the source setting tells apart.

### The chain hashes in SQL, and verification lives in SQL

<!-- antislop: allow sentence-length -->
<!-- The CREATE EXTENSION statement is quoted verbatim; its SQL tokens count as prose words. -->
Postgres 11 and later ship `sha256()` over `bytea` in core. The salt's
`gen_random_bytes` does not. It comes from `pgcrypto`, which
`initSchema` installs as `CREATE EXTENSION IF NOT EXISTS pgcrypto WITH
SCHEMA public`. A bare `CREATE EXTENSION` lands in the first schema of
whatever search path `initSchema` ran under. The append function calls
`public.gen_random_bytes` under a pinned path, so `WITH SCHEMA` pins the
extension to match. That clause beside `IF NOT EXISTS` stays a no-op
where the extension already exists.

<!-- antislop: allow sentence-length -->
<!-- The hash formula is quoted verbatim; its SQL tokens count as prose words. -->
The trigger computes `hash = sha256(convert_to(concat_ws(E'\x1e',
instance_id, seq, transition_seq, field_id, op, coalesce(actor,
E'\x1f'), coalesce(source, E'\x1f'), coalesce(reason, E'\x1f'),
extract(epoch from at)::numeric::text), 'UTF8') || value_hash ||
prev_hash)`. The digest leaves out `value` and `salt` on purpose. A
redaction nulls both, and every earlier row must still verify afterwards.

The digest is null-safe, and injective with it. The `actor`, `source`
and `reason` columns are nullable. A `||` would propagate a NULL into a
NOT NULL column, so `concat_ws` joins them instead.

`concat_ws` alone does not get there. It drops a NULL argument together
with its separator. Every argument after it slides one place left, and a
null column lets its neighbour stand in for it. Two such rows carry one
digest, measured on Postgres 16.14. One holds a null `reason`, the other
a null `actor`. Anyone able to rewrite a row could null an attribution
out, and the chain would still verify.

Each of the three therefore enters the digest as `coalesce(col,
E'\x1f')`. That unit separator is a byte no column can hold, which is
what keeps the encoding injective.

The `\x1e` record separator cannot appear in a column the digest covers
either. The append function is what makes that true. An assertion alone
would not. `instance_audit_append` raises on an `instance_id`, a
`field_id`, an `actor`, a `source` or a `reason` holding `\x1e` or
`\x1f`.

The three `coalesce` calls close only the three nullable columns. The
`transition_seq` column carries `NOT NULL` for the same reason. The
append function rejects both separators in `instance_id` and `field_id`
as well. Every argument `concat_ws` receives is then non-null and
separator-free.

Measured on Postgres 16.14, one digest covers two rows. The first
carries a null `transition_seq` and a `field_id` of `'7' || E'\x1e' ||
'fld_a'`. The second is an ordinary row whose `transition_seq` is 7 and
whose `field_id` is `fld_a`. That is the same gap the paragraphs above
close for `actor` and `reason`, one column further along.

Neither rejection can fire in ordinary operation. An `instance_id`
carries `inst_` plus a canonical UUID (v4 via `crypto.randomUUID()` for
a participant-created or chained instance, v5 via the hand-rolled
`uuidv5` in `idempotency.ts` for a subprocess spawn) — hex digits and
dashes only, in both cases. A `field_id` is a `FieldDef.key`, which
`compile.ts` already holds to `/^[a-z_][a-z0-9_]*$/`. The `NOT NULL`
breaks no writer either: the
trigger copies `NEW.transition_seq` from a column `instances` already
declares `NOT NULL`, and `redact_instance_fields` receives
`inst.transitionSeq`, a required number on `instanceSchema`.

Two of those three have no controlled alphabet. A `reason` comes from a
caller, and a later change routes it from an HTTP body. An `actor`
carries an `Actor.id`, which the dev-header and JWT resolvers fill from
outside the process. The rest of the digest is ids, a source token from
a fixed set, and a rendered number.

The `at` column enters the digest as `extract(epoch from
at)::numeric::text` rather than as `at::text`. A `timestamptz` renders
through the session's `TimeZone` and `DateStyle`. A chain written from
Bun.sql and verified from `psql` would otherwise read as tampered. The
epoch rendering depends on neither.

`value_hash` is `sha256(salt || convert_to(value::text, 'UTF8'))`. That
`value::text` is Postgres's own `jsonb` rendering. It sorts and
deduplicates keys, so it is deterministic. It is not RFC 8785. It emits
`{"a": 1}` where `canonical-json.ts` emits `{"a":1}`.

A removed key's entry stores JSON null (`'null'::jsonb`), never SQL
NULL. `'null'::jsonb::text` renders `null`, so the digest still
computes. SQL NULL in `value` means one thing only: a redaction cleared
it.

An instance's first row takes `prev_hash = sha256(''::bytea)`. That is
the fixed empty value the chain starts from, and a verification
recomputes it the same way.

The trigger function and `instance_audit_append` are both declared `SET
search_path = pg_catalog, public`, the same pin the redaction function
carries. The trigger calls `public.gen_random_bytes`, and a trigger runs
under whatever search path its invoking statement set.

Verification is therefore `verify_instance_chain(instance_id)`, a
database function, in plpgsql like the append and diff functions. The
running `prev` accumulator it walks the chain with has no `LANGUAGE sql`
form short of a recursive CTE. A TypeScript verifier would have to
reproduce a Postgres
formatting detail exactly. It would break silently on the first value
shape nobody tried. Any TypeScript caller calls the function.

Its signature is `verify_instance_chain(instance_id text) RETURNS TABLE
(ok boolean, failed_seq bigint)`. An intact chain returns one row,
`(true, NULL)`.

Verification does two things per row. It recomputes `hash` from the
row's metadata, its stored `value_hash` and its predecessor's `hash`. It
also recomputes `value_hash` from `salt || convert_to(value::text,
'UTF8')`, but only where `salt IS NOT NULL`. A redacted row's
fingerprint is unverifiable against a value that no longer exists. That
is the one check redaction deliberately gives up.

Rejected: canonicalizing to JCS inside the trigger. It buys a
cross-language hash nobody needs. It also duplicates a rule
`canonical-json.ts` already owns.

### The trigger salts every row's `value_hash`

`docs/decisions.md` hashes a plain field's value directly, and salts only
a `redactable` field. This change salts every row with
`gen_random_bytes(16)`. `FieldDef.redactable` moves to change 2 as a
pure authoring-time signal.

The reason is ordering. Land the trigger without the salt and the
null-priors function, and `redactInstance` still wipes
`instances.body.data` while `instance_audit` keeps every clear value.
Redaction no longer erases. Salting everything costs one column and one
function call. It removes that window.

What the recorded design gives up: two rows holding the same value no
longer share a `value_hash`. Nothing reads that property.

### Who owns the audit relation

A `REVOKE` aimed at a relation's owner also binds a `SECURITY DEFINER`
function that same owner owns. Measured against this repo's Postgres 16:
`REVOKE UPDATE, DELETE ON aud FROM app_probe`, then a definer function
owned by `app_probe` running `UPDATE aud`, gives
`ERROR: permission denied for table aud`. `initSchema`
(`src/engine/store.ts:76`) runs on the engine's own connection under one
`DATABASE_URL`. That one role therefore owns both the relation and the
function, and a revoke would name that same role. A revoke cannot carve
out the redaction function.

<!-- antislop: allow synonym-rotation -->
<!-- `ALTER` and `UPDATE` are SQL keywords in this paragraph, not synonyms for change. -->
Least-privilege grants replace it. `initSchema` creates a login-less
owner role with `CREATE ROLE detent_audit_owner NOLOGIN`, guarded on
`pg_roles` and trapping `insufficient_privilege` beside
`duplicate_object`. It then creates `instance_audit` and
`redact_instance_fields` inside a `withTransaction` block opening with
`SET LOCAL ROLE detent_audit_owner`, so the owner role creates both
objects itself. The role the engine connects as receives
`GRANT INSERT, SELECT ON instance_audit` and `GRANT EXECUTE ON FUNCTION
redact_instance_fields`, and receives no `UPDATE` and no `DELETE` at
all.

Both grants name that role by the name `initSchema` captured before it
opened the block. Inside the block `current_user` reads as the owner
role. A grant to `current_user` there hands the owner privileges to
itself and leaves the engine's role with none. Measured on Postgres
16.14, the database then refuses the engine's role its own `INSERT`, and
every write to `instances` fails inside the trigger.

A `REVOKE EXECUTE ON FUNCTION redact_instance_fields FROM PUBLIC`
precedes the grants. A function created with no explicit ACL carries
`EXECUTE` for `PUBLIC`. Without the revoke, every role that can connect
to a tenant database can null another instance's audit values. The one
deliberate hole in the append-only property belongs to the engine's role
alone.

No `ALTER ... OWNER TO` appears anywhere. Measured on Postgres 16.14,
that statement raises `must be owner of table` against a role holding no
membership. It raises again on the run after the ownership is already
correct. A
`CREATE OR REPLACE FUNCTION` raises the matching error. Creating both
objects under `SET LOCAL ROLE` avoids the pair.

The `SET LOCAL` has to sit inside a transaction. `initSchema` issues
bare statements on the pooled `db` handle. A plain `SET ROLE` would not
survive to the next statement on a different pooled connection.

One grant comes before that block. So `initSchema` issues
`GRANT CREATE ON SCHEMA public TO detent_audit_owner` first. A role
creating a relation needs `CREATE` on its schema. Postgres 15 removed
`public`'s default `CREATE` for `PUBLIC`. The `CREATE TABLE` otherwise
fails with `permission denied for schema public`. A superuser skips that
check, so the devcontainer would not have caught it.

The append-only property then rests on a grant nobody made, rather than
on a revoke a definer function walks past. The definer function holds its
owner's own `UPDATE`, which is what lets it null a prior row.

Creating those objects under `SET LOCAL ROLE` requires membership in the
owner role, and it requires that membership to carry `SET`. On Postgres
16 `SET` is a grant of its own, and membership does not imply it. The
automatic row a `CREATEROLE` creator gets for a role it just created
carries `set_option = false`. Measured on Postgres 16.14, `SET LOCAL
ROLE` against it answers `permission denied to set role`. An explicit
grant is what supplies `SET`, since a grant issued without `WITH SET
FALSE` defaults it to true.

Membership also carries far
more by default. A plain grant of the membership follows the grantee's
`rolinherit`, true unless somebody set it otherwise. The engine's role
then holds the owner's `UPDATE` and `DELETE` with no `SET ROLE` at all.
Measured on Postgres 16.14, both statements land against
`instance_audit`. The grant model then states nothing true.

The grant of membership therefore reads `WITH INHERIT FALSE`, and
nothing else. The database then refuses those same two statements, while
`set_option` stays true and the role can `SET ROLE detent_audit_owner`,
so the DDL block runs. Measured on Postgres 16.14 with both rows
present, the member's direct `UPDATE` and `DELETE` stay refused.

<!-- antislop: allow synonym-rotation -->
<!-- "ADMIN OPTION" is the clause's own name. -->
No `ADMIN OPTION` clause. A role that created the owner already holds
that privilege. Asking for it a second time raises sqlstate `0LP01`,
`invalid_grant_operation`, which the `insufficient_privilege` trap
around the grant does not catch.

The engine's role can still assume the owner role and reach past its own
missing grants. The grants block an accidental `UPDATE`, not a
deliberate one. Appending is therefore the only write the engine's role
performs without first assuming the owner role. The hash chain, not the
grant, is what makes a deliberate rewrite detectable.

### Redaction is its own definer function

The engine's role holds no `UPDATE` on `instance_audit`, and clearing a
prior row is an `UPDATE`. So `redact_instance_fields(instance_id, actor,
reason, transition_seq)` runs `SECURITY DEFINER`, owned by
`detent_audit_owner`. It is
the one deliberate exception, and `redactInstance` calls it inside its
existing transaction.

`initSchema` declares the function `SECURITY DEFINER SET search_path =
pg_catalog, public`. A definer function without a pinned search path is
the standard privilege-escalation shape. The caller's own path would
otherwise pick the `sha256` and the relation the body resolves to.

`redactInstance`'s signature becomes `redactInstance(instanceId, db =
sql, opts?: { actor?: string; reason?: string })`. The added argument is
trailing and optional, so the automatic sweep's call
(`src/engine/retention.ts:73`) keeps compiling and supplies no actor. The
admin route (`src/http/admin-routes.ts:348`) holds the requesting actor
in scope and passes it.

`redactInstance` passes no field list. The function
`redact_instance_fields(instance_id, actor, reason, transition_seq)`
selects the distinct `field_id`s the instance's own entries hold. The
field-id argument arrives in change 2, once `FieldDef.redactable`
narrows the set.

The function appends its `redact` rows through the same head read and
hash computation the trigger uses. Both call one
`instance_audit_append(...)` plpgsql function, so the chain has one
implementation and not two. The trigger fires on `instances`. A
redaction changes no `body.data`, so the trigger never runs for one.
Without that shared function the appended row would carry no `seq`, no
`prev_hash` and no `hash`.

A `redact` row carries `value` and `salt` both NULL. Inside
`instance_audit_append`, a NULL value takes the branch stamping
`value_hash = sha256(''::bytea)`. That is the fixed empty value an
instance's first row uses for `prev_hash`. A null salt tells verification
to skip the fingerprint check, so the two agree by construction.

Nothing populates `reason` in this change. The admin route parses no
body and the sweep supplies none. The column is null in practice. This
change plumbs `opts.reason` and the column now. They are the half that is
expensive to add later. The route gains a body field in a later change.

`redact_instance_fields` stamps the `transition_seq` its caller passes
on each `redact` row. A `redact` entry then joins to `history_entries`
the way a `set` entry does. Reading that value from `instances` inside
the function does not work. The `SECURITY DEFINER` marking switches the
effective role to `detent_audit_owner`, which owns the audit relation
and nothing else. Measured on Postgres 16.14, the read raises
`permission denied for table instances`.

Every redaction would throw, from the admin route and from the automatic
sweep alike. The caller already parses the instance at
`retention.ts:26`. It passes `inst.transitionSeq` as the fourth argument
instead. That is cheaper than widening the owner role's reach.

`redactInstance` calls `redact_instance_fields()` AFTER the `data = {}`
wipe, in the same transaction, so the wipe's own entries fall under the
nulling.

The devcontainer connects as the `postgres` superuser, whom no grant
restrains. The guarantee is therefore stated against a non-superuser
role, and the tests create one to prove it there. Create the role in
`test/preload-db.ts`, the only once-per-run hook, and grant it `CONNECT`
on the derived test database.

<!-- antislop: allow sentence-length -->
<!-- The CREATE ROLE statement is quoted verbatim; its SQL tokens count as prose words. -->
The statement is `DO $$ BEGIN CREATE ROLE detent_audit_probe LOGIN
PASSWORD 'probe'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`.

A TypeScript `try`/`catch` around it logs a named skip and continues. A
maintenance role without `CREATEROLE` raises 42501 whether or not the
role is already there. An uncaught throw in a preload takes down every
suite. The privileges suite guards on the probe role's absence with
`test.skipIf`, the way the DB suites guard on `!DB`.

The `LOGIN` and the password are what let a suite open a second client
as that role. That hook runs before any suite calls `initSchema`, so
`instance_audit` does not exist there yet. The privileges suite
therefore issues the probe role's own `INSERT`, `SELECT` and `EXECUTE`
grants itself, after `initSchema` has run. It connects on `DATABASE_URL`
with the role name and the password swapped.

The function stays short enough to read in one sitting. It is the one
hole in the append-only claim, and an auditor will read it.

### The chain head read is safe under the existing locks

Each inserted row needs its predecessor's `hash`. The trigger reads it
with `SELECT hash FROM instance_audit WHERE instance_id = … ORDER BY seq
DESC LIMIT 1`.

`seq` is `coalesce(head.seq, 0) + 1`, read in the same head query as
`prev_hash`, so both come from one index seek on `(instance_id, seq)`.

The append function `instance_audit_append()` is `VOLATILE`, the
default. A `STABLE` marking would let one statement's later rows miss the
rows its earlier iterations appended. Every field of one write then takes
the same `seq`, and the primary key rejects it.

Two concurrent writers of one instance cannot interleave there. The
`UPDATE instances` firing the trigger takes that row's lock for the rest
of its transaction. An `AFTER` trigger runs inside it. A second writer
blocks on that row lock until the first transaction commits, so the two
head reads cannot interleave.

The `redact_instance_fields` function runs inside `redactInstance`'s
transaction. That transaction already holds the instance row under
`SELECT … FOR UPDATE` (`retention.ts:21`). The same row lock orders its
own head read.

### `instance_audit` carries no foreign key to `instances`

34 suites truncate `instances` alone and an FK would fail every one;
`history_entries` and `instance_events` carry none either, for the same
reason. Each of those suites gains `instance_audit` in its own
`TRUNCATE` list instead.

Test cleanup uses `DELETE FROM instance_audit` under `SET LOCAL ROLE
detent_audit_owner`, not a grant to the connecting test role. The
devcontainer's `DATABASE_URL` is the `postgres` superuser, so this
isn't required for correctness today — a plain `DELETE` would work —
but it keeps the suite decoupled from that superuser assumption for a
future non-superuser test environment.

## Migration Plan

Existing instances carry no audit history. Nothing backfills them, and
nothing can. The old values were never recorded. An instance predating
this change starts its chain at its next field write. There is no
migration step. Rolling back means dropping the relation.

`initSchema` fixes the bootstrap order. The `CREATE EXTENSION IF NOT
EXISTS pgcrypto WITH SCHEMA public` statement runs first. The trigger
function calls `gen_random_bytes`. `initSchema` creates the owner role before the
relation it comes to own. The grants run after the relation and the
function exist.

`initSchema` runs against every tenant database, so the `CREATE
EXTENSION` runs once per tenant. A role is cluster-wide while
`initSchema` runs per tenant database. A guard therefore wraps the
`CREATE ROLE`, and bootstrapping needs `CREATEROLE`. A duplicate guard
alone does not survive a least-privileged engine role.

Measured on Postgres 16.14, Postgres checks the `CREATEROLE` attribute
before it checks whether the role exists. A role without the attribute
gets `permission denied to create role`, 42501. That holds even where
the owner role already exists. 42501 is not `duplicate_object`, so the
guard tests
`pg_roles` first and traps `insufficient_privilege` beside it. Without
that, `initSchema` raises in precisely the cluster this design means to
keep booting.

What the skip degrades to is worth stating plainly. The relation, the
redaction function and both triggers sit inside the one guarded block. A
cluster that skips it has none of the four. The engine keeps writing
instances and records no audit entries. The warning says so, and the log
stays switched off until a superuser runs the remediation.

That is also why the triggers cannot live outside the block. A trigger
created against a missing relation raises nothing until the first
`INSERT INTO instances`. Postgres resolves a plpgsql body's relations at
call time. So `initSchema` would return, the server would accept
requests, and every instance write would throw.

Bootstrapping also needs `CREATE WITH GRANT OPTION` on schema `public`,
or ownership of the schema, to pass that `CREATE` on to the owner role.
Missing it does not raise. Measured, a role that cannot pass `CREATE` on
gets `WARNING: no privileges were granted for "public"` and then
`GRANT`. The error surfaces one statement later, as `permission denied
for schema public` on the `CREATE TABLE`.

<!-- antislop: allow synonym-rotation -->
<!-- "admin option" is the Postgres privilege's own name, not a synonym for the transaction setting above. -->
Creating a role gives its creator admin option on it. On Postgres 16
nothing else does. Granting membership needs that admin option. The
engine's role holds one only where it created the role itself. So
`initSchema` issues `GRANT detent_audit_owner TO current_user WITH
INHERIT FALSE` inside a `DO` block trapping
`insufficient_privilege`. Unguarded, that grant
raises `must have admin option` against a cluster where a DBA created
the role first.

The clause carries no `ADMIN OPTION`. The creator already holds that
privilege, and Postgres 16 refuses a re-grant of it back to one's own
grantor. Measured on Postgres 16.14, that refusal is sqlstate `0LP01`,
`invalid_grant_operation`, which the trap above does not catch. A
superuser creating the role gets no automatic membership row at all. It
never meets the refusal, so the devcontainer would not have caught this
either.

The owner DDL block sits under the same trap. Where the membership is
missing, `initSchema` skips the block rather than failing. It issues a
`RAISE WARNING` enumerating the whole manual remediation in order. That
order is the schema grant, the membership grant with `INHERIT FALSE`,
then the object statements. A superuser runs those
once.

Naming the object statements alone leaves the schema grant missing, and
the next run warns again. That is the restore case the `pg_dump` risk
names. The tests create their own non-superuser role once, in
`test/preload-db.ts`.

## Risks / Trade-offs

**A bulk migration writes one row per changed field per instance.**

→ Each row costs a head read. 100k instances at 10 fields is 1M rows.
That is 1M index seeks in one batch loop. Measure before optimizing.

The upgrade path is an `audit_head_hash` and `audit_seq` pair of columns on
`instances`. That turns the head read into the row the statement already
holds. Leave a `ponytail:` comment on the head read naming the ceiling.
Do not add those columns first.

**The trigger is plpgsql that `tsc` never typechecks.**

→ Every requirement in the spec ships a `bun:test` case against a real
database, where the DB suites already run. A trigger bug then surfaces as
a failing assertion rather than as a compile error.

**A superuser can still rewrite the log.**

→ `docs/decisions.md` states this as a non-goal, and nothing here changes
it. `session_replication_role = replica` silences the trigger. A
superuser can also recompute a whole chain. Truncating a chain's tail
fails no verification either. What remains is a shorter chain that is
perfectly self-consistent. Change 3's signed checkpoint over the chain
heads is what detects both. This change is tamper-evident against
a database reader, never against the database's owner.

**The engine's role can reach the owner role.**

→ Creating the audit objects requires membership, and membership carries
`SET ROLE`. Membership also carries the owner's privileges outright
unless the grant says `INHERIT FALSE`, which is why `initSchema`'s grant
does. Measured on Postgres 16.14, an inheriting member's direct `UPDATE`
and `DELETE` against the relation both land. Under `INHERIT FALSE` the
database refuses both, and `SET ROLE` still works.

The grants block an accidental
`UPDATE`, not a deliberate one. The
guarantee is against a compromised query path, not against the engine's
own code. The hash chain, not the grant, is what makes a deliberate
rewrite detectable.

**The owner role does not travel with a `pg_dump`.**

→ A restore into a fresh cluster must create `detent_audit_owner` first.
It must also grant that role to the engine's role with admin option and
`INHERIT FALSE`.
Otherwise `pg_restore` fails on the ownership statements. A superuser
restore
that skips them leaves the relation owned by the restoring role,
silently removing the guarantee. The `backup-restore-runbook` capability
gains a `pg_dumpall -g` step in a follow-up change, not this one. One
role serves every tenant database, since roles are cluster-scoped.

**One owner role spans every tenant in a cluster.**

→ The owner role is the schema's first cluster-scoped object. Roles are
cluster-scoped. Databases are not. Every tenant's engine role therefore
holds membership in the same one.

Connection privilege still bounds the
reach. A role reaches another tenant's audit relation only by connecting
to that tenant's database. That is the `multi-tenancy` capability's own
connection-is-the-boundary rule, and it stays intact. A per-tenant owner
role is the alternative if it ever stops being enough.

**The claim UPDATE evaluates a `WHEN` clause on every row it touches.**

→ `resolution.ts:61` claims up to 100 rows per pass. The two-trigger
split above keeps all 100 out of plpgsql. What stays is the `WHEN`
clause itself. For each row the executor detoasts both `body->'data'`
values and compares them, and finds them equal every time. That
comparison, not a plpgsql entry, is what to measure. Measure a pass
before and after.

**The hash formula has no version.**

→ One hard-coded digest covers every row. Adding a column to the digest
later makes every pre-existing chain read as broken. A reader cannot tell
that apart from tampering, and change 3's signed checkpoints go with it.

This change adds no `hash_version` column. No deployment runs this engine
and no chain exists. A formula change before the first row lands costs a
`DROP TABLE` and nothing else. The Migration Plan already names that as
the rollback. Settle the column list before that first row.

The redaction function's signature is the same kind of settling. Change
2 adds a field-id argument to it. A `CREATE OR REPLACE FUNCTION` cannot
change a signature. It creates an overload and leaves the four-argument
version behind. Change 2's `initSchema` therefore needs a `DROP FUNCTION
IF EXISTS redact_instance_fields(text, text, text, bigint)` before the
create.

**`initSchema` gains DDL that `CREATE TABLE IF NOT EXISTS` does not
cover.**

→ `CREATE OR REPLACE FUNCTION`, and a `DROP TRIGGER IF EXISTS` before
each of the two `CREATE TRIGGER` statements, keep a second `initSchema` a
no-op. The guarded `CREATE ROLE`, the grants and the `CREATE EXTENSION
IF NOT EXISTS` are idempotent already.

Two of those statements stay idempotent only because the owner role
creates its own objects under `SET LOCAL ROLE`. Measured on Postgres
16.14, a `CREATE OR REPLACE FUNCTION` raises `must be owner of
function`. The function's owner is another role. The same holds for
`ALTER TABLE ... OWNER TO`. It raises `must be owner of table` even
where the table already has the target owner.

So `ALTER ... OWNER TO` is no no-op. Trapping it would make every run
emit a warning naming statements a DBA already issued. Under the owner's
own role the replace succeeds, and the function keeps its owner, its
`prosecdef` and its `proconfig` search path. The second-run test
therefore runs as a non-superuser role owning schema `public` and
holding the membership. In the devcontainer `initSchema` connects as
`postgres`, whom none of these checks reach.

**An actor id or reason containing `\x1e`/`\x1f` makes
`instance_audit_append` raise, failing the whole instance write, not
just the audit row.**

→ `Actor.id` is attacker-influenced under a compromised or malicious
JWT issuer in production, and trivially caller-controlled via the
non-production `devHeaderResolver`'s `X-Actor-Id` header in the
dev/demo/test configuration this repo itself runs. Accepted for this
change — raising is strictly better than silently corrupting digest
injectivity — but a defensive strip/reject at actor-resolution time
(`src/auth/jwt.ts`, `src/auth/resolve.ts`) is the natural fix, left to a
later change.

## Open Questions

- Whether the actor identities in `history_entries` and in an instance's
  claim records are themselves redactable. This change clears field
  values and nothing else. A request naming a person may reach further.
- How a "this person's data" request maps to instance ids. Redaction
  takes one instance id today. Finding every instance holding a named
  person needs cross-instance query machinery that does not exist.
- What volume makes the per-row head read too expensive. The
  `audit_head_hash` and `audit_seq` columns on `instances` are the answer
  when it does. A measured bulk migration is the trigger condition for
  adding them, not a projection.
