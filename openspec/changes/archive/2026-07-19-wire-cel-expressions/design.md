## Context

Every condition in a process definition is a CEL expression `{ lang: "cel", src }`,
but no code parses, type-checks, or evaluates it yet. The schema (`definition.ts`)
accepts any string as `src`. This change pins the language binding and validates
expressions at authoring time, so a broken or ill-typed guard fails at
publish/validate rather than at runtime.

Two constraints from CLAUDE.md shape the design:
- **One library for parse and evaluate.** The editor parses (to validate as you
  type); the engine evaluates (Roadmap #3). Two libraries risk semantic drift, so
  a single implementation serves both.
- **Type-check against the field catalog.** The stronger requirement. The catalog
  declares each field's type; a guard comparing a text field to a number must be
  rejected before publish. That needs a CEL library with a real *check* phase over
  a declared type environment, not just an evaluator.

Everything here is pure authoring-time validation. No runtime evaluation ships in
this change.

## Goals / Non-Goals

**Goals:**
- Select one CEL library that runs under Bun, offers parse-only and a check phase
  against a declared type environment, and can evaluate later for the engine.
- Pin the expression context: enumerate namespaces and fix the shapes of
  `instance` and `actor` (the open question in CLAUDE.md).
- Type-check every `Expression` in a definition against the field catalog +
  context, wired into definition validation, each rule backed by a rejecting test.

**Non-Goals:**
- Runtime guard/path evaluation and `Action.output` result-writeback (Roadmap #3).
- Editor UI integration. This change exposes the parse/check API; the editor
  consuming it comes with the editor package.
- Custom CEL functions/macros beyond the reference set. Add when a real guard needs
  one.

## Decisions

### Library: `@marcbachmann/cel-js` (v8.0.0)

Selected after a two-round parallel spike (six libraries) that overturned the
original candidate. The hard requirement — a **type-check phase against a
declared environment** (reject an unknown reference and an int-vs-string mismatch
with no runtime values present) — eliminated every evaluate-first library. Only
`@marcbachmann/cel-js` and `@gresb/cel-javascript` provide a real declared-env
checker; `@marcbachmann/cel-js` wins on maturity (v8.0.0 vs v0.1.1), zero
dependencies, full TS types, a documented API, and it also evaluates (satisfying
the one-library-for-parse-and-evaluate constraint). It installs and runs clean
under Bun on the Windows host.

API shape used: `new Environment({ unlistedVariablesAreDyn: false })` +
`registerVariable({ name, schema })` (object types with per-field CEL types) +
`env.check(src) -> { valid, type?, error? }` (pure type-check, no values). A
parse-only `parse(src)` serves the editor.

**Spike evidence (why the original pick failed):**
- `@celjs/parser` (the original choice, v0.0.4): its `check()` is an **empty stub**
  in the shipped bundle — declarations are never consulted, and type mismatch,
  unknown ref, and even parse errors all pass. Needed a `buf` registry hack to
  install. Rejected: insufficient.
- `libcel-ts` (the original fallback): **does not exist on npm** (hard 404). Vapor.
- `cel-js` (ChromeGG) and `@kevinmichaelchen/cel-typescript` (Rust binding):
  evaluate-first / parse-only; no declared-env check phase. Rejected: insufficient.
- `@gresb/cel-javascript`: works, but v0.1.1, "not production ready", with a
  documented-API bug. Kept as the runner-up.

### Field references in CEL use `key`, not `id`

CEL expressions reference catalog fields by their `key` (e.g. `data.booking_status`),
not their `id`. Forced by two facts: a `field_<uuid>` id is not a valid CEL
identifier (hyphens parse as subtraction), and per-field type-checking requires
each field declared as a named variable with a valid identifier. The existing
example already authors guards this way. This nuances CLAUDE.md's "key references
nothing" — that rule governs *structural* cross-references (path targets, view
refs, action-output targets), which remain id-only; CEL source is the one place
keys are read. Consistency holds because keys and the expressions that read them
live in the same immutable ProcessBody: a key rename is a same-artifact rewrite
within a version. (Engine consequence for Roadmap #3: when building the runtime
eval context, remap the id-keyed instance `data` to key-keyed before evaluation.)

### Expression context shape

One context definition, two scopes derived from it:

- **Guard scope** (paths, timer target guards): `data`, `instance`, `actor`, named
  data-source results, and — only inside a subprocess step — `child`.
- **Output scope** (`Action.output` value expressions): `result` plus the guard
  namespaces. `result` exists ONLY here and is never in guard scope.

Namespace shapes:
- `data` — flat object keyed by `fieldId`; each field's CEL type derived from its
  catalog type (see mapping below).
- `instance` — `{ id: string, status: string, transitionSeq: int, currentStepId: string }`.
  Minimal runtime identity/state a guard plausibly reads. Extended only when a
  concrete guard needs more. `// ponytail: minimal shape, widen when a guard needs it`
- `actor` — `{ id: string, roles: list<string> }`. Who is acting; `roles` covers
  permission-style guards.
- `child` — `{ outcome: string, data: map }`, present only in the guard scope of a
  subprocess step. Referencing it elsewhere is an unknown-reference error.
- data-source results — each declared data source contributes a named entry; its
  type comes from the plugin's declared output schema.
- `result` — the handler's structured return, typed from the action plugin's
  output schema; output scope only.

CEL is pure and total: no `now()` / time functions. The checker's environment
declares no time symbols, so any time reference is an unknown-reference error for
free.

### Catalog-type → CEL-type mapping

A small total function maps each field catalog type to a CEL type (text→string,
number→double/int, boolean→bool, date→string or timestamp per catalog, enum→string,
etc.). This mapping is the single source of truth for building the checker's type
environment. One unit test asserts every catalog field type has a mapping (fails if
a new field type is added without one).

### Wiring into validation

Type-check lives in a new `src/cel/` module (needs the library, so it cannot sit in
`definition.ts` per CLAUDE.md). Definition validation invokes it as a refinement /
lint pass: collect every `Expression` in the definition with its location and its
scope (guard vs output vs subprocess-guard), build the environment from the
catalog + context, parse+check each, and surface failures with the expression's
location. Parse errors and check errors are both authoring-time validation errors.

## Risks / Trade-offs

- **[Chosen library underperforms or misbehaves under Bun]** → Spike is the first
  task; `libcel-ts` is the pre-vetted fallback, so failure costs a swap, not a
  reopened proposal.
- **[`instance`/`actor` shapes guessed too narrow]** → Shapes are marked as minimal
  and centralized in one context definition; widening is a one-place edit, and the
  engine work (Roadmap #3) will surface the real needs. Accepted over speculating a
  wide shape now.
- **[Catalog→CEL type mapping loses precision]** (e.g. int vs double, date as
  string) → Start with the coarsest correct mapping; tighten when a guard needs a
  finer distinction. The mapping-coverage test prevents silent gaps.
- **[Data-source / action plugin output schemas not yet formalized as CEL types]**
  → For plugins without a declared output type, fall back to CEL `dyn` (untyped) so
  those references parse but skip strict checking. `// ponytail: dyn fallback until
  plugin output schemas are typed`

## Open Questions

- **Resolved:** library selected (`@marcbachmann/cel-js` v8.0.0) and confirmed
  under Bun by the two-round spike.
- **Resolved:** `date`/`datetime` map to CEL `string` (values are ISO strings; the
  coarsest correct mapping). Tighten to `timestamp` only if a guard needs date math.
- Data-source results and `result` are typed `dyn` until plugin output-schema
  formats are pinned. `file` and custom (plugin) field types are also `dyn`.
- Migration `transforms` (on the version wrapper, not the ProcessBody) are not
  checked here — they need the from-version catalog. Deferred to the migration work.
- **Known papercut** (adversarial verification): a `number` field maps to CEL
  `double`, so `data.count == 5` and `data.count % 2` are type errors (CEL int
  literals don't `==`/`%` a double); authors write `== 5.0` or `int(...)`. Not
  fixable without an int/float split in the catalog. Documented, not blocked.
- Time constructors `now()`/`timestamp()`/`duration()` are blocked everywhere via
  an AST-level denylist (verification found the pure `timestamp`/`duration` slipped
  the env-only check). Guards carry no time logic; time lives in timers.
