## Why

Today nothing records what an instance's field values used to be. The
`history_entries` and `instance_events` relations carry structural facts
only: which step, which path, which actor, which event kind. A question
like "who was in `assigned_manager` before somebody changed it" has no
answer in the datastore.

Five statements write `instances.body.data`, and a sixth can join them.
A log the application writes at those call sites stays complete only
while every future author remembers it. A trigger under those statements
needs no such discipline. No write reaches the row without passing it.

## What Changes

- A new relation, `instance_audit`, holding one row per field change: a
  delta, not an instance snapshot.
- Two triggers on `instances`, one `AFTER INSERT` and one `AFTER UPDATE`,
  sharing one function that diffs `OLD.body->'data'` against
  `NEW.body->'data'`. It writes one row per changed field. The second
  trigger's `WHEN` clause rejects a row whose new field data matches its
  old. The seven non-data writes then never enter plpgsql. The insert
  half matters. `createProcessInstance` inserts a row whose `body` already
  carries start-form data and seeded `FieldDef.default` values. An
  update-only trigger would leave every field's first value out of the
  log.
- Actor and source reach the trigger through a transaction-scoped
  setting. A trigger reads `OLD` and `NEW` and nothing else, so each
  write path calls `set_config('detent.actor', …, true)` and
  `set_config('detent.source', …, true)` first. That setting also
  separates a participant's submit from a migration. `migrateOne` commits
  through the same `applyStepEntry` statement.
- A hash chain per instance. Each row's `hash` covers the row's metadata,
  its `value_hash` and the previous row's `hash`. A row edited, deleted
  or reordered in the middle of a chain then fails a later verification.
  Truncating a chain's tail does not. What remains is a shorter,
  self-consistent chain. Change 3's signed checkpoint over the chain
  heads is what catches that.
- `verify_instance_chain(instance_id)`, a SQL function walking one
  instance's chain. It reports the first row that does not verify.
- The trigger salts every row's `value_hash` with a per-row
  `gen_random_bytes(16)`. The salt stops a reader from recovering a
  nulled value by hashing candidates over a small value space. That
  function comes from `pgcrypto`, so `initSchema` installs the extension.
- `redact_instance_fields(instance_id, actor, reason, transition_seq)`, a
  `SECURITY DEFINER` function. It appends one `redact` row per field the
  instance's entries name. It then nulls `value` and `salt` in every
  prior row of those fields.
  `redactInstance` calls it. Without it, the trigger alone would leave
  every clear value in `instance_audit` after a redaction. Redaction
  would stop erasing.
- A separate owner role for `instance_audit` and its redaction function.
  The role the engine connects as receives `INSERT` and `SELECT` on the
  relation and `EXECUTE` on the function, and receives no `UPDATE` and no
  `DELETE`. The application can then only append. The redaction function
  runs with its owner's privileges and is the one deliberate exception.

Two pieces stay out of scope, each its own later change. The
authoring-time flag `FieldDef.redactable` decides which fields a
redaction offers. The nightly signed checkpoint detects a wholly
recomputed chain.

## Capabilities

### New Capabilities

- `instance-audit-log`: the `instance_audit` relation and its triggers.
  Covers the actor and source plumbing, the per-instance hash chain,
  chain verification, and field redaction against the log.

### Modified Capabilities

- `data-retention`: `redactInstance` clears personal data across five
  relations rather than four. The audit log is the first relation it
  neither leaves alone nor deletes from. It nulls values in place and
  keeps the rows. The requirement's sentence "Neither carries a field
  value, so neither needs redaction" stays true of `history_entries` and
  `instance_events`. It becomes false of the new relation.
- `persistence`: `initSchema` installs `pgcrypto` and creates a further
  relation, its index, its two triggers and its four functions. It also
  creates an owner role for the relation and grants the engine's own role
  insert and select alone. These are the schema's first triggers, and the
  redaction function beside them is its first `SECURITY DEFINER`
  function.
- `admin-operations-api`: `handleAdminRedactInstance` passes the
  requesting actor into `redactInstance`, so a redaction the admin area
  starts names who asked for it. The pinned call in that capability's
  requirement moves with it.

## Impact

- `src/engine/store.ts`: the `CREATE EXTENSION` for `pgcrypto`, the owner
  role, the `instance_audit` DDL, the trigger function,
  `instance_audit_append()`, `verify_instance_chain()`,
  `redact_instance_fields()`, the grants, and a `set_config` call before
  the `INSERT INTO instances`.
- `src/engine/transition.ts`: `set_config` before `applyStepEntry`'s
  `UPDATE`. `commitTransition` (`transition.ts:437`) and `migrateOne`
  (`migration.ts:527`) each call the `set_config` helper on their own
  `tx` before reaching `applyStepEntry`, `commitTransition` deriving the
  source from its `cause` argument. `applyStepEntry`'s signature does
  not change.
- `src/engine/admin-queries.ts`: `verifyInstanceChain(instanceId, db)`, a
  thin wrapper over the SQL function, so a TypeScript caller reaches the
  one verification. It has no production caller in this change by
  design. The audit view in `admin-app` is a separate change. The spec
  requires a TypeScript entry point before anybody writes that view.
- `src/engine/outbox.ts`, `src/engine/subprocess.ts`: `set_config` before
  each writeback.
- `src/engine/migration.ts`: `migrateOne` sets `migration` as the source
  on its own `tx` before it reaches `applyStepEntry`.
- `src/engine/retention.ts`: `redactInstance` calls
  `redact_instance_fields()` rather than leaning on the `body.data` wipe
  alone, and takes a trailing optional `opts` carrying an actor and a
  reason.
- `src/http/admin-routes.ts`: `handleAdminRedactInstance` passes the
  requesting actor through that new argument.
- `test/`: `instance_audit` joins the `beforeEach` TRUNCATE list of every
  suite that already truncates `instances`, since the relation carries no
  foreign key that would cascade. Two new suites join them. One covers the
  trigger, the chain and verification. The other covers the append-only
  privileges, and opens a second `SQL` client as the probe role.
- `test/preload-db.ts`: a duplicate-guarded, login-capable non-superuser
  probe role, created once per run. The append-only guarantee is then
  provable against a role no grant exempts.
- `docs/decisions.md`: the recorded design pass names a write-site list,
  a change-2 scope and a `SECURITY DEFINER` trigger this change corrects.
- `docs/current-state.md`: a section for the new relation, its two
  triggers, its four functions and its grants.
- `CLAUDE.md`: the Verification section's `sh scripts/gates/prose.sh <
  /dev/null` line, whose `origin/main..HEAD` fallback claim belongs to
  `scripts/gates/range.sh` instead.
- `openspec/specs/`: the four delta specs sync back, one of them
  creating `instance-audit-log` as a new capability.
- `ROADMAP.md`: no stage row. This capability comes from
  `docs/decisions.md`'s "Decided, not yet built" list, not from a
  numbered stage.
- No HTTP route, no runtime API signature and no UI screen changes. A
  reader reaches the log through `psql` and nothing else. An admin audit
  view is a separate change against `admin-app`.
- No definition contract change. Nothing here touches
  `src/schema/definition.ts`.
