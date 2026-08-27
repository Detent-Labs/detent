## Why

`instance-audit-log-chain` (archived) shipped the tamper-evident audit
relation and its hash chain. It also shipped a `redact_instance_fields()`
that clears **every** field an instance's audit log holds an entry for.

That was deliberate. Narrowing the redaction set to author-designated
fields needed `FieldDef.redactable`. That change explicitly deferred it,
as "Change 2" in `docs/decisions.md`'s "Instance audit log" entry.

Today a redaction request erases a field's whole history, whether or not
its author meant it to be erasable. That includes fields the audit trail
exists to preserve, like who approved what. This change adds the
authoring flag and narrows redaction to the fields it marks.

## What Changes

- `FieldDef` gains an optional `redactable: boolean` (`src/schema/definition.ts`),
  a pure authoring-time signal. It changes no hashing behavior: every audit
  row is already salted regardless of this flag.
- `redact_instance_fields()` (`src/engine/store.ts`) gains a `field_ids
  text[]` parameter. It clears only the fields named in it, instead of
  every distinct `field_id` the instance's audit entries hold.
- `redactInstance` (`src/engine/retention.ts`) resolves the instance's
  currently pinned definition body, flattens its field catalog, filters to
  `redactable === true`, and passes those field ids through. It reads a
  process definition for the first time: a new dependency this function did
  not carry before.
- A field id present in the instance's audit log but absent from the
  currently pinned version's catalog stays uncleared. That covers a field
  removed in a later republish. This is an accepted limitation, not a
  silent drop: see design.md.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `definition-contract`: adds the authoring-time field `FieldDef.redactable`
  and its publish/hash rules (mirrors the existing `technical` field's
  requirement shape).
- `instance-audit-log`: narrows the "Redaction clears values across a
  field's whole history" requirement. It narrows "every field the audit
  log holds an entry for" to "every field the pinned version marks
  `redactable`."
- `data-retention`: narrows the "redactInstance clears personal data across
  five relations" requirement's audit-log clause the same way. This
  capability's copy of "every field the instance's audit log holds an
  entry for" goes stale once `instance-audit-log`'s narrows. Both move
  together.
- `persistence`: a one-line wording fix only, no behavior change. The
  "audit relation is append-only" requirement's incidental "every field an
  instance's entries name" phrase goes stale the same way. No new scenario.

## Impact

- `src/schema/definition.ts`: `FieldDef` type and Zod schema.
- `src/engine/store.ts`: `redact_instance_fields()` SQL function signature
  and body.
- `src/engine/retention.ts`: `redactInstance()` gains a definition-store
  read.
- `openspec/specs/definition-contract/spec.md`: new requirement.
- `openspec/specs/instance-audit-log/spec.md`: narrowed requirement.
- `openspec/specs/data-retention/spec.md`: narrowed requirement (the same
  "every field" clause, restated in this capability's own words).
- `openspec/specs/persistence/spec.md`: wording fix only, same clause.
- `examples/`: a sweep to mark at least one existing personal-data field
  `redactable: true` so the examples stay a truthful demonstration of the
  flag.
- `docs/authoring-guide.md`: documents the new flag.
- `docs/current-state.md`: the "Instance audit log" section documents
  `redact_instance_fields`'s old signature and unrestricted behavior.
- `test/instance-audit-privileges.test.ts`: hardcodes the old 4-arg
  `redact_instance_fields` signature in a module-level `GRANT`.
- `test/retention.test.ts`, `test/instance-audit.test.ts`: both fixtures
  create instances from an unpublished body, which `redactInstance`'s new
  definition-resolving path cannot satisfy. `instance-audit.test.ts`'s
  existing redaction assertions also encode the pre-narrowing behavior.
- `test/view-layout-hash.test.ts`: pins `expense-approval.json`'s
  `definitionHash`, which the `examples/` sweep above moves.
- Not touched: `instance_audit_diff()`, `instance_audit_append()`,
  `verify_instance_chain()`, the hash chain itself, and the admin route/UI
  layer. An admin audit-log read view is a separate, later change against
  `admin-app`. See `docs/current-state.md`'s instance-audit-log section.
