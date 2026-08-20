## Context

The field catalog's editor is the last developer-shaped part of the
studio's panels screen. In `FieldCatalogPanel.tsx`, one field's whole
editor stacks under one scroll. Key, label, description, type, options
and data source all sit in it. The column mapping, validation, issue
list and developer view do too. The type picker speaks raw contract
names.

Nothing on the screen answers the questions an author asks. What does
the field look like? Where do its values come from? How does it behave?

`tmp/Field Catalog Redesign/` is a Claude Design template. It is
direction, not a 1:1 plan. It organizes that editor into Field / Values
/ Rules tabs. It adds a friendly type picker and a per-field
translation list. A live preview, a reverse usage list and a state
footer join them.

The template is not a spec. It shows concepts the definition contract
does not carry. "Long text" has no type, and a field-level condition
has no contract home. This change keeps those out. It realizes what the
contract already backs.

What the current code already provides:

- Stage 42's list-and-detail rail (`panels-list-and-detail`). It brings
  per-entity issue marks, selection in component state, a recursive
  group editor and `field-row-<id>` anchors.
- The full options / dataSource / column mapping section
  (`columnMappingLogic.ts`), with stale-column handling.
- `FieldValidationEditor`, `IssueList` and the developer view
  (`PluginEnvelopeEditor`).
- `collectUsedLocales`, `localeGapCount` and
  `missingTranslationWarning` in `draft/localized-text.ts`. The
  draft-scoped content-locale switcher sits beside them with its
  add-locale input.
- Draft persistence with optimistic concurrency. `draftSaveLogic.ts`
  carries the revision and the reload-only conflict resolution.
- form-ui's `FieldForm`, which renders `ResolvedViewField` wire shapes.
  The studio Player already drives it.
- `FieldDef.default` (`Literal | Expression`) parses and type-checks in
  the contract. No runtime code applies it. `resolveFields`
  (`src/runtime/api.ts`) fills a field's value from `instance.data`
  alone. No `ResolvedViewField` carries a `default` key, and
  `createProcessInstance` starts an instance's `data` from `opts.data
  ?? {}`. This change does not add an editor for it.

## Goals / Non-Goals

Goals:

- Organize the field editor into Field / Values / Rules tabs, with the
  field's checks rendered once, above the tabs.
- List the ten base field types under friendly names with notes. The
  picker writes the raw `baseFieldType` value unchanged.
- Report each field's translation status per used locale.
- Preview the field through form-ui, read-only. An author sees what a
  participant gets.
- List the places that use the field. Navigate to the canvas with the
  step selected.
- Give "Only ask this when" a studio-side home, as a third
  condition-builder site. It writes through the existing view-override
  site.
- Keep every new piece of logic pure and tested.

Non-Goals:

- No default-value editor. `FieldDef.default` parses and type-checks.
  No runtime code applies it. `resolveFields`
  (`src/runtime/api.ts`) fills a field's value from `instance.data`
  alone. `ResolvedViewField` carries no `default` key. Building an
  editor before the engine reads it would ship UI with no visible
  effect. That gap and its trigger live in `docs/decisions.md`.
- No new field type. "Long text" stays out. The contract's ten types
  are the picker's whole list. A future multiline type is a separate
  definition-contract change.
- No field-level condition in the definition. `FieldDef` gains no
  `visible` or `when` key. The engine and the runtime stay untouched.
<!-- antislop: allow synonym-rotation -->
<!-- Why: the header bar's Discard control drops every unsaved change.
     The field editor's Remove control (Decision 1) drops one entity.
     Two separate controls, each keeping its own name. -->
- No new state footer. `ProcessHeaderBar` already mounts above the
  panels screen. It already shows the draft's revision, its dirty
  state and the `⋮` Save/Discard/Publish menu. This change shows that
  state nowhere new, and persists nothing a second way.
- No reorder, duplicate or filter controls for fields. Stage 42 kept
  them out, and this change does not bring them back.
- No data-list administration. The "Cost centres · 42 entries" rows
  already come from `useDataLists`.
- No change to the definition contract, the engine, the runtime API or
  the HTTP wrapper. Nothing serialized changes shape.

## Decisions

### 1. Three tabs, Field / Values / Rules, with the checks above them

The editor's controls split by what an author changes. The Field tab
holds identity. The Values tab holds the provenance of values. The
Rules tab holds behavior.

`IssueList` renders once, above the tab set, rather than inside a tab.
A field's issue must stay visible whatever tab is open. Splitting it
into "the checks" across two tabs would let an issue hide behind the
Field tab while the author sat on Rules.

`studio-checks-rail` names this placement. Its "The rail adds a
consolidated view" requirement lists where `IssueList` sits per entity,
and reads "They also sit in a field's validation editor". The
validation editor moves into the Rules tab, so that sentence stops
holding. That capability gains a delta for it.

The Field tab holds the key, the label, the description, the type
picker and the translation status. It also holds a group field's
children, the developer view, the preview, the usage list and the
"Remove field" control. The Values tab holds the options, the data
source and the column mapping. The Rules tab holds the condition and
`FieldValidationEditor`'s validation rules.

The active tab is component state per selected field, the shape the
screen's selection already takes. Reloading or selecting another field
resets to the Field tab.

All three tab panels stay mounted, and the two inactive ones carry
`hidden`. This is the rule the panels screen's four views already take,
and it holds here for the same reason. Three controls in this editor
hold input the draft does not carry yet. `PluginEnvelopeEditor` keeps
`configText` in component state, so a half-typed config sits there
until it parses. `RuleInput` and `ConditionInput` each keep an
incomplete builder row, which `toCel` omits on purpose. Unmounting a
tab panel would drop all three. `hidden` also takes the panel out of
the accessibility tree, which is what Decision 9's pattern asks for.

The tab set belongs to the selected top-level field alone.
`FieldCatalogPanel`'s `FieldRow` is recursive today — a group field
renders its own children through the same `FieldRow`, and each of
those, restructured wholesale, would carry a nested tablist. `FieldRow`
therefore splits. A tabbed outer editor wraps the selected top-level
field: its own component state holds the active tab. A group field's
children render inside that editor's Field tab through the existing
flat, recursive row — unchanged, and carrying no tab set of their own.
One `tablist` exists per open editor, never one per nested field.

A group field's children stay inside the Field tab, recursively, under
the design's "Fields inside this group", through that flat row. The
rail's existing "Open" behavior stays the way into a child. It selects
the parent group and scrolls the child into view.

The child's own row sits inside the Field tab alone, not a section
rendered outside every tab. Where a click names a child of the group
already open, and the author sits on Values or Rules, the selection
itself does not change — so nothing else would reset the active tab.
The rail's navigation therefore also switches the editor to the Field
tab before it scrolls, the one case where a rail click both selects
and switches.

### 2. Friendly type names over the ten contract types

The picker shows ten entries. Each entry carries a friendly name and a
short note. The names are Text, Number, Choice, Multiple choice and
Yes/no. Date, Date and time, File, Reference and Group follow. The
mapping is display-layer. One entry stands for each `baseFieldType`
value.

A pure `FIELD_TYPE_LABELS: Record<BaseFieldType, { name: string; note:
string }>` carries it. It follows the exhaustive-record pattern
`JS_TYPE` (`src/schema/definition.ts`) already uses over the same
enum, rather than two parallel lookup functions. A test covers every
enum member exactly once. The picker writes the raw value. The
definition serializes unchanged. The custom plugin envelope keeps its
existing entry.

"Long text" is deliberately absent. The contract has no multiline
type, and the template is direction, not a contract proposal. The
deferral lives in `docs/decisions.md` with its trigger. A real need
for a multiline textarea whose rendered behavior differs from
`string` would unblock it.

The field matrix's row headers (`studio-app` § Row headers name the
field and its type) keep the raw `type` string. This change does not
extend the friendly name there. That is deliberate. The matrix is a
dense grid an author scans against the engine's own vocabulary, and
only the rail and the Field tab move to the friendly name.

### 3. "Only ask this when" writes through the view-override site, as a third condition-builder site

The condition row reads the `visible` overrides of every step view
whose `fields` reference the field. The views are the single source of
truth. The field carries nothing.

`ViewField.visible` is `boolean | Expression` (`definition.ts:451`).
The row speaks expressions alone, so it classifies every referencing
view first. A view holds an expression, a literal boolean, or no key
at all. The row shows one condition when every referencing view holds
the same expression source. It shows the divergence state when those
sources differ, and it names the differing steps. It shows the
divergence state as well when any referencing view holds a literal,
and names that step: a literal `visible: false` is a deliberate hide,
and replacing one without a word would lose it. When no step view
references the field, the row shows disabled, with a note that no step
asks for it yet. There is nothing to read a condition from or write
one to.

The row writes the same override to every referencing view. It names
the write before it happens: "This replaces the condition on 2 steps".
Where a referencing view holds a literal, the notice names that step
too. Clearing the condition takes the same path: it names its scope
before it happens, on the same terms a write does, and then drops the
`visible` key from every referencing view rather than leaving it
unmentioned.

`applyVisibleOverride(draft, fieldId, visible)` returns no patch object
of its own; the draft store's only writer is
`mutate(recipe: (draft: Draft) => void)` (`draft/store.tsx`), which
clones the whole draft and lets the recipe walk it. The function is
therefore itself the recipe body: it walks `draft.workflow.steps`,
finds each view whose `fields` references `fieldId`, and sets or
deletes that entry's `visible` key in place. Its test (task 1.8) calls
it against a plain object and asserts the mutated shape, exactly as
`setFlag`'s own tests do, rather than asserting a returned patch list.

The divergence state takes its own line, above the builder rows. The
builder already carries the CEL readout below its rows, with the
toggle beside it. A third element on the row itself would crowd all
three.

The row mounts `ConditionInput` with no `stepId`, so the operand
picker offers the draft's catalog and the curated instance and actor
context alone. It withholds `child.*`. `src/cel/check.ts` admits
`child` in a `visible` override only on a subprocess step (`child =
s.type === "subprocess"`, line 224), and this row writes one
expression across steps of mixed type. A `child.outcome` reference
would be a publish error on every task step in that set. An existing
`child`-based `visible` still reads back as a raw row, which
`studio-condition-builder` already states for a fragment the builder
cannot represent.

The row reuses the condition-builder's row style over CEL, including
its CEL-surface toggle. It keeps `toggleVariant: "link"`, the
presentation every view-override site takes. The "Developer view"
disclosure stays the path-guard site's alone.
`studio-condition-builder`'s Purpose describes
"the studio's two condition sites". This makes a third, so that spec
gains a delta alongside `studio-app`. The builder reads an existing
expression back by parsing it. A hand-written guard and a built one
stay one artifact. The row shows the CEL it produces. The divergence
state derives from the views, never from storage.

This follows the user's decision for the template's field-level
condition. It stays studio-side, with no contract change. The
divergence risk is real. The interaction with the field matrix's own
CEL handling is real, and the row is a one-way door for a future
contract-level condition. Risks states all three below.

### 4. Translation status per field, languages stay draft-scoped

Each field lists its used locales. The list marks the base locale.
Each other locale carries its missing count. The locale set comes from
`collectUsedLocales`, the same walk the content-locale switcher reads.

The count needs a new function. `localeGapCount(draft, locale)`
(`draft/localized-text.ts:78`) walks the whole draft through the
module-private `forEachLocalizedEntry`: the process label and
description, every step, every field, every option. Called once per
field it answers with one number for the entire draft, so every field
on the screen would print the same figure. `fieldLocaleGaps(field,
locale, baseLocale)` walks one field instead: its `label`, its
`description` and each `options[].label`. It applies
`localeGapCount`'s own two rules, so the two agree. An entry with no
base-locale value does not count, since `runValidation` already
reports it. The base locale never counts against itself.

A group field's own `label` and `description` are the whole walk. Its
children carry their own translation-status list on their own rail
entry — `flattenRailFields` already gives a group's children their own
top-level or one-indent row — so `fieldLocaleGaps` does not recurse
into `field.fields`. Recursing would count a child's gap twice: once on
the child's own row, once folded into the parent's.

The template's "fr (missing)" badge is the existing warning. It shows
as a list row rather than beside the input alone. Adding a language
stays in the content-locale switcher. The draft owns the locale set,
and a field does not invent one.

### 5. The preview renders through form-ui, read-only

"How it will look" synthesizes a single-field view.
`previewViewFields(field: DraftField, contentLocale: string, baseLocale:
string)`, in a new `draft/field-preview.ts`, returns two things:
`fields`, the `ResolvedViewField[]`, and `values`, the `Record<string,
unknown>` keyed by field id. Both go to `FieldForm`, together with a
no-op `onChange`. It takes no `dataSources` argument: a
dataSource-backed field's empty-options rule (below) reads
`field.dataSource` alone, the field's own reference, and never
resolves it against the draft's declared data sources.

The second half is load-bearing. `FieldForm` reads a control's value
from `values[def.id]` (`packages/form-ui/src/FieldForm.tsx:135`), never
from `ResolvedViewField.value`. That key is declared in `types.ts` and
read nowhere in the renderer. A synthesis that filled the entry alone
would draw every control empty.

For a leaf field the synthesis returns one entry. For a group field it
returns the group's own entry, carrying no `group` key, plus one entry
per descendant at every depth, each carrying its parent's synthesized
key as `group`. `FieldForm` starts from `fields.filter((f) => !f.group)`
and then recurses into the entries whose `group` matches the parent's
key (`FieldForm.tsx:63,116`). Child entries alone would leave the
filter empty and draw nothing. This is form-ui's own grouping, not
`FieldDef.fields` nesting.

A sample value per type fills `values`, with the options resolved onto
each entry's own `options` key, which is what `FieldForm` renders. A
dataSource-backed choice previews with no option list. The draft
carries none: the engine resolves a data source's options at runtime
through `resolveDataSourceOptions` (`src/runtime/api.ts`), and the
Values tab's own fetch, `GET /admin/data-lists`, returns a list's
`columns` (`StudioDataList`), never its row values — a different route,
`GET /admin/data-lists/:listKey`, holds those, and no studio client
call reaches it. The preview names the field as resolving at runtime
rather than drawing an empty control with no explanation.

A synthesized `WireField.key` falls back to the field's own id where the
draft's `key` is still empty. A freshly created group is seeded with an
empty key (`FieldCatalogPanel.tsx:91`), and `FieldForm` reads an empty
`group` string as no parent at all (`fields.filter((f) => !f.group)`,
`FieldForm.tsx:63`); without the fallback every child of an unnamed
group would draw twice, once nested and once beside the group. A field
missing an `id` yields no preview at all; the panel shows its ordinary
empty state instead, the same as an id-less field the rail already
skips (`flattenRailFields`). A missing `type` falls back to `string`, a
missing `label` to an empty `LocalizedText`.

`FieldForm` renders under the panel's own content locale, the same
locale the label and description inputs beside it already show. That
differs from the Player's own call, which passes `"en"` for both
`locale` and `baseLocale` since the Player has no content-locale
concept of its own; the field catalog does, through `useDraft()`'s
`contentLocale`, so the preview reads it rather than hardcoding a
locale a multi-language draft would render wrong.

Every synthesized entry's `readonly` is forced `true`, and the preview's
container carries the `inert` attribute. The sample inputs then take no
keyboard or pointer interaction, and no screen reader announces them as
live controls. That is the native replacement for a disclosure landmark
that a bespoke pattern would otherwise have to invent. The field matrix
already uses "inert" for a column whose step declares no view, so task
8.5 registers both readings in the glossary.

<!-- antislop: allow synonym-rotation -->
<!-- Why: "render" is form-ui's verb for drawing a form; "preview" is
     the pane's name; "show" is UI copy in a button. Three words, three
     jobs, no rotation. -->
form-ui is the renderer the participant gets. The preview cannot drift
from the form it previews. No new renderer ships. The studio's
existing Player screen already consumes the same export. Submission
controls do not render in the preview.

### 6. "Used in" shares its walk with the condition row

The usage list walks the draft's steps and their views. It matches
each `viewField.ref` against the field. It reports the step and the
modes the reference sets: `visible`, `required`, `readonly`. The same
walk feeds the condition row. The two cannot disagree about which
steps reference the field.

"Show on the canvas" navigates through the route's new step target.
Decision 7 covers that route.

### 7. The route carries a step target, re-read on every change

The `edit` route gains an optional `stepId`. It takes the shape
`panel` and `formStepId` already take. `routePath` renders it as its
own path segment, `/processes/:id/edit/step/:stepId`. `matchRoute`
ranks it after the `formStepId` and `panel` matches. That is the same
precedence order those two already establish over each other.

`EditorArea` stays mounted across a trip to the panels screen and
back, the same routing decision `panels-list-and-detail` made. A
mount-only read of `stepId` would therefore never fire on a "Show on
the canvas" navigation. It would fire only on the initial page load.

`EditorArea` instead reads `stepId` in a `useEffect` keyed on its
value. A change sets the canvas selection to that step. The effect
then replaces the current history entry with the plain `edit` route,
rather than pushing a new one.

The shell's own `go` (`shell/routing.ts`) calls `history.pushState`
unconditionally today. It has no replace mode. This change adds one.

A push here would leave `/edit/step/:stepId` as a live history entry.
The effect would re-trigger on every Back. Back from the canvas would
land on that entry, re-select the step, and push `/edit` again. Back
could then never reach the panels screen the author came from.

A replace avoids that. The history entry the "Show on the canvas"
navigation created is the one that gets overwritten. Back returns to
the panels screen, exactly as it does today for `formStepId` and
`panel`.

"Show on the canvas" navigates `{ name: "edit", processId, stepId }`.
An unknown step id falls back to the canvas's normal empty selection.
That is the same rule an unknown view already follows.

### 8. The rail rows name a field by its label

A rail row's primary text is the field's resolved label in the content
locale. The key sits on a secondary mono line. The rail already shows
a fallback for an unnamed field. Today that fallback triggers on an
empty `key`, since the key was the primary text.

It moves to trigger on an empty resolved label instead, since the
label is the primary text now. A field can carry a key and no label.
That field needs the fallback exactly as an empty-key field did
before. The friendly type and the issue mark complete the row.

The key stays visible because the engine matches it exactly. It just
stops being the row's name.

### 9. The tab set matches the area's existing tab pattern

The editor's tabs use the pattern the canvas's Structure/JSON surface
toggle already establishes. A `tablist` groups `role="tab"` buttons.
The active tab carries `aria-selected`. Each tab is its own stop in
the tab order. Enter or Space activates it. The hidden panels leave
the accessibility tree.

The stricter WAI-ARIA arrow-rotation pattern is deliberately not
required. Two tab patterns in one area would be a bigger
inconsistency than one shared simple pattern. The surface toggle is
not in this change's scope.

This change codifies the pattern as a new `spa-accessibility`
requirement. The repo's specs carried no tab pattern before.

### 10. Strings follow the catalog's existing rule

The new section headings, tab names, type names and notes go under
`fieldCatalog.*` and `panelsScreen.*` keys in `catalogs/studio.ts`. The
raw contract vocabulary the area already renders as bare field labels
stays literal. That means `key`, `label`, `type` and `description`, per
the stage-42 note in `docs/roadmap-history.md`.

## Risks / Trade-offs

- **Condition sync divergence.** Writing one override into every
  referencing view can diverge. That happens when an author later
  edits one step's view directly. The row derives its state from the
  views, so it shows the divergence instead of hiding it. The write
  names its scope. A per-step view editor remains the escape hatch.
- **A CEL-authored `visible` locks the matrix row.** `studio-app`'s
  live-cell requirement already replaces a CEL flag's checkbox with a
  read-only stamp there. It also excludes that flag from bulk toggles.
  Writing a condition through this change's row therefore freezes
  every referencing step's `visible` cell in the matrix to a stamp.
  That is the existing rule working as designed, not a new one. An
  author moving from the field catalog to the matrix meets it for the
  first time here.
- **The condition row is a one-way door.** A later change might declare
  a contract-level condition on `FieldDef` itself. Every field this row
  has already fanned out across N views would then need a migration
  back to one place. The escape hatch above, a per-step view editor,
  is also the undo path. Nothing here blocks that migration, but
  nothing automates it either.
- **Preview fidelity.** The preview synthesizes sample values, and its
  one gap is deliberate. A dataSource-backed choice shows no options at
  all, named as resolving at runtime. The draft carries none, and the
  studio client has no call that fetches a data list's row values
  (Decision 5). The preview is explicitly a sketch ("How it will
  look"). Reusing form-ui keeps the rendering faithful for every other
  type, where the sample value is the only synthesized part.
- **Scope size.** One screen, but ten decisions. The tasks land in
  phases: logic first, then tabs, then route. Each phase stays
  reviewable on its own.
- **Catalog growth.** The studio catalog grows by a few dozen keys.
  The stage-42 rule keeps raw contract vocabulary out of the catalog.
  That limits the growth and keeps the machine words literal.
- **ROADMAP stage 44 overlaps this editor.** Stage 44 ("Technical
  (system-only) field marker") is NOT STARTED. Its light direction
  would infer "technical" from `writtenFieldCounts`
  (`draft/view-flags.ts`), the same walk `fieldUsage` (this change's
  task 1.3) performs. A technical-field marker, if it lands later,
  most naturally reads on the Field tab. It would sit beside the key
  and the translation status this change adds there. Building it is
  not this change's job. Naming it here keeps the two from designing
  the same walk twice.
- **ROADMAP stage 43 overlaps the Rules tab.** Stage 43
  ("Step-level validation overrides") is ENGINE DONE, STUDIO UI NOT
  BUILT. The engine reads `ViewField.validation` and
  `ViewField.validationMode`, but no studio surface writes either;
  today an author writes them through the JSON view alone. The Rules
  tab this change adds already holds a field-scoped editor writing a
  per-step override, the condition row (Decision 3). A step-level
  validation-override editor is the same shape, on the Rules tab
  beside it. Building it is not this change's job. Naming it here
  keeps the two from designing the same fan-out twice.

## Migration Plan

None. This change touches no stored data and no serialized shape. The
definition contract, the engine, the runtime API and the HTTP wrapper
stay untouched. A draft's JSON and a published body serialize exactly
as before. Drafts live in the browser and persist through the existing
draft endpoint. No database migration, no backfill, no rehash.

## Open Questions

None. This design opened one: whether the divergence state and the CEL
toggle fit one row. Decision 3 answers it. The divergence state takes
its own line above the builder rows.
