## 1. Schema

Task 1.2's `CREATE TABLE` is not runnable standalone: see task 5.4.

<!-- antislop: allow sentence-length -->
<!-- The CREATE EXTENSION statement is quoted verbatim; its SQL tokens count as prose words. -->
- [x] 1.1 Add `CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA
  public` to `initSchema`. That matches the `public.gen_random_bytes`
  the append function calls under its pinned search path. Verify a fresh
  `initSchema` installs it into `public`, and that a second run is a
  no-op
- [x] 1.2 Add the `instance_audit` DDL to `initSchema`, keyed
  `PRIMARY KEY (instance_id, seq)`. Carry the columns `design.md`'s
  "The relation's shape" names, with `seq` and `transition_seq` as
  `bigint`. Declare `transition_seq`, `field_id`, `op`,
  `value_hash`, `prev_hash` and `hash` NOT NULL. A null `transition_seq`
  lets the next column slide into its place inside `concat_ws`. Add a
  `CHECK (op IN ('set','redact'))`, and declare `at` as
  `timestamptz NOT NULL DEFAULT now()`. Leave `salt` and `value`
  nullable, since a redaction clears both.

  Verify a fresh `initSchema` creates it. This `CREATE TABLE` is one of
  task 5.4's three owner-block statements. Write it inside that block,
  not as a bare statement
- [x] 1.3 Comment the `instance_audit` DDL in `store.ts`, above the
  relation, in the style the existing indexes use. Name the index's two
  readers, the ordered replay and the chain-head read. Verify
  `pg_indexes` lists the index
- [x] 1.4 Add `instance_audit` to every `beforeEach` TRUNCATE list naming
  `instances`; verify no suite sees another suite's audit rows. Delete
  rather than truncate. The engine's role holds no `TRUNCATE` and no
  `DELETE` on the relation. The suites' cleanup therefore runs `DELETE
  FROM instance_audit` under a `SET LOCAL ROLE detent_audit_owner`. This
  is consistent with `design.md`'s "`instance_audit` carries no foreign
  key to `instances`" section. This binds the test harness only; the
  append-only requirement still binds the engine's role at runtime
- [x] 1.5 Verify a second `initSchema` run leaves the relation and its
  rows untouched

## 2. Trigger

<!-- antislop: allow sentence-length -->
<!-- The digest is quoted verbatim so the trigger and the verifier cannot drift; its SQL tokens count as prose words. -->
- [x] 2.1 Write `instance_audit_append(instance_id, transition_seq,
  field_id, op, value, actor, source, reason)`, carrying the head read,
  the `salt` via `gen_random_bytes(16)`, the `value_hash` and the digest
  `sha256(convert_to(concat_ws(E'\x1e', instance_id, seq, transition_seq,
  field_id, op, coalesce(actor, E'\x1f'), coalesce(source, E'\x1f'),
  coalesce(reason, E'\x1f'), extract(epoch from at)::numeric::text),
  'UTF8') || value_hash || prev_hash)`. Those three `coalesce` calls
  carry the injectivity, since `concat_ws` drops a NULL argument
  together with its separator and lets the next column take its place.
  Bind
  `at := now()` into a local and insert that value, so the digest hashes
  the instant the row stores. A NULL `value` takes a second branch,
  stamping `value_hash = sha256(''::bytea)` and leaving `salt` null.
  Reject an `instance_id`, a `field_id`, an `actor`, a `source` or a
  `reason` holding `E'\x1e'` or
  `E'\x1f'` with a `RAISE EXCEPTION`; verify the raise for each of the
  five arguments and for both bytes. Write the
  plpgsql diff function `instance_audit_diff()` calling it, over
  `jsonb_object_keys(OLD.body->'data')` UNION
  `jsonb_object_keys(NEW.body->'data')` so a key only the old data holds
  still reaches the diff, copying `NEW.transition_seq` onto each row.
  Declare both
  `SET search_path = pg_catalog, public`, since the append calls
  `public.gen_random_bytes`

  The first two rejections matter as much as the last three. A null
  `transition_seq` beside a `field_id` carrying a separator collides
  with an ordinary row, measured on Postgres 16.14. Task 1.2's NOT NULL
  closes the other half of that pair
<!-- antislop: allow synonym-rotation -->
<!-- `UPDATE` and `INSERT` name SQL statements in this task, not synonyms for a field data change. -->
- [x] 2.2 Attach two triggers calling `instance_audit_diff()`:
  `instance_audit_insert_trg` as `AFTER INSERT ... FOR EACH ROW` with no
  `WHEN`, and `instance_audit_update_trg` as
  `AFTER UPDATE ... FOR EACH ROW WHEN (OLD.body->'data' IS DISTINCT FROM
  NEW.body->'data')`.

  Both `CREATE TRIGGER` statements run inside task 5.4's guarded block,
  after the `CREATE TABLE`. A cluster that skips that block then holds
  no relation and no triggers. The engine keeps writing instances and
  records no audit rows, rather than failing every write. Outside the
  block the triggers would attach to `instances` on a cluster holding no
  `instance_audit`. A plpgsql body resolves its relations at call time.
  Nothing would raise until the first `INSERT INTO instances`, and then
  every one of them would
- [x] 2.3 Verify a direct `INSERT` writes one row per key. This case and
  the rest of the trigger, chain and verification cases land in a new
  `test/instance-audit.test.ts`
- [x] 2.4 Verify an `UPDATE` writes one row per differing key
- [x] 2.5 Verify two rows of one value differ in `value_hash`
- [x] 2.6 Verify `value_hash` against a hand-computed digest
- [x] 2.7 Verify a three-row chain links head to tail
- [x] 2.8 Verify an instance's first row chains from `sha256(''::bytea)`
- [x] 2.9 Verify a join to `history_entries` on the instance and the
  transition sequence returns that transition's rows
- [x] 2.10 Verify a write that removes a key writes a `set` entry whose
  `value` is JSON null and whose `value_hash` is non-null
- [x] 2.11 Add a `ponytail:` comment on the head read naming the
  bulk-migration ceiling
- [x] 2.12 Verify a write touching only `assignment` or `status` leaves
  the relation empty
- [x] 2.13 Verify the resolution worker's claim `UPDATE` writes no audit
  row
- [x] 2.14 Make the DDL idempotent with `CREATE OR REPLACE` and a
  `DROP TRIGGER IF EXISTS` for `instance_audit_insert_trg` and
  `instance_audit_update_trg`; verify a second `initSchema`. Verify that
  second run leaves `pg_class.relowner`, `pg_proc.proowner` and the
  engine role's grants as the first run set them. Run both `initSchema`
  calls as a non-superuser role owning schema `public` and holding
  membership in `detent_audit_owner`. Assert the second one raises
  nothing and warns nothing. In the devcontainer the suite
  connects as `postgres`, and a superuser walks past every ownership
  check this task exists for.

  Not reproducible as written. The shared devcontainer database has
  only one connecting role, `postgres`. No non-superuser role here owns
  schema `public`, for the same reason task 5.12 records.

  The test therefore runs both calls on the shared superuser connection
  instead. It compares ownership and grants before and after. That
  still catches a second run reassigning ownership or re-granting, the
  regression this task guards against.

  It does not exercise task 5.4's `insufficient_privilege` branches.
  Task 5.12 measures the SQLSTATE those branches trap. The full
  degraded-`initSchema` scenario stays a manual check on a virgin
  cluster, as task 5.12 itself says

## 3. Actor and source

- [x] 3.1 Add a `set_config` helper beside `withTransaction`; verify
  `current_setting` reads it back inside one transaction
- [x] 3.2 Read actor and source in the trigger as
  `nullif(current_setting('detent.actor', true), '')` and
  `nullif(current_setting('detent.source', true), '')`; verify a row
  carries both. `current_setting`'s second argument answers null only on
  a connection that never wrote the placeholder. A connection that wrote
  it in an earlier transaction resets it to the empty string instead.
  That holds whether the transaction committed or rolled back, measured
  on Postgres 16.14. The engine runs on a pool, so the empty string is
  what an unattributed write reads in practice. An `Actor.id` is never
  empty, so the `nullif` collapses no value a caller can supply
- [x] 3.3 Verify an unset actor writes a null actor and a full field
  record. Verify an unset source writes a null source and a full field
  record too. Run the unset case on a connection that already committed
  a transaction writing both values. A never-touched connection does not
  reach the reset path task 3.2's `nullif` exists for
- [x] 3.4 Call the helper on the enclosing `tx`, never on `db`, before
  `INSERT INTO instances` (`store.ts:675`), passing `creation` as the
  source and `opts.startedBy` as the actor. Verify a creation entry
  carries both. Verify a subprocess spawn, which supplies no
  `startedBy`, carries the source and a null actor
- [x] 3.5 Call it in `commitTransition` (`transition.ts:437`) on its own
  `tx`, before it reaches `applyStepEntry`, mapping `cause` `user` to
  `submit`. Besides `user`, `commitTransition` passes `timer`,
  `automatic` and `cancel`. None of the three carries field data, so
  none writes a row. The `migration` cause never reaches
  `commitTransition` at all; task 3.6 handles it on `migrateOne`.
  The non-data-write task verifies that. Verify the submit
  source
- [x] 3.6 Call it in `migrateOne` (`migration.ts:527`) with `migration` as
  the source, before it reaches `applyStepEntry`; verify a migration row
  differs from a submit row
- [x] 3.7 Call it on the enclosing `tx`, never on `db`, before the
  writebacks in `outbox.ts` and `subprocess.ts`; verify both sources
- [x] 3.8 Call the helper on the enclosing `tx`, never on `db`, before
  the redaction wipe in `retention.ts`.
  Pass `redaction` as the source; verify it. The actor
  argument arrives with `opts` in group 6, and this call passes none yet

## 4. Chain verification

<!-- antislop: allow sentence-length -->
<!-- The digest is quoted verbatim so the trigger and the verifier cannot drift; its SQL tokens count as prose words. -->
- [x] 4.1 Write `verify_instance_chain(instance_id text) RETURNS TABLE
  (ok boolean, failed_seq bigint)`, walking the instance's rows in `seq`
  order with a running `prev` seeded from `sha256(''::bytea)` and
  recomputing each row's `hash` as
  `sha256(convert_to(concat_ws(E'\x1e', instance_id, seq,
  transition_seq, field_id, op, coalesce(actor, E'\x1f'),
  coalesce(source, E'\x1f'), coalesce(reason, E'\x1f'), extract(epoch
  from at)::numeric::text), 'UTF8') || value_hash || prev)`, the
  expression task 2.1 writes with the running `prev` standing in for the
  stored `prev_hash`. That `prev` holds the PREDECESSOR row's own `hash`
  column, never this row's stored `prev_hash`, since recomputing from
  the row's own column checks a row against itself alone and reads a
  deleted or reordered row as intact. The function also compares the
  row's stored `prev_hash` against `prev`, so it names a doctored
  `prev_hash` at the row carrying it. It recomputes `value_hash` too,
  where `salt IS NOT NULL`, sets `prev` to this row's stored `hash`
  before the next iteration, and returns the first row whose
  recomputation disagrees. Declare it `SET search_path = pg_catalog,
  public` too,
  since it names `instance_audit` unqualified and a human runs it from
  `psql`. Verify an untampered chain reports as holding, returning one
  row, `(true, NULL)`

  Declare it `LANGUAGE plpgsql`. It walks the rows with `FOR ... IN
  SELECT ... ORDER BY seq` over a `prev bytea` local. A `LANGUAGE sql`
  body reaches that running accumulator only through a recursive CTE.
  Postgres also resolves such a body's relations at creation time. A
  `LANGUAGE sql` verifier would therefore fail `initSchema` on the
  cluster task 5.11 warns about
- [x] 4.2 Rewrite one row's value; verify the function names that row's
  sequence
- [x] 4.3 Delete a middle row; verify the function names the following
  row
- [x] 4.4 Rewrite two rows in one chain; verify the function names the
  earlier one
- [x] 4.5 Export `verifyInstanceChain(instanceId, db)` from
  `src/engine/admin-queries.ts` as a thin
  `SELECT * FROM verify_instance_chain($1)` wrapper returning
  `{ ok: boolean; failedSeq: number | null }`; verify it returns
  the function's verdict unchanged
- [x] 4.6 Verify two rows differing only in which of `actor` and
  `source` holds the null carry different `hash` values. A bare
  `concat_ws` gives that pair one digest, so this is the test that
  measures task 2.1's `coalesce` calls.

  Add a second collision case beside it, for the pair task 1.2 and task
  2.1 close. Insert a row, then rewrite it as the owner role to
  `transition_seq = NULL, field_id = '7' || E'\x1e' || 'fld_a'`. Assert
  `verify_instance_chain` names that row. Left open, the two rows share
  one digest, measured on Postgres 16.14
- [x] 4.7 Swap two rows' `seq` values; verify the function names the
  earlier of the two

## 5. Redaction function and append-only privileges

Execution order inside `initSchema`: 5.4's role + schema-grant guard,
then 5.11's membership grant, then the `SET LOCAL ROLE` block wrapping
1.2, 2.2, 5.1 and 5.5. Task numbers below track verifiable increments,
not code order.

- [x] 5.1 Write the four-argument `redact_instance_fields`. Its
  parameters are `instance_id text`, `actor text`, `reason text` and
  `transition_seq bigint`. It is a `SECURITY DEFINER`
  function with a pinned search path. Declare `SET search_path =
  pg_catalog, public` on it. Verify `pg_proc.proconfig` carries that
  search path. This `CREATE OR REPLACE FUNCTION` is one of the three
  statements task 5.4 wraps in its `SET LOCAL ROLE detent_audit_owner`
  block; write it there, not as a bare statement
- [x] 5.2 The function calls `instance_audit_append()` once per distinct
  `field_id` the instance's entries hold, appending one `redact` row each
  time. It then nulls `value` and `salt` on every earlier row of those
  fields. It stamps the `transition_seq` its caller passes on each
  `redact` row.

  Reading that value from `instances` inside the function
  does not work. The `SECURITY DEFINER` marking switches the effective
  role to `detent_audit_owner`, which holds no grant on that relation.
  Each
  `redact` row passes a NULL value. That is the branch on which
  `instance_audit_append` stamps `value_hash = sha256(''::bytea)` and
  leaves `salt` null
- [x] 5.3 Verify the trigger function and `redact_instance_fields` both
  reach the chain through `instance_audit_append()`, and that no chain
  arithmetic exists twice. Assert it against the catalog rather than by
  reading the source. Read `pg_get_functiondef` for
  `instance_audit_diff` and for `redact_instance_fields`. Each body
  names `instance_audit_append`, and neither names `sha256(` anywhere
  outside that call
- [x] 5.4 Create the audit owner role, guarded so a cluster that cannot
  create roles still boots. Postgres checks the `CREATEROLE` attribute
  before it checks whether the role exists. A bare `duplicate_object`
  trap then leaves a least-privileged engine role raising 42501:

  ```sql
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'detent_audit_owner') THEN
      CREATE ROLE detent_audit_owner NOLOGIN;
    END IF;
  EXCEPTION
    WHEN duplicate_object THEN NULL;            -- lost a race
    WHEN insufficient_privilege THEN
      RAISE WARNING 'detent_audit_owner absent and this role cannot create it; a superuser must run: CREATE ROLE detent_audit_owner NOLOGIN;';
  END $$;
  ```

  Issue `GRANT CREATE ON SCHEMA public TO detent_audit_owner` under that
  same `insufficient_privilege` trap. An owner role creating the
  relation itself needs `CREATE` on the schema, and Postgres 15 removed
  `public`'s default `CREATE` for `PUBLIC`. Make the whole owner block
  conditional on the role existing. A cluster that skipped the create
  does not then fail on the grants.

  Issue `GRANT TRIGGER ON instances TO detent_audit_owner` under the
  same trap too. The engine's own connecting role owns `instances` and
  issues that grant. The owner role owns nothing on `instances` yet.
  The `CREATE TRIGGER` statement needs the `TRIGGER` privilege on the
  target table, distinct from owning it. Without this grant, the owner
  role's block below can create `instance_audit` and
  `redact_instance_fields`. It cannot create task 2.2's two triggers on
  `instances` there.

  Before opening the transaction, capture the engine's own role name,
  which task 5.5 needs as a grantee:

  ```ts
  const engineRole = (await db`SELECT current_user`)[0].current_user as string;
  ```

  Then wrap the statements below in one `withTransaction(db, ...)` block
  opening with `SET LOCAL ROLE detent_audit_owner`. They are task 1.2's
  `CREATE TABLE instance_audit`, task 2.2's two `CREATE TRIGGER`
  statements, task 5.1's `CREATE OR REPLACE FUNCTION`, and task 5.5's
  revoke and grants. The owner
  role
  then creates both objects itself, and no `ALTER ... OWNER TO` exists
  to raise on a second run. Inside the block `current_user` reads as the
  owner role. That is what the capture above steps around.

  The membership grant task 5.11 issues is what supplies `SET`. The
  automatic membership row a `CREATEROLE` creator receives carries
  `set_option = false`, measured on Postgres 16.14. Postgres then
  refuses `SET LOCAL ROLE` with `permission denied to set role`.
  Membership alone does not carry `SET ROLE` on Postgres 16. `SET` is
  its own grant option.

  The `withTransaction` is what keeps `SET LOCAL
  ROLE` in force. `initSchema`
  issues bare statements on the pooled `db` handle. A plain `SET
  ROLE` would not survive to the next statement on a different pooled
  connection. Verify `pg_class.relowner` and `pg_proc.proowner` name the
  owner role
- [x] 5.5 Revoke first, then grant. Inside task 5.4's `SET LOCAL ROLE`
  block, since the owner role is what can grant on its own objects,
  issue in this order:

  <!-- antislop: allow sentence-length -->
  <!-- The three privilege statements are quoted verbatim; their SQL tokens count as prose words. -->
  ```sql
  REVOKE EXECUTE ON FUNCTION redact_instance_fields(text, text, text, bigint) FROM PUBLIC;
  GRANT INSERT, SELECT ON instance_audit TO "${engineRole}";
  GRANT EXECUTE ON FUNCTION redact_instance_fields(text, text, text, bigint) TO "${engineRole}";
  ```

  A function created with no explicit ACL carries `EXECUTE` for
  `PUBLIC`. Without the revoke, every role that can connect to the
  tenant database can null another instance's audit values. That is the
  one deliberate hole in the append-only property. It belongs to the
  engine's role alone.

  Name that role explicitly. `${engineRole}` is task 5.4's captured
  `SELECT current_user`, quoted as an identifier. Inside the block
  `current_user` is the owner role. Granting to `current_user` here
  hands the owner privileges to itself and leaves the engine's role
  holding nothing. The `session_user` value also names the right role,
  and it goes wrong under a `SET ROLE`. The capture beforehand survives
  both.

  Verify both halves. `has_table_privilege('${engineRole}',
  'instance_audit', 'INSERT')` and the same for `'SELECT'` are true, and
  `'UPDATE'` and `'DELETE'` are false. Verify `proacl` on
  `redact_instance_fields` names the engine's role and carries no `=X/`
  entry for `PUBLIC`. The negative half alone passes on a role holding
  no grant at all. The positive half is what catches that
- [x] 5.6 In `test/preload-db.ts`, duplicate-guarded, create
  `detent_audit_probe` with `LOGIN PASSWORD 'probe'` and grant it
  `CONNECT` on the derived test database. Both statements go inside
  `ensureDatabase`, on the maintenance connection it already opens. Both
  run unconditionally, after the `if (rows.length === 0)` branch holding
  the `CREATE DATABASE` and before the `finally` closes that connection.
  A developer whose `_test` database predates this change would
  otherwise never get the grant.

  Wrap both in a `try`/`catch` logging a
  named skip and continuing, the way the file's existing
  `DATABASE_URL`-unset branch does. A maintenance role without
  `CREATEROLE` raises 42501 whether or not the role is already there.
  An uncaught throw in the preload takes down every suite. A
  `DATABASE_URL`-unset run then still skips cleanly. The `GRANT CONNECT`
  names the derived test database and is visible cluster-wide. It runs on
  that same connection.

  The role outlives the suite by design. Nothing drops it, and a role is
  cluster-scoped rather than per-database. Say so in a comment beside
  the create. A later cluster audit then reads the role as the test
  fixture it is
- [x] 5.7 In the privileges suite, a new
  `test/instance-audit-privileges.test.ts`, after `initSchema` has run,
  grant the probe role `INSERT, SELECT ON instance_audit`. Grant it
  `EXECUTE ON FUNCTION redact_instance_fields` too. That is exactly what
  the engine's
  role gets. Grant it `INSERT, SELECT ON instances` too, so that insert
  reaches the trigger rather than tripping on the parent relation. That
  grant is deliberately wider than the engine's own audit grants and is
  what makes the refusal test specific to `instance_audit`.

  Issue those three grants inside a `withTransaction` block opening with
  `SET LOCAL ROLE detent_audit_owner`. Only the owner can grant on its
  own relation and its own function. The suite connects as the engine's
  role, which after task 5.5 holds `INSERT` and `SELECT` without grant
  option. It can pass neither on. Postgres answers a grant it cannot
  make with `WARNING: no privileges were granted`, and the probe tests
  then fail on a warning nobody read. The `instances`
  grant can stay outside the block.

  Guard the
  suite with `test.skipIf` on the probe role's absence, the way the DB
  suites guard on `!DB`. A clone whose maintenance role cannot create
  roles must still run every other suite
- [x] 5.8 Open a second `SQL` client at `DATABASE_URL`, with the role
  name and password swapped for the probe role's. Verify its `UPDATE` and
  `DELETE` against `instance_audit` are both refused. Then grant the
  probe role membership in `detent_audit_owner` the way task 5.11 grants
  it to the engine's role, `WITH INHERIT FALSE`. Verify
  both statements stay refused. Membership is what makes this
  test measure the engine's real privilege shape. Without `INHERIT
  FALSE` the member holds the owner's `UPDATE` and `DELETE` with no `SET
  ROLE`, and both statements land
- [x] 5.9 Verify that same role's `INSERT` through the trigger still
  lands
- [x] 5.10 Verify `pg_proc.prosecdef` is false for
  `instance_audit_diff` and `instance_audit_append`, and true for
  `redact_instance_fields` alone
- [x] 5.11 Issue the membership grant inside a `DO` block trapping
  `insufficient_privilege`:

  ```sql
  DO $$ BEGIN
    GRANT detent_audit_owner TO current_user WITH INHERIT FALSE;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE WARNING 'detent_audit_owner membership missing; the audit log stays inactive until a superuser runs: GRANT CREATE ON SCHEMA public TO detent_audit_owner; GRANT detent_audit_owner TO <engine role> WITH INHERIT FALSE; then the audit object statements.';
  END $$;
  ```

  No `ADMIN OPTION` clause. Postgres 16 gives admin option to the role's
  creator alone, which is why the clause buys nothing here. A role that
  just created the owner already holds it. Asking for it a second time
  raises sqlstate `0LP01`, measured on Postgres 16.14 as a `CREATEROLE`
  non-superuser that had just created the role.

  That sqlstate is `invalid_grant_operation`, not
  `insufficient_privilege`. The trap above misses it, and `initSchema`
  aborts on the fresh non-superuser bootstrap this design targets. As
  `postgres` the same statement succeeds. A superuser creating a role
  gets no automatic membership row, so the devcontainer never sees the
  raise.

  The `INHERIT FALSE` is what makes the grant model mean anything. A
  role grant follows the grantee's `rolinherit`, true unless somebody
  set it otherwise. A plain grant then hands the engine's role the
  owner's `UPDATE` and `DELETE`, with no `SET ROLE`. Leaving `SET` at
  its default is equally load-bearing. That is what task 5.4's DDL block
  runs on, and the automatic creator row carries `set_option = false`.

  Measured on the shape above: it succeeds as `postgres` and as the
  non-superuser creator. Both land `admin_option = f, inherit_option =
  f, set_option = t`. A second run answers a notice and raises nothing.
  On a
  DBA-created role it raises 42501, which the trap catches as intended.

  This block runs before task 5.4. Trap `insufficient_privilege` around
  task 5.4's owner block too. Issue a `RAISE WARNING` there enumerating
  the whole manual remediation. It names `GRANT CREATE ON SCHEMA public
  TO detent_audit_owner;` first. The membership grant this task opens
  with comes second. The object statements come last.

  The warning also says the audit log stays inactive until those
  statements run. Task 2.2's triggers sit inside the same skipped block.

  A `GRANT CREATE ON SCHEMA
  public` issued without grant option warns rather than raising. The
  refusal surfaces one statement later, so the warning must name the
  schema grant too
- [x] 5.12 Verify the degraded cluster. With `detent_audit_owner` absent
  and the connecting role unable to create it, `initSchema` returns and
  warns. `pg_trigger` lists neither `instance_audit_insert_trg` nor
  `instance_audit_update_trg`. An `INSERT INTO instances` then succeeds
  and writes no audit row. Without task 2.2's placement that insert
  raises `relation "instance_audit" does not exist` from inside the
  trigger body. Every `createProcessInstance` and every `applyStepEntry`
  then throws on a server that booted clean

  Measured differently in the end. The role is cluster-scoped, so no suite
  in this shared database can make it absent again. The suite asserts the
  condition the degraded path turns on instead. A `SET LOCAL ROLE` without
  membership raises SQLSTATE 42501, which `isInsufficientPrivilege`
  catches. The full scenario needs a virgin cluster and stays a manual
  check

## 6. Redaction

- [x] 6.1 Thread the requesting actor into `redactInstance` from
  `handleAdminRedactInstance` (`src/http/admin-routes.ts:348`). The sweep
  passes none and the entry then carries a null actor; verify both. Pass
  `opts.actor` into task 3.8's `set_config` call as well as into
  `redact_instance_fields`. That same call passes `opts.reason` as
  `redact_instance_fields`'s third argument and `inst.transitionSeq` as
  its fourth. The wipe's trigger-written
  entries and the
  `redact` entries then name the same actor. Update the handler's doc
  comment, which says it wraps `redactInstance` unchanged
- [x] 6.2 Verify one `redact` row lands per field the instance's entries
  name
- [x] 6.3 Verify all prior rows of those fields clear
- [x] 6.4 Call it from `redactInstance` after the `body.data` wipe.
  Verify a redacted instance's rows hold no value. Verify the wipe's
  `set` entries and the `redact` entries carry the same actor
- [x] 6.5 Verify a second instance's entries keep their values in clear
  text
- [x] 6.6 Verify `verify_instance_chain` still reports holding after a
  redaction
- [x] 6.7 Verify the redaction wipe's own entries carry no value
- [x] 6.8 Verify a second `redactInstance` call appends no second
  `redact` entry and nulls nothing further
- [x] 6.9 Call `redactInstance` directly with `opts.reason`; verify each
  `redact` row carries that reason, and that a call without one leaves
  the column null
- [x] 6.10 Pass `inst.transitionSeq`, which `redactInstance` already
  parses at `retention.ts:26` and holds in scope, as
  `redact_instance_fields`'s fourth argument. Verify each `redact` row's
  `transition_seq` equals the instance's own at redaction time

## 7. Documentation

- [x] 7.1 Sync the four delta specs into `openspec/specs/`, creating
  `openspec/specs/instance-audit-log/spec.md` as a new capability; verify
  `openspec validate` passes
- [x] 7.2 Rewrite the live `openspec/specs/data-retention/spec.md`
  Purpose. It should read "…leaves `history_entries` and
  `instance_events` intact, and clears the values of `instance_audit`
  while keeping its rows." A delta cannot reach a Purpose block
- [x] 7.3 Correct `docs/decisions.md`'s write-site list, its change-2
  scope (only `FieldDef.redactable` remains), its
  salt-only-for-redactable-fields statement and its `(no pgcrypto)`
  parenthetical. Correct its table bullet's five-source enumeration too,
  since this change has six and adds creation. Correct its claim about
  the `data-retention` sentence "history carries no field values, so it
  needs no redaction". That sentence stays true of `history_entries` and
  `instance_events`, which is what the delta spec
  says. Correct the entry's `Not started.` line last: change 1 landed as
  `instance-audit-log-chain`, and changes 2 and 3 remain. The entry
  stays under "Decided, not yet built"
- [x] 7.4 Correct `docs/decisions.md`'s `SECURITY DEFINER` claim about
  the trigger and its `REVOKE UPDATE, DELETE` claim. Correct its
  single-`AFTER INSERT OR UPDATE`-trigger statement. This proposal splits
  that trigger into two over one shared function. Correct its "this
  replaces the current `redactInstance` wipe" sentence too, since the
  wipe stays.

  Correct its single-`redact`-row shape as well. The entry
  reads "append one `redact` row naming who, when, why, and which
  fields". This change appends one row per field. Verify the prose
  gate stays level with
  `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`
- [x] 7.5 Add an "Instance audit log (`instance-audit-log-chain`)" heading
  to `docs/current-state.md`. Name the relation and the grants. Name the
  two triggers, `instance_audit_insert_trg` and
  `instance_audit_update_trg`. Name the four functions too:
  `instance_audit_diff`, `instance_audit_append`,
  `verify_instance_chain` and `redact_instance_fields`. Name the
  TypeScript wrapper `verifyInstanceChain` in
  `src/engine/admin-queries.ts` beside them, since that file lists
  exported symbols by hand
- [x] 7.6 Correct `CLAUDE.md`'s Verification section, which says
  `sh scripts/gates/prose.sh < /dev/null` defaults to
  `origin/main..HEAD` where stdin is empty. The fallback lives in
  `scripts/gates/range.sh:54`, not in `prose.sh`. That script reads its
  ranges on stdin, and an empty list checks nothing and exits 0. Name
  the working form instead, `sh scripts/gates/range.sh < /dev/null | sh
  scripts/gates/prose.sh`. Tasks 7.4 and 8.2 already use it

## 8. Verification

- [x] 8.1 Run `bun run typecheck` and `bun run build`, then the full
  `bun test` with `DATABASE_URL` set
- [x] 8.2 Run `sh scripts/gates/range.sh < /dev/null | sh
  scripts/gates/prose.sh` over the touched files. Run
  `sh scripts/gates/whitespace.sh < /dev/null` too. A bare `prose.sh`
  reads an empty range list and exits 0 without checking anything
- [x] 8.3 Pipe the run through `sh scripts/gates/silent-green.sh` and
  confirm the skip count against `scripts/gates/skip-floor.txt`
