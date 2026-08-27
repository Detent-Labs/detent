## 1. Definition contract: `FieldDef.redactable`

- [x] 1.1 Add `redactable?: boolean` to the `FieldDef` type and to the
      `fieldDef` Zod schema in `src/schema/definition.ts`, beside
      `technical`, with a doc comment mirroring `technical`'s. Verify
      `bun run typecheck` passes.
- [x] 1.2 Add a `checkRedactableFields`-style structural check in
      `src/schema/compile.ts` (alongside `checkTechnicalFields`, called
      from `structuralIssues`) that rejects `redactable: true` on a field
      declaring `type: "group"`. Verify a new
      `test/compile-validation.test.ts` case publishing a group field with
      `redactable: true` throws, naming the field.
- [x] 1.3 Verify a technical field may also declare `redactable: true`
      with a `test/compile-validation.test.ts` case that publishes
      successfully.
- [x] 1.4 Verify `definitionHash` treats `redactable: false` as distinct
      from an absent key, and an absent key as unchanged from a
      pre-this-change hash, with a `test/schema.test.ts` (or the file
      already covering `technical`'s hash cases) case mirroring the
      existing `technical` hash tests.

## 2. Engine: narrow `redact_instance_fields`

- [x] 2.1 Change `redact_instance_fields`'s signature in
      `src/engine/store.ts` (`initInstanceAudit`) to
      `redact_instance_fields(instance_id text, actor text, reason text,
      transition_seq bigint, field_ids text[])` and change its loop from
      `SELECT DISTINCT ia.field_id FROM instance_audit ia WHERE
      ia.instance_id = ...` to the same query filtered by `AND
      ia.field_id = ANY(field_ids)`. Postgres treats a changed parameter
      list as a new overload, not a replacement of the old one: add
      `DROP FUNCTION IF EXISTS redact_instance_fields(text, text, text,
      bigint)` immediately before the `CREATE OR REPLACE`, and update the
      `REVOKE`/`GRANT` statements right below it — they currently hardcode
      the old 4-arg signature — to name the new 5-arg one. Also update the
      matching hardcoded signature in
      `test/instance-audit-privileges.test.ts`'s module-level
      `GRANT EXECUTE ON FUNCTION redact_instance_fields(text, text, text,
      bigint) TO detent_audit_probe`. Verify `bun run typecheck`, a manual
      `psql \df redact_instance_fields` (or the devcontainer equivalent)
      shows only the new signature, and that `bun test` boots successfully
      against a freshly created database — the `REVOKE`/`GRANT` mismatch
      this task fixes otherwise raises "function does not exist" on any
      database that never held the old signature, which is every CI run
      and every `_test` database `bunfig.toml`'s preload creates from
      scratch.
- [x] 2.2 In `redactInstance` (`src/engine/retention.ts`), construct a
      `createDefinitionStore(tx)` inside the existing transaction, resolve
      `inst.processId`/`inst.version` via `resolveBody`, flatten the
      catalog with `collectFieldsDeep`, filter to `redactable === true`,
      and pass the resulting `id[]` as the new `field_ids` argument to the
      `redact_instance_fields` call. Throw (do not silently no-op) if
      `resolveBody` returns `undefined`. Verify with a
      `test/retention.test.ts` case: an instance with one redactable and
      one non-redactable field, both holding values, redacted, then
      re-read from `instance_audit` directly — the redactable field's rows
      have `value`/`salt` null, the non-redactable field's rows keep their
      original value and salt.
- [x] 2.3 Verify a field id present in the audit log but absent from the
      instance's currently pinned version's catalog is left untouched, with
      a `test/retention.test.ts` case that migrates an instance to a
      version whose catalog drops a field the instance previously wrote,
      then redacts and confirms that field's old rows still carry their
      original value and salt.
- [x] 2.4 Verify the currently-pinned-version-governs rule with two
      `test/retention.test.ts` cases: (a) a field marked `redactable: true`
      in the source version and `redactable: false`/absent in the target
      version — after migration and redaction, the field's rows (including
      pre-migration values) keep their values; (b) the reverse — a field
      marked `redactable: false`/absent in the source version and
      `redactable: true` in the target version — after migration and
      redaction, all of the field's rows (including pre-migration values)
      are cleared.
- [x] 2.5 Verify `verify_instance_chain` still reports the chain intact
      after a narrowed redaction, extending the existing
      `test/instance-audit.test.ts` redaction-then-verify case to cover a
      mix of redacted and untouched fields on the same instance.
- [x] 2.6 `redactInstance` now resolves the instance's pinned definition
      body and throws if it cannot (task 2.2), which
      `test/retention.test.ts`'s `mk()` fixture cannot currently satisfy:
      it calls `createInstance` directly against `version: 1` with no
      matching `definitions` row, a shortcut the file's own header comment
      documents as deliberate ("no publish needed"). Update `mk()` (and
      the `body()` it wraps) to publish once via
      `publishBody(pid, body(), reg, dataSourceReg)` and create every
      instance against the published version, mirroring the file's own
      `findOrphanKeys` test, which already does this. Verify every
      existing test in the file still passes: none of them assert on
      field-level redaction scoping, only on
      `body.data`/comments/attachments/drafts, which stay unconditionally
      cleared regardless of `redactable`.
- [x] 2.7 The same unpublished-fixture gap exists in
      `test/instance-audit.test.ts`'s `mk()`: its "6.1" through "6.10"
      cases all call `redactInstance` against an instance `mk()` created
      with no matching `definitions` row. Update `mk()`/`simpleBody()` to
      publish via `publishBody` before creating instances, the way this
      file's own writeback tests already do. `field_x` and `field_y` are
      already declared in `simpleBody()`'s catalog (they are not ad-hoc,
      raw-jsonb-only fields — `setData()`'s "bypasses" comment refers to
      bypassing the runtime API's submission path, not the catalog).
      Mark `field_x: redactable: true` in `simpleBody()`'s catalog only;
      leave `field_y` without the flag. "6.1" and "6.4" through "6.10"
      need no further change beyond the publish-before-create fixture
      update — they only ever touch `field_x`, which stays redactable and
      so stays cleared. Rewrite "6.2/6.3"'s expectation: it currently
      asserts both `field_x` and `field_y` get redact rows; under the
      narrowed rule only `field_x` does. Narrow that assertion to
      `field_x` alone, and add a companion assertion (in the same case or
      a new one) that `field_y`'s entries keep their original value and
      salt and get no `redact` row — this is the new spec's "A
      non-redactable field keeps its history" scenario, not "A field
      removed from the catalog keeps its history": `field_y` stays
      declared in the catalog throughout, it is simply never marked
      `redactable`. The "removed from the catalog" scenario is already
      covered separately by `test/retention.test.ts` task 2.3 via a
      migration that drops a field from the catalog; do not duplicate it
      here under a mismatched label. Verify with a full `bun test` run
      naming each of the ten affected cases.

## 3. Docs and examples

- [x] 3.1 Document `FieldDef.redactable` in `docs/authoring-guide.md`,
      beside the existing `technical` field documentation, including the
      group-field restriction and that it takes effect only for the
      currently published version at redaction time.
- [x] 3.2 Mark `review_note` in `examples/expense-approval.json`
      `redactable: true`, so at least one shipped example demonstrates the
      flag. Verify the example still publishes cleanly (existing example
      validation test / `bun run typecheck` plus a load of the file
      through `authoredProcessBody`). This moves the body's
      `definitionHash` (the delta spec's own scenario: a declared
      `redactable: true` hashes differently from the key's absence), which
      moves the literal `test/view-layout-hash.test.ts` pins for this
      file. Re-measure `definitionHash(processBody.parse(bodyOf(...)))`
      against the edited file and update
      `PRE_CHANGE_HASHES["expense-approval.json"]` to the fresh value,
      following the same pattern that test file's own header comment
      documents for its three prior edits. Verify
      `test/view-layout-hash.test.ts` passes with the new literal.
- [x] 3.3 `docs/decisions.md`'s "Instance audit log" entry already
      records the accepted limitation ("a field id removed from the
      catalog stays unredactable through this path") and this change's
      proposal status, done 2026-08-27 ahead of implementation. Nothing
      left to do here; re-check only if design.md's decisions change
      before this change archives.
- [x] 3.4 Update `docs/current-state.md`'s "Instance audit log" section,
      which currently documents `redact_instance_fields(instance_id,
      actor, reason, transition_seq)` and describes it as appending "one
      `redact` row per field the instance's entries name" — both the
      signature and the behavior go stale once this change lands. Update
      the signature to the new 5-arg form and the description to the
      narrowed, catalog-`redactable`-gated behavior.

## 4. Verification

- [x] 4.1 Run `bun run typecheck`, then `bun run build`, and confirm both
      succeed with no errors.
- [x] 4.2 Run the full `bun test` suite with `DATABASE_URL` set (never a
      single-file rerun), confirm every test in the groups above passes
      by name, and check the printed skip count is not silently elevated
      (no DB-backed suite skipped for a missing `DATABASE_URL`).
