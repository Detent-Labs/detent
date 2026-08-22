## Context

See `proposal.md` for the motivation. This design covers how four
pieces fit into the existing code. They are the Field tab's disclosure
structure, the Values/Rules zone sectioning, the Default-value editor,
and the `createProcessInstance` defaults-seeding behavior.

`FieldCatalogPanel.tsx`'s `FieldEditor` already holds three mounted tab
panels behind `hidden`. That is `field-catalog-redesign`'s decision 1.
This change restructures what sits inside each panel. It keeps the tab
set, the mount-all/`hidden`-toggle rule, and the recursive
`SubFieldRow` for a group's children.

The Field-tab reorganization and the new Default-value zone are UI
work under `packages/web`. Per this repo's UI-work convention,
tasks.md 2.0 gates that work on `/frontend-design:frontend-design` and
a `.claude/rules/design-language.md` check.

`src/runtime/api.ts::createProcessInstance` already builds a
`submitted` object from `opts.data`. It already validates that object
through `validateSubmissionData` before creation.
`src/cel/check.ts::collect`'s `walkFields` already type-checks a
`default` Expression at publish time. It does so in guard scope
(`result: false, child: false`). `src/schema/definition.ts::leafFields`
already filters a field tree down to its non-`group` leaves. That is
the same filter CEL's `data` namespace needs. `dataSchema` and
`fieldKeyById` already share that same helper.

## Goals / Non-Goals

**Goals:**

- Reorganize the Field tab into always-visible identity, plus two
  collapsed disclosures. No new component beyond `<details>` and a
  small badge.
- Add zone labels and rules to Values and Rules. Match the design
  language's existing section-rule convention.
- Add a Default-value editor. Write `FieldDef.default` through the
  literal-or-CEL shape the schema already declares.
- Make `createProcessInstance` read that value at creation. Reuse the
  existing validation pipeline, rather than invent a parallel one.

**Non-Goals:**

- No change to `FieldDef.default`'s schema shape. It already parses as
  `Literal | Expression`.
- No change to `src/cel/check.ts`'s type-checking of a `default`
  Expression. It already covers this correctly.
- No compile-time check of a `Literal` default's type, options or
  constraints. The existing runtime validation path already catches a
  bad literal default. See Decision 3 for why that is enough.
- No re-evaluation of a default after creation. It seeds initial data
  once. A later transition never re-applies it.
- No new `InstanceEvent` kind. See Decision 3.
- No Default-value control on `SubFieldRow`, the flat recursive editor
  a group's own children use. A child field's own `default` stays
  authorable only through the JSON view.
- The `SubFieldRow` component already carries no control for several
  other `FieldDef` keys the top-level `FieldEditor` edits. This change
  does not widen it there. The JSON view is this repo's own escape
  hatch, for whatever a no-code/low-code builder does not cover.

## Decisions

### 1. The Field tab: `<details>` disclosures, not new component state

The preview and the usage list each move inside a native `<details>`.
No new open/closed state lives in `FieldEditor`'s own component state.
The browser already tracks that state as part of the DOM. It does so
for as long as the element stays mounted. The panel component
`FieldEditor` already stays mounted across a tab switch, which is
decision 1 of `field-catalog-redesign`'s own design. An open disclosure
therefore survives a trip to Values or Rules and back, for free.

Translation status drops its list block. It becomes a badge beside the
label input. `fieldLocaleGaps` already returns the count that badge
needs.

This is not only a render-site move. The shipped Field tab lists a
gap count for every locale in `usedLocales`
(`FieldCatalogPanel.tsx:550`). It makes one `fieldLocaleGaps` call per
locale. The badge names only the current `contentLocale`'s missing
count. An author editing a field in `de` loses per-field visibility
into `fr` or `es` gaps. Switching `contentLocale` becomes the only way
to see them again.

The content-locale switcher shows a per-locale gap count instead (see
`studio-app`'s "The content-locale switcher shows a per-locale
translation-gap count" requirement). That count is a Draft-wide
aggregate, not a per-field one. It offsets this narrowing only
partially. See Risks / Trade-offs below.

Remove field already sits last in the Field tab's JSX
(`FieldCatalogPanel.tsx:624-626`, the final child after the usage
list). This change wraps it in a rule and reduces its emphasis; it
does not move it. This needs one new wrapper class,
`.field-tab-remove`, for the rule and the button's reduced emphasis.

Alternative considered: one expand-all/collapse-all control above both
disclosures. Rejected. Two disclosures need no shared toggle. A third
control would compete with the identity fields for attention, the
exact defect this change fixes.

### 2. Values/Rules zones: a heading and a rule, no new abstraction

Each zone is a `<div className="field-zone">`: a heading, then
content. A rule separates each zone from its neighbour. That rule uses
the same structural-rule class the design language already defines for
"between major sections." No new component exists here.
`showsColumnMapping`'s existing conditional keeps deciding whether the
Column mapping zone renders at all.

A `.field-zone` heading REPLACES the section's own existing inline
heading. It does not stack above one. Three sections already carry
their own:

- The column-mapping block's own `<p
  className="studio-column-mapping-heading">{t("columnMapping.heading")}</p>`
  (`FieldCatalogPanel.tsx:256` and `:681`) already reads "Column
  mapping." That is the exact string the new zone heading uses.
  Wrapping the block in a zone drops that paragraph; the zone heading
  carries the label instead.
- `FieldValidationEditor`'s own `<summary>{t("fieldValidation.legend")}
  ({carried.length})</summary>` (`FieldValidationEditor.tsx:49-51`)
  stays, but loses its label text. The zone heading states "Rules" (or
  equivalent). The `<summary>` keeps only the count, or the zone
  heading itself becomes the `<details>` disclosure's summary. Either
  way, no second toggle renders beneath a heading that already names
  the section.
- The options/data-source block's own
  `<legend>{t("fieldCatalog.optionsLegend")}</legend>`
  (`FieldCatalogPanel.tsx:199` and `:631`) loses that legend, or the
  implementer repurposes it, once its `<fieldset>` sits inside a
  "Where values come from" zone.

An implementer wrapping a section in `.field-zone` drops or repurposes
that section's own inline heading in the same change. Shipping both
prints a duplicated label, the defect this reorganization exists to
fix on the Field tab's own translation-status list.

### 3. The Default-value editor: reuse validation, not a new drop path

The zone offers a literal input, matching the field's own
`baseFieldType`. A `string` field gets a text control. A `number`
field gets a number control. A `boolean` field gets a checkbox. A
`date` or `datetime` field gets a date control. `FieldForm` already
uses this same per-type mapping to pick a control.

A `select` field gets a `<select>` bound to its own static `options`.
That is the same list the Values tab's own options block already
edits. A `multiselect` field gets the multi-value equivalent. When the
field is `dataSource`-bound instead of `options`-bound, either control
offers no option. The draft carries no resolved rows for one. The CEL
toggle still works there, the same carve-out the preview requirement
already states for a `dataSource`-backed field.

A `reference` or `file` field has no author-typeable literal shape.
The whole Default-value zone shows disabled for those two types. A
note states the type accepts no default here. This mirrors the "Only
ask this when" row's own disabled state for a field no step view
references yet.

A `group` field gets the same disabled treatment, for a different
reason. Proposal.md and this design's runtime section both already
state that a group's own `default` is never read. A group carries no
slot of its own in the flat `data` payload. The fallback sentence
below ("Every other type gets a link-styled toggle") would otherwise
cover `group` too.

That would let an author set a literal or CEL default the runtime
silently ignores. That is the exact defect this change exists to
close for `FieldDef.default` in general. The Default-value zone
therefore disables for `group` the same way it disables for
`reference`/`file`. It states that a group's own default is never
read.

Every other type keeps a link-styled toggle that switches the zone to
a raw CEL textarea. It mirrors `ConditionInput`'s own `toggleVariant:
"link"` presentation, without mounting `ConditionInput` itself. The
textarea holds unparsed text in component state until it type-checks,
the same pattern `PluginEnvelopeEditor` already uses for `configText`.

`FieldDef.default`'s `Literal` schema already includes
`z.array(literal)` (`src/schema/definition.ts:177`). So a
`multiselect` array default is schema-legal, with no schema change
needed.

At runtime, `createProcessInstance` initializes a working object. It
starts as a copy of `opts.data ?? {}`, mirroring the existing code's
`submitted` variable. It then walks `leafFields(body.fields)` in
array order and checks each field that carries a `default`. It fills
that field's slot in the working object only when the slot is still
absent. That happens when `opts.data` never set it, or when an
earlier field's default has not filled it yet.

For each such field, a `Literal` default writes directly. An
`Expression` default evaluates through one call to the already-exported
`src/cel/eval.ts::evalFieldMap`. That call passes a single-entry map
holding just that field: `evalFieldMap({ [fieldId]: field.default },
buildGuardContext(body, stub, actor))`.

`evalFieldMap` already implements the two-step evaluate-then-coerce,
total-per-entry behavior this design wants. Internally it calls the
file-private `evalMapTotal`. That function evaluates the expression,
dropping the entry with reason `"expression-raised"` on a throw. It
then pipes a successful result through the file-private `coerceJson`,
dropping it with reason `"value-out-of-range"` on a throw, and returns
`{ patch, drops }`. This design needs no new export from
`src/cel/eval.ts`.

The `stub` argument is the same preliminary `Instance`-shaped object
described below. The defaulting loop sets its `.data` to the working
object as filled so far, before each field's call. A later field's
default can therefore read an earlier field's already-resolved value.

`fieldId in patch` marks success: the value already passed through
`coerceJson`, so the loop takes `patch[fieldId]` directly into
`working`.

<!-- antislop: allow sentence-length -->
<!-- The linter merges the next sentence into the one above it, since
that one ends on a code span; see
antislop-sentence-split-breaks-on-code-span.md. Read alone, this
sentence is 12 words. -->
`fieldId`'s absence from `patch` leaves that field's slot unfilled
instead, the same treatment any other raising default gets. `drops`
names which of the two raises caused the absence.

It is the same coercion `evalMapTotal` already runs, inside
`evalFieldMap`, on every other value-producing CEL result on its way
into `data`. The same coercion covers `evalTransforms` for migrations
and `evalOutput` for `Action.output`. `cel-js` models a CEL `int` as a
JS `bigint`. `typeMatches` (`src/schema/definition.ts`) checks
`typeof value === expected`, so an uncoerced bigint fails that check
for a `number` field. That includes a plain integer-literal default
like `{ lang: "cel", src: "5" }`.

`buildGuardContext` supplies `instance: { id, status, transitionSeq,
currentStepId }`, matching `INSTANCE_SCHEMA` exactly. It also re-keys
`data` from field id to field `key`, the same remap
`data.subtotal`-style references need everywhere else.

`createProcessInstance` mints the id first. It sets the stub's
non-data fields: `currentStepId`, `transitionSeq`, and `status`. The
stub is already built this way today. This change inserts the
defaulting loop between building the working object and calling
`validateSubmissionData`.

This is the same stub `createProcessInstance`'s own `opts.data`
validation step already builds a few lines later, to run
`validateSubmissionData` against. The defaulting loop and the
validation step share one stub, not two hand-built context shapes.

This working object becomes `submitted`. It already carries every
value `opts.data` set. The defaulting loop only fills the gaps
`opts.data` left open. An explicit submission therefore always
overrides a default, with no later overlay step.

That object is
exactly what `validateSubmissionData` already checks before creation
completes. A default that resolves to a bad
value throws `SubmissionValidationError`, the same as a bad `opts.data`
value does. "Bad" here means a wrong type, an invalid option, or a
failing constraint or `validation.rule`.

This reuses the SAME code path a submitted value takes. It is
deliberately not a parallel one. A default prefills data, before an
instance exists. A participant's own submission earns a correctness
guarantee. A default deserves the same one. No runtime code has to
duplicate `validateSubmissionData`'s rules a second time.

The only new "drop, don't fail" behavior is the raising-Expression
case. That stays deliberate. It mirrors the rule
`.claude/rules/process-contract.md` already states: a raising guard
means no match, never a throw. Every other Expression outside a strict
validation boundary already gets that same total-CEL treatment.

This case earns no new `InstanceEvent` kind, unlike
`mapping.entry-dropped`. A default is authoring-time data, under the
author's own control, not a runtime delivery outcome an operator needs
to audit. A bad default gets caught the way any other broken authoring
choice does. It throws on the first thing that exercises it, here the
first `createProcessInstance` call. The author fixes the draft and
republishes.

A field's default can fill a slot outside the initial step's resolved
view. The function `resolveFields` returns no entry for such a field.
The `booking_status` field in `examples/expense-approval.json` is one
example.

The `book` step reads it only through its two automatic paths'
guards. It writes it only through its onEntry action's output
mapping. `book` declares no `view` key at all. The `booked` (terminal)
step and the `booking_error` step both view-reference it readonly. The
initial `capture` step's view references it nowhere.

A field's default can also fill a slot the initial step's view DOES
resolve, but resolves readonly. That happens through a step-level
`readonly` override, or through `FieldDef.technical: true`. The
compile pass bars a technical field from being `type: "group"`
(`compile.ts::checkTechnicalFields`). It also bars a view from
declaring `required` or `readonly` on one. It does not bar the field
from declaring `default`.

A technical field's default is therefore reachable. It resolves a
`ResolvedViewField` marked readonly, rather than resolving to nothing.
That is a different case from the off-view one above, and it earns a
different rule below.

The base spec's own `runtime-api` requirement, "The initial step's
overrides govern a seeded creation," governs an on-view field. It
judges `opts.data` against the initial step's effective validation.
The off-view and readonly-default exemptions below add to that
requirement, not contradict it.

They cover two cases that requirement's text does not reach. One is a
field the initial step's view never resolves at all. The other is a
field it resolves but marks readonly.

The off-view field cannot pass through `validateSubmissionData`'s
per-key loop unmodified. That loop rejects any key absent from
`editableFieldIds(resolved)` as `unknown-field`
(`src/runtime/api.ts:716-724`). It also rejects a key that resolves
readonly as `readonly-field`, through the same branch. The defaulting
loop therefore records the set of field ids it filled. It keeps that
set separate from ids `opts.data` supplied directly.
`createProcessInstance` threads that set into `validateSubmissionData`.

For a member of that set with no `ResolvedViewField` at all, the
off-view case, `validateSubmissionData` skips the
`unknown-field`/`readonly-field` branch entirely. It validates the
value directly against the FieldDef's own declared `type`
(`typeMatches`), its own static `options`, and its own `validation`
constraints. It reads `options` from the FieldDef itself, not from a
view-resolved `ResolvedViewField`, since an off-view field has none.
None of these three checks route through `resolveFields`.

This is the on-view readonly case, including technical. For a member
of that set that does resolve a `ResolvedViewField`,
`validateSubmissionData` takes that field's ordinary `rf`-based path
instead. That is the same path an editable field on that step already
takes. It checks the value against `rf.field.type`, the view-resolved
`rf.options`, and `effectiveValidation(rf.field,
viewFieldsByRef.get(fieldId))`.

That is the step's own overridden or merged validation, exactly as it
would be for an editable field. The only branch it skips is the
`readonly-field` rejection itself. Every other check still applies,
including a step-level bound that narrows or widens the catalog's own.

This mirrors `applyColumnMapping`'s existing precedent
(`src/runtime/api.ts`). A mapped target already takes a write "even
when the view marks it readonly." The view bounds what a participant
may change, not what the engine itself may write. A catalog default
writing its own declared slot is the same kind of engine write. It
earns the same carve-out.

A field that is both a `columnMapping` target and carries its own
`default` loses that default once the mapping resolves. The mapping
runs after the defaulting loop, inside the same `createProcessInstance`
call. Its `Object.assign(submitted, mapped.writes)` overwrites
whatever slot the defaulting loop filled, with no check for an
existing value. This is deliberate. The mapping is the more specific,
author-declared source for that slot at creation. That is the same
reason it already wins over a readonly view.

The carve-out runs through the field's own step-effective validation,
not a parallel catalog-only check. An on-view field carrying a default
and a step-level constraint override still gets judged by the bound
the step declares. It never falls back to a bound the step overrode.

The off-view case's own option check has a further gap, for a
`dataSource`-bound field. Its static `options` is empty, and
`validateSubmissionData`'s off-view branch reads only the FieldDef's
own declared `options`, never a step's `ResolvedViewField`.

Its option-membership check is therefore skipped outright. The reason
is not that resolution is impossible. `resolveDataSourceOptions`
(`src/runtime/api.ts`) needs only the field's own `dataSource` def,
`registry`, and `db`. It needs no step context at all.
`createProcessInstance` already has all three in scope.

The real reason is scope. This change reuses
`validateSubmissionData`'s existing per-step resolution path for
default-seeding. It does not add a second, step-independent
data-source resolution call for this one case. This is the same
treatment `optionValuesValid` already gives any field carrying an
empty options list. Only its type check and its `validation`
constraints still gate an off-view `dataSource`-bound field's default.
`validateSubmissionData` accepts one regardless of
its value.

Alternative considered: validate a `Literal` default's type against
`typeMatches` (`src/schema/definition.ts`) at publish time, inside
`compile.ts`. That would stop a bad literal default from ever reaching
a running instance. Rejected for this change. `opts.data` itself
carries no publish-time check today, only a runtime one. Giving
`default` a stricter guarantee than `opts.data` gets would be an
asymmetry with no current justification.

The helper `typeMatches` is already exported and already reused twice,
in `src/runtime/api.ts` and `src/engine/outbox.ts`. Nothing here blocks
a later change from adding a third caller there, inside `compile.ts`.
That would make sense if a bad literal default turns out common enough
in practice to catch earlier.

Alternative considered: mount `ConditionInput` itself for the CEL
toggle, since it already builds a CEL-authoring UI. Rejected.
`ConditionInput` is guard-shaped. Its rows build a boolean expression,
and its "no match" semantics are specific to a condition. A default is
a value of the field's own type, not a boolean. A plain
literal-or-raw-CEL toggle fits that better than a repurposed boolean
builder would.

### 4. Default evaluation order: catalog order, not a dependency graph

Fields with a default evaluate in the field catalog's own array order,
depth-first through `leafFields`. A later field's `Expression` default
can read an earlier field's already-resolved value through `data`. A
submission or an earlier default may have set that value. Either way
it is visible.

An earlier field's default cannot read a later field's value. That
field has not resolved yet. CEL raises on the missing key. The earlier
field's slot stays unfilled, the same as any other raising default.

Alternative considered: a dependency graph, resolving defaults in
reference order rather than catalog order. Rejected as unnecessary
complexity for a first version. Catalog order is simple and
deterministic. It also matches how an author already thinks about
field order elsewhere in the studio. The rail and the Field tab's own
list both already work this way.

An author who needs field B's default to see field A's resolved value
already controls that. They place A first in the catalog.

### 5. Default-seeding scope: `createProcessInstance` only

Default-seeding lands only inside `createProcessInstance`
(`src/runtime/api.ts`), the function this change modifies. It does not
extend to `src/engine/seeded-create.ts::createSeededInstance`, the
shared creation path underneath two other callers. Both
`core.spawnSubprocess` (`subprocess.ts`) and the `process.start`
handler (`process-start.ts`) call `createSeededInstance` instead, and
neither one ever calls `createProcessInstance`.

This is deliberate, not an oversight. Both of `createSeededInstance`'s
callers already carry their own author-declared seed. A subprocess
spawn seeds the child from the parent's `inputMapping`. A
`process.start` chain seeds the started instance from its own
`config.inputMapping`.

Each mapping already resolves against the calling instance's own
`data`/`instance`/`actor` context, entry by entry. It gets the same
total-CEL treatment Decision 3 gives a default: a raise leaves the
entry unwritten.

Layering catalog defaults on top would mean a second,
differently-scoped seed source competing with the first over the same
field. That would need an ordering rule this change does not need for
its own goal. The goal is closing the gap for a top-level instance
created with no seed. It also covers one seeded only by a
participant's own `opts.data`.

A subprocess-spawned or chain-started instance is therefore not
covered by this change. Its catalog defaults stay exactly as inert for
those two paths as `FieldDef.default` is everywhere today. Task 1.11
in `tasks.md` locks this in with a regression test. That way a later
implementer does not discover the asymmetry only as a bug report. A
later change can extend `createSeededInstance` to seed catalog
defaults the same way, if that asymmetry proves wrong in practice.
Nothing here forecloses it.

## Risks / Trade-offs

- **An already-published body's dormant `default` goes live the moment
  this ships.** The `FieldDef.default` key already parses, type-checks
  and serializes today. Per `docs/decisions.md`, no runtime code
  applies it. For example, `examples/expense-approval.json`'s
  `booking_status` field (`"default": "pending"`) already sets one, and
  `examples/purchase-requisition.json`'s currency field
  (`"default": "CHF"`) sets one too.

  This is a one-way door. The instant this change ships, an
  already-published body's set `default` starts seeding. That happens
  for every instance created afterward. No republish, no version bump,
  and no announcement triggers it. This is deliberate: a `default` was
  always meant to apply, once read support existed. It is still worth
  stating plainly, rather than as a discovered side effect.

  Task 1.12 verifies the effect on purpose for
  `expense-approval.json`. A freshly created instance seeds
  `booking_status` to `"pending"`. The "book" step still parks as a
  wait-state, since `"pending"` matches neither its `booked` nor its
  `failed` guard.
- **A reordered catalog can change which defaults see which values**.
  Moving a field earlier or later in the catalog changes what its
  `Expression` default can read. This stays implicit. Nothing in the
  UI shows it.

  Mitigation: the studio catalog is not commonly reordered once a
  process is in use. A reordered default that then fails validation
  raises `SubmissionValidationError` loudly, at the next instance
  creation. It does not corrupt data silently.
- **A default that fails validation blocks every future instance
  creation, not just the affected field**. The check function
  `validateSubmissionData` throws on the first failing field it finds,
  per its existing behavior. An author who ships a broken default
  breaks instance creation entirely, until they fix it. This is the
  intended trade-off from Decision 3. It fails loud, at the first
  point that exercises the value. It never silently drops a bad
  default into instance data.
- **Disclosure state is per-DOM-node, not draft-scoped.** Reloading the
  browser resets an open disclosure to closed. The draft carries no
  `open` value for it. This matches every other ephemeral UI state on
  this screen. The active tab itself already resets on reload, per
  `field-catalog-redesign`'s own design.
- **The translation-status badge narrows to one locale.** The shipped
  Field tab lists a gap count for every locale in `usedLocales`. The
  badge names only the active `contentLocale`'s count. An author no
  longer sees, per field, whether an OTHER used locale has a gap
  without switching `contentLocale` first. The content-locale
  switcher's Draft-wide per-locale count is the offsetting signal. It
  is coarser: it names a locale's total gap count, not which field it
  belongs to. This is a deliberate trade-off for the badge's one-line
  footprint, not an oversight.
- **Scope grew during brainstorming.** A visual reorganization gained a
  runtime behavior, default-value application. A "Default value"
  section with nothing behind it would otherwise sit inert. The
  runtime piece stays deliberately minimal: one seeding step that
  reuses existing validation. No new schema. No new compile-time
  check. No new `InstanceEvent` kind.

## Migration Plan

No SERIALIZED-SHAPE migration. This change touches no stored data and
no serialized shape. `FieldDef.default` already exists in every
published body that sets it. This change only starts reading a key
that was already there. A draft's JSON and a published body serialize
exactly as before. No database migration, no backfill, no rehash.

This says nothing about BEHAVIOR, which does change for an
already-published body: see the Risks section's first bullet. No
migration step closes that gap, because none is possible. The value
was always going to start applying once this change shipped. There is
no version to bump and no rehash to run, for a key the body already
carried unchanged.

## Open Questions

None. Every question this design raised has a decision above:
evaluation order, validation reuse, event recording, and disclosure
state persistence.
