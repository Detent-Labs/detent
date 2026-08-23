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
- All `id` references resolve within the process; `initialStep` exists.
- Ids unique per kind; slugs/keys are not used as references anywhere.
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
- `unmappableStep` present iff `onUnmappable === "route-to-step"`; migration
  maps reference valid ids.
- Every `LocalizedText` value anywhere in the body (process, steps, fields
  incl. nested `group` fields, field options) has a non-empty entry for
  `ProcessBody.baseLocale`; other locales are optional per entry.
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
  step, path, action, timer, view field, validation. It includes fields
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
- `FieldDef.key` matches `/^[a-z_][a-z0-9_]*$/` — the CEL identifier grammar
  `data.<key>` requires. The compile pass checks this
  (`compile.ts::checkFieldKeyFormat`). `Step.key`/`Path.key` stay
  unconstrained: nothing reads them as identifiers.
- `key`, `Plugin.type`, every `duration`, `pattern` and `Expression.src` stay
  under a declared length bound — every authored string that reaches an
  interpreter or a registry lookup. Checked in `compile.ts::checkLengthBounds`,
  plus the pattern bound in `checkPatterns`.
- A `view.fields[]` entry declaring literal `required: true` and literal
  `readonly: true` names a field some source in the body writes (an action
  `output`, a `subprocess.outputMapping`, a `columnMapping` target, a
  `contract.inputFields` entry, a literal catalog `default`, or an editable
  entry elsewhere in the body), except on a step carrying no manual path, on a
  group or technical field, on a ref-less entry, or on an entry declaring
  `visible: false`. The compile pass checks this
  (`compile.ts::checkUnsatisfiableRequiredReadonly`), not a Zod refinement on
  `viewField` — see `definition-contract`'s placement rule.
