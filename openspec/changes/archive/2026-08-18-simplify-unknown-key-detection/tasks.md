## 1. Confirm the current baseline before touching anything

- [x] 1.1 Re-read `src/schema/compile.ts`'s current `checkUnknownKeys`, its
  19 `*_KEYS` constants, and its 9 `walkFooKeys` functions
  (`walkExpressionKeys`, `walkActionKeys`, `walkActionsKeys`,
  `walkFieldDefKeys`, `walkViewKeys`, `walkSubprocessSpecKeys`,
  `walkTimerKeys`, `walkPathKeys`, `walkStepKeys`). They span roughly lines
  184-429 as of this proposal. Confirm the current range before editing,
  since it may have drifted. A tenth, similarly-named function,
  `walkFieldsIndexed`, is NOT part of this set (see task 2.5).

  Confirmed the range at apply time. `shapeKeys` plus the 19 constants sat
  at lines 196-222. `checkKnownKeys`, the 9 `walkFooKeys` functions, and
  the old `checkUnknownKeys` sat at lines 291-429. Both ranges start a few
  lines later than this proposal estimated. Neither range changed shape.
- [x] 1.2 Re-read `structuralIssues` and `compileProcessBody` (same file,
  roughly lines 740-811) to reconfirm placement. Both run before any Zod
  parse of the authored body, ahead of the `publishedProcessBody`-valid
  early return. Confirmed unchanged.
- [x] 1.3 Re-read `test/compile-validation.test.ts`'s unknown-key
  `describe` block in full. Note the exact `loc`/`value` assertions it
  pins.
- [x] 1.4 List every nesting level the block's planted-case loop covers:
  `body`, `field`, `fieldValidation`, `workflow`, `step`, `path`,
  `expression`, `action`, `timer`, `timerAction`, `view`, `viewField`,
  `assignment`, `plugin`, `fieldOption`, `dataSourceDef`. This list is the
  acceptance criterion for task 3 below.
- [x] 1.5 Re-read `packages/web/src/areas/studio/draft/issues.ts`'s
  `tokenize`/loc-consuming logic. Confirm it accepts the `loc` format
  unchanged (string, dot- and bracket-indexed).
- [x] 1.6 Confirm the current status of the two sibling OpenSpec changes
  that touch this same file: `openspec/changes/field-tree-check-consolidation`
  and `openspec/changes/compile-unknown-key-check-generic`. This change
  must apply before `field-tree-check-consolidation`, per design.md's
  Risks section. If someone already applied or archived
  `field-tree-check-consolidation`, stop before continuing. Reconcile
  with it first: its task 4.2 touches `walkViewKeys`, one of the 9
  functions task 2.5 below deletes. If someone already applied
  `compile-unknown-key-check-generic`, this change is redundant. Stop
  and reconcile rather than duplicating the replacement.

  Verified. No conflict. Safe to proceed.

  Finding 1. `field-tree-check-consolidation`'s task 4.2 would have
  removed `walkViewKeys`'s `view.renderer` shape check. That task needed a
  production-database audit query this environment cannot run.

  That change's own design.md contingency plan dropped the whole
  sub-task. Nobody ever ran it. I confirmed `walkViewKeys` in the
  pre-this-change tree matched the version before that sibling change,
  byte for byte. It still carried the `view.renderer` check.

  Finding 2. `openspec/changes/archive/2026-08-17-compile-unknown-key-check-generic/`
  holds `compile-unknown-key-check-generic` now. It carries only a
  `proposal.md`. It has no `design.md` and no `tasks.md`, so nobody ever
  implemented it. I confirmed `checkUnknownKeys` in the pre-this-change
  tree still held its original hand-mirrored form. The archival closed out
  a duplicate proposal, one this change supersedes.

## 2. Implement the schema-driven walker

- [x] 2.1 Extend `unwrapSchema`, or add a sibling helper. It must expose
  enough of the underlying Zod `_zod.def` to dispatch on `object`, `array`,
  `record`, `union`/`discriminatedUnion`, or leaf, per design.md's
  Decisions section.

  `unwrapSchema` needed no code change. It already strips every wrapper
  type (`lazy`/`optional`/`nullable`/`default`) down to the substantive
  node. The new `walkSchema` dispatches on that node's `_zod.def.type`
  directly: `object`, `array`, `record`, or `union`. A
  `discriminatedUnion` also reports `_zod.def.type === "union"` in Zod
  4.4.3. I confirmed that by reading
  `node_modules/.../zod/v4/core/schemas.d.ts`. So `walkSchema` needs no
  separate case for it.
- [x] 2.2 Implement the single generic walker. For an object node, check
  the value's own keys against `Object.keys(shape)`. Push a `CompileIssue`
  per unknown key, using the same `{ loc, value, message }` shape
  `checkKnownKeys` produces today. Then recurse per declared key into that
  key's sub-schema against the value's corresponding sub-value.
- [x] 2.3 Implement the array, record, and union branches per design.md.
- [x] 2.4 Wire the walker's top-level entry points to `ProcessBody`'s five
  checked positions: `body`, `body.contract`, `body.dataSources[]`,
  `body.fields[]` (recursive), and `body.workflow`/`body.workflow.steps[]`
  (recursive). `checkUnknownKeys`'s current top-level function visits
  these same positions today.

  I implemented one `walkSchema(processBody, body, "", issues)` call, not
  five separate calls. `processBody`'s object-node recursion already
  visits `contract`, `dataSources`, `fields`, and `workflow` as
  declared-and-present keys. It also visits `workflow.steps`,
  transitively. A second, explicit wiring of those same five positions
  would just repeat the hand-mirrored duplication this change removes. I
  verified this against every planted-level test case in section 3 below.
  Two of them exercise this exact set of positions: `body` and
  `dataSourceDef`.
- [x] 2.5 Delete the 19 `*_KEYS` constants and these 9 `walkFooKeys`
  functions once the walker's output matches on every existing test:
  `walkExpressionKeys`, `walkActionKeys`, `walkActionsKeys`,
  `walkFieldDefKeys`, `walkViewKeys`, `walkSubprocessSpecKeys`,
  `walkTimerKeys`, `walkPathKeys`, `walkStepKeys`. Do not leave the old
  code dead in the file. `walkFieldsIndexed` stays. Four other checks
  reuse it for their own field-tree traversal: `checkPatterns`,
  `checkColumnMapping`, `checkFieldKeyFormat`, `checkLengthBounds`. That
  traversal has nothing to do with unknown-key detection. A `^function
  walk` grep over the file returns 10 matches, not 9. Do not delete all
  10. Perform this deletion only after tasks 3.4-3.8a below are in place.
  Those tasks must pass against the new walker, with the old
  implementation still present. That order gives a red-to-green
  checkpoint. It proves the new walker against the full new-and-old test
  set before the old safety net disappears.

  Deletion also removed `shapeKeys`, since nothing else called it. It also
  trimmed 18 now-unused schema imports from `definition.js`. The new
  walker needs only `processBody`'s root schema. It discovers every nested
  schema structurally, via `.shape`, `.element`, `.valueType`, and
  `.options`, rather than importing each one by name. `walkFieldsIndexed`
  and `collectActionSites` stayed untouched.

  This deviates from the literal sequencing: keep the old code present but
  unused, get tests green, then delete it. This repo's `tsconfig.json`
  sets `noUnusedLocals: true`. Leaving the 9 functions and 19 constants
  dead in the file would fail `bun run typecheck`. It would not fail `bun
  test`, which does not type-check.

  The task intends a correctness checkpoint. It wants proof the new
  walker matches the old, against a full test set, before deleting the
  old code. That way nothing disappears without a safety net.

  I honored that intent differently. I ran the full new-and-existing test
  set from section 3 against the new walker first. All of it passed. Only
  then did I delete the old code, in the same sitting.

  The deleted code stays recoverable from git history. That history is
  the real, persistent safety net.
- [x] 2.6 Confirm `structuralIssues`' call site stays unchanged. Keep the
  exported function named `checkUnknownKeys`.
  `.claude/rules/authoring-invariants.md` cross-references
  `compile.ts::checkUnknownKeys` by that exact name. A rename would leave
  that cross-reference stale. No other task in this change accounts for
  touching it. If a rename turns out to be unavoidable, touch that
  cross-reference in the same commit instead.

  Confirmed. `structuralIssues` still calls `checkUnknownKeys(body)` at the
  same position in its list. `checkUnknownKeys` is still the name. It
  stays unexported: this file exports no unknown-key symbol, matching the
  pre-change state.

## 3. Prove the new walker matches the old behavior exactly

- [x] 3.1 Run `test/compile-validation.test.ts` unchanged against the new
  implementation. Do not change the test file's expectations.
  All pre-existing assertions in this file pass unchanged.
- [x] 3.2 Confirm the exact `loc`/`value` pins still hold. Confirm the
  "reports every unknown key when a body carries them in more than one
  place" test still passes.
- [x] 3.3 Confirm the "is not bypassable by a body that also satisfies
  publishedProcessBody" test still passes. Confirm every planted per-level
  case in the `for (const [level, plant] of planted)` loop still passes.
- [x] 3.4 Add a test reproducing design.md's Risk counterexample. Plant an
  `assignment` object missing its required `strategy` field and carrying
  an unknown key (`{ zzAssignment: 1 }`, no `strategy`).
  Added: "locates an unknown key even when the same object is also missing
  a required field".
- [x] 3.5 Confirm that test raises a `CompileValidationError` naming
  `zzAssignment`. It must not raise a raw `ZodError`, and it must not pass
  the compile silently.
- [x] 3.6 Pin task 3.5's case as its own explicit assertion, separate from
  the shared planted-cases loop. A future regression on this exact case
  should then fail loudly and by name.
- [x] 3.7 Add or confirm a test for each `z.union` site the walker's union
  branch must dispatch through. There are five: `FieldDef.type`
  (`BaseFieldType | Plugin`, already covered by the "plugin" planted case),
  `FieldDef.default` (`Expression | Literal`), and `ViewField.visible`,
  `.required`, `.readonly` (each `z.boolean() | Expression`,
  `definition.ts:442-444`). The three `ViewField` sites are lower risk than
  `FieldDef.default`: a boolean value is never a plain object. There is no
  object-vs-object ambiguity to disambiguate. They still need their own
  test. No existing test plants an unknown key inside an expression-shaped
  `visible`/`required`/`readonly` value.
- [x] 3.7a Plant an unknown key inside an expression-shaped `visible` value
  (for example `viewField.visible = { lang: "cel", src: "true", zz: 1 }`)
  and confirm the walker catches it.
  Added: "catches an unknown key inside an expression-shaped
  ViewField.visible".
- [x] 3.8 Plant an unknown key on the `Expression`-shaped branch of
  `default` and confirm the test catches it.
  Added: "catches an unknown key on the Expression-shaped branch of
  FieldDef.default".
- [x] 3.8a Plant an object-shaped, non-`lang` `default` (for example
  `{ foo: "bar" }` on a `type: "string"` field). Confirm the walker
  raises NO unknown-key issue. This is the `Literal`-as-plain-object case
  design.md's Decisions section calls out: `Literal` recurses through
  `z.record(z.string(), literal)`. A plain-object `default` is not always
  the `Expression` member.
  Added: "raises no unknown-key issue for an object-shaped, non-lang
  default (an opaque Literal)".
- [x] 3.9 Add the cheap consistency-check test from design.md's "keep
  canonicalize out of the detection path" decision. Take a body that
  parses cleanly and raises no unknown-key issue. Confirm
  `canonicalize(processBody.parse(input)) === canonicalize(input)` holds.
  Added: "a full Zod parse leaves a clean body's canonical form unchanged
  (consistency oracle)".
- [x] 3.10 Treat task 3.9's check as a guard on the walker's own
  correctness, separate from the detection mechanism it tests.
- [x] 3.11 Confirm no other test file references the deleted `*_KEYS`
  constants or `walkFooKeys` function names directly. They stay internal,
  never exported, so this should need no change.

  I grepped the repo for every deleted constant and function name. Only
  `compile.ts` (now deleted) and this change's own docs matched,
  referencing them by name in prose. No test file needed a change.
- [x] 3.12 Add a case to `packages/web/test/studio-issues.test.ts`'s
  `resolveLoc` `describe` block. Plant a `loc` shaped like what the new
  walker produces for a nested unknown key with no `steps` token, for
  example `"fields[0].validation.zz"`. That plants an unknown key inside
  a catalog field's `validation` object. Confirm `resolveLoc` resolves it
  to `{ entityType: "field", entityId: <that field's id> }`. The Process
  Studio inspector calls `resolveLoc` to locate an issue's field. That
  suite has no case yet for an unknown-key-shaped `loc` value that
  reaches the field branch.

  A `loc` that does carry a `steps[i]` token resolves to the containing
  step instead. `resolveLoc` returns as soon as it finds `step?.id` (line
  168). That happens before the field-lookup code below it ever runs. A
  step-scoped example such as `"workflow.steps[0].view.fields[0].zz"`
  would assert `entityType: "step"`, not `"field"`. It does not exercise
  what this task tests.

  Added: "resolves an unknown-key loc inside a field's validation to that
  field".

<!-- antislop: allow synonym-rotation: "studio-publishErrors.test.ts" is a literal filename, not a prose synonym for "issue". -->
- [x] 3.12a Confirm the other two suites do not already cover this. The
  file `studio-publishErrors.test.ts` only unit-tests client-side message
  formatting on a synthetic object. It never calls `resolveLoc`.

  The file `studio-draftValidationLogic.test.ts` documents a KNOWN GAP.
  Studio's live validator strips an unknown key before
  `compileProcessBody` runs. So the key never reaches `runValidation`'s
  structural-issue path there. Neither suite locates an unknown-key
  issue's field. Neither proves the inspector does.
- [x] 3.13 Confirm the case added in task 3.12 passes and resolves to the
  field the planted `loc` names.

## 4. Verification

- [x] 4.1 Run `bun run typecheck` and confirm it passes clean.
  `tsc --noEmit` on the engine plus `bun run --filter './packages/*'
  typecheck` (form-ui, web): all exit 0.
- [x] 4.2 Run `bun run build` and confirm it passes clean.
  `bun run --filter './packages/*' build`: web build exits 0.
- [x] 4.3 Run the full `bun test` suite with `DATABASE_URL` set. Check the
  skip count as well as the pass count. Read the verdict off named test
  results, not off a single-file rerun.

  Result: 2749 pass, 1 skip, 0 fail, across 155 files. The baseline was
  2743 pass, 1 skip, 0 fail, across 155 files. This change added 6 tests.
- [x] 4.4 Run the antislop linter over every Markdown file this change
  touched: `proposal.md`, `design.md`, the
  `specs/definition-contract/spec.md` delta, and this file.
- [x] 4.5 Run `git diff --check` over the changed files for trailing
  whitespace and blank-at-EOF.
