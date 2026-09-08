---
paths:
  - "packages/web/**"
  - "packages/form-ui/**"
---

# UI glossary: one word per thing

Each term below has one word. Never reach for a synonym. `CLAUDE.md` already
applies this rule to *operator* and *surface*. Antislop's `synonym-rotation`
check enforces it in prose.

Two audiences read this. A person pointing at the screen needs section 1. A
person naming what the screen shows needs section 2. The words differ. The
pairs that go wrong span both sections, so both live in one file.

## 1. Chrome: the parts of the screen

"Chrome" is the general UI term for an application's fixed frame. It names
the persistent controls around the content, not the content itself. A menu
bar, a toolbar, a scrollbar are chrome; the document inside them is not.
The term predates the Google Chrome browser. That browser took its name from
this term, because it deliberately shows almost none of it. In this
codebase, "chrome" names the one header every area shares.

### The shell

Every area's chrome is one component, `Chrome.tsx` in `src/shell/`. It wraps
whichever area is open and renders the same header row around it every time.

| Term | Names | Lives in |
|---|---|---|
| header | the one fixed row atop every area, holding the register tab, the area nav and the account group | `Chrome.tsx` |
| register tab | the label naming the open area, at the header's left edge; full definition in `design-language.md` | `Chrome.tsx` |
| area nav | the open area's own navigation buttons, right of the register tab | passed into `Chrome` as its `nav` prop |
| account group | the identity span and the account menu trigger, right-aligned in the header | `Chrome.tsx` |
| account menu | the popover the account group opens: profile, language, area switch, logout | `Chrome.tsx` |

The area switch lives inside the account menu, not as a persistent tab row.
The switcher filters the current area out of the actor's permitted set. An
actor permitted only one area gets an empty set from that filter. The
switcher then renders nothing, so that actor sees no trace of the other
three areas.

### The process surface

A draft opens on this one screen, `EditScreen.tsx`. Top to bottom: the screen
nav, the header bar, the tab row, then one tab body.

| Term | Names | Lives in |
|---|---|---|
| process surface | the one screen a draft opens on: the tab row and the body under it | `screens/EditScreen.tsx` |
| screen nav | the row above the header bar. It holds Back to processes and nothing else | `screens/EditScreen.tsx` |
| header bar | the process-identity row: name, key, revision, dirty/saved state, the `⋮` menu | `panels/ProcessHeaderBar.tsx` |
| tab row | the row of ten tabs over the body, with the overflow menu at its end | `panels/ProcessTabRow.tsx` |
| tab | one of the ten. The authoring order runs Canvas, Steps, Fields, Data sources, Paths, Forms, Field matrix, Contract, Changes and Checks | `routing.ts` |
| overflow menu | the tab row's own menu: the JSON surface, Versions and Player | `panels/ProcessTabRow.tsx` |
| structure surface | the ten tab bodies together, the JSON surface's one alternative | `EditScreen.tsx`, its `structureActive` prop |
| JSON surface | the raw definition view, the structure surface's one alternative | `panels/JsonView.tsx` |

The open tab stands in the address, at `/studio/processes/:id/edit/:tab`. All
ten bodies stay mounted at once, and `hidden` shows one. A body keeps its own
edit state across a switch: a half-typed outcome name, a selected field.
Unmounting on every switch would lose that state.

Checks, Save, Discard draft and Publish stand in the area nav, never on the
surface. The component `DraftNavControls.tsx` renders them into the element
`root.tsx` reserves there.

Every other term below belongs to one tab.

| Term | Names | Lives in |
|---|---|---|
| canvas | the graph surface an author draws a process on | `canvas/CanvasView.tsx` |
| palette | the "Add to canvas" list: drag a Step, Subprocess or End onto the canvas | `canvas/CanvasPalette.tsx` |
| steps rail | the Steps tab's left column: one numbered row per step, in reachability order | `panels/StepsRail.tsx` |
| step page | the Steps tab's wide right column, editing the one selected step | `panels/StepPage.tsx` |
| masthead | the step page's top zone. It holds the step number, the kind phrase, the name, the key, the description, and the issues no section claims | `panels/StepPage.tsx` |
| section | one subject group on the step page, standing open in one of two columns | `panels/sectionsFor.ts` |
| Developer view | the step page's disclosure over that step's raw JSON. It stands closed on open | `panels/StepPage.tsx` |
| entity rail | the Fields and Data sources tabs' own left column: one row per entity | `panels/EntityTabs.tsx` |
| field catalog | the Fields tab's editor over the process's field definitions | `panels/FieldCatalogPanel.tsx` |
| field tabs | the Field / Values / Rules tab set inside the field catalog's editor, for the one selected top-level field | `panels/FieldCatalogPanel.tsx`, `FieldEditor` |
| data sources | the Data sources tab's editor over the process's data source definitions | `panels/DataSourcesPanel.tsx` |
| contract | the Contract tab, editing the process's `ProcessContract`: input fields, output fields, outcomes | `panels/ContractPanel.tsx` |
| field matrix | the Field matrix tab's grid of every field against every step | `panels/FieldMatrixPanel.tsx`, `panels/FieldMatrixGrid.tsx` |
| changes | the Changes tab, listing the draft's difference against the base version | `panels/ChangesView.tsx` |
| paths | the Paths tab, listing every path in the process, one row each | `panels/PathsView.tsx`, `panels/pathRows.ts` |
| Forms tab | the tab holding one card per step that declares a view | `panels/FormsTab.tsx` |
| form card | one bordered plate on the Forms tab. It carries a kicker, a label, a count and a miniature | `panels/formCardRows.ts` |
| form preview | the form editor's right pane, mounting the renderer a participant meets | `panels/FormPreview.tsx` |
| checks rail | the validation issue list, grouped by check | `panels/ChecksRail.tsx` |

The tab row replaced the ribbon over the bench. Seven words went with it:
*ribbon*, *ribbon bar*, *bench*, *steps register*, *configuration pane*,
*section register* and *process links*. Say *tab row* for the row. Say *steps
rail* for the numbered column, and *step page* for the editor beside it. The
word *masthead* survives on the step page, and nowhere else.

The process surface replaced the panels screen too. Six words went with it:
*panels screen*, *panels screen header*, *index rail*, *open view*, *surface
toggle* and *rail sublist*. Say *tab* for one of the ten. Say *entity rail*
for the row list the Fields and Data sources tabs keep.

*Inspector* retired ahead of both, with the inspector column. The step page is
what succeeds it. Say *step page*.

**field tabs** names one thing only: the Field / Values / Rules set inside the
field catalog's own editor. It stands apart from the register tab, the shell's
own header label. It stands apart from a tab on the tab row as well. All three
are tab patterns, and each keeps its own name.

The step page carries no tab row of its own. Its two columns of open sections
take the place of one.

**inert** carries two readings here, both HTML terms used for their literal
meaning, not a rotated synonym for either. The field matrix stamps a step
column `data-inert` when that step declares no view: a state fact about the
column. Two preview containers carry the `inert` HTML attribute itself. Those
are the field catalog's, and the form editor's participant preview. That is a
behavior. Neither takes keyboard or pointer interaction, and a screen reader
skips both.

The field matrix splits into two components: a bare grid and a wrapper. The
bare grid, `FieldMatrixGrid`, holds the headers, the cells and the keyboard
model. The wrapper, `FieldMatrixPanel`, adds the toolbar, the legend and the
bulk badges. Only the wrapper mounts the bare grid.

### The player

The player drives one real instance through the Runtime API Layer, the same
one a participant's Task screen drives. What an author previews here is what
a participant gets. Top to bottom: instance access, then a two-pane layout
once an instance is open.

| Term | Names | Lives in |
|---|---|---|
| player | the routed screen that drives one instance for preview | `screens/PlayerScreen.tsx` |
| instance access | the `<fieldset>` above the panes: create a new instance, or open one by id | `PlayerScreen.tsx` |
| form pane | the left pane: the status line, the step form, the claim controls, the path buttons | `PlayerScreen.tsx` |
| step form | the field-by-field renderer both the player and the app area's Task screen mount | `FieldForm`, `packages/form-ui` |
| path buttons | the manual-path submit controls below the step form | `PathButtons`, `packages/form-ui` |
| record pane | the right pane: the open instance's merged transition/event history | `PlayerScreen.tsx` |

The record pane shows the same merged record the admin area's instance
detail shows, from one shared function: `describeRecordElement`.

The form preview mounts that same `FieldForm`. So the form editor, the player
and the Task screen all draw one renderer.

**rail** names a class of component, not one component. A rail is a
fixed-width column beside a screen's main content, scrolled on its own. It
holds a register list, or a validation list. Three rails exist.

The checks rail holds the validation issue list. The steps rail holds the
numbered step list, on the Steps tab. The entity rail holds the row list, on
the Fields tab and on the Data sources tab.

**rail** alone names none of the three. Say *checks rail*, *steps rail* or
*entity rail*, every time.

**panel** alone names nothing either. The step page hosts panel components,
one per section body.

**dock** names nothing here any more, as a verb or as a noun. Nothing docks.
The checks rail takes two forms instead. The Checks tab stands the full
grouped list. The area nav stands the one-line summary, with a state dot and a
count. Pressing it opens that tab.

## 2. Domain terms as the UI shows them

The JSON definition is the definition contract. Its words win in UI text, in
commit messages, and in conversation. A rendering layer may hold a different
word internally, and that word stays inside the layer.

| JSON term | The word we use | The layer's own word | Rule |
|---|---|---|---|
| Step | step | `node` (canvas geometry) | never *node* outside `canvas/` |
| Path | path | `edge` (canvas geometry) | never *edge* outside `canvas/` |
| Expression | CEL | `CelNode` (the parsed AST) | *CEL* names the source text |

`canvas/geometry.ts` measures rectangles and knows nothing about steps.
`NODE_WIDTH` is the honest name for a width. The canvas renders a step as a
node, one for one, and nothing else on the canvas is a node. That mapping is
why the code keeps its word and the UI keeps ours.

`CelNode` in `panels/shared/conditionLogic.ts` names the parsed CEL AST. It
carries the `Cel` prefix because `packages/web` compiles with `"DOM"` in `lib`,
so a bare `Node` shadows the global one.

**draft**, **version**, **definition** name three states of one artifact. A
draft is mutable, and an author edits it freely. Publishing freezes a draft
into a version, and a version never changes again. The definition is the
serialized JSON body itself, which both a draft and a version carry. Never use
one term for another.

The `instance-form-drafts` capability introduces an unrelated concept: a
participant's saved, unsubmitted step-form input on a running instance. Its
full, exclusive term is **form draft** (or **instance form draft**), never
bare "draft". Bare "draft" always means the studio's process draft above.

## 3. Defined elsewhere

This file links. It does not repeat. A term defined twice drifts.

- Stamp, register row, register tab, measuring rule, field:
  `.claude/rules/design-language.md`.
- `id`, `key`, `label`, `definitionHash`, guard, outcome, trigger:
  `.claude/rules/process-contract.md`.
- Operator, surface, area, participant, process owner: `CLAUDE.md`.
