## Context

`describeConfigSchema(schema, typeName)` lives in
`src/engine/config-descriptor.ts`. It has one caller: `describeRegistry` in
`src/http/studio-routes.ts`. That function builds the
`actionSchemas`/`dataSourceSchemas`/`assignmentStrategySchemas` maps
`GET /registry` returns.

`PluginEnvelopeEditor.tsx`
(`packages/web/src/areas/studio/panels/shared/`) is the only reader of that
output. It reads it through the `ConfigFieldDescriptor` mirror type in
`packages/web/src/areas/studio/api/types.ts`.

A grep sweep covers `describeConfigSchema`, `ConfigFieldDescriptor`, and
`ConfigFieldKind`. It checks three trees: `src/`, `packages/web/src`, and
`packages/form-ui`.

Four files besides `PluginEnvelopeEditor.tsx` reference
`ConfigFieldDescriptor` by name: `DataSourcesPanel.tsx`,
`ActionListEditor.tsx`, `PathsPanel.tsx`, and `TimersPanel.tsx`. Each
imports the type only to pass a prop through to `PluginEnvelopeEditor`.
None of the four reads `kind` or any other field off a descriptor itself.

The sweep confirms one thing: no third file interprets `kind` or `fields`.
It does not confirm that no other file references the type name. That
leaves `PluginEnvelopeEditor.tsx` as the only reader this design needs to
reason about.

Today's implementation walks Zod's own internal representation:
`(schema as any)._zod.def.checks`, `._zod.def.type`, `._zod.def.format`,
`._zod.def.defaultValue`. Four `no-explicit-any` escapes cover those reads.

The file's comments explain two things. One is a `ZodEffects`-vs-`refine`
distinction between Zod versions 3 and 4. The other is two ways a string
format can reach a node. One way, `z.string().email()`, appends a check.
The other way, `z.email()`, sets the format on the node itself. None of
that is public API.

`zod` 4.4.3, the installed version per `package.json`, ships
`z.toJSONSchema(schema)`. That is a public, documented function. It
normalizes all of the above into standard JSON Schema (2020-12) keywords.

I ran `z.toJSONSchema()` inside the devcontainer against every config
schema the engine registers today. The goal was to check the normalized
shape, and to confirm today's descriptor semantics survive the swap. That
investigation is what the rest of this document reports.

## Goals / Non-Goals

**Goals:**
- Delete every `_zod.def` reach and every `no-explicit-any` escape from
  `config-descriptor.ts`.
- Build byte-identical `ConfigFieldDescriptor[]` output for every config
  schema the engine registers today. The existing test suite verifies this,
  running unchanged.
- Keep the public signature and the `ConfigFieldDescriptor`/`ConfigFieldKind`
  types exactly as they are. Nothing downstream of `describeConfigSchema`
  needs a change.

**Non-Goals:**
- Expanding `PluginEnvelopeEditor.tsx` to display a record, a nested
  object, or an unknown/any-typed property as a generated form. All three
  are describable now, a fact the section below, "What `z.toJSONSchema`
  newly makes describable", covers.

  Displaying them needs a form control this change does not build, one
  that is recursive or accepts free-form keys. That is a separate, larger
  feature: a nested form. Adding it here would grow new form-control code
  from a ponytail cleanup, backward from the finding's intent.
- Changing which config schemas get a generated form versus a raw-JSON
  fallback. The supported subset (`string`, `number`, `boolean`, `enum`,
  `string-array`) and its bail rules stay exactly as they are.

## Decisions

### Derive the descriptor from `z.toJSONSchema(schema)`, keeping the same supported subset

Call `z.toJSONSchema(schema)` once per `describeConfigSchema` invocation.
Keep `schema instanceof z.ZodObject` as the top-level gate. Keep
`schema.shape` for property iteration order and existence. Both are stable
public Zod APIs already in use today; neither is part of `_zod`. For each
key in `schema.shape`, read that property's normalized node from
`jsonSchema.properties[key]`. Classify it by its JSON Schema keywords,
never by its Zod internals.

**Alternative considered**: drive both iteration order and classification
from `jsonSchema` alone (`Object.keys(jsonSchema.properties)`,
`jsonSchema.required`). Rejected. It would work for every schema this
investigation covered. But it trades a stable, documented Zod API
(`.shape`) for an assumption about `z.toJSONSchema`'s own key ordering and
`required`-array behavior. This design cannot fully verify that assumption
past the schemas registered today.

The required/default interaction below already needs `.shape`-level
cross-checking regardless. Keeping `.shape` as the anchor, and
`jsonSchema` as the leaf-type oracle, needs no such assumption.

### `z.toJSONSchema` can throw, so `describeConfigSchema` catches it

`z.toJSONSchema` is not total. Verified against the installed zod 4.4.3: a
schema built from `z.date()`, `z.bigint()`, `.transform()`, `z.void()`,
`z.symbol()`, `z.nan()`, or `z.map()` throws. None of them return a JSON
Schema node the classifiers below could bail on.

None of the six config schemas the engine registers today reaches one of
these constructs. But `describeConfigSchema` runs inside a loop.
`describeRegistry` (`src/http/studio-routes.ts`) calls it once per
registered type, to build the `GET /registry` response.

A future config schema might add a `.transform()`, or one of the other
throwing constructs. An uncaught throw would then crash that whole
response. The existing, intended failure mode is narrower: dropping just
that one type's descriptor.

`describeConfigSchema` wraps its `z.toJSONSchema(schema)` call in a
`try`/`catch`. A caught throw logs through the same `log.debug` call the
`not a ZodObject` and `unsupported construct` paths already use. The
function then returns `undefined`. That is the ordinary raw-JSON-fallback
outcome, not a propagated exception. This keeps `describeRegistry`'s
per-type loop as resilient to a future schema's constructs as it already
is to today's.

### The required/default interaction needs one extra check

`z.toJSONSchema` lists a `.default()`-carrying property in the schema's own
`required` array. That property also carries a `"default"` keyword. A
plain `.optional()` property, one with no default, is correctly absent
from `required` and carries no `default` keyword. Verified directly:

```
z.object({ note: z.string().optional(), tries: z.number().default(3) })
```

This produces `required: ["tries"]`, not `note`. `tries` carries both
`"default": 3` and membership in `required`.

Today's descriptor semantics mark a defaulted field `required: false`,
with a `default` value attached, never `required: true`. So the new
implementation computes:

```
required = jsonSchema.required?.includes(key) && !("default" in propertyNode)
```

That is not a bare read of the `required` array. This is the one place the
JSON Schema shape needs adjustment rather than a direct read. A new test
case covers it (tasks.md).

### Refinements resolve transparently; the v3/v4 distinction becomes moot

`z.toJSONSchema` on a `.refine()`/`.superRefine()`-wrapped `ZodObject`
produces the same plain `type: "object"` JSON Schema as the unwrapped
object. Properties and bounds stay intact.

The repository's own `min <= max` cross-field-refine test case, in
`test/config-descriptor.test.ts`, confirms this. Its JSON Schema output
carries `min` and `max` as ordinary `number` properties, with their
`minimum: 0` bound. Nothing sets them apart from an unrefined object.

This means the new implementation needs no refine-vs-effects branch at
all. The current file carries an explanatory comment block about this.
Zod v4 declares `refine` as returning `this`, while Zod v3 wrapped it as
`ZodEffects`. That block is not just dead code once the rewrite lands. It
names a distinction the new approach never has to make, since
`z.toJSONSchema` already resolved it upstream.

### String format and number bound classification map directly

| Descriptor concern | JSON Schema keyword(s) | Bail condition |
|---|---|---|
| `kind: "string"` | `type: "string"` | none |
| `format: "email"` | `format: "email"` | any other declared `format` value |
| `minLength`/`maxLength` | `minLength`/`maxLength` | none |
| (no descriptor) | `pattern` on a string node | always, unless `format` on that same node is `"email"` |
| `kind: "number"` | `type: "number"` | none |
| `min`/`max` | `minimum`/`maximum` | a declared `exclusiveMinimum`/`exclusiveMaximum` |
| (no descriptor) | `multipleOf` on a number node | always |
| `kind: "boolean"` | `type: "boolean"` | none |
| `kind: "enum"` | `enum: [...]` (all string values) | a non-string enum value |
| `kind: "string-array"` | `type: "array"`, `items.type: "string"` | array `items.type !== "string"` and no `items.enum` |
| `string-array` + `enumValues` | `items.enum: [...]` | a non-string value in `items.enum` |
| `string-array` + `format: "email"` | `items.format: "email"` | any other declared `items.format` value |
| (no descriptor) | `items.pattern` on a string-array node | always, unless `items.format` on that same node is `"email"` |
| `minItems`/`maxItems` | `minItems`/`maxItems` | none |
| (no descriptor) | anything else: `type: "object"`, non-string/non-enum array `items`, or no `type` keyword | always: `describeLeaf` falls through to `undefined` |

The classifier is fail-closed on `pattern` and `multipleOf`. Neither
keyword appears in the rows above. A classifier limited to those rows
would silently drop the constraint. It would not bail to the raw-JSON
fallback, the way every other unsupported construct does.

`z.string().regex()`, `.startsWith()`, and `.endsWith()` all build a bare
`pattern` keyword with no `format` key. `z.number().multipleOf()` builds
a `multipleOf` keyword with no `exclusiveMinimum` or `exclusiveMaximum`.

`describeString` and `describeStringArray`'s `items` read both check for a
`pattern` keyword. Each bails unless the node's `format` is `"email"`.
`describeNumber` checks for a `multipleOf` keyword. It bails whenever that
keyword appears.

The `enum` row and the `type: "string"` row are not mutually exclusive
signals on the same property node. Verified against the installed zod
4.4.3: `z.toJSONSchema(z.object({ priority: z.enum(["low", "high"]) }))`
produces `{ type: "string", enum: ["low", "high"] }` on `priority`'s own
property node, both keywords on it at once. `describeLeaf` MUST check
for the `enum` keyword first, before it checks `type === "string"`.
Checking `type` first would classify every scalar-enum property as
`kind: "string"`, discarding `enumValues`.

`z.string().email()` and `z.email()` are the two authoring styles the
current `stringFormat()` helper reconciles by hand. Both converge on the
identical `format: "email"` JSON Schema output. The dual-path lookup goes
away with the internals it worked around.

A plain string-array element classifies the way a scalar string property
does. `describeString` already reads a node's own `format` keyword. It
bails on any value other than `"email"`.

The new `describeStringArray` applies that same read to `items`.
`items.format: "email"` sets `descriptor.format`. Any other declared
`items.format` bails the whole type, matching the scalar string rule.

Today's implementation reaches this by reusing `describeString(element)`
on the array's element schema. The JSON-Schema version reads
`items.format` directly instead. The element is no longer a Zod node to
recurse into.

`notificationEmailConfigSchema`'s `to` property is the case this covers:
a `string-array` with `format: "email"`, asserted byte-identical in
`test/config-descriptor.test.ts`.

### What `z.toJSONSchema` newly makes describable, and why this design does not use it

Three of the engine's own registered config schemas return `undefined`
from `describeConfigSchema` today. `test/config-descriptor.test.ts` asserts
exactly that:

- `httpConfigSchema`: a `z.unknown()` body, a `z.record()` headers field, a
  non-email URL format
- `processStartConfigSchema`: a `z.record()`-valued `inputMapping`
- `staticDataSourceConfigSchema`: an array of nested objects

Every one of these produces full, valid JSON Schema under `z.toJSONSchema`.
A record becomes an object with a schema attached to `additionalProperties`.
`z.unknown()` becomes an empty schema, `{}`, with no `type` keyword. A
nested object becomes a nested `type: "object"` schema. Running
`z.toJSONSchema` against all three inside the devcontainer confirmed this.

Say the new descriptor generator accepted anything `z.toJSONSchema` can
describe. Then all three would newly get a generated form, instead of the
raw JSON fallback. Still, `PluginEnvelopeEditor.tsx` builds a form control
for none of the three:

- a record (free-form key/value pairs)
- a nested object (a sub-form)
- an arbitrary/unknown value (an untyped leaf)

None of today's five `ConfigFieldKind`s covers them.

This design keeps the bail rule as it stands: one unsupported property
drops the whole type's descriptor to `undefined`. The existing
`httpConfigSchema`/`processStartConfigSchema`/`staticDataSourceConfigSchema`
cases keep asserting `undefined`, unchanged, and the expansion stays listed
above as a Non-Goal.

## Risks / Trade-offs

**Risk**: a future `zod` upgrade changes `z.toJSONSchema`'s output shape.

**Mitigation**: this needs the same care a change to `_zod.def`'s shape
would need today. The test suite pins the exact expected output, in
`test/config-descriptor.test.ts`, for five real, registered config
schemas, plus several synthetic ones. A shape change fails the suite
before it reaches the studio. The difference from today: `z.toJSONSchema`
is public, versioned API `zod`'s own changelog covers. `_zod.def` carries
no such contract.

**Risk**: the required/default interaction is a genuine oddity. A later
change can reintroduce it as a bug.

**Mitigation**: a dedicated test case (tasks.md) covers it. It asserts a
defaulted field is `required: false`, with its `default` value attached.
It asserts a separate optional-no-default field is `required: false` too,
with no `default` key. This document records the reasoning, so a later
change does not simplify the required check back to a bare
`jsonSchema.required?.includes(key)` read.

**Risk**: `z.toJSONSchema` throws on a construct no config schema uses
today (`z.date()`, `z.bigint()`, `.transform()`, and others listed above).
An uncaught throw from one type would crash `GET /registry`'s whole
response, not just that type's own descriptor.

**Mitigation**: `describeConfigSchema` wraps its `z.toJSONSchema(schema)`
call in a `try`/`catch` (see "`z.toJSONSchema` can throw, so
`describeConfigSchema` catches it", above). A caught throw returns
`undefined`, the same outcome an unsupported construct already produces.
Task 2.7 covers this with a regression test.

**Risk**: a `pattern` or `multipleOf` keyword is silent under this
classifier. It reads only the keywords each row of the classification
table names. Neither keyword sets `format`, `exclusiveMinimum`, or
`exclusiveMaximum`.
A classifier limited to those reads would drop the constraint silently,
instead of bailing to the raw-JSON fallback.

**Mitigation**: `describeString`, `describeStringArray`'s `items` read, and
`describeNumber` each check for `pattern`/`multipleOf` explicitly (see the
classification table, above). Each bails whenever that keyword appears.
Tasks 2.5 and 2.6 cover this with regression tests.

## Migration Plan

No data migration. No API shape change. No `GET /registry` response shape
change. Deploy as an ordinary code change: land the rewrite, run the full
verification gate (tasks.md), and ship. Rollback is a plain revert.
Nothing persists a value this change produces.

## Open Questions

None. The investigation this document reports resolved every question the
design needed answered, before I wrote the task breakdown.
