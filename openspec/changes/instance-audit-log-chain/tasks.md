## 1. Schema

- [ ] 1.1 Add the `instance_audit` DDL to `initSchema`; verify a fresh
  `initSchema` creates it
- [ ] 1.2 Add its index on `(instance_id, seq)`; verify `pg_indexes` lists
  it after `initSchema`
- [ ] 1.3 Verify a second `initSchema` run leaves the relation and its
  rows untouched

## 2. Trigger

- [ ] 2.1 Write the plpgsql diff function over `body->'data'`; verify a
  direct `INSERT` writes one row per key
- [ ] 2.2 Attach it `AFTER INSERT OR UPDATE FOR EACH ROW`; verify an
  `UPDATE` writes one row per differing key
- [ ] 2.3 Verify a write touching only `assignment` or `status` leaves the
  relation empty
- [ ] 2.4 Copy `NEW.transition_seq` onto each row; verify a join to
  `history_entries` returns that transition's rows
- [ ] 2.5 Make the DDL idempotent with `CREATE OR REPLACE` and `DROP
  TRIGGER IF EXISTS`; verify a second `initSchema`

## 3. Actor and source

- [ ] 3.1 Add a `set_config` helper beside `withTransaction`; verify
  `current_setting` reads it back inside one transaction
- [ ] 3.2 Read actor and source in the trigger; verify a row carries both
- [ ] 3.3 Verify an unset setting writes a null actor and a full field
  record
- [ ] 3.4 Call the helper before `INSERT INTO instances`
  (`store.ts:675`); verify the creation source
- [ ] 3.5 Call it before `applyStepEntry` (`transition.ts:381`); verify
  the submit source
- [ ] 3.6 Pass `migration` as the source from `migrateOne`; verify a
  migration row differs from a submit row
- [ ] 3.7 Call it before the writebacks in `outbox.ts` and
  `subprocess.ts`; verify both sources
- [ ] 3.8 Call it before the redaction wipe in `retention.ts`; verify the
  redaction source

## 4. Hash chain

- [ ] 4.1 Add `salt` via `gen_random_bytes(16)` per row; verify two rows
  of one value differ in `value_hash`
- [ ] 4.2 Compute `value_hash` in the trigger; verify it against a
  hand-computed digest
- [ ] 4.3 Chain `prev_hash` and `hash` from the head read; verify a
  three-row chain links head to tail
- [ ] 4.4 Verify an instance's first row chains from the fixed empty
  value
- [ ] 4.5 Add a `ponytail:` comment on the head read naming the
  bulk-migration ceiling

## 5. Verification

- [ ] 5.1 Write `verify_instance_chain(instance_id)`; verify an untampered
  chain reports as holding
- [ ] 5.2 Rewrite one row's value; verify the function names that row's
  sequence
- [ ] 5.3 Delete a middle row; verify the function names the following
  row
- [ ] 5.4 Rewrite two rows in one chain; verify the function names the
  earlier one

## 6. Append-only privileges

- [ ] 6.1 Add `REVOKE UPDATE, DELETE` for the application role; verify it
  rejects that role's `UPDATE`
- [ ] 6.2 Verify the database rejects that role's `DELETE`
- [ ] 6.3 Verify the trigger's own inserts still land under the revoke

## 7. Redaction

- [ ] 7.1 Write `redact_instance_fields()` as `SECURITY DEFINER`; verify
  it appends one `redact` row
- [ ] 7.2 Null `value` and `salt` on every prior row of the named fields;
  verify all prior rows clear
- [ ] 7.3 Call it from `redactInstance`; verify a redacted instance's rows
  hold no value
- [ ] 7.4 Verify a field outside the redaction keeps its values in clear
  text
- [ ] 7.5 Verify `verify_instance_chain` still reports holding after a
  redaction

## 8. Documentation and gates

- [ ] 8.1 Sync the two delta specs into `openspec/specs/`; verify
  `openspec validate` passes
- [ ] 8.2 Correct the write-site list in `docs/decisions.md`; verify the
  prose gate stays level
- [ ] 8.3 Add the relation to `docs/current-state.md`'s persistence
  section
- [ ] 8.4 Run `bun run typecheck`, `bun run build`, and the full `bun
  test` with `DATABASE_URL` set
- [ ] 8.5 Run `sh scripts/gates/prose.sh` and
  `sh scripts/gates/whitespace.sh` over the touched files
