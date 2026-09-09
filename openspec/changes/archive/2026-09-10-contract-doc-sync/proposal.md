## Why

Two rule files load automatically when an agent touches `src/schema`,
`src/engine`, `src/cel`, the studio area, `examples/` or `openspec/`.
`.claude/rules/process-contract.md` states the definition contract.
`.claude/rules/authoring-invariants.md` states what the validation layer
enforces. Both drifted from the code they describe.

The 2026-09-09 documentation audit found that drift. A verification pass then
checked every audit claim at the code. It wrote
`tmp/doc-audit/08-rules-contract.md`, which holds sixteen corrections. Each one
carries a byte-exact anchor and a `file:line` citation.

Two of the sixteen state one fact twice. `process-contract.md:74` and
`docs/authoring-guide.md:482` both list `order` as a view key. `viewField`
has no such key. Shipping one correction without the other leaves the
contradiction in place. That guide line therefore joins this change.

## What Changes

- `.claude/rules/process-contract.md`, seven corrections. Drop `order` from the
  view-key list. Document `span`, `validation`, `validationMode`,
  `View.columns`, `FieldDef.redactable`, `format`, `control` and
  `columnMapping`. Name the fourth assignment strategy,
  `org.actor-from-field`. Correct the org-aware strategy count from two to
  three, and the group-scope check's ordinal from fourth to third. Name all six
  DB-resolving checks `publishBody` awaits, in call order.
- `.claude/rules/authoring-invariants.md`, eight corrections. Add
  `checkFieldTree` and the five per-field checks that share its walk. Add the
  `format`/`control` pair rule, the `columnMapping` bounds and the `redactable`
  group rule. Add the three subprocess step refinements, field-key and data
  source key uniqueness, and `migrationSpec.fieldMap` injectivity. Correct the
  length-bounds entry, which credits `checkLengthBounds` for two bounds it no
  longer owns.
- `docs/authoring-guide.md:482`, one correction. Drop `order` from the view-key
  list. Line 833 of the same file already states it correctly.
- `.claude/rules/process-contract.md:14`, one directive change. The six-rule
  `allow-file` narrows to `em-dash passive-voice sentence-length run-ons`.
  Measured: dropping `synonym-rotation` and `paragraph-length` costs 3 printed
  lines and leaves the exit code at 0. Dropping `em-dash`, `sentence-length` or
  `run-ons` instead flips the process to exit 1; `passive-voice` prints 32 more
  lines at exit 0. `design.md` carries the seven measured rows.

No code, no test and no schema change. Every one of them restates behavior the engine
already ships.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The report's research question asked whether the four undocumented checks
amount to a spec gap. It does not. Every check and every invariant this change
documents already stands as a `SHALL` requirement in a living capability spec:
`definition-contract`, `field-tree-check-consolidation` and
`instance-migration`. `design.md` names the requirement behind each one.

This change writes no requirement, because no requirement changes. It sets
`skip_specs: true`.

## Impact

- `.claude/rules/process-contract.md`, `.claude/rules/authoring-invariants.md`,
  `docs/authoring-guide.md`. Three files, documentation only.
- No `src/`, `packages/`, `test/` or `openspec/specs/` file changes.
- No test asserts anything about the two rule files, so `bun test` cannot catch
  a wrong replacement here. The prose gate and the whitespace gate are the two
  gates this change can trip.
