## Why

Every condition in a process definition is a CEL expression (`{ lang: "cel", src }`),
but nothing today parses, evaluates, or type-checks that `src`. A definition can
publish with a syntactically broken guard, a reference to a non-existent field, or
a type error (comparing a string field to a number) and the schema accepts it —
the failure only surfaces at runtime, in the engine that does not exist yet. Before
the engine can evaluate guards (Roadmap #3), the language, its evaluation context,
and its authoring-time validation must be pinned. One library must serve both the
editor (parse) and the engine (evaluate) so there is no semantic drift.

## What Changes

- Adopt a single CEL library for TypeScript/Bun, used by both editor and engine.
  It must run in-container under Bun and expose parse-only (for authoring
  validation) and evaluate (for the engine later) against a supplied context.
- Formally define the CEL **expression context**: the exact shape of every
  namespace a guard may read — `data`, `instance`, `actor`, named data-source
  results, and `child.outcome`/`child.data` (subprocess steps only). Resolve the
  two open questions in CLAUDE.md: the exact fields of `instance` and `actor`.
- Scope the `result` namespace to `Action.output` mappings only; it is never
  visible to guards. Encode this as a distinct context so the two cannot be mixed.
- Add authoring-time CEL validation: every `Expression` in a definition is parsed
  and type-checked against the process-wide field catalog at publish/validate time.
  Unknown field references and type mismatches become validation errors, not
  runtime failures. Delivered as a Zod refinement or a lint pass over the parsed
  definition (the type-check needs the CEL library, so it lives outside
  `definition.ts` per CLAUDE.md).
- Each validation rule ships with a test that rejects a violating expression.

Not in scope: runtime guard/path evaluation in the engine, and the `Action.output`
CEL evaluation — those are Roadmap #3. This change pins the language and validates
expressions at authoring time only.

## Capabilities

### New Capabilities
- `cel-expressions`: the CEL language binding for the engine — the chosen library,
  the formal expression context (namespaces and their shapes, including `instance`
  and `actor`), the `result`-scoping rule, and authoring-time parse + type-check of
  every Expression against the field catalog.

### Modified Capabilities
<!-- None. definition.ts already carries the Expression type and field catalog;
     this change adds a validation layer over them, not a requirement change to an
     existing capability spec. -->

## Impact

- **New dependency**: one CEL library (added via `bun install`). Selection
  criteria and the candidate decision live in design.md.
- **New code**: a CEL module (context definition + parse/type-check entry points)
  and a validation hook wired into definition parsing.
- **Schema touch**: `src/schema/definition.ts` gains a refinement/lint hook that
  invokes CEL validation. The `Expression` shape itself is unchanged.
- **Unblocks**: closes the "formal expression context" open question in CLAUDE.md;
  prerequisite for the engine's guard evaluation (Roadmap #3).
- **Tests**: new cases under `test/` that reject broken/ill-typed expressions.
