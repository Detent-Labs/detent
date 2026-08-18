## Context

`checkUnknownKeys` (`src/schema/compile.ts:412-429`) walks an authored
`ProcessBody`. It reports every key not declared by the corresponding Zod
schema, at any depth. It is one of seven structural checks
`compileProcessBody` runs via `structuralIssues`
(`src/schema/compile.ts:750-760`), called from `publishBody`
(`src/engine/definitions.ts:231`).

Three placement facts drive this design. Reading the code confirmed each
one. None of them is a guess.

1. `structuralIssues` runs `checkUnknownKeys` and `checkReservedActionPrefix`
   on the body before any Zod parse of it. The function's own comment says
   the `body: ProcessBody` parameter type "is a lie at this exact call
   site". The type becomes honest only after
   `publishedProcessBody.safeParse`/`authoredProcessBody.parse` succeed,
   later in `compileProcessBody`. `checkUnknownKeys` today receives a
   duck-typed `unknown`, not a `ProcessBody`.
2. This ordering is deliberate, not incidental
   (`.claude/rules/authoring-invariants.md`). Running ahead of the
   `publishedProcessBody`-valid early return makes the check unbypassable.
   A hand-written body that only satisfies the loose published-body schema
   still hits it.
3. `checkUnknownKeys` already derives its known-key sets from the live
   schema, via `shapeKeys`/`unwrapSchema`. It is not a fully independent
   hand-transcription.

The current implementation is 19 named constants (`PROCESS_BODY_KEYS`,
`STEP_KEYS`, and 17 more), each computed by calling `shapeKeys(someSchema)`.
It also carries 9 `walkFooKeys` functions (`walkExpressionKeys`,
`walkActionKeys`, `walkActionsKeys`, `walkFieldDefKeys`, `walkViewKeys`,
`walkSubprocessSpecKeys`, `walkTimerKeys`, `walkPathKeys`, `walkStepKeys`).
Each hand-wires which constant applies at which nesting position. Each also
hand-wires how to recurse into it: arrays, `z.record` value positions,
`z.union` branches. The audit's complaint accurately targets the second
half, the recursion structure. It does not target `shapeKeys` itself, which
already reads `.shape` off the schema at call time.

A tenth function matching `^function walk` exists in the same file,
`walkFieldsIndexed` (`compile.ts:263`). It is not one of the 9 above. It
carries no `*_KEYS` constant of its own. Four checks unrelated to
unknown-key detection reuse it as a generic field-tree traversal helper:
`checkPatterns`, `checkColumnMapping`, `checkFieldKeyFormat`,
`checkLengthBounds`. It stays untouched by this change.

`test/compile-validation.test.ts` pins the exact `{ loc, value, message }`
shape. A misspelled `guard` produces
`loc === "workflow.steps[0].paths[0].gaurd"` and `value === "gaurd"`. The
same test file pins a walk that reaches every nesting level:

- body, field, fieldValidation
- workflow, step, path, expression
- action, timer, timerAction
- view, viewField, assignment
- plugin (inside `FieldDef.type`'s union), fieldOption, dataSourceDef

`packages/web/src/areas/studio/draft/issues.ts` tokenizes `CompileIssue.loc`
to locate the offending field in Process Studio's inspector. The `loc`
format is a real consumer contract, not just a test fixture.

Two other active OpenSpec changes touch the same code this change edits.
`field-tree-check-consolidation` already has generated tasks. Its task 4.2
edits `walkViewKeys` directly, removing the `view.renderer` shape check
inside it. Its section 2 also edits `structuralIssues`, `checkPatterns`,
`checkColumnMapping`, `checkFieldKeyFormat`, and `checkLengthBounds` in
this same file. `walkViewKeys` is one of the 9 `walkFooKeys` functions
this change deletes outright (task 2.5).

`compile-unknown-key-check-generic` (proposal-only: no design.md or
tasks.md yet) proposes the identical goal for the identical function. It
would replace `checkUnknownKeys` and its supporting mirror with a small,
schema-driven mechanism. See the Risks section below for the coordination
this overlap requires. See the Migration Plan for the sequencing it
drives.

## Goals / Non-Goals

**Goals:**
- Replace the 9 hand-written `walkFooKeys` functions and 19 `*_KEYS`
  constants with one generic recursive walker. The walker reads the schema
  tree at traversal time. A schema change then needs no mirror updated.
  `walkFieldsIndexed` is a tenth `walk`-prefixed function in the file. It
  is not one of the 9. It stays: four other checks reuse it (see Context
  above).
- Preserve, byte-for-byte, the `{ loc, value, message }` shape and the
  per-key granularity every existing test and the studio consumer depend
  on.
- Preserve the duck-typed, pre-parse operating mode. The walker must keep
  working before Zod has validated the rest of the body, exactly like
  `checkUnknownKeys` does today.

**Non-Goals:**
- Changing what counts as an unknown key, or which bodies get rejected.
- Changing `structuralIssues`' placement, `compileProcessBody`'s control
  flow, or any other of the seven structural checks.
- Touching `packages/web/src/areas/studio/draft/issues.ts` or any other
  consumer. The change is a no-op from their side.
- Adopting the audit finding's literal wording
  (`canonicalize(parsed) !== canonicalize(input)` as the detection
  mechanism). See Decisions below for why, and Risks for the counterexample
  that rules it out.

## Decisions

### Decision: a schema-driven recursive walker, not a parse-then-diff

The audit finding's one-line suggestion reads as: call
`processBody.parse(input)` to get `parsed`. Compare `canonicalize(parsed)`
against `canonicalize(input)` to detect that something got stripped. Then
run "a 25-line generic object diff" between `parsed` and `input` to locate
which keys got stripped.

That mechanism needs a full, successful Zod parse of the entire body before
it can locate anything. Calling `.parse()` throws the moment any part of
the body is invalid, unknown-key or not. Calling `.safeParse()` instead
returns no `.data` in that same case, leaving nothing to diff.

`checkUnknownKeys` today carries no such requirement. It inspects each
object's own keys independently of whether the rest of the body is
well-typed. That independence is exactly why it can run ahead of any Zod
parse at all (see Context, point 1). Adopting the literal parse-then-diff
reading breaks a placement rule the codebase treats as deliberate. It also
demonstrably regresses an existing test. See Risks.

Instead, keep the check schema-driven, but make it one walker instead of
ten. The walker takes a live Zod schema node and the corresponding raw
(still duck-typed) value. It dispatches on the schema node's underlying
type, reusing and extending `unwrapSchema`, which already unwraps `lazy`,
`optional`, `nullable`, and `default`:

- **object** (`ZodObject`): check the value's own keys against
  `Object.keys(schema.shape)`. This is exactly what `checkKnownKeys` already
  does. Push a `CompileIssue` per unknown key. Then recurse into each
  declared key that exists on the value, against that key's own sub-schema.
- **array** (`ZodArray`): recurse into each element against the element
  schema, index-chaining the `loc` by position (`foo[0]`, `foo[1]`) the
  same way `walkFieldsIndexed` and `collectActionSites` already do.
- **record** (`ZodRecord`): skip the value's own keys. They are data,
  locale codes or field ids, never a fixed shape. This matches the current
  explicit exclusion for `localizedText`, `Plugin.config`,
  `FieldOption.attributes`, `Action.output`, and `SubprocessSpec.*Mapping`.
  (Migration `transforms`/`stepMap`/`fieldMap` live on a separate schema,
  never part of `ProcessBody`. They are out of this check's scope
  entirely, not an in-scope exclusion.) Recurse into the record's declared
  value-schema for each entry's value.
- **union** (`ZodUnion`/`ZodDiscriminatedUnion`): recurse into whichever
  member schema structurally matches the raw value. For `FieldDef.type:
  BaseFieldType | Plugin`, a primitive-typed member (`baseFieldType`, a
  string enum) matches when the value is not a plain object. The
  object-typed member (`plugin`) matches when the value is a plain
  object. This mirrors what the hand-written code already does ad hoc.

  `FieldDef.default: Expression | Literal` needs its own rule. The
  generic rule above does not disambiguate it. `Literal` recurses through
  `z.record(z.string(), literal)` (`definition.ts:174-178`). A `Literal`
  value can be a plain object too. Dispatch this union the way the
  current hand-written code does instead (`compile.ts:345`). A
  plain-object `default` matches `Expression` only when it also carries a
  string `lang` field.

  Any other plain-object `default` is an opaque `Literal`: no key-set
  check, no recursion into it. That matches today's behavior for a body
  with `default: { foo: "bar" }` on a `type: "string"` field. That body
  is schema-valid today. No refinement ties `default`'s shape to `type`.
  It must keep compiling clean.
- anything else (primitives, `ZodLiteral`): no keys to check, no
  recursion.

A value can match no member in the union branch. Then whichever other
structural check applies, or the eventual Zod parse, reports the real type
mismatch instead. That check was never responsible for reporting "wrong
type," only for "extra key."

The walker replaces `checkKnownKeys` plus the 9 `walkFooKeys` functions
with one function and a small per-Zod-type dispatch table. `shapeKeys`
collapses into that dispatch. An object node's "known keys" is just
`Object.keys(unwrapSchema(schema).shape)`, computed at the moment the
walker visits that node. Nothing precomputes it into 19 module-level
constants anymore.
The entry points that call it stay: one call each for `body`,
`body.contract`, `body.dataSources[]`, `body.fields[]` (recursive),
`body.workflow`, `body.workflow.steps[]` (recursive). They fix
`ProcessBody`'s five top-level positions to their schemas. That part was
never the duplicated mirror the audit flagged.

**Alternative considered: literal parse-then-diff.** Rejected, and not for
a cosmetic reason: see the Risk below. It stops detecting the exact
violating input `test/compile-validation.test.ts`'s "assignment" case pins.

**Alternative considered: `z.strictObject()` on a derived variant of each
schema.** The audit mentions this as "the other route." Rejected for this
change. It needs a parallel `strict` copy of every object schema in
`definition.ts`, a different mirror no smaller than today's. Or it needs
wrapping each schema with `.strict()` at `compile.ts` load time instead.

The wrapping approach only works if `.strict()` composes cleanly through
three things: `z.lazy()` (the field-tree self-reference), `z.record()`
value positions, and `z.union()` members. It must do so without
reintroducing its own per-type unwrapping logic. At that point it is the
same schema-introspection work this design already does. It also produces
a less precise error shape (`ZodError` issues, not
`{ loc, value, message }`). It carries the same parse-must-fully-succeed
limitation as parse-then-diff, since `.strict()` still only reports
through a full `.parse()`/`.safeParse()` call.

### Decision: keep `canonicalize` out of the detection path entirely

`canonicalize(parsed) !== canonicalize(input)` stays a legitimate cheap
consistency check, but only as a test oracle. Take a body that also
happens to parse cleanly under `processBody`, and for which the new walker
reports zero unknown-key issues. For that body, stripping changed nothing:
`canonicalize(processBody.parse(input)) === canonicalize(input)`. That
assertion is a useful regression guard for the walker's own correctness. It
does not produce the located issues `CompileValidationError` carries. See
the Risk below for why.

## Risks / Trade-offs

**[Risk] Two sibling changes overlap this one's target code. Only one
carries a cross-reference back to this change.**

`field-tree-check-consolidation` already has generated tasks. Its task 4.2
touches `walkViewKeys`, removing its `view.renderer` shape check. Its
section 2 also touches `structuralIssues`, `checkPatterns`,
`checkColumnMapping`, `checkFieldKeyFormat`, and `checkLengthBounds`, all
in `src/schema/compile.ts`. `walkViewKeys` is one of the 9 `walkFooKeys`
functions this change deletes outright (task 2.5). Applying this change
first invalidates that sibling's task 4.2, which assumes `walkViewKeys`
still exists in its current shape. Applying this change after that sibling
lands leaves task 4.2 pointed at a function that no longer exists.

That sibling's own design.md now carries the cross-reference. Its Risks
section names this change by slug and states the same `walkViewKeys`
conflict. Its mitigation matches too: `simplify-unknown-key-detection`
applies first.

Separately, `compile-unknown-key-check-generic` (proposal-only: no
design.md or tasks.md yet) proposes the identical replacement of
`checkUnknownKeys` this change makes. It proposes that under a
different name. That overlap still carries no cross-reference on either
side.

Mitigation: this change applies before `field-tree-check-consolidation`.
See the Migration Plan below for the sequencing this drives on both
sides.

`compile-unknown-key-check-generic` stays open only until whoever manages
the `openspec/changes/` queue archives or withdraws it. This change is
the more complete of the two, already through design and tasks. It
satisfies that proposal's own `Why` once it lands. No task in this change
deletes `compile-unknown-key-check-generic` directly. That decision sits
with the change queue, not with a single change's task list.

**[Risk] A literal parse-then-diff implementation silently regresses
unknown-key detection whenever the body carries an unrelated error.**

Mitigation: this design does not use parse-then-diff (see Decisions). The
`assignment` schema is `z.object({ strategy: plugin })`. That schema
requires `strategy` (`src/schema/definition.ts:469`). The per-level planted-key
test in `test/compile-validation.test.ts` plants this exact
counterexample: `b.workflow.steps[0].assignment = { zzAssignment: 1 }`.
That `assignment` object is missing its required `strategy` field, and it
also carries the unknown key `zzAssignment`.

Today, `checkUnknownKeys` reports `zzAssignment` regardless of the missing
`strategy` field, because it never looks past each object's own keys. A
`parsed = processBody.parse(input)` call on that same body throws a
`ZodError` for the missing `strategy` field. That happens before any diff
can run. No `CompileIssue` for `zzAssignment` ever gets produced, and the
thrown `ZodError` is not a `CompileValidationError` at all. Keep this
exact test case, or an equivalent one, in the implementation's coverage.
It guards against reintroducing this exact regression by a future
refactor.

**[Risk] The union-dispatch branch cannot be a pure `.shape` lookup.**

Mitigation: this applies to `FieldDef.type` and `FieldDef.default`. Scope
it narrowly. Do not write a general resolver that tries every member and
takes the best match.

The `FieldDef.type` union dispatches on value shape, plain object versus
primitive, the same disambiguation the current hand-written code
performs. The `FieldDef.default` union cannot use that same rule, since
`Literal` can also be a plain object (see the Decisions section above).
It dispatches instead on whether the plain-object value carries a string
`lang` field, mirroring `compile.ts:345`'s exact check.

Cover both union sites with the planted-key tests already in
`test/compile-validation.test.ts`. Keep the "plugin" case. Add a
`FieldDef.default` case if the suite lacks one yet. Add a case planting an
object-shaped, non-`lang` default and confirm it raises no unknown-key
error.

A future Zod upgrade could change union introspection internals. Such an
upgrade should fail a test immediately, rather than silently stop the
walk at that node. That mirrors the silent-regression pattern the test
file's own comments already flag for the current implementation.

**[Risk] Zod v4 internal introspection (`_zod.def`) is not a public,
version-stable API.**

Mitigation: this is an existing risk, not a new one.
`unwrapSchema` already reads `_zod.def` today. The test file already
carries a standing comment about this exposure. It reads:
"migrate-to-zod-v4: ... a Zod upgrade can move what they contain". The new
walker reads that same surface: `_zod.def.type`,
`.shape`, plus the array, record, and union `def` fields this change adds.
A Zod upgrade stays a deliberate, reviewed commit per existing repo
convention. It gets verified by re-running the full unknown-key test
suite, never folded into an ordinary `bun update`.

## Migration Plan

No data or API migration applies. This is an internal implementation swap
behind an unchanged `checkUnknownKeys`-equivalent entry point and an
unchanged `CompileIssue` output shape. Land it as one commit:

- Sequencing: apply this change before `field-tree-check-consolidation`.
  Before starting either change, confirm nobody has applied or archived
  `field-tree-check-consolidation` yet. Confirm nobody has applied
  `compile-unknown-key-check-generic` on its own either. If either check
  fails, stop and reconcile instead of duplicating or contradicting that
  work.
- Once this change lands, `field-tree-check-consolidation`'s own task 1
  (re-reading the current baseline) must re-read the post-this-change
  state of `walkViewKeys` and `structuralIssues`. It must do that before
  editing either. `walkViewKeys` no longer exists once this change
  lands. The `view.renderer` shape check its task 4.2 targets moves into
  the new schema-driven walker's object-node branch instead.
- Replace the constants and walkers.
- Keep `structuralIssues`' call site and argument unchanged.
- Run the full test suite: `test/compile-validation.test.ts`, then the full
  `bun test` run for downstream effects.
- Confirm `packages/web/src/areas/studio/draft/issues.ts`'s consumer
  behavior stays unchanged. The actual proof is task 3.12's new
  `resolveLoc` case. It lives in `packages/web/test/studio-issues.test.ts`,
  the one studio suite that calls `resolveLoc` against an
  unknown-key-shaped `loc`. By contrast,
  `packages/web/test/studio-publishErrors.test.ts` and
  `packages/web/test/studio-draftValidationLogic.test.ts` cover only the
  narrower client-side message-formatting paths each one exercises. Task
  3.12a records why neither one locates an unknown key's field.

No rollback process applies beyond a normal revert. No data written by
this code path would need reconciling.

## Open Questions

None. The walker's dispatch surface (object, array, record, union, leaf)
covers every Zod construct `ProcessBody` and its descendants use, confirmed
via `grep z.union|z.record` over `src/schema/definition.ts`. Decisions and
Risks above resolve the placement, error shape, and test coverage
questions.
