## Why

`src/engine/config-descriptor.ts` hand-rolls a Zod-schema-to-form-descriptor
converter. It reaches into Zod's internal `_zod.def`/`_zod.def.checks` shape,
behind four `no-explicit-any` escapes. It carries comments that distinguish
Zod v3 from Zod v4 internal representations, plus a `ZodEffects`-vs-`refine`
unwrap distinction.

The installed `zod` is 4.4.3 (`package.json`). It ships a public, documented
`z.toJSONSchema(schema)` API. That API already normalizes every one of those
cases: refinements, defaults, optionals, string formats, numeric bounds. It
turns each into a standard JSON Schema keyword.

The reflection this file does by hand is exactly what the library now does
for it. The library's surface is public and stable. A routine dependency
bump can shift an internal one.

## What Changes

- Rewrite `describeConfigSchema` in `src/engine/config-descriptor.ts` (and its
  private helpers `nodeType`, `checkDefs`, `stringFormat`, `describeString`,
  `describeNumber`, `describeStringArray`, `describeLeaf`) to derive each
  property's descriptor from `z.toJSONSchema(schema)` output instead of
  `_zod.def` internals. The public signature
  (`describeConfigSchema(schema: z.ZodTypeAny, typeName: string):
  ConfigFieldDescriptor[] | undefined`) stays the same. The
  `ConfigFieldDescriptor`/`ConfigFieldKind` output shape stays the same too.
- Same supported subset as today, same bail rules. A non-`email` string
  format, an exclusive numeric bound, or any `record`/nested-object/`unknown`
  property drops the WHOLE type's descriptor to `undefined` (raw-JSON
  fallback). It does that no matter where in the schema the property sits.
  This matches the existing rule: one unsupported property drops the whole
  type.
  `httpConfigSchema`, `processStartConfigSchema`, and
  `staticDataSourceConfigSchema` keep returning `undefined`, exactly as they
  do today. See design.md for the investigated evidence behind that claim.
- No change to `describeRegistry` in `src/http/studio-routes.ts` (the sole
  caller). No change to `GET /registry`'s response shape.
- No change to `PluginEnvelopeEditor.tsx`'s rendering logic. No change to the
  `ConfigFieldDescriptor` mirror type in
  `packages/web/src/areas/studio/api/types.ts`. Every config schema the
  engine registers today produces the same descriptors in. It produces the
  same generated form or raw-JSON fallback out, too.
- `test/config-descriptor.test.ts`'s existing 14 cases keep passing. Every
  expected value stays byte-identical. Five new cases join them. One covers
  the exclusive-numeric-bound behavior design.md documents. Two cover a
  pattern-constrained string and a `multipleOf`-constrained number.
- One more new case covers a schema construct that makes `z.toJSONSchema`
  itself throw. The last covers a non-string array property, one whose
  elements are neither strings nor a fixed string enum.
- Most of that coverage is already black-box confirmed by existing cases.
  "A synthetic schema exercises enum, number, boolean, optional and
  default" already asserts the required/default interaction. An optional
  field sits beside a defaulted field there, both `required: false`. The
  `min <= max` `.refine()` case already confirms refined-object
  transparency. A `.superRefine()` case already covers the
  cross-field-rule variant. Tasks 2.2 and 2.3 confirm that pre-existing
  coverage instead of adding net-new cases.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `studio-plugin-config-form`: the requirement "A type with no declared
  config schema keeps the raw JSON path" leaves one line undrawn. It never
  says where a schema counts as "outside the supported subset". A reader
  had to trace Zod internals in `config-descriptor.ts` to find that line.

  This change states that boundary directly in the requirement. It writes
  the boundary in JSON-Schema terms, since the new implementation expresses
  it that way.

  Eight constructs each send the WHOLE type to the raw-JSON fallback:

  - a record-valued property
  - a nested object property
  - an `unknown`-typed property
  - a non-`email` string format
  - a pattern-constrained string (a regex, `.startsWith()`, or `.endsWith()`)
  - an exclusive numeric bound
  - a `multipleOf`-constrained number
  - an array property whose elements are not strings and not a fixed
    string enum (a number array, a boolean array, or an array of nested
    objects)

  That is the same fallback a type with no `configSchema` at all already
  gets.

  The property is exactly what the existing and new regression tests
  assert. No scenario's observable outcome changes. The scenarios already
  listed for `http.request` and the "static data source" schema in
  `test/config-descriptor.test.ts` are the evidence.

## Impact

- Affected code: `src/engine/config-descriptor.ts` gets rewritten internals
  behind the same public exports. `test/config-descriptor.test.ts` gains
  five cases. One covers the exclusive-numeric-bound behavior. One covers a
  pattern-constrained string. One covers a `multipleOf`-constrained number.
- One more new case covers the `z.toJSONSchema` throw-safety case. The last
  covers a non-string array property. The rest of the file stays unchanged.
- `src/http/studio-routes.ts`,
  `packages/web/src/areas/studio/panels/shared/PluginEnvelopeEditor.tsx`, and
  `packages/web/src/areas/studio/api/types.ts` get no change. The
  verification task covers them with a real browser check instead. The
  design keeps the generated-form/raw-JSON boundary identical end to end.
- No API, schema, or database change. No migration.
