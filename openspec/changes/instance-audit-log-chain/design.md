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
  (`transition.ts:768`) writes `body.status`. Neither writes an audit
  row, because neither changes field data.
- `createProcessInstance` reaches `INSERT INTO instances`
  (`src/engine/store.ts:675`), which the entry omits. Start-form data and
  seeded `FieldDef.default` values arrive there.

The statements that can write an audit row:

| Statement | Source |
|---|---|
| `store.ts:675` `INSERT INTO instances` | creation |
| `transition.ts:381` `applyStepEntry` | submit, or migration |
| `outbox.ts:311` action writeback | writeback |
| `subprocess.ts:213` return writeback | subprocess-return |
| `retention.ts:38` redaction wipe | redaction |

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

### The trigger diffs `body.data`, and fires on insert as well

A plpgsql `AFTER INSERT OR UPDATE ON instances FOR EACH ROW` trigger
walks `NEW.body->'data'` against `OLD.body->'data'`. It writes a row per
differing key. On insert `OLD` is null, so every key differs.

The alternative was writing rows from TypeScript at the five call sites.
That reads better and tests more easily. It also fails the one property
this change exists for. A sixth site added later is complete only if its
author remembers.

`FOR EACH ROW` rather than a statement trigger. The per-instance chain
needs each row's own predecessor.

### Actor and source arrive through `set_config`

A trigger sees `OLD` and `NEW`. It cannot see which TypeScript function
called it. Each write path therefore calls
`SELECT set_config('detent.actor', $1, true)` inside its own
transaction, before its statement, and the matching `detent.source`
beside it. The trigger reads them with
`current_setting('detent.actor', true)`. That second argument returns
null for an unset setting rather than raising.

The consequence is deliberate, and the spec states it. The row is
complete by construction. The attribution is not. A path that forgets the
call writes a null actor and a full field-change record. A query finds
that, unlike a missing row.

Rejected: a `current_user`-based actor, which names the database role
rather than the person. Also rejected: threading an actor column through
every statement. That puts the burden back on each call site and gives up
nothing.

Nothing in `src/` sets a session variable today. `withTransaction` gains
the helper, and the five sites call it.

### The chain hashes in SQL, and verification lives in SQL

Postgres 11 and later ship `sha256()` over `bytea`, so this needs no
`pgcrypto` extension. The trigger hashes the row's metadata, its
`value_hash` and the previous `hash`.

`value_hash` is `sha256(salt || convert_to(value::text, 'UTF8'))`. That
`value::text` is Postgres's own `jsonb` rendering. It sorts and
deduplicates keys, so it is deterministic. It is not RFC 8785. It emits
`{"a": 1}` where `canonical-json.ts` emits `{"a":1}`.

Verification is therefore `verify_instance_chain(instance_id)`, a SQL
function. A TypeScript verifier would have to reproduce a Postgres
formatting detail exactly. It would break silently on the first value
shape nobody tried. Any TypeScript caller calls the function.

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
Redaction stops erasing. Salting everything costs one column and one
function call. It removes that window.

What the recorded design gives up: two rows holding the same value no
longer share a `value_hash`. Nothing reads that property.

### Redaction is its own definer function

`REVOKE UPDATE, DELETE` on `instance_audit` from the application role is
what makes the relation append-only. Clearing a prior row is an `UPDATE`.
So `redact_instance_fields(instance_id, field_ids, actor, reason)` runs
`SECURITY DEFINER`. It is the second deliberate exception beside the
trigger, and `redactInstance` calls it inside its existing transaction.

Both functions stay short enough to read in one sitting. They are the two
holes in the append-only claim, and an auditor will read them.

### The chain head read is safe under the existing locks

Each inserted row needs its predecessor's `hash`. The trigger reads it
with `SELECT hash FROM instance_audit WHERE instance_id = … ORDER BY seq
DESC LIMIT 1`.

Two concurrent writers of one instance cannot interleave there. The
`UPDATE instances` firing the trigger takes that row's lock for the rest
of its transaction. An `AFTER` trigger runs inside it. A second writer
blocks on the row before its own trigger runs. The OCC predicate then
fails it, exactly as today.

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
superuser can also recompute a whole chain. Change 3's signed checkpoint
is what detects a recomputed chain. This change is tamper-evident against
a database reader, never against the database's owner.

**`initSchema` gains DDL that `CREATE TABLE IF NOT EXISTS` does not
cover.**

→ `CREATE OR REPLACE FUNCTION`, and `DROP TRIGGER IF EXISTS` before
`CREATE TRIGGER`, keep a second `initSchema` a no-op. The `REVOKE` is
idempotent already.

**Existing instances carry no audit history.**

→ Nothing backfills them, and nothing can. The old values were never
recorded. An instance predating this change starts its chain at its next
field write. There is no migration step. Rolling back means dropping the
relation.
