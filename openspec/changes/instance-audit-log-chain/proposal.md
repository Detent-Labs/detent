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
- A trigger on `instances`, `AFTER INSERT OR UPDATE`, diffs
  `OLD.body->'data'` against `NEW.body->'data'`. It writes one row per
  changed field. The `INSERT` half matters. `createProcessInstance`
  inserts a row whose `body` already carries start-form data and seeded
  `FieldDef.default` values. An update-only trigger would leave every
  field's first value out of the log.
- Actor and source reach the trigger through a transaction-scoped
  setting. A trigger reads `OLD` and `NEW` and nothing else, so each
  write path calls `set_config('detent.actor', …, true)` and
  `set_config('detent.source', …, true)` first. That setting also
  separates a participant's submit from a migration. `migrateOne` commits
  through the same `applyStepEntry` statement.
- A hash chain per instance. Each row's `hash` covers the row's metadata,
  its `value_hash` and the previous row's `hash`. An edited, deleted or
  reordered row then fails a later verification.
- `verify_instance_chain(instance_id)`, a SQL function walking one
  instance's chain. It reports the first row that does not verify.
- The trigger salts every row's `value_hash` with a per-row
  `gen_random_bytes(16)`. The salt stops a reader from recovering a
  nulled value by hashing candidates over a small value space.
- `redact_instance_fields()`, a `SECURITY DEFINER` function. It appends a
  `redact` row, then nulls `value` and `salt` in every prior row of the
  named fields. `redactInstance` calls it. Without it, the trigger alone
  would leave every clear value in `instance_audit` after a redaction.
  Redaction would stop erasing.
- The application role loses `UPDATE` and `DELETE` on `instance_audit`.
  The application can then only append. The trigger and the redaction
  function are the two deliberate exceptions.

Two pieces stay out of scope, each its own later change. The
authoring-time flag `FieldDef.redactable` decides which fields a
redaction offers. The nightly signed checkpoint detects a wholly
recomputed chain.

## Capabilities

### New Capabilities

- `instance-audit-log`: the `instance_audit` relation and its trigger.
  Covers the actor and source plumbing, the per-instance hash chain,
  chain verification, and field redaction against the log.

### Modified Capabilities

- `data-retention`: `redactInstance` clears personal data across five
  relations rather than four. The audit log is the first relation it
  neither leaves alone nor deletes from. It nulls values in place and
  keeps the rows. The requirement's sentence "Neither carries a field
  value, so neither needs redaction" stays true of `history_entries` and
  `instance_events`. It becomes false of the new relation.
- `persistence`: `initSchema` creates a further relation, its index, its
  trigger and its two functions. It also revokes two privileges from the
  application role. This is the schema's first trigger and its first
  `SECURITY DEFINER` function.

## Impact

- `src/engine/store.ts`: the `instance_audit` DDL, the trigger function,
  `verify_instance_chain()`, `redact_instance_fields()`, the `REVOKE`, and
  a `set_config` call before the `INSERT INTO instances`.
- `src/engine/transition.ts`: `set_config` before `applyStepEntry`'s
  `UPDATE`, carrying the source a caller supplies.
- `src/engine/outbox.ts`, `src/engine/subprocess.ts`: `set_config` before
  each writeback.
- `src/engine/migration.ts`: passes `migration` as the source into
  `applyStepEntry`.
- `src/engine/retention.ts`: `redactInstance` calls
  `redact_instance_fields()` rather than leaning on the `body.data` wipe
  alone.
- No HTTP route, no runtime API signature and no UI screen changes. A
  reader reaches the log through `psql` and nothing else. An admin audit
  view is a separate change against `admin-app`.
- No definition contract change. Nothing here touches
  `src/schema/definition.ts`.
