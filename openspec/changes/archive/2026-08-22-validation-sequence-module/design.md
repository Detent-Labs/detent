## Context

See proposal.md's "Why" for the motivation. Three facts shape the approach.

`publishBody` splits its stages around the hash. `compileProcessBody` runs
first, and `definitionHash` derives from its output. Six stages run after the
hash-hit early return. `src/engine/definitions.ts:250-256` states why in a
comment. A re-publish of a body that predates a tightened check stays a no-op.
It does not become an issue for a version instances already pin.

The studio already holds the registry type names. `GET /registry`
(`src/http/studio-routes.ts:260-283`) returns `actionTypes`,
`dataSourceTypes` and `assignmentStrategyTypes`, plus a config descriptor per
type. `useRegistry` already fetches it for the plugin-config form. No studio
code passes any of it to `runValidation`.

`describeRegistry` (`src/http/studio-routes.ts:237`) returns
`Record<string, ConfigFieldDescriptor[]>`. That drives a form. It does not
validate a config. The live Zod schema stays on the server.

## Goals / Non-Goals

**Goals:**

- One module owns the stage order. Neither caller restates it.
- The order is an ordering convention the module's own function signatures
  enforce. It is not a comment either caller could drift from.
- The studio reports every publish blocker it holds the input for.
- A dimension without its input reads as not run, never as passing.

**Non-Goals:**

- Changing what a publish accepts or rejects.
- A new endpoint. The registry response already carries what this needs.
- Validating a plugin config in the browser.
- Unifying the four issue types. See proposal.md's Impact.

## Decisions

### Module placement: `src/validate.ts`, not `src/schema/validate.ts`

The new module lives at top-level `src/validate.ts`, a sibling of `schema/`,
`engine/` and `cel/`. It does not live inside `src/schema/`.

`src/engine/registry-check.ts`'s own header states why a check like this
stays out of `src/schema/`. It needs `Registry`, an engine-owned, in-process
concept `definition.ts` must not depend on. `src/cel/check.ts` stays out of
`definition.ts` for the same reason.

`validateReferences` (below) runs the registry checks, the CEL check and the
cross-process and chaining checks. It imports from outside `src/schema/` in
three ways. `Registry`, `AssignmentRegistry` and `DataSourceRegistry` come
from `src/engine/registry.ts`. The type-resolution halves come from
`src/engine/registry-check.ts`. The chaining and cross-process comparison
logic comes from `src/cel/check.ts` (`checkSubprocessChildRefs`,
`checkProcessChainingTarget`). `src/engine/definitions.ts`'s
`validateProcessChaining` and `validateCrossProcess` stay engine-only, called
only from `publishBody`, and are never imported by `src/validate.ts`.
`validateProcessBody` also comes from `src/cel/check.ts`. Placed inside
`src/schema/`, that import set breaks the existing boundary comment's rule.

`./cel/check` and `./engine/registry-check` already sit outside `schema/` in
the exports map. That is the same reason. `src/validate.ts` follows that
precedent. `validateStructure` needs only `definition.ts` and `compile.ts`,
so it could live in `schema/` on its own. It ships beside `validateReferences`
in one file instead, so the pair stays one import for both callers.

Alternative: keep the module in `src/schema/` and accept the boundary
violation. Rejected. The boundary is load-bearing, not a style choice.
`src/schema/` stays the deserializer for stored immutable bodies.

### Two exported phases, ordered by a compiled-body token

`src/validate.ts` exports two functions.

`validateStructure(authored)` runs duration validation, the structural
checks (including the unknown-key check), then the Zod gate, in that order.
That is `compileProcessBody`'s own order today, preserved exactly. See
"Duration and structural checks keep running before the Zod gate" below for
why the order matters. It returns the issues and, on success, the compiled
body. The sketch below is illustrative, parallel to
`ReferenceValidationResult` further down. It does not bind the implementer
to these exact field names:

```ts
interface StructureValidationResult {
  issues: (CompileIssue | DurationIssue)[];
  zodIssues: z.ZodIssue[];
  compiled: ProcessBody | undefined;
  discardedError: unknown | undefined;
  dimensions: {
    zod: "ran";
    duration: "ran" | "not-run";
    structural: "ran" | "not-run";
  };
}
```

`zod` always reads `"ran"`. The `safeParse` call runs unconditionally.
`zodIssues` carries that call's own `error.issues` when the parse rejects
the body. It carries an empty array when the parse accepts it. Two readers
use `zodIssues`. The studio's `EditorIssue` mapping (task 4.3) fills the rail's
`zod` group with the real message text. `publishBody`'s own re-throw
(above) reconstructs the `ZodError` it throws when duration and structural
both pass but this call does not.

<!-- antislop: allow synonym-rotation -->
<!-- "discard" here names dropping a caught exception; "delete" elsewhere in
     this document names removing the 36-line ordering comment (task 4.5).
     Different concepts, not synonyms for one. -->
`discardedError` carries the exception this call's own try/catch caught and
discarded, most often a `TypeError`. See "Duration and structural checks
keep running before the Zod gate" below. It reads `undefined` whenever that
try/catch caught nothing to discard. An ordinary `DurationValidationError` or
`CompileValidationError` outcome leaves it `undefined` too. Those two
populate `issues` instead.

`duration` and `structural` follow the next section's try/catch and
fall-through rules. `duration` reads `"not-run"` when the cheap
`workflow?.steps` shape check fails. It also reads `"not-run"` when the
try/catch falls through on an unrelated thrown exception.

`structural` reads `"not-run"` whenever a duration issue stops
`compileProcessBody` before it reaches the six structural checks. It also
reads `"not-run"` when that same fall-through happens. `compiled` carries
a value only when `structural` reads `"ran"` with no issue. That is the
same point `compileProcessBody`'s own internal `.parse()` call reaches
today. One exception narrows that rule: a body that reaches
`compileProcessBody`'s idempotent early-return branch while the separate,
unconditional Zod parse still rejects it. See "Duration and structural
checks keep running before the Zod gate" below, the paragraph on that
fifth fall-through state.

`ValidationResult`'s single per-dimension record (task 4.6) merges this
result's `zod`/`duration`/`structural` entries with
`ReferenceValidationResult`'s own `dimensions` entries
(`actionType`/`assignmentType`/`dataSourceType`/`registryConfig`/`cel`)
into one eight-key `Record<Dimension, "ran" | "not-run">`. Nothing in
`ReferenceValidationResult` reports the zod, duration or structural
dimensions; `StructureValidationResult` is where those three originate.

`validateStructure` produces that compiled body by calling
`compileProcessBody` itself. That call runs `compileProcessBody`'s own
internal duration/structural/Zod sequence. `validateStructure`'s own cheap
shape check and try/catch have already run by then. They confirm the input
is a reasonable candidate. That internal sequence is now expected to
succeed as a result. It does not reimplement cancel-sink and contract
injection on its own.

<!-- antislop: allow sentence-length run-ons -->
<!-- Known linter miscount: sentence splitting merges across this passage's adjacent `code span` references. Each sentence reads under 20 words split at its own period, and none is a comma splice. -->
`validateReferences(compiled, inputs)` runs the three registry
type-resolution checks, each a direct `resolveType` call against the
supplied `RegistryDescription`. When the caller supplies a live registry
set, it also calls `checkConfigOnly` directly, once per dimension. That
call reads that dimension's own registry, not `checkTypedConfig`.
`checkTypedConfig` would re-resolve every site and duplicate the
not-registered issues `resolveType` already reported. `validateReferences`
also runs the CEL check, the cross-process check and the chaining check. It
takes a compiled body, which only `validateStructure` produces.

Alongside the `RegistryDescription` and the loaded referenced-process bodies,
`inputs` carries one more, optional field: a live registry set (`Registry`,
`AssignmentRegistry`, `DataSourceRegistry`). Only `publishBody` supplies it.
The studio never holds a live registry, so its calls always omit it. The
config-validation half always reports `not-run` there.

The result `validateReferences` returns pins one `ran`/`not-run` flag per
dimension, alongside the located issues. The sketch below is illustrative. It
does not bind the implementer to these exact field names:

```ts
interface ReferenceValidationResult {
  actionTypeIssues: RegistryIssue[];
  assignmentTypeIssues: RegistryIssue[];
  dataSourceTypeIssues: RegistryIssue[];
  actionConfigIssues: RegistryIssue[];
  assignmentConfigIssues: RegistryIssue[];
  dataSourceConfigIssues: RegistryIssue[];
  celIssues: CelIssue[];
  dimensions: {
    actionType: "ran" | "not-run";
    assignmentType: "ran" | "not-run";
    dataSourceType: "ran" | "not-run";
    registryConfig: "ran" | "not-run";
    cel: "ran" | "not-run";
  };
}
```

A flat `issues` array cannot support "throw only the action-registry issues"
(task 6.15). Nothing in it would discriminate one dimension's entries from
another's. The config-validation half splits the same way. One array covers
each registry kind. That mirrors the type-resolution arrays exactly.
`publishBody` needs to throw `RegistryValidationError`,
`AssignmentRegistryValidationError` or `DataSourceRegistryValidationError`
for a config-only violation in one dimension. A merged `registryConfigIssues`
array could not tell it which class that violation belongs to.

`dimensions.registryConfig` stays one shared `"ran"`/`"not-run"` flag across
all three arrays, not three separate flags. Config validation is
all-or-nothing per call. The caller supplies the live registry set as one
bundle or not at all.

<!-- antislop: allow run-ons -->
<!-- Known linter miscount: sentence splitting merges across this passage's adjacent `code span` references. None of the sentences below is a comma splice. -->
`publishBody` applies precedence itself over these per-dimension arrays. It
checks the four dimensions in order: action, then assignment, then data
source, then CEL. The three registry dimensions each carry two arrays. One
holds type-resolution issues. The other holds config-validation issues.
`publishBody` checks both of that dimension's arrays together.

It throws under that dimension's own thrown class when either array is
non-empty. The thrown value concatenates the two arrays, type-resolution
issues first, then config-validation issues. CEL carries one array,
`celIssues`, checked alone. A non-empty `celIssues` throws
`CelValidationError`. `publishBody` moves to the next dimension only when
the current one's array, or both arrays, read empty.

The studio's `runValidation` mapping concatenates `actionTypeIssues`,
`assignmentTypeIssues`, `dataSourceTypeIssues`, `actionConfigIssues`,
`assignmentConfigIssues` and `dataSourceConfigIssues` under `source:
"registry"`. It maps `celIssues` under `source: "cel"`. Both preserve today's
`EditorIssue` grouping.

`publishBody` calls the first, hashes, returns early on a hash hit, then calls
the second. The studio calls both in order. The hash-hit position stays
expressible, and it stays where it is today.

The studio's own entry point wraps both calls behind one function,
`runValidation`. Its new parameter list is illustrative, matching the
sketches above for `StructureValidationResult`/`ReferenceValidationResult`.
It does not bind the implementer to these exact parameter names:

```ts
function runValidation(
  draft: Draft,
  registry: RegistryDescription | undefined,
  loadedChildren: Record<string, ProcessBody>,
  loadedChainingTargets: Record<ActionId, ProcessBody>,
): ValidationResult
```

<!-- antislop: allow sentence-length -->
<!-- Known linter miscount: sentence splitting merges across this passage's
     adjacent `code span` references. Each sentence reads under 20 words
     split at its own period. -->
`registry` reads `undefined` until `useRegistry` (task 4.0) resolves. Every
caller-supplied-input rule above applies to it the same way it applies to
`validateReferences`'s own `inputs.registryDescription`. `loadedChildren` and
`loadedChainingTargets` feed `checkSubprocessChildRefs` and
`checkProcessChainingTarget`, per site, the same way they feed
`validateReferences`. `runValidation` never receives a live registry set.
The studio never holds one. So the config-validation half always reports
`not-run` through this call. That matches `validateReferences`'s own rule
for a caller that omits it.

`validateStructure` never throws, for a duration, structural, or Zod issue,
nor for the caught-and-discarded exception `discardedError` carries. It
reports every one of those in its returned result instead, per "Duration and
structural checks keep running before the Zod gate" below.

`publishBody` reconstructs the class it throws from that result, before it
ever computes a hash. A `compiled` of `undefined` means the result carries an
issue. `publishBody` checks four branches in order: `DurationValidationError`
when `duration` carries issues, else `CompileValidationError` when
`structural` carries issues, else `ZodError` built from `zodIssues` when that
array is non-empty, else `discardedError` itself, re-thrown as-is. That
fourth branch is the one reachable state the first three leave uncovered: a
caught exception unrelated to any Zod-detectable shape problem, against a
body that is otherwise Zod-valid. `compileProcessBody` never runs a second
time. The result already carries what each thrown class needs.

`publishBody` hashes `compiled` and proceeds only once it holds a value.
This is how "The engine's publish verdict does not change" holds for the
duration and structural stages. It already holds that way for the four
stages `validateReferences` owns.

`checkViewFlags` is not one of the inputs `validateReferences` accepts. It
runs outside the shared module entirely, inside the studio's own
`runValidation`, after both module calls return. The studio merges its
`EditorIssue[]` into the result the module produced. `publishBody` never
calls it. The engine holds no view-flag concept to check. The module
accepts only the two inputs `publish-validation-consolidation`'s delta spec
names. Those are a registry description and the loaded bodies of referenced
processes.

`checkUnwrittenTechnicalFields` (`packages/web/src/areas/studio/draft/
view-flags.ts`) is not a module input either, for the same reason as
`checkViewFlags`. It reads the Zod-parsed body directly. It is a
studio-only, `view`-source finding, and the engine holds nothing to check
against. It runs alongside `checkViewFlags`, after both module calls
return, and the studio merges its `EditorIssue[]` into the result the same
way.

Alternative: one call taking a callback that runs between the phases. That
inverts the control flow to serve one caller's early return. Rejected.

Alternative: one call running everything, with the hash check moved ahead of
it. That re-runs the five post-hash checks on an identical re-publish. A body
published before a check tightened would then fail on re-publish. That is the
outcome the current comment exists to prevent. Rejected.

The compiled body is the ordering convention. `validateStructure` is the only
sanctioned way to build one from an authored draft. A caller that wants the
reference checks has nothing else to pass.

`compileProcessBody` returns the same nominal `ProcessBody` type it accepts
(`src/schema/compile.ts:802`). Nothing at the type level stops a caller from
hand-constructing a value and skipping `validateStructure` outright. The
guarantee holds only because neither caller has a reason to do that.

The 36-line ordering comment at `validation.ts:43-78` describes a hazard that
stops being reachable through the module's own call pattern.

`validateReferences` does not call `validateProcessChaining` or
`validateCrossProcess` directly. See "Process chaining and cross-process
checks split into a resolution half and a comparison half" below. It calls
their new synchronous halves instead.

### Duration and structural checks keep running before the Zod gate

<!-- antislop: allow synonym-rotation -->
<!-- "error class" names a TypeScript class (DurationValidationError and its siblings); "issue" names the located RegistryIssue/CelIssue/CompileIssue/DurationIssue records those errors carry. The two are different things in this codebase, not synonyms for one concept. -->

`compileProcessBody` today runs `validateDurations`, then the seven
structural checks, against the raw, duck-typed body. It calls
`authoredProcessBody.parse`, the real Zod gate, only after that, near the
end (`src/schema/compile.ts:802-826`). For a body invalid in more than one
dimension at once, that order decides which `Error` subclass `publishBody`
throws. `DurationValidationError` beats `CompileValidationError`. Both beat
a bare `ZodError`.

<!-- antislop: allow synonym-rotation -->
<!-- Same distinction as above: "error type" here names the HTTP error type src/http/errors.ts maps an Error subclass to, not the located issue records. -->

`src/http/errors.ts` maps each to its own HTTP error type. `validateStructure`
preserves this exact order for the engine. It does not reorder to Zod-first.
So it does not change which error class a multi-violation body raises.
"The engine's publish verdict does not change" holds without narrowing that
scenario.

<!-- antislop: allow sentence-length -->
<!-- Known linter miscount: sentence splitting merges across this passage's adjacent `code span` references. Each sentence reads under 20 words split at its own period. -->
Today's studio `runValidation`, by contrast, calls
`authoredProcessBody.safeParse` first. Its own docstring states the reason.
`validateDurations` walks `body.workflow.steps` with no optional chaining.
It throws a raw `TypeError` there, not a located issue, against a Draft
still missing that shape. `validateStructure` meets that same need without
reordering the engine's stages.

Before running duration validation on the raw input, `validateStructure`
checks cheaply whether the raw input carries enough shape to walk. The
check is `Array.isArray` on `workflow?.steps`, nothing more. When the raw
input lacks that shape, `validateStructure` skips straight to the Zod
parse. That parse always fails on the same missing-`workflow.steps` shape.
Skipping duration and structural loses nothing for that one case.

That cheap check is shallow on purpose. It does not guarantee a fully
walkable shape.

<!-- antislop: allow synonym-rotation -->
<!-- "JSON surface" here is the fixed UI term for the raw definition view (ui-glossary.md), not the verb "surface" meaning reveal. -->
`validateDurations` (`src/schema/compile.ts:105`) reads `t.onFire.actions` per
timer. It applies no optional chaining to `onFire` itself. A raw input can
carry `workflow.steps` as an array while one timer has no `onFire` at all.
Only the JSON surface's paste/import path reaches `validateDurations` with
that shape. `TimersPanel.tsx` cannot: it always sets `onFire: {}` on a new
timer.

`Array.isArray(workflow?.steps)` still passes for that input.
`validateDurations` then throws an uncaught `TypeError`, not a located
issue.

So `validateStructure` wraps the whole duration-and-structural step in a
try/catch. `DurationValidationError` and `CompileValidationError` report
their issues inside it, as they already do.

<!-- antislop: allow synonym-rotation -->
<!-- "method" here names the HTTP request method (GET/POST/...) `log.error`
     records; "function" elsewhere in this document names a TypeScript
     function. Different concepts, not synonyms for one. -->
`validateStructure` logs the caught `TypeError` server-side before it falls
through. It mirrors `src/http/errors.ts`'s own unhandled-error fallback
(`log.error`, from `src/log.ts`): method, path, the error's name, message
and stack. That fallback exists because a raw runtime exception is
otherwise the operator's only trace of a real bug. A silent catch here
would lose that trace before anyone sees it. The result also carries the
caught error itself, in the `discardedError` field above, so a caller can
recover it instead of losing it to the fall-through.

A fourth error type gets that same fall-through treatment: `ZodError`.
`compileProcessBody`'s own final internal call is
`authoredProcessBody.parse(body)` (`src/schema/compile.ts:826`). That call
throws a plain `ZodError` for every invariant that lives only in
`processBody`'s own `.superRefine` (`src/schema/definition.ts:659-780`).
Those invariants are `initialStep` resolution, `path.to` resolution,
`view.fields[].ref` resolution, `timer.onFire.targetPath` resolution,
`action.output` field resolution, duplicate-id checks, `baseLocale`
requirements, and contract-outcome reachability.

None of those invariants live in `validateDurations` or the seven structural
checks (`compile.ts:790-800`).

`checkIdResolution` is the structural check closest in shape. It covers
only `subprocess.outputMapping` and `contract` fields, not path, view, timer
or `initialStep` references.

So a body that clears duration and the seven structural checks still reaches
that internal `.parse()` call. It can still fail there. That state is common,
not rare. An author deleting a step a path still targets leaves the draft
exactly there.

`validateStructure` catches that `ZodError` too, and falls through to
Zod-only reporting, the same way it does for `TypeError`. It needs no
further handling. The result's `zodValid`/`zod` dimension already comes from
the separate, unconditional `authoredProcessBody.safeParse(authored)` call
below. That `ZodError`'s issues are already available there, with no need
to re-derive them from the caught exception.

A fifth state reaches the same fall-through with no exception at all.
`compileProcessBody`'s idempotent branch
(`publishedProcessBody.safeParse(body)`, `src/schema/compile.ts:819-820`)
returns successfully whenever the raw input already carries the compiled,
published shape: the reserved cancel-sink step and outcome. The JSON
surface's raw-paste import path reaches that shape most directly, by
pasting an already-published body's exported JSON back in as a draft. That
branch returns before `authoredProcessBody.parse` ever runs, so
`compileProcessBody` throws nothing. Duration and the seven structural
checks already reported zero issues to reach it.

Left alone, that state reports `duration` and `structural` both `"ran"`,
with `compiled` populated, while the separate, unconditional
`authoredProcessBody.safeParse(authored)` call still fails:
`authoredProcessBody` explicitly rejects the reserved cancel-sink identity
`publishedProcessBody` just accepted. `zodValid` then reads `false` against
a clean duration/structural pass. That contradicts `studio-checks-rail`'s
"A Zod-invalid draft shows every group held back" scenario, since
`heldBackFor` keys the CEL and registry groups off the structural
dimension alone.

`validateStructure` closes that gap by reading `zodIssues` once
`compileProcessBody` returns, whichever way it returned: by throwing the
`ZodError` above, or by succeeding through the idempotent branch. Whenever
`zodIssues` is non-empty, `duration` and `structural` both report
`"not-run"`, regardless of what `compileProcessBody` itself did. This
narrows the earlier rule that `compiled` carries a value only when
`structural` reads `"ran"` with no issue: `compiled` still carries the
idempotent branch's own return value here, since nothing about that
branch's own success changes. `publishBody`'s own gating (task 3.1) stays
on `compiled !== undefined` alone, so this reporting change does not touch
it. `runValidation`'s decision to call `validateReferences` keys off
`dimensions.structural` alone: it never runs the reference checks against a
body whose separate Zod verdict already rejects it, since
`dimensions.structural` reads `"not-run"` in exactly that state, per the
narrowing rule above.

The rail's own `heldBackFor` rule needs a second signal alongside that
field. `dimensions.structural` reads `"ran"` both when the six structural
checks pass cleanly and when they run and raise a `CompileValidationError`,
so it cannot alone tell "compiled cleanly" apart from "ran and failed."
`heldBackFor` therefore holds the CEL and registry groups back whenever
`dimensions.structural !== "ran"`, OR the structural group's own issue list
is non-empty. Neither of those two rules keys off `compiled` directly.

`compileProcessBody`'s idempotent early return is pre-existing behavior,
unrelated to this change, and stays exactly as it is. An authored body that
already carries the compiled shape still short-circuits there, and
`publishBody` still hashes and publishes what `compiled` returns, precisely
as it does today. Only the studio's per-dimension reporting narrows here,
so its rail does not tell an author that duration and structural ran clean
against a body its own Zod check already rejects.

`validateStructure` re-throws anything that is not one of those four types
(`DurationValidationError`, `CompileValidationError`, `TypeError`,
`ZodError`), instead of folding it into the fall-through path. That stops an
unrelated bug elsewhere in `compileProcessBody` from reading as "only Zod
issues" (task 6.18).

A caught `TypeError` is not always the documented onFire hazard above. Any
other null- or undefined-property access inside `validateDurations` or the
seven structural checks throws the same way. It might exist today, or arrive
with a later change. This catch cannot tell the two apart by class alone.

That happens against a body that is otherwise Zod-valid. When it does,
`validateStructure` returns `duration`, `structural` and `zodIssues` all
empty. `compiled` stays `undefined`, and `discardedError` carries the caught
exception. `publishBody`'s own re-throw (task 3.1) needs a fourth branch for
exactly that state. It re-throws `discardedError` itself, instead of
building a content-free `ZodError([])`.

That branch is reachable, not defensive dead code. Logging alone does not
fix the misclassification when `publishBody` still answers 422 with an empty
issue list. The re-throw is what lets `src/http/errors.ts`'s own 500
fallback classify the fault correctly. The logged message and stack stay
the operator's trace of it.

`validateStructure` also calls `authoredProcessBody.safeParse(authored)` on
the raw input directly, to populate `zodValid`/the `zod` dimension. That
call runs unconditionally. It never gates behind the
duration-and-structural try/catch's outcome. It never skips because that
try/catch raised or fell through. It differs from the internal `.parse()`
call inside `compileProcessBody`.

That internal call runs only once duration and structural have already
succeeded, to build the compiled body. So `zodValid` stays knowable even
when duration or structural validation fails. This matches
`studio-checks-rail`'s "A Zod-valid draft with a duration issue holds the
structural group back too" scenario.

When the raw input carries that shape, duration and structural run first.
That matches the engine's own order today. Only then does the Zod parse
run. That covers any body the engine will ever publish. It also covers a
studio Draft from shortly after its first step exists.

This is a real, deliberate behavior change for the studio. Today it always
runs Zod first. After this change it runs duration and structural first
whenever the Draft carries that shape. It does not change which issues the
studio finds. Today's `runValidation` already runs `validateDurations` and
the structural checks once Zod passes.

Both already run together once the Draft is Zod-valid. The change is which
of several simultaneous issues the studio's own single-body check runs
first. It is never which issues the studio finds overall. The engine's own
precedence stays unchanged from today. That is the precedence "The engine's
publish verdict does not change" pins.

Alternative: reorder the engine to Zod-first, matching the studio. Rejected.
That changes which error class a multi-violation body raises at publish,
contradicting "The engine's publish verdict does not change."

Alternative: two different hardcoded orders, one per caller. Rejected. That
is the per-caller stage list this change exists to delete.

### The registry description is the three type arrays already on the wire

`RegistryDescription` carries `actionTypes`, `assignmentStrategyTypes` and
`dataSourceTypes`. The engine derives it from its live registries with
`[...registry.keys()]`. The studio passes the response it already fetches,
`useRegistry`'s `RegistryInfo` — a six-field superset carrying the same three
type arrays plus three schema-description records. No shared type ties the
two declarations together; `RegistryInfo` satisfies `RegistryDescription`
structurally wherever the studio passes one where the other is expected.

This is why the change needs no endpoint. The payload matches the type already,
field for field.

Alternative: send the config schemas as JSON Schema and validate in the
browser. That needs three new pieces. It needs a Zod-to-JSON-Schema step, a
JSON Schema validator in the bundle, and a second definition of every config
rule. Rejected.

### Config validation stays on the server, and the rail says so

`checkActionRegistry` and its two siblings keep a second half that reads
`HandlerDef.configSchema`. That half runs only when a caller supplies the live
registry, which only the engine holds.

The rail reports that half as held back. The existing spec already establishes
that honest reporting for the registry group. This change narrows it from the
whole group to one half.

`ActionListEditor.tsx` renders its own per-action registry badge today. It
reads `!validation.registryChecked`, a whole-group flag. That flag stays
`true` while the group stays held back for the whole session. Once type
resolution runs, that flag stops existing: `ValidationResult` moves to the
per-dimension record instead.

The per-action badge narrows to the held-back config-validation half. It
shows for an action whose type resolved, since resolution is not the reason
it might still be wrong. It shows only when the studio cannot check that
action's config. An action whose type did not resolve gets its own registry
issue from the type-resolution half instead. That issue shows the way every
other located issue does.

### The type-resolution half shares one implementation across all three registry checks

Splitting `checkActionRegistry`, `checkAssignmentRegistry` and
`checkDataSourceRegistry` "the same way" means the same shared shape their
combined form already has, not three independently-written type-resolution
loops. `registry-config-check-consolidation`'s existing "Resolve-and-
validate-config loop shares one implementation" requirement exists
specifically to close that kind of duplication. A naive three-loop split
would reopen it.

Two new shared functions live in `src/engine/registry-check.ts`, beside
`checkTypedConfig`:

```ts
resolveType(sites: TypedSite[], typeNames: readonly string[], entityLabel: string): RegistryIssue[]
checkConfigOnly(sites: TypedSite[], resolveFn: (type: string) => { configSchema?: z.ZodTypeAny } | undefined): RegistryIssue[]
```

`checkConfigOnly` takes no `entityLabel`. Nothing it emits needs one.
`mapConfigIssues(loc, type, zodIssues)` is the function it calls to build a
`RegistryIssue` from a failed `configSchema` parse. That function takes a
`loc` and a `type`, never a label.

A "not registered" message is the one place a label would matter. That
message is `resolveType`'s output, not `checkConfigOnly`'s. This function
skips an unresolved site instead of naming it.

Each dimension's standalone type-resolution half calls `resolveType`. That
half is the one `validateReferences` runs against a `RegistryDescription`.
The call passes that dimension's sites, `RegistryDescription`'s matching
type-name array, and the dimension's own entity label.

`checkConfigOnly` is the sibling that answers the other half.
`registry-config-check-consolidation`'s config-validation-only arrays
(`actionConfigIssues`, `assignmentConfigIssues`, `dataSourceConfigIssues`)
need a way to check `config` alone, with no duplicate not-registered issue
of their own.

<!-- antislop: allow sentence-length -->
<!-- Known linter miscount: sentence splitting merges across this passage's adjacent `code span` references. Each sentence reads under 20 words split at its own period. -->
`checkConfigOnly` resolves each site's `type` through `resolveFn`. That is
the same single-type resolver closure `checkTypedConfig` already takes,
bound to a live registry. For a site whose type resolves to a definition
with a `configSchema`, `checkConfigOnly` safe-parses `config` against it.
It skips a site whose type does not resolve, and emits no issue for that
site. `resolveType` already reports that site under the type-resolution
array.

`validateReferences` calls `checkConfigOnly` directly when the caller
supplies a live registry set, once per dimension. That call populates
`actionConfigIssues`, `assignmentConfigIssues` and
`dataSourceConfigIssues`. It needs no separate `resolveType` call to build
those arrays. `checkConfigOnly` takes the live registry's resolver
directly.

That half needs a way to build "that dimension's sites" from a compiled
body alone. It has no live registry to call `resolveFn` against. Actions,
assignment strategies and data sources each get their own exported
collector in `src/engine/registry-check.ts`, beside `resolveType`.
Those collectors are `collectTypedActionSites(body)`,
`collectAssignmentSites(body)` and `collectDataSourceSites(body)`, each
returning `TypedSite[]`. `collectTypedActionSites` deliberately does not
share its name with `src/schema/compile.ts`'s own unexported function of
that name. That function is `collectActionSites(body: any): ActionSite[]`,
used by `checkReservedActionPrefix`. It lives in a different file and
returns a different shape.

`collectTypedActionSites` is `collect(body)`'s existing `Site[]` mapped to
`TypedSite[]`, the same map `checkActionRegistry` inlines today.
`collectAssignmentSites` and `collectDataSourceSites` are the
`body.workflow.steps`/`body.dataSources` walks `checkAssignmentRegistry` and
`checkDataSourceRegistry` inline today. The collectors pull those walks out
unchanged. Tasks 1.4-1.6 refactor those three functions to call the
matching collector instead of inlining the walk.

`validateReferences` (task 2.3) then calls
`resolveType(collectTypedActionSites(body), registryDescription.actionTypes,
"action")`, and the matching call for the other two dimensions, directly.
This half needs no live registry.

`checkTypedConfig` is not exported. It has exactly three in-file callers:
`checkActionRegistry`, `checkAssignmentRegistry` and
`checkDataSourceRegistry`. Its current signature takes three parameters:

```ts
(sites: TypedSite[], resolveFn: (type: string) => { configSchema?: z.ZodTypeAny } | undefined, entityLabel: string)
```

`resolveFn` there is a single-type resolver closure. `resolveType` needs
`typeNames: readonly string[]`, an enumerable list instead.
`checkTypedConfig` cannot build that list from `resolveFn` alone. So it gains
one parameter and composes `resolveType` and `checkConfigOnly` from its own
body instead of reimplementing either half inline:

```ts
checkTypedConfig(sites: TypedSite[], typeNames: readonly string[], resolveFn: (type: string) => { configSchema?: z.ZodTypeAny } | undefined, entityLabel: string): RegistryIssue[]
```

<!-- antislop: allow sentence-length run-ons -->
<!-- Known linter miscount: sentence splitting merges across this passage's adjacent `code span` references, each one a dense function-call signature. Each sentence reads under 20 words split at its own period, and none is a comma splice. -->
Its body stops inlining its own "not registered" check and its own
config-parse loop. It calls `resolveType(sites, typeNames, entityLabel)` for
the first half. Then it calls `checkConfigOnly(sites, resolveFn)` for the
second half, and concatenates the two arrays in that
order. `checkConfigOnly` already skips a site `resolveType` rejected, so the
concatenation needs no separate filtering step. The `RegistryIssue[]`
`checkTypedConfig` emits stays the same for all three dimensions,
not-registered issues first, then config issues, matching pre-consolidation
behavior.

The two-pass split changes emitted issue order for a body that mixes an
unregistered-type site with a config-invalid site. All not-registered issues
now precede any config issue, rather than interleaving by site position.
The content stays the same. The order does not, and no caller depends on
it.

This signature growth carries no external blast radius. `checkTypedConfig` is
an internal helper. Nothing outside this file imports it or calls it. Its
three callers all change in this same commit (tasks 1.4-1.6).

Each derives `typeNames` from its own live registry by calling
`describeTypeNames(registry)` (task 1.2). That is the same helper
`RegistryDescription` itself calls to build its three type arrays. None of
the three re-inlines `[...registry.keys()]`. `checkActionRegistry`,
`checkAssignmentRegistry` and `checkDataSourceRegistry` are being rewritten
in this same change (tasks 1.4-1.6). No existing call site needs to stay
undisturbed the way `handleGetRegistry`'s does. Each then passes
`typeNames` alongside the existing `resolveFn`.

`handleGetRegistry` (`src/http/studio-routes.ts:274-276`) keeps its own
inline `[...registry.keys()]` idiom for its own three arrays,
deliberately. It builds a route-response shape, not a `RegistryDescription`.
This change does not touch that route otherwise. Switching its three call
sites to `describeTypeNames` would add a dependency on this change's new
helper. This change gives that route no reason to take on that dependency.
Nothing in this change routes `handleGetRegistry` through
`describeTypeNames`.

`checkActionRegistry`,
`checkAssignmentRegistry` and `checkDataSourceRegistry` keep exactly the
public signatures `registry-config-check-consolidation`'s delta spec pins:
`(body, registry)`, `(body, assignmentRegistry)`, `(body,
dataSourceRegistry)`. Only the unexported helper beneath them grows a
parameter.

Every existing `registry-config-check-consolidation` scenario still holds.
The body change is why this change carries a delta spec against that
capability (`specs/registry-config-check-consolidation/spec.md`). That delta
names `resolveType` in the requirement text. The requirement then states the
shape that now exists. It stops describing `checkTypedConfig` as one loop
with no shared piece beneath it.

Alternative: three separately-written type-resolution loops, one per
registry kind. Rejected. That is exactly the duplication
`registry-config-check-consolidation` exists to prevent.

### Process chaining and cross-process checks split into a resolution half and a comparison half

<!-- antislop: allow sentence-length -->
<!-- Known linter miscount: sentence splitting merges across this passage's adjacent `code span` references. Each sentence reads under 20 words, split at its own period. -->
`validateProcessChaining` and `validateCrossProcess` live in
`src/engine/definitions.ts`. Both are today async and DB-resolving.
`validateProcessChaining` throws a single `CrossProcessValidationError` on
the first failing site. `validateCrossProcess` also throws
`CrossProcessValidationError` immediately, but only for its resolvability,
contract and `inputMapping` preconditions. It separately collects
`checkSubprocessChildRefs`'s issues across every step. It throws
`CelValidationError` once, after the loop, carrying all of them.

Neither shape fits a synchronous, dual-caller `validateReferences`. The
browser cannot make an async, DB-resolving call at all. The
studio-checks-rail delta also requires one located issue per site, not one
thrown message for the whole body.

So `publishBody` never routes its own cross-process or chaining verdict
through `validateReferences`. It keeps calling `validateCrossProcess` and
`validateProcessChaining` directly, by name, in their existing order, exactly
as `publishBody`'s own body does today.

The "One module owns the publish validation sequence" requirement in
`publish-validation-consolidation` names this pair as the deliberate
exception. It scopes the module's ownership to the stages it runs for every
caller. Those stages are the three registry checks and the single-body CEL
check.

`checkSubprocessChildRefs` and `checkProcessChainingTarget` stay the shared
comparison logic both paths reduce to. The studio reaches them through
`validateReferences`. The engine reaches them through the two
`definitions.ts` functions instead. Both reach the same issues for the same
resolved bodies. Only the call path differs, for these two DB-resolving
stages alone.

`validateCrossProcess` already carries a comparison half that fits.
`checkSubprocessChildRefs` (`src/cel/check.ts`) is already synchronous. It
already takes a body, a step index and an already-resolved child body. It
already returns a `CelIssue[]` instead of throwing. The studio already calls
it directly today, once per loaded subprocess child, independent of
`validateCrossProcess`.

`validateCrossProcess`'s own resolution preconditions stay exactly as they
are. Those are an unresolvable child, a child with no `contract`, or a
mapping key outside `contract.inputFields`. Each stays an async, DB-backed,
throw-immediately step inside `publishBody`, run after `validateReferences`,
as `publishBody`'s own final stages. This matches `publishBody`'s real stage
order today. The three registry checks and the CEL check run first. Only a
body that clears all four reaches the cross-process and chaining checks.

`validateReferences`'s own "cross-process check" means
`checkSubprocessChildRefs` alone. It runs once per step the caller supplies a
loaded child body for. That is the same per-step loop `runValidation` already
runs by hand today. That loop just moves inside the shared module.

`validateProcessChaining` needs the same split. It lacks the comparison half
`checkSubprocessChildRefs` already gives cross-process.

A new function fills that gap, `checkProcessChainingTarget`. It lives in
`src/cel/check.ts`, beside `checkSubprocessChildRefs`. Its signature is
`checkProcessChainingTarget(body, targetsByLoc: Record<string, ProcessBody>):
CelIssue[]`. It walks every `process.start` action site, not every CEL
`Expression` site.

Despite that file and that return type, `checkProcessChainingTarget` parses
no CEL and type-checks no expression. It compares a mapped field's key
against the target's declared field set, a plain membership check.
`validateProcessChaining`'s own `fields.has(key)` logic today already runs
that same check (`src/engine/definitions.ts:194-200`).

This decision reuses `src/cel/check.ts` and `CelIssue[]` for shape parity
with `checkSubprocessChildRefs`, the sibling this function's callers pair it
with. It reuses them for rail-grouping parity too: the rail's existing "CEL"
group covers both, with no seventh group added. A reader should not infer
CEL evaluation from this function's location or return type.

<!-- antislop: allow sentence-length -->
<!-- Known linter miscount: sentence splitting merges across this passage's adjacent `code span` references, both within a sentence and across the period between two sentences. Each sentence below reads under 20 words, split at its own period. -->
`src/cel/check.ts`'s own local, unexported `collect()` walks `Expression`
sites. It has no notion of `action.type`, so it cannot find a `process.start`
action. `checkProcessChainingTarget` instead imports `collect` (aliased as
`collectFullActionSites`) from `../engine/registry-check.js` and uses its
return value structurally, the same way `definitions.ts`'s own
`validateProcessChaining` already does. The `Full`/`Typed` pairing keeps this
alias and `collectTypedActionSites` (task 1.11's own, differently-shaped
export from the same module) visually distinct at a glance, unlike two names
that differ only in one prefix word: `collectTypedActionSites` returns
`TypedSite[]` (`{loc, type, config}`, no `.action` field, for the
type-resolution half); `collectFullActionSites` returns `Site[]`, keeping
the full `.action`. The alias also avoids `collectActionSites`, the
unrelated, unexported function `src/schema/compile.ts` already has under
that exact name. Aliasing this import to either of those two names would
risk exactly the mistake this note exists to prevent: importing
`collectTypedActionSites` (`TypedSite[]`) here instead of `collect`
(`Site[]`) would drop `.action` entirely, which `checkProcessChainingTarget`
needs both to filter on `action.type` and to read the mapped fields off.
`checkProcessChainingTarget` does not need to name the `Site` type, which
would otherwise collide with `cel/check.ts`'s own local `Site` interface
(Expression sites, unrelated). It filters that result on
`s.action.type === PROCESS_START_ACTION_TYPE`, the same filter
`validateProcessChaining` already applies.

`checkProcessChainingTarget` needs a second import to apply that filter.
It imports `PROCESS_START_ACTION_TYPE` itself, from `../engine/registry.js`.
That import is separate from the `collect`/`collectFullActionSites` import
above. `definitions.ts` already imports both this way, as two separate
imports. It imports `PROCESS_START_ACTION_TYPE` from `./registry.js`
(`src/engine/definitions.ts:34-40`). It imports `collect` from
`./registry-check.js` (`src/engine/definitions.ts:31`).
`checkProcessChainingTarget` mirrors that same pair.

<!-- antislop: allow sentence-length -->
<!-- Known linter miscount: sentence splitting merges across this passage's adjacent `code span` references. Each sentence below reads under 20 words, split at its own period. -->
This adds three new, deliberate imports to `cel/check.ts`:
`collect`/`collectFullActionSites` from `engine/registry-check.ts`,
`PROCESS_START_ACTION_TYPE` from `engine/registry.ts`, and
`collectFieldsDeep` from `schema/definition.ts`. All three of
`registry-check.ts`, `registry.ts` and `schema/definition.ts` stay free of
any CEL dependency in the reverse direction: none of them imports from
`cel/check.ts`. The boundary comment at the top of `cel/check.ts` is what
changes to name all three exceptions, not the ones at the top of
`registry-check.ts`, `registry.ts` or `schema/definition.ts`.

<!-- antislop: allow sentence-length -->
<!-- Known linter miscount: sentence splitting merges across this passage's adjacent `code span` references. Each sentence reads under 20 words split at its own period. -->
`checkProcessChainingTarget` looks up each site's target by the site's own
`loc` in `targetsByLoc`. It builds that target's accepted field-id set via
`collectFieldsDeep(targetsByLoc[loc].fields)`, group-container ids
included. That is the same call `validateProcessChaining`'s own
`fields.has(key)` logic already makes (`src/engine/definitions.ts:194`).
It is also the field set `cross-process-validation`'s "A process.start
action's inputMapping targets lie within the target process's field
catalog" requirement names: "the process's full field catalog, not a
`ProcessContract.inputFields` list."

This file's own `leafFields` (`src/schema/definition.ts:349`) is already
imported here, for `dataSchema`/`contractFieldSchema`. It filters every
group container out. Using it for this comparison instead would silently
reject a mapping into a group-container field id. The engine accepts that
mapping today. `checkProcessChainingTarget` pushes one located issue per
mapped field the target does not declare. That issue's `src` carries the
mapped field's key. This matches `checkSubprocessChildRefs`'s own issue
shape, though the studio's rendering never reads `src` here.

The function skips a site with no entry in `targetsByLoc`. The caller
reports that site as not-checked, the same way an unloaded subprocess child
already reads.

`validateProcessChaining` resolves every site's target via `resolveLatest`.
It throws immediately on an unpublished target, exactly as it does today. It
then builds `targetsByLoc` from what resolved and delegates to
`checkProcessChainingTarget`.

Today's function throws `CrossProcessValidationError` immediately at the
first failing site, in an interleaved resolve-then-check walk. The
redesigned function resolves every site first. It then runs
`checkProcessChainingTarget` over all of them at once, collecting issues
from every site rather than stopping at the first. That collection step is
new. Only the final throw's class and message-building rule stay
pre-existing behavior.

<!-- antislop: allow sentence-length paragraph-length -->
<!-- Known linter miscount: sentence splitting merges across this passage's adjacent `code span` references, both within a sentence and across the period between two sentences. Each sentence below reads under 20 words, split at its own period; the paragraph reads as nine sentences, not the merged count the linter reports. -->
`src/http/errors.ts` maps `CrossProcessValidationError` to HTTP type
`cross-process-validation`. That stays the thrown class here. When
`checkProcessChainingTarget` returns issues, `validateProcessChaining`
builds its thrown message from only the first collected issue. It names
that issue's `loc` and `message`, taking the first in `collect()` order.
That matches today's single-violation reporting. Today's interleaved walk
would also have hit sites in that same `collect()` order.
`validateProcessChaining` discards the rest of
`checkProcessChainingTarget`'s collected issues at this call site.
`publishBody` only needs one message to throw. It then throws
`CrossProcessValidationError` with that message, not `CelValidationError`.

`checkProcessChainingTarget` itself still returns a `CelIssue[]`. The
studio-checks-rail delta needs one located issue per site. Only
`validateProcessChaining`'s own throw stays the existing class. This keeps
the class `cross-process-validation`'s existing requirement already pins for
this scenario. That requirement is "A process.start action's inputMapping
targets lie within the target process's field catalog."

It also keeps this change's own "The engine's publish verdict does not
change" promise true. That promise covers the accept/reject verdict and the
thrown class. A body that rejects today rejects as
`CrossProcessValidationError` again, at every site that alone triggers a
reject today.

One case changes which message that throw carries, not whether it throws.
Today's interleaved walk resolves then checks one site before moving to the
next. A body with an early-site mapping violation and a later-site
unresolvable target throws the early site's mapping error there. It never
reaches the later site's resolution.

The redesigned resolve-all-first pass reaches the later site's resolution
failure while resolving. That happens before it ever runs
`checkProcessChainingTarget` on the earlier site's mapping. So it throws
that resolution failure instead.

Both throws are `CrossProcessValidationError`. The HTTP error type and the
accept/reject verdict stay the same. Only the message differs. That happens
only for a body carrying simultaneous violations of different kinds,
resolution and mapping, at different `process.start` sites.

No existing test or spec scenario covers that shape. This is an accepted
edge case, not a silent behavior change. Task 6.13 asserts the throw still
happens. It also records which message the new ordering surfaces.

### loadedChainingTargets and chainingSiteStatus key by the action's own id, not by site loc

<!-- antislop: allow sentence-length -->
<!-- Known linter miscount: the sentence splitter needs a capital letter or
     quote mark after a period to detect a new sentence. A sentence ending
     right before a lowercase-starting code span (like `` `loadedChildren` ``)
     does not split, so the word count merges two sentences into one. Each
     sentence in this block reads under 20 words, split at its own period. -->
`loadedChainingTargets` and `chainingSiteStatus` are the studio's own two
across-render records for a chaining site. Both key their entries by the
triggering `process.start` action's own `id`. That id is `Action.id`, the
`actionId`-branded string every action already carries
(`src/schema/definition.ts:407-408`). Neither record keys by step id.
Neither keys by site `loc`.

A step-id key would collide. A step's schema places no limit on the number
of `process.start` actions it carries. One step can hold several, across
`onEntry`, `onExit`, `onCancel`, paths and timers, even targeting different
processes. A step can also hold a `subprocess` field alongside one or more
`process.start` actions, in its own action positions.

The step-level `loadedChildren` record correctly uses a step-id key. Its
target, `subprocess`, is a single step-level field. A chaining site is not
that shape.

A `loc` key fares no better, for a different reason. `loc` is `collect()`'s
own positional string, for example `steps[3].onEntry[1]`. An edit that
changes array indices ahead of it, in the same action array, shifts that
string. Deleting a preceding action does this. So does reordering two
`process.start` actions in the same list.

`resolveLoc`
(`packages/web/src/areas/studio/draft/issues.ts:54-64`) already documents
why a record meant to survive an edit must resolve to the deepest entity
found. That entity is an id. It is never an array position, since an array
edit can invalidate a position.

`loadedChainingTargets` and `chainingSiteStatus` are exactly that kind of
record. Both persist, across renders, in
`DraftContextValue`/`ValidationResult`. `loadedChainingTargets` also gets
populated only by an async fetch (task 4.2). It can still hold a stale entry
for at least one render pass after such an edit. That is a full
`listProcesses`+`getVersionBody` round trip, not one frame.

A `loc` key would then let a stale entry read as the swapped-in action's own
resolved target. `chainingSiteStatus` would report that action "checked".
`loadedChainingTargets` would still hold the other action's body at that
same key. `checkProcessChainingTarget` would then validate the wrong action
against the wrong target's field catalog.

That is a wrong verdict, not merely a stale one. It contradicts
studio-checks-rail's own rule for a chaining site with no loaded target: such
a site must read as not checked. A stale hit is neither "no loaded target"
nor a genuine check. A `loc` key would still read it as the latter.

`subprocessStepStatus`, the sibling field already on `ValidationResult`,
already keys by the entity's own id (`validation.ts:27`, "keyed by its
entity id"). An id key keeps `chainingSiteStatus` consistent with it. A
`loc` key would not.

The studio loads chaining targets into a new, separate record:
`loadedChainingTargets: Record<ActionId, ProcessBody>`, in
`DraftContextValue` (`draft/store.tsx`). It keys that record by the
triggering action's own `id`.

That id comes from `collect()`'s own `Site.action.id`. `collect()`
(`src/engine/registry-check.ts`) already produces `loc` in the same walk.
Task 4.9 runs that same walk.

`checkProcessChainingTarget` (`src/cel/check.ts`, task 1.9) still wants a
`loc`-keyed `targetsByLoc`. That keeps message-building parity with
`collect()`'s own `loc` convention. `runValidation` builds that `loc`-keyed
map from the id-keyed `loadedChainingTargets`, at call time. It reuses the
same `collect()` walk that already populates `chainingSiteStatus`.

Alternative: a seventh `chaining` group. That adds a rail group for one check
whose held-back model already exists next door. Rejected.

Alternative: key chaining targets by step id, reusing `loadedChildren`
directly. That silently drops or misreports a second `process.start` action
on the same step, a schema-legal case. Rejected.

Alternative: key chaining targets by site `loc`. `loc` is positional. An
edit can reorder or remove a preceding action in the same array. A stale
render can then read one action's fetched target under another action's
now-shifted `loc`. That produces a wrong chaining verdict, not an honest
not-checked state. Rejected, per the reasoning above.

`loadedChainingTargets` has no manual-upload counterpart to share plumbing
with. `StepsPanel.tsx`'s file-upload control populates `loadedChildren`
(`draft/store.tsx`'s `setChildForStep`) exclusively: an author picks a JSON
file, and `parseChildProcessJson` parses its already-read text. No fetch
code exists anywhere on that path today. There is no "fetch-by-id plumbing"
for a chaining loader to share.

<!-- antislop: allow sentence-length run-ons -->
<!-- Known linter miscount: sentence splitting merges across this passage's adjacent `code span` references, both within a sentence and across the period between two sentences. Each sentence below reads under 20 words, split at its own period; none is a comma splice. -->
`DraftProvider` instead fetches every chaining target over the network.
It does that automatically, the same way it already fetches the registry
description in task 4.0. For each `process.start` action's target
`processId`, it calls `listProcesses(token)`
(`packages/web/src/areas/studio/api/client.ts`) once. It reads that
target's `version` field off the matching `ProcessSummary`.

That field's own docstring names it the newest published version. It then
calls `getVersionBody(processId, version, token)`, the same pairing
`TemplatesScreen.tsx` already uses to resolve a process's latest published
body. The result populates `loadedChainingTargets[action.id]`.

An unpublished or deleted process has no matching entry in `listProcesses`'
response. That target then gets no entry in `loadedChainingTargets` either.
Its site reads not-checked, the same as a target the fetch has not yet
returned for. Nothing here throws on a missing or slow target. The
not-checked state already covers both.

<!-- antislop: allow sentence-length -->
<!-- Known linter miscount: a sentence ending right before a lowercase-starting
     code span (like `` `collect()` ``) does not split, so the word count
     merges two sentences into one. Each sentence in this block reads under
     20 words, split at its own period. -->
Finding every `process.start` action site to drive this fetch is a second
walk, distinct from task 4.9's. Task 4.9 walks the Zod-parsed/compiled body
inside `runValidation`, so it reuses `collect()`
(`src/engine/registry-check.ts`) safely. This fetch effect instead runs
against the raw `draft: Draft`. It runs before `validateStructure` has
confirmed the draft is even Zod-valid.

The whole point is to start resolving a target as soon as an author adds a
`process.start` site. It must not wait until the draft next happens to
compile. `collect()` declares a `(body: ProcessBody)` parameter, and its
body calls `body.workflow.steps.forEach(...)` with no optional chaining.
Passing it a `Draft` throws a `TypeError` the moment `workflow` is absent.

That shape is not a rare edge case. `processListLogic.ts::seededDraftInput`'s
no-`seedVersion` branch, the `+ New process` case, seeds a brand-new draft as
`{ body: { baseLocale: "en" }, layout: {}, revision: 0 }`. That body carries
no `workflow` key at all. `EditScreen.tsx` passes it straight into
`<DraftProvider initial={...}>`. So this effect runs against a
`workflow`-less draft on every "Start a new process" load.

That is the single most common way a developer opens the studio. Task 4.2
therefore writes this enumeration as its own local, fully optional-chained
walk. It follows the same tolerant style `resolveLoc` (`draft/issues.ts`)
already uses for a raw Draft. It never reaches for `collect()`, and never
for an unsafe `draft as unknown as ProcessBody` cast into it.

### Chaining targets auto-fetch; subprocess children stay a manual upload

This change gives `loadedChainingTargets` a network fetch. It leaves
`loadedChildren` on its existing manual upload. The rail then treats two
sibling not-checked states differently for the author. A subprocess child
waits on a file the author must find and pick. A chaining target resolves
itself the moment the draft loads, with no author action at all.

<!-- antislop: allow sentence-length -->
<!-- Known linter miscount: sentence splitting merges across this passage's adjacent `code span` references. Each sentence below reads under 20 words, split at its own period. -->
This change accepts that asymmetry rather than closing it.
`checkSubprocessChildRefs`'s manual upload predates this change and stays
out of its scope. Rewriting it to an auto-fetch is its own piece of work.

`StepsPanel.tsx` names no reason for the manual upload beyond "the only
route to a loaded child body in the whole studio." That rewrite would need
its own migration reasoning first. Task 5.0 covers only the new behavior
this change introduces. That behavior is the chaining loader's own loading
and error-adjacent states, alongside the registry group's existing
held-back indicator.

Alternative: hold `loadedChainingTargets` to the same manual upload, for
symmetry with `loadedChildren`. Rejected. A `process.start` action's target
is a plain process reference with no contract and no callback shape.
Nothing about it needs an author to hand-pick a file the way a subprocess
binding's richer selection might.

The fetch this change adds costs one request pair per distinct target
`processId` referenced anywhere in the draft. It never costs one pair per
site. `listProcesses` runs once per load. Task 4.2a's shared
`chainingFetchState` ref dedupes `getVersionBody` across every site that
targets the same `processId`.

<!-- antislop: allow sentence-length synonym-rotation -->
<!-- Known linter miscount: sentence splitting merges across this passage's
     adjacent `code span` references. Each sentence below reads under 20
     words, split at its own period. "edit"/"editing" here names a draft
     mutation at one site; "change" elsewhere in this document names the
     OpenSpec change itself. Different concepts, not synonyms for one. -->
"Once per load" holds only when the effect skips a fetch for an edit at an
unrelated site, and only when two sites that share a target `processId`
also share one fetch rather than each issuing its own. `draft/store.tsx`'s
reducer deep-clones the whole draft on every dispatch (`structuredClone`,
`draft/store.tsx:49`). So `draft`'s object identity changes on every
keystroke anywhere in the document, not only at a `process.start` site.
Task 4.2's `(actionId, processId)` fetch trigger decides when a given site
should re-evaluate its own target. On its own it does nothing to stop two
different sites, or the same site across a re-render, from each re-issuing
an already-satisfied fetch for the same `processId`. That happens on every
one of those unrelated re-renders, and, absent a shared cache, on every
site that independently targets a `processId` some other site has already
resolved.

`DraftProvider` guards against both with a `processId`-keyed ref,
`chainingFetchState: Map<string, "pending" | "done">`. It sits outside React
state, so updating it triggers no render. Before it issues
`listProcesses`/`getVersionBody` for a target, a site's effect checks this
ref first. It skips a `processId` already marked `"pending"` or `"done"` by
any site, and instead reads that `processId`'s already-resolved body
straight into its own `loadedChainingTargets[action.id]` entry. Two sites that
target the same `processId` — the same site across an edit, or two
different sites anywhere in the draft — therefore share one request pair,
never two.

That holds even on a render its own dependency array still re-runs it for.
Editing an existing site's `processId` moves that site onto the shared-ref
rule for its new target: fresh if no other site in the draft has resolved
that `processId` yet, reused if one already has. The ref never serves a
resolved body for the pre-edit target at that site's own action `id`.

This is what keeps "one request pair per distinct target `processId`" true
across a large draft's ordinary editing, and across a draft where more than
one site targets the same process. It holds across the whole draft, not
only across one site's own lifecycle.

### The unknown-key check stays held back in the studio

`checkUnknownKeys` needs the raw authored body. The studio validates
`authoredProcessBody.safeParse(draft).data`, which the parse has already
stripped.

Running the check against the raw draft ahead of the Zod gate looks close. The
walk follows the contract's declared shape, so a half-built draft can break it.
That is the hazard the Zod gate exists to prevent. This change keeps the check
server-side and reports it held back.

`CheckGroup` carries that held-back state as `unknownKeysHeldBack?: boolean`,
set on the structural group and always `true` in the studio. "CheckGroup
gains a second, independent held-back field per group" below names the
shared shape. This field and the registry group's `registryConfigHeldBack`
both use it.

A later change may reach it by giving the check a tolerant walk. That is its
own piece of work with its own risk, and it does not block this one.

### ValidationResult reports per dimension

`ValidationResult` replaces `registryChecked`, `structurallyValid` and
`structuralChecked` with one record keyed by dimension. Each entry reads `ran`
or `not-run`.

`checksRail.ts` loses two exclusion filters. `allChecksClear` and
`totalOpenIssueCount` stop naming `"registry"` as a special case, because the
registry group now reaches a clear state.

### chainingSiteStatus mirrors subprocessStepStatus, keyed by the action's own id

<!-- antislop: allow sentence-length -->
<!-- Known linter miscount: sentence splitting merges across this passage's adjacent `code span` references. Each sentence below reads under 20 words, split at its own period. -->
A chaining site with no loaded target must read as not checked, per site,
never as passing. `ValidationResult` already carries the analogous state for
subprocess children: `subprocessStepStatus: Record<string, "checked" |
"not-checked">`, keyed by step id. A visible fieldset in `StepsPanel.tsx`
consumes it.

Nothing analogous exists for a `process.start` action site. Without one, an
implementer can satisfy "never as passing" by omitting an issue alone. The
CEL group's held-back rendering does not depend on per-site data. So that
alone gives the author no visible sign a given action's target was never
checked.

`ValidationResult` gains `chainingSiteStatus: Record<ActionId, "checked" |
"not-checked">`. `runValidation` populates it the same way it populates
`subprocessStepStatus`. It walks every `process.start` action site, using
the `collect()`/`PROCESS_START_ACTION_TYPE` filter
`src/engine/definitions.ts` already uses for `validateProcessChaining`. It
keys each entry by the site's own action `id` (`site.action.id`), matching
`loadedChainingTargets`'s own key. It reads
`loadedChainingTargets[site.action.id]`.

"loadedChainingTargets and chainingSiteStatus key by the action's own id,
not by site loc" above states this reasoning in full. The short form: `loc`
is positional. A reordered or removed preceding action shifts it, in the
same array. A stale render can then read one action's fetched target under
another action's now-shifted `loc`.

`ActionListEditor.tsx` renders a `NotCheckedBadge`, the same component it
already imports for the registry badge (`ActionListEditor.tsx:111`). It
places that badge beside a `process.start` action whose own `id` is absent
from `chainingSiteStatus` or reads `"not-checked"`.

`ActionListEditor.tsx` already holds `action.id` in scope. It already
passes it to the sibling `IssueList` as `entityId={action.id}`
(`ActionListEditor.tsx:112`). So this keying needs no new prop threaded
through `StepsPanel.tsx`, `PathsPanel.tsx` or `TimersPanel.tsx`. That gives
the chaining not-loaded case the same visible, per-site signal
`StepsPanel.tsx`'s fieldset already gives the subprocess case.

Alternative: infer not-checked from the absence of an issue at that `loc`,
with no dedicated field. Rejected. That reads the same as a genuinely clear
site with no visible marker either way. That is the exact silent gap this
decision exists to close.

The `studio-checks-rail` delta's own scenario wording names the CEL
group's negative behavior only. It emits no issue for that site. It never
presents a clear pass. `checkProcessChainingTarget` skips an unloaded site
with no positive signal of its own. That wording does not mean `ChecksRail.tsx` or
`draft/checksRail.ts` renders a not-checked entry inside the CEL group. The
one visible, per-site indicator is `ActionListEditor.tsx`'s `NotCheckedBadge`
above, mirroring `StepsPanel.tsx`'s subprocess fieldset. Tasks 4.9 and 5.5
cover the whole of that indicator; no task changes `ChecksRail.tsx` or
`draft/checksRail.ts` to read `chainingSiteStatus`.

### CheckGroup gains a second, independent held-back field per group

`studio-checks-rail`'s delta requires two groups to each hold two states at
once. The registry group reads clear, or issue-carrying, on its
type-resolution half. It reads held back on its config-validation half.

The structural group reads clear, or issue-carrying, on its six other checks.
It reads held back on its unknown-key check, per "The unknown-key check stays
held back in the studio" above. Today's `CheckGroup` shape, `{source, issues,
heldBack: boolean}`, carries one boolean for the whole group. It has no room
for either split.

`CheckGroup` gains two fields, one per group: `registryConfigHeldBack?:
boolean` on the registry group, `unknownKeysHeldBack?: boolean` on the
structural group. Both follow the same shape. `heldBack` keeps its existing
meaning on both groups. The whole group has not run, for want of a compiled
body. The new field reads independently of `heldBack`.

<!-- antislop: allow sentence-length -->
<!-- Known linter miscount: sentence splitting merges across this passage's adjacent `code span` references. Each sentence below reads under 20 words, split at its own period. -->
`registryConfigHeldBack` is `true` whenever the studio holds no live
registry, no matter what `heldBack` reads. `unknownKeysHeldBack` is `true`
unconditionally in the studio, for the same reason, no matter what
`heldBack` reads.

The rail's rendering and `totalOpenIssueCount`'s collapsed-summary logic read
each group's pair of fields separately. A `heldBack` group renders as not-run
in full. A group clear on `heldBack` but `true` on its own second field
renders its other checks' issues, or its clear state. It also renders one
held-back indicator for the held-back half alone.

## Risks / Trade-offs

A clear rail today may show registry issues after this change. → Those issues
are real publish blockers. The draft already carries them. The author learns at
authoring time instead of at publish time. That is the change's purpose.

A later contributor could add a stage to the wrong phase. → The compiled-body
token blocks that direction. A reference check cannot run before the structure
check. A test asserts both callers receive identical issues for one body.

`GET /registry` sits behind `requireAuthoring`. → The studio's draft screens sit
behind the same authoring roles. No account gains a reach it lacks today.
`src/http/studio-routes.ts`'s own file-level docstring already states
`requireAuthoring` covers "the four draft routes, the publish route ... and
GET /registry". That is the identical gate function at every one of those
call sites. Reading `requireAuthoring`'s single implementation confirms
this. No further check is open.

Loading chaining target bodies adds fetches to a draft load. → A process with no
`process.start` action loads nothing new. Otherwise `DraftProvider` issues
one `listProcesses` call plus one `getVersionBody` call per distinct target
`processId` referenced anywhere in the draft. That count never grows with
the site count.

Two or more `process.start` sites that target the same `processId` still
share one fetch. Task 4.2a's `processId`-keyed `chainingFetchState` ref
covers every referencing site, not one site alone. That is genuinely new
network traffic, not a shared path with `loadedChildren`'s manual upload.
See "Chaining targets auto-fetch; subprocess children stay a manual
upload" above.

The studio's issue count rises for existing drafts. That may read as a
regression. → Say so in the change's verification notes. Check one seeded
example in a browser before archiving.

<!-- antislop: allow sentence-length -->
<!-- Known linter miscount: sentence splitting merges across this passage's adjacent `code span` references. Each sentence reads under 20 words, split at its own period. -->
`DraftProvider`'s new `useRegistry` call (task 4.0) becomes a fourth call
site for `GET /registry`. → No cache covers that call site, the same as
the other three. `useRegistry` composes `useFetchOnce`. That hook fetches
once per mount, not once across the whole component tree.

<!-- antislop: allow synonym-rotation -->
<!-- "edit screen" here is the fixed UI-glossary term for `EditScreen.tsx` (ui-glossary.md), not a synonym for "change" — the OpenSpec change this document describes. The two words name different concepts. -->
`DataSourcesPanel.tsx` already calls `useRegistry` (line ~84).
`StepsPanel.tsx` already calls it too (line ~90). Both are pre-existing,
separate consumers. `ToolsScreen.tsx` calls `getRegistry` directly (line
~38). `DraftProvider` mounts as an ancestor of both `DataSourcesPanel` and
`StepsPanel` in the edit screen. So its own fetch is a redundant fourth
request, not a shared one.

This change accepts that redundancy as a known, documented cost. It does
not widen its own scope to refactor `DataSourcesPanel`/`StepsPanel` onto
the new `DraftContextValue` registry state. A future cleanup change can
consolidate the four call sites.

`technical-field-marker` has already landed. `checkUnwrittenTechnicalFields`
already exists (`packages/web/src/areas/studio/draft/view-flags.ts`) and is
already wired into `runValidation`, pushed beside `checkViewFlags`
(`validation.ts:112-113`). This change rewrites that same function
wholesale.

Tasks 4.3-4.4 do it. Task 4.3 reads "Rewrite runValidation as two module
calls plus an EditorIssue mapping." Task 4.4 must therefore call out
`checkUnwrittenTechnicalFields` by name alongside `checkViewFlags`, or the
rewrite silently drops an already-shipped, currently-visible checks-rail
finding. See "Two exported phases" above for the call-site rule both checks
follow.

## Migration Plan

No data migration. No definition contract change. No stored body changes shape.

Deploy in one piece. The engine's verdict is identical before and after. An
older browser bundle against a newer engine keeps working. The reverse keeps
working too.

Rollback is a revert. Nothing persists that a reverted build cannot read.

## Open Questions

Whether `checkUnknownKeys` should eventually gain a tolerant walk so the
studio can run it before the Zod gate. That walk would close the one
dimension this change still leaves held back for the studio's whole session.
"The unknown-key check stays held back in the studio" above defers this on
purpose. The tolerant walk is its own piece of work with its own risk. No
follow-up change exists yet to track it.
