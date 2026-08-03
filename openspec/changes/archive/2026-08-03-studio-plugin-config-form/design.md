## Context

See `proposal.md` - Why. Zod 3.23 is the schema library, per `package.json`.
It has no built-in JSON Schema export; that landed later, in Zod v4. This
repo also has no `zod-to-json-schema`-style package today.

The five `configSchema` values that exist right now shape this design more
than any abstract case:

- `staticAssignmentConfigSchema`: `{ candidates: z.array(z.string()) }`
- `dbListDataSourceConfigSchema`: `{ listKey: z.string().min(1).max(...) }`
- `notificationEmailConfigSchema`: `{ to: z.array(z.string().email()).min(1),
  subject: z.string(), body: z.string() }`
- `staticDataSourceConfigSchema`: `{ options: z.array(fieldOption) }`, where
  `fieldOption` is itself an object (`{ value, label }`), not a flat
  primitive.
- `httpConfigSchema`: a flat object plus `.refine((c) => !(c.method ===
  "GET" && c.body !== undefined), ...)` and a `body: z.unknown()` field.

Four of the five are flat objects of strings, string arrays, or enums. Two
do not fit a generated form without much more work.

The data-source type `staticDataSourceConfigSchema` has a cross-field
`.refine()` and an object-typed array element. The action type
`httpConfigSchema` has a `.refine()` plus a freeform `z.unknown()` body. Any
converter has to degrade gracefully for these two, not just the three
simple ones.

## Goals / Non-Goals

**Goals:**
- One source of truth for a type's config shape: the same `configSchema`
  the publish-time registry checks already parse against. Never a second,
  hand-maintained description that can drift from it.
- A generated form for every config schema the converter can represent
  today: `staticAssignmentConfigSchema`, `dbListDataSourceConfigSchema`,
  `notificationEmailConfigSchema`.
- A predictable, total fallback: a schema the converter cannot represent
  keeps the exact raw-JSON behavior `PluginEnvelopeEditor` already has.

**Non-Goals:**
- Full JSON Schema spec compliance, or a generic converter that handles
  every Zod construct (unions, transforms, cross-field refinements, nested
  objects). JSON Schema itself cannot express a `.refine()` predicate
  either, so "full compliance" would not even solve the `httpConfigSchema`
  case.
- A partial form for a type like `httpConfigSchema`, showing generated
  fields for `url`/`method`/`headers` and a raw-JSON box only for `body`.
  Whole-type fallback is simpler and is the same granularity the
  `studio-plugin-config-form` spec already commits to.
- Any change to `src/schema/definition.ts`, publish-time validation, or the
  custom-field-type position (out of scope per `proposal.md`).

## Decisions

### The server converts each configSchema itself; no hand-written descriptor, no new dependency

`GET /registry` derives a small, form-oriented descriptor straight from
each entry's `configSchema`. A handler author writes no separate descriptor
by hand. This change adds no new dependency such as `zod-to-json-schema`.

**Alternative 1**: a hand-written descriptor per registry entry, the option
`proposal.md` names. Rejected. It creates a second artifact beside
`configSchema`, one a handler author must keep in sync by hand. That is the
drift risk `CLAUDE.md` calls out for CEL: one library for parsing and
evaluating, so nothing drifts. A hand-written descriptor also does not
remove the degrade-gracefully problem. `httpConfigSchema`'s author would
still have to decide what the descriptor says about a `.refine()`-guarded,
`z.unknown()` field.

**Alternative 2**: a generic Zod-to-JSON-Schema library. Rejected for this
change's actual scope. Four of five schemas are flat objects of primitives
and arrays. A full generic converter buys coverage no existing schema
needs. It would still leave the same `.refine()`/`z.unknown()` cases
unrepresentable in JSON Schema. It would also add a dependency to solve a
problem none of this repo's five schemas has.

**Chosen shape**: the converter walks a `ZodObject`'s shape. It recognizes
`ZodString` (plus `.email()`), `ZodNumber`, `ZodBoolean`, `ZodEnum`, and
`ZodArray` of one of those. `ZodOptional` or `ZodDefault` may wrap any of
those. It also reads each node's own length and format checks, not just its
base kind. That means a `ZodString`'s `.min()`/`.max()`, a `ZodArray`'s
`.min()`/`.max()`, and a `ZodString`'s `.email()`.

Two of the three schemas this design calls fully supported carry exactly
these checks. The data-source type's `listKey` has `.min(1).max(...)`. The
notification-email type's `to` field has an array `.min(1)` and a
per-element `.email()`. The descriptor has to carry them.

Dropping them would leave the generated form blind to a too-long key or an
empty recipient list. That is the exact publish-time surprise this change
exists to remove. It emits one descriptor per property:
```
{ key: string; kind: "string" | "number" | "boolean" | "enum" | "string-array";
  required: boolean; enumValues?: string[]; default?: unknown;
  minLength?: number; maxLength?: number; min?: number; max?: number;
  minItems?: number; maxItems?: number; format?: "email" }
```
Four constructs make a type's conversion fail. These are: a `ZodObject`
wrapped in `.refine()` or `.superRefine()`, a nested `ZodObject` property,
and `z.unknown()`. Anything else outside that list fails too. `GET
/registry` then omits a schema description for that type.
`studio-plugin-config-form`'s existing "no declared schema" requirement
already covers the resulting raw-JSON behavior. `httpConfigSchema` and
`staticDataSourceConfigSchema` build no descriptor today. Neither needs a
new requirement or per-type special-casing for that reason.

### Whole-type fallback, not per-field

A type either gets a fully generated form, or it keeps the fully raw JSON
textarea. This avoids a new UI state: some fields generated, one field raw
JSON, inside the same envelope. It also matches what
`studio-plugin-config-form`'s spec already commits to. A real need for
partial forms may show up later, for example if `http.request` gains a
well-known, representable subset. That would be a follow-up change. It is
not a reason to build mixed-mode UI now, for zero schemas that would use it
today.

### db.list keeps its dedicated list-key picker, not a generated form

`dbListDataSourceConfigSchema` converts cleanly: one `listKey` string,
within bounds. A generated form is possible for it.

`DataSourcesPanel.tsx` still excludes `db.list` from what it passes as
`registrySchemas`. Its envelope keeps the raw JSON path for that type.

Reason: `DataSourcesPanel.tsx` already has a dedicated `listKey` picker
below the envelope. It reads from `listDataListKeys`, a real, live list of
known keys. It also warns about a key the server doesn't recognize.

A generated form's plain text input for the same field would be strictly
worse, not an improvement. It would also leave two controls writing the
same `config.listKey`.

This is a per-call-site integration choice, not a change to
`PluginEnvelopeEditor` itself. The component still shows a generated form
whenever the caller passes it a matching descriptor. That is exactly what
`studio-plugin-config-form`'s own requirement asks for.
`DataSourcesPanel.tsx` chooses not to pass one for this single type.

## Risks / Trade-offs

- A `.refine()`-guarded schema like `httpConfigSchema` gets no generated
  form. Only the existing raw JSON path remains. → Acceptable: this is
  exactly today's behavior for that type, not a regression. A future
  change can special-case one refine pattern, if `http.request` config
  errors become a real authoring problem.
- A handler author's new `configSchema` shape may confuse the converter,
  for example a nested object.

  The result is no generated form, with no obvious reason why.

  → Mitigation: the server logs a debug-level line naming the type and the
  unsupported construct when conversion fails. A developer testing their
  own new handler sees it during that testing.
- The converter is bespoke code, not a maintained library. A future Zod
  upgrade could change the internal shape-introspection details it relies
  on. → Mitigation: `package.json` ranges on `^3.23.8` today. That differs
  from the pinned, no-caret `@marcbachmann/cel-js` dependency `CLAUDE.md`
  documents.

  A `bun test` suite exercises the converter against all five current
  schemas. A breaking introspection difference fails that suite right away,
  before any Zod version bump ships.
- The wire descriptor is a bespoke shape, not standard JSON Schema.

  → Low stakes: `GET /registry` sits outside the versioned `ProcessBody`
  contract, so nothing pins this shape. A later stage wanting real JSON
  Schema or OpenAPI tooling here can convert it then, at no migration cost.

## Migration Plan

No data migration, no schema change, no new persisted state. Deploy is a
server change (the converter plus the widened `GET /registry`) followed by
a studio-area UI change. Rollback is a plain code revert. Nothing this
change writes is unreadable by the code before it.

## Open Questions

None.
