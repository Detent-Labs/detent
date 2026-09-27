---
paths:
  - "src/schema/**"
  - "src/engine/**"
  - "src/cel/**"
  - "packages/web/src/areas/studio/**"
  - "openspec/**"
  - "examples/**"
  - "docs/authoring-guide.md"
  - "src/validate.ts"
---

# Authoring-time invariants (the validation layer must enforce these)

The TS types cannot express these invariants. Each needs a Zod refinement or
a lint pass, with a test that rejects a violating definition. Not every
invariant below lives in `definition.ts`.

Several run instead as write-path checks inside `compileProcessBody`
(`src/schema/compile.ts`). They run right after `validateDurations`. They run
**before** the `publishedProcessBody`-valid idempotent early return. That is
`validateDurations`' own placement.

Placement is a judgment call. It follows no default. `definition-contract`
states two criteria. A hand-written body must not bypass an invariant that
belongs on the publish path. An invariant may live in the schema when its
violation cannot exist in an already-published body. The publish-path
placement also makes a check unbypassable.

A hand-written body cannot skip it by only satisfying
`publishedProcessBody`, since that schema checks only the cancel-sink
count. The read path cannot settle placement on its own. `definition.ts`
also deserializes stored bodies. A tightened refinement there strands every
instance already pinned to that body. Each body-resolving worker holds its
own per-instance error boundary, so one stranded instance does not stop the
others.

`checkFieldTree` is one of the twelve structural checks and runs five
per-field checks in one pass (`field-tree-check-consolidation`).

Checks run in this order at publish. `validateStructure` runs durations,
then the twelve structural checks, then Zod. A hash match then returns
early. `validateReferences` runs the registry checks, then CEL. `publishBody`
then runs its own seven DB-resolving checks.

`process-contract.md` already states the meaning behind `validationMode`,
`technical`, `redactable`, `format`/`control`, `Path.key`/`Path.label`, and
`columnMapping`. This file states only each check's site, its message, and
its placement.

- All `id` references resolve within the process; `initialStep` exists.
- `id` anchors every stored reference. CEL reads a field `key` as
  `data.<key>`. A view entry's `group` names a group field's `key`, and its
  `tab` names a key in the same view's `tabs`.
- Field `key`s are unique across the whole field tree, groups included. CEL
  addresses a field by `key` in the flat `data` namespace. Data source
  `key`s are unique among themselves. No data source `key` equals a
  reserved CEL namespace (`data`, `instance`, `actor`, `child`, `result`).
  Both rules are Zod refinements in `processBody`'s superRefine.
- A non-terminal step needs at least one outgoing path. A terminal step has
  no outgoing paths. A timer's `targetPath` must itself resolve to one of
  the step's own outgoing paths (`definition.ts:942-945`, `:1096-1099`). A
  step with zero paths has no exit, timer included.
- Two actions on one transition never write the same output field.
  `onExit`, `onPath` and the target's `onEntry` form one set. `onCancel`
  forms the other (`definition.ts:1026-1036`, `:1081`, `:1085`).
- A step's paths are all-manual or all-automatic. Among two or more
  automatic paths, `priority` is present and unique. At most one guardless
  automatic path may exist. A default, if one exists, carries the highest
  priority.
- A field declares at most one of `options` and `dataSource`. A field with
  neither passes (`definition.ts:356-359`). Timer `duration` XOR `deadline`.
- `duration` values are ISO-8601 W/D/H/M/S: no calendar units, and at least
  one component. A `Timer.duration` also carries a bound, so `entryInstant +
  duration` stays in the four-digit-year window. `compile.ts::validateDurations`
  enforces this at PUBLISH, on arming totality (compile).
- `pinnedVersion` present iff `versionBinding === "pinned"`; `contractRef`
  present for a latest-at-spawn subprocess reference.
- A process referenced as a subprocess has a `contract`. In a contracted
  process, every terminal step has an `outcome` in `contract.outcomes`. An
  `outcome` appears only on a terminal step. Every declared outcome is
  bound by some terminal step (`definition.ts:1115-1119`).
- `inputMapping` keys are in the child contract's `inputFields`.
- A step declares a `subprocess` spec iff its `type` is `"subprocess"`, and a
  subprocess step's paths are all-automatic. The step is a wait-state: a manual
  path would let an actor advance the parent while the child still runs. All
  three are Zod refinements in `definition.ts`'s `step` superRefine, beside the
  path-trigger checks.
- A published body must not reach its own `processId` through subprocess
  references. Publish rejects a direct self-reference and any longer chain a
  new version would close. The comparison uses process ids and ignores
  version. A `process.start` chain is exempt, since it is fire-and-forget
  rather than a wait-state reference. The `publishBody` check for this is
  `validateSubprocessCycle`; see `process-contract.md`.
- See `process-contract.md`'s Extensibility section for the seven
  DB-resolving publish checks. A data source's `valueFromField` must resolve
  to a scalar field of the publishing process's own catalog
  (`checkInstanceQueryValueFromField`, `src/engine/definitions.ts:224-240`).
- `unmappableStep` present iff `onUnmappable === "route-to-step"`. Migration
  maps reference only valid ids.
- `migrationSpec.fieldMap` is injective. Two sources targeting one field
  collapse under the snapshot remap. The last write wins, in an unspecified
  order. Registration fails instead of letting the migration silently
  produce a data-dependent result. This is a Zod refinement on
  `migrationSpec` in `definition.ts`.
- Migration plan checks, including the transform CEL check, run once, at
  plan registration (`src/engine/migration.ts:85-107`, `MigrationPlanError`).
  Publish itself runs none of them.
- Every `LocalizedText` value needs a non-empty entry for
  `ProcessBody.baseLocale`; other locales stay optional per entry. The rule
  covers the process's own label and description, and each step's label and
  description. It also covers each field's label and description. Nested
  group fields count too, along with each option's label, each view tab's
  label, and `ViewNote.text`. `processBody`'s superRefine checks all of it,
  and both `authoredProcessBody` and `publishedProcessBody` inherit that
  check (`definition.ts:1004-1093`).
- Every CEL Expression parses and type-checks against the field catalog.
  `src/cel/check.ts::validateProcessBody` enforces this, reached through
  `src/validate.ts::validateReferences`. It runs there instead of in
  `definition.ts`, since only that path holds the CEL library. See
  `process-contract.md`'s Expressions section for which CEL namespaces each
  site can read.
- Every checked CEL Expression also stays under a structural bound. It
  holds at most 2,000 AST nodes and a parse depth of at most 64. It nests at
  most two comprehension macros (`all`, `exists`, `exists_one`, `map`,
  `filter`). `validateProcessBody` enforces this too, at the same site as
  the type check. It reports a violation as a located CEL finding.
- `now()`, `timestamp()` and `duration()` fail at every checked CEL site
  with the message "time function not allowed" (`src/cel/check.ts:161`,
  `:315`).
- A timer `deadline` must infer to `string` (`check.ts:260-269`).
- No action anywhere in the body carries a `type` with the reserved `core.`
  prefix. The compile pass checks this on both compile branches
  (`compile.ts::checkReservedActionPrefix`). The cancel-sink id/key/outcome
  checks stay a Zod refinement in `authoredProcessBody`. A compiled body
  legitimately carries all three, so generalizing them would reject every
  compiled body on sight.
- The authored body has no key the definition contract does not declare.
  This applies at any depth: process, contract, field, data source,
  workflow, step, path, action, timer, view entry, and validation. It
  includes fields nested inside a group. The compile pass checks this
  (`compile.ts::checkUnknownKeys`). The read path, `processBody.parse`,
  keeps stripping unchanged, so `definitionHash` stays reproducible.
- Every `FieldValidation.pattern` compiles as a JavaScript `RegExp`. Its
  source also stays under the declared length bound. The compile pass
  checks this (`compile.ts::checkPatterns`) at two call sites: once over the
  field catalog, and once over every `ViewField.validation.pattern`
  (`checkViewFieldPatterns`). A step's own validation override carries the
  same risk (compile).
- A `ViewField` declaring `validationMode` without `validation`, or a
  `validation` with no key set, fails to parse. Both are Zod refinements on
  `viewField` itself (schema).
- `SubprocessSpec.outputMapping` keys, and `ProcessContract.inputFields`/
  `outputFields`, resolve against the process's own recursive field set.
  The compile pass checks this (`compile.ts::checkIdResolution`) (compile).
  The sibling `Action.output` check lives in the `processBody` superRefine
  instead.
- A `technical` field is never `type: "group"`. A `ViewField` naming a
  technical field declares neither `required` nor `readonly`. The compile
  pass checks both (`compile.ts::checkTechnicalFields`) (compile).
- A `redactable` field is never `type: "group"`. The compile pass checks
  this (`compile.ts::checkRedactableFields`) (compile).
- `FieldDef.key` matches `/^[a-z_][a-z0-9_]*$/`, the grammar a CEL
  identifier `data.<key>` needs. The compile pass checks this
  (`compile.ts::checkFieldKeyFormat`). `Step.key` and `Path.key` stay
  format-free. Nothing reads them as identifiers.
- A field's `format` and `control` are pairs its own `type` admits, and a
  literal `default` matches the declared `format`. The compile pass checks
  this (`compile.ts::checkFieldFormatControl`, inside `checkFieldTree`)
  (compile).
- `Path.key` and `Path.label` are each a non-empty string after trimming,
  for either trigger kind. Both are Zod constraints on the shared `path`
  object in `definition.ts` (schema).
- The compile pass checks `FieldDef.columnMapping`'s bounds
  (`compile.ts::checkColumnMapping`, inside `checkFieldTree`) (compile).
- `FieldDef.key` and a `columnMapping` column key are the only `key`s under
  a declared length bound. `Plugin.type`, every `duration`, `pattern`, and
  `Expression.src` each carry their own length bound too. Every authored
  string reaches an interpreter or a registry lookup.
  `compile.ts::checkLengthBounds` checks the `Plugin.type`, `duration` and
  non-field-tree `Expression.src` sites. `checkPatterns` owns the `pattern`
  bound. The field-key length bound, and a field's own
  `validation.rule`/`default` expression length, sit in `checkFieldTree`
  instead (compile).
- A `view.fields[]` entry can declare literal `required: true` and literal
  `readonly: true` together. Then some source in the body must write that
  field before the participant submits the entry's own step. Six sources
  count as a writer. Two are body-wide: a `contract.inputFields` entry, and
  a literal catalog `default`. Four are step-scoped, and count only on a
  step that dominates the entry's own step. They are an action `output`, a
  `subprocess.outputMapping`, an editable `columnMapping` target, and
  another editable view entry.

  On the entry's own step, only its `onEntry` output counts. Its `onExit`,
  `onPath` and `onCancel` outputs fire after the submission gate. None of
  them count. An own-step timer's `onFire` output counts only when that
  timer declares a `targetPath` (`compile.ts:1046-1117`).

  The rule has four exceptions. A step that has no manual path is one. A
  group or technical field is another. A third is an entry that has no
  `ref`; a note has no field to write. The fourth is an entry declaring
  `visible: false`. The compile pass checks this
  (`compile.ts::checkUnsatisfiableRequiredReadonly`) (compile).
- A non-empty `view.fields[].group` names the `key` of a `type: "group"`
  field the body declares at any depth. The same view must also carry a
  `ref` entry for that group field. `form-ui` draws only the entries with
  no `group`, and a group field then draws the entries naming its key. An
  entry that fails either clause leaves the form with no message. An empty
  `group` reads as no group, matching the renderer. The rule reaches a note
  entry too.

  A third clause binds a field entry, one carrying a `ref`, both ways. Its
  `group` must repeat the catalog's own parent group, the way
  `process-contract.md` describes. An absent or empty `group` there fails
  to publish exactly as a wrong one does. This closes a hole. A
  hand-authored body could otherwise move a grouped field to the form's
  root while its catalog entry stays grouped. The same rule reaches a
  nested group's own entry, checked against the outer group's key.

  A note is exempt from the third clause alone. The first two clauses still
  bind it, so its `group` may name any group field the same view carries. A
  group whose own `key` is empty is the one exception on the catalog side.
  Its children can name nothing, so they have no `group` either. Such a
  body already fails the field-key grammar before this rule ever runs. The
  compile pass checks all of it (`compile.ts::checkViewGroupReferences`)
  (compile).
- A view declaring `tabs` holds one hierarchy: tabs, then fields and
  groups, then a group's own members. Two tabs in one view never share a
  `key`, and every non-empty `tab` names a declared one. Once a view
  declares a tab, every entry outside a group must declare one too. An
  entry inside a group never declares its own tab. Instead, the group's own
  entry names the tab for the whole group. An untabbed view's entries must
  not declare `tab` either. All five are Zod refinements in `definition.ts`'s
  `view` superRefine. No body published before `tabs` and `tab` existed
  could violate one, so none can strand a pinned instance (schema). A
  `viewTab.key` must also be non-empty after trimming (`definition.ts:683`).
- A step whose `assignment.strategy.type === "org.group-members"` and whose
  `config.groupId` is a string must name a group id already present in the
  body's own `allowedGroups`. The compile pass checks this
  (`compile.ts::checkGroupReference`) (compile). Publish alone can compare
  the two lists. Only publish decides whether the strategy is even
  registered, so an authored body cannot state both lists consistently
  before then. A `groupId` that is absent or non-string falls to the
  assignment-registry config-schema check instead. The two checks never
  both flag one step.
- A step whose `assignment.strategy.type === "org.actor-from-field"` and
  whose `config.fieldId` is a string must name a field the body declares
  with `format: "person"`. The compile pass checks this
  (`compile.ts::checkActorFromFieldReference`), the direct sibling of the
  check above, placed for the same reason (compile). It resolves against
  the field tree (`collectFieldsDeep`), so a person field nested in a group
  satisfies it. A missing field and a wrongly-formatted one draw one
  message, since both mean the strategy has nothing valid to read. A
  `fieldId` that is absent or non-string falls to the assignment-registry
  config-schema check instead. The two checks never both flag one step.
