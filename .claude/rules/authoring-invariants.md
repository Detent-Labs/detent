---
paths:
  - "src/schema/**"
  - "src/engine/**"
  - "src/cel/**"
  - "packages/web/src/areas/studio/**"
  - "openspec/**"
  - "examples/**"
  - "docs/authoring-guide.md"
---

<!-- antislop: allow-file synonym-rotation em-dash passive-voice sentence-length run-ons -->
# Authoring-time invariants (the validation layer must enforce these)

The TS types cannot express these; they must be Zod refinements or a lint pass,
each with a test that rejects a violating definition. Not every invariant
below lives in `definition.ts`.

Several run instead as write-path checks inside `compileProcessBody`
(`src/schema/compile.ts`). They run right after `validateDurations`. They run
**before** the `publishedProcessBody`-valid idempotent early return. That is
`validateDurations`' own placement.

Placement is a judgment call, not a default; `definition-contract` states two
criteria. An invariant a hand-written body must not bypass belongs on the
publish path. An invariant whose violation cannot exist in an
already-published body may live in the schema. The read path never settles
placement on its own: `definition.ts` also deserializes stored bodies, and a
tightened refinement there parks only the instances pinned to the body it
strands, since every body-resolving worker holds its own per-instance error
boundary.

The compile-pass placement also makes a check unbypassable. A hand-written
body cannot skip it by merely satisfying `publishedProcessBody`, which checks
only the cancel-sink count.

Five per-field checks share one walk. `checkFieldTree` runs `checkPatterns`,
`checkColumnMapping`, `checkFieldKeyFormat`, `checkFieldFormatControl`,
`checkFieldExpressionLength` and the field-key length bound at each field, in
that sequence, over one `walkFieldsIndexed` pass
(`field-tree-check-consolidation`). `structuralIssues` lists twelve checks;
`checkFieldTree` is one entry there, and those five carry no entry of their own.
- All `id` references resolve within the process; `initialStep` exists.
- Ids unique per kind; slugs/keys are not used as references anywhere.
- Field `key`s are unique across the whole field tree, groups included: CEL
  addresses a field by `key` in the flat `data` namespace. Data source `key`s
  are unique among themselves, and equal none of the reserved CEL namespaces
  (`data`, `instance`, `actor`, `child`, `result`). Both are Zod refinements in
  `processBody`'s superRefine.
- Every non-terminal step has at least one exit (a path, or a timer with a
  targetPath); terminal steps have no outgoing paths.
- A step's paths are all-manual or all-automatic. Among 2+ automatic paths,
  `priority` is present and unique; at most one guardless automatic path; if a
  default exists it has the highest priority.
- Field `options` XOR `dataSource`. Timer `duration` XOR `deadline`.
- `duration` values are ISO-8601 W/D/H/M/S (no calendar units, at least one
  component), and a `Timer.duration` is additionally bounded so `entryInstant +
  duration` stays in the four-digit-year window. Enforced at PUBLISH
  (`compile.ts::validateDurations`), on arming totality — see
  `definition-contract`'s placement rule.
- `pinnedVersion` present iff `versionBinding === "pinned"`; `contractRef`
  present for a latest-at-spawn subprocess reference.
- A process referenced as a subprocess has a `contract`. In a contracted
  process every terminal step has an `outcome` in `contract.outcomes`; `outcome`
  only on terminal steps; every declared outcome is reachable by a terminal step.
- `inputMapping` keys are in the child contract's `inputFields`; a
  subprocess-callable child requires no fields outside its `inputFields`.
- A step declares a `subprocess` spec iff its `type` is `"subprocess"`, and a
  subprocess step's paths are all-automatic. The step is a wait-state: a manual
  path would let an actor advance the parent while the child still runs. All
  three are Zod refinements in `definition.ts`'s `step` superRefine, beside the
  path-trigger checks.
- `unmappableStep` present iff `onUnmappable === "route-to-step"`; migration
  maps reference valid ids.
- `migrationSpec.fieldMap` is injective. Two sources targeting one field
  collapse under the snapshot remap, last write in an unspecified order, so
  registration fails rather than the migration producing a data-dependent
  result. A Zod refinement on `migrationSpec` in `definition.ts`.
- Every `LocalizedText` value anywhere in the body (process, steps, fields
  incl. nested `group` fields, field options, `ViewNote.text`) has a
  non-empty entry for `ProcessBody.baseLocale`; other locales are optional
  per entry.
- Every CEL Expression parses and type-checks against the field catalog. The
  CEL step below enforces this one, not definition.ts, since it needs the CEL
  library.
- No action anywhere in the body carries a `type` with the reserved `core.`
  prefix. The compile pass checks this on BOTH compile branches
  (`compile.ts::checkReservedActionPrefix`). The cancel-sink id/key/outcome
  checks stay a Zod refinement in `authoredProcessBody`. A compiled body
  legitimately carries all three, so generalizing them would reject every
  compiled body on sight.
- The authored body carries no key the definition contract does not declare.
  This applies at any depth: process, contract, field, data source, workflow,
  step, path, action, timer, view entry, validation. It includes fields
  nested inside a group. The compile pass checks this
  (`compile.ts::checkUnknownKeys`). The read path (`processBody.parse`)
  keeps stripping unchanged, so `definitionHash` stays reproducible.
- Every `FieldValidation.pattern` compiles as a JavaScript `RegExp`, and its
  source stays under the declared length bound. The compile pass checks this
  (`compile.ts::checkPatterns`) at two call sites: once over the field
  catalog, once over every `ViewField.validation.pattern`
  (`checkViewFieldPatterns`), since a step's own validation override carries
  the same risk — see `definition-contract`'s placement rule.
- A `ViewField` declaring `validationMode` without `validation`, or a
  `validation` with no key set, fails to parse. Both are a Zod refinement on
  `viewField` itself, not a compile-pass check: neither shape can exist in a
  body published before the two keys did, so tightening here carries none of
  the already-published-body risk the write-path placement above guards
  against.
- `SubprocessSpec.outputMapping` keys and `ProcessContract.inputFields`/
  `outputFields` resolve against the process's own recursive field set. The
  compile pass checks this (`compile.ts::checkIdResolution`), not the sibling
  `Action.output` check in the `processBody` superRefine — see
  `definition-contract`'s placement rule.
- A `technical` field is never `type: "group"`, and a `ViewField` naming a
  technical field declares neither `required` nor `readonly`, literal or
  CEL. The compile pass checks both (`compile.ts::checkTechnicalFields`), not
  a Zod refinement on `fieldDef` or `viewField` — see `definition-contract`'s
  placement rule.
- A `redactable` field is never `type: "group"`: a group holds fields, not a
  value to erase. The compile pass checks this
  (`compile.ts::checkRedactableFields`), not a Zod refinement on `fieldDef` —
  see `definition-contract`'s placement rule. `redactable` places no
  restriction on `technical`; a field may declare both.
- `FieldDef.key` matches `/^[a-z_][a-z0-9_]*$/` — the CEL identifier grammar
  `data.<key>` requires. The compile pass checks this
  (`compile.ts::checkFieldKeyFormat`). `Step.key`/`Path.key` stay
  format-free: nothing reads them as identifiers.
- A field's `format` and `control` are pairs its own `type` admits, per the one
  table `definition.ts::ALLOWED_BY_TYPE`, and a literal `default` matches the
  declared `format`. A plugin-typed field has no row there, so it may declare
  neither key. The compile pass checks this
  (`compile.ts::checkFieldFormatControl`, inside `checkFieldTree`), not a Zod
  refinement — see `definition-contract`'s placement rule, which that
  function's own comment cites.
- `Path.key` is a non-empty string after trimming, and `Path.label` is
  required and a non-empty string after trimming, for a path of either
  trigger kind. Both are plain per-field Zod constraints on the shared
  `path` object in `definition.ts` (not a `compile.ts` write-path check —
  see `definition-contract`'s placement rule), so `.trim()` is applied at
  parse time and a padded authored value normalizes before it reaches
  `definitionHash`.
- A `FieldDef.columnMapping` field declares a `dataSource` and
  `type: "string"`. Each key matches `/^[a-z_][a-z0-9_]*$/` and the key-length
  bound. Each target resolves in the recursive field set, and is neither a
  group field nor the mapping field itself. No two keys name one target. The
  compile pass checks all of it (`compile.ts::checkColumnMapping`, inside
  `checkFieldTree`) — see `definition-contract`'s placement rule. It reads no
  data list, so a key naming no declared column publishes.
- `key`, `Plugin.type`, every `duration`, `pattern` and `Expression.src` stay
  under a declared length bound — every authored string that reaches an
  interpreter or a registry lookup. `compile.ts::checkLengthBounds` checks the
  `Plugin.type`, `duration` and non-field-tree `Expression.src` sites.
  `checkPatterns` owns the `pattern` bound. The field-key length bound, and a
  field's own `validation.rule`/`default` expression length, sit in
  `checkFieldTree` instead.
- A `view.fields[]` entry declaring literal `required: true` and literal
  `readonly: true` names a field some source in the body writes, guaranteed
  before the entry's own step is submitted (an action `output` or a
  `subprocess.outputMapping` on a step that dominates the entry's own step,
  a `columnMapping` target whose mapping field is editable on a step that
  dominates the entry's own step, a `contract.inputFields` entry, a literal
  catalog `default`, or an editable entry on a step that dominates the
  entry's own step), except on a step carrying no manual path, on a group or
  technical field, on an entry carrying no `ref` (a note entry names no
  field, so this rule has no field to look for a writer of), or on an entry
  declaring `visible: false`. The compile pass checks this
  (`compile.ts::checkUnsatisfiableRequiredReadonly`), not a Zod refinement on
  `viewField` — see `definition-contract`'s placement rule.
- A non-empty `view.fields[].group` names the `key` of a `type: "group"` field
  the body declares at any depth, and the same view carries a `ref` entry for
  that group field. `form-ui` draws only the entries with no `group`, and a
  group field then draws the entries naming its key, so an entry failing
  either half leaves the form with no message. An empty `group` reads as no
  group, matching the renderer. The rule reaches a note entry too, and it does
  not ask the view group to follow the catalog's own nesting: the view carries
  presentation, and `purchase-requisition.json` heads one field under five
  groups across five steps. The compile pass checks this
  (`compile.ts::checkViewGroupReferences`). A Zod refinement on `viewField`
  would strand the pinned instances of three bodies published before the
  check — see `definition-contract`'s placement rule.
- A view declaring `tabs` holds one hierarchy: tabs, then fields and groups,
  then a group's own members. Two tabs in one view never share a `key`, and
  every non-empty `tab` names a declared one. Once a view declares a tab,
  every entry outside a group must declare one too. An entry inside a group
  never declares its own tab — the group's own entry names the tab for the
  whole group. An untabbed view's entries must not declare `tab` either. All
  five are Zod refinements in `definition.ts`'s `view` superRefine: no body
  published before `tabs` and `tab` existed could violate one, so none can
  strand a pinned instance — see `definition-contract`'s placement rule.
- A step whose `assignment.strategy.type === "org.group-members"` and whose
  `config.groupId` is a string must name a group id already present in the
  body's own `allowedGroups`. The compile pass checks this
  (`compile.ts::checkGroupReference`), not a Zod refinement: an authored body
  cannot state both lists consistently before publish decides whether the
  strategy is even registered, so the write path is where the two lists can
  first be compared — see `definition-contract`'s placement rule. A `groupId`
  that is absent or non-string is left to the assignment-registry
  config-schema check instead, so the two checks never both flag one step.
- A step whose `assignment.strategy.type === "org.actor-from-field"` and whose
  `config.fieldId` is a string must name a field the body declares with
  `format: "person"`. The compile pass checks this
  (`compile.ts::checkActorFromFieldReference`), the direct sibling of the
  check above and placed for the same reason — see `definition-contract`'s
  placement rule. It resolves against the field tree
  (`collectFieldsDeep`), so a person field nested in a group satisfies it. A
  missing field and a wrongly-formatted one draw one message: both mean the
  strategy has nothing valid to read. A `fieldId` that is absent or
  non-string is left to the assignment-registry config-schema check, so the
  two checks never both flag one step.
