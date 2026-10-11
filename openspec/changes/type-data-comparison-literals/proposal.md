# Proposal

## Why

Two builders write every comparison value as a string. The engine compares `jsonb` by type. On a number or boolean field, `eq` then matches nothing and `ne` matches every row. No check reports it.

The `instance.query` form in the studio and the comparison row in the report builder share this root cause. The audit of 2026-10-10 found four defects in the two screens: E2-2, E2-9, E2-16 and F-5.

## What Changes

- Both builders write a literal of the compared field's declared type. A number field takes a number. A boolean field takes a Yes/No choice. Any other field takes text.
- The `in` operator takes one comma-separated text input in both builders. Each member parses by the field type. The `instance.query` form offers no own-field right side for `in`.
- A value that does not parse leaves the comparison incomplete. The `instance.query` form marks it. The report builder keeps it out of the query.
- Publish rejects an `instance.query` comparison when no live version of the target admits its literal. A hand-written body meets the same gate as the form. This is a new authoring invariant.
- A column choice carries the declared type of its field. The response of `POST /reporting/reports/columns` gains an optional `type` key.
- The report builder waits 300 ms after the last keystroke before it asks for column choices.
- The attribute rows of the `instance.query` form keep their identity while the author types a key. The form marks a key that another row holds and does not write it.
- A failed fetch of the target catalog shows an error row. The form marks no reference stale.
- `compileDataComparison` stays as it is. Report create, update and preview run no literal check. The owner ruled both on 2026-10-11.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-plugin-config-form`: the `instance.query` form writes typed literals and takes an `in` list. Its attribute rows stay stable. It reports an unreadable target catalog.
- `reporting-data-tables`: the report builder writes typed comparison values. It keeps an incomplete comparison out of the query. It debounces the column request.
- `instance-data-tables`: a column choice carries the declared type of its field.
- `cross-process-validation`: publish rejects an `instance.query` literal that no live version of the target admits.

## Impact

- Engine: `src/engine/definitions.ts` gets the publish check. `src/runtime/reports.ts` carries the field type in `ColumnChoice`.
- Web: `InstanceQueryForm.tsx`, `useTargetProcessCatalog.ts`, `ReportBuilderScreen.tsx`, the reporting `types.ts` and `reportsLogic.ts`. One new pure module under `packages/web/src/shell/` parses a literal for both areas. The studio catalog gains English strings. The reporting catalog gains English and German strings.
- Rules and docs: `.claude/rules/authoring-invariants.md`, `.claude/rules/process-contract.md`, `docs/authoring-guide.md`, `docs/browser-checks.md` and the audit index in `docs/decisions.md`.
- Unchanged: `src/schema/definition.ts`, the `instance.query` config schema, `definitionHash` and every example under `examples/`.
- `docs/openapi.yaml` stays as it is. It excludes `reporting/*`.
