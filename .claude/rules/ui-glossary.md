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
| header | the one fixed row atop every area, holding the register tab, the area nav and the account group | `Chrome.tsx`, `.shell-header` |
| register tab | the label naming the open area, at the header's left edge; full definition in `design-language.md` | `.shell-tab` |
| area nav | the open area's own navigation buttons, right of the register tab | passed into `Chrome` as its `nav` prop |
| account group | the identity span and the account menu trigger, right-aligned in the header | `.shell-account-group` |
| account menu | the popover the account group opens: profile, language, area switch, logout | `.shell-menu` |

The area switch lives inside the account menu, not as a persistent tab row.
The switcher filters the current area out of the actor's permitted set. An
actor permitted only one area gets an empty set from that filter. The
switcher then renders nothing, so that actor sees no trace of the other
three areas.

### The edit screen

A draft opens on this one screen, `EditScreen.tsx`. Top to bottom: the
screen nav, the header bar, then either the structure surface or the JSON
surface.

| Term | Names | Lives in |
|---|---|---|
| screen nav | the row above the header bar: Back to processes, Versions, Player | `.studio-header-nav` |
| header bar | the process-identity row: name, key, revision, dirty/saved state, the `⋮` menu | `panels/ProcessHeaderBar.tsx`, `.studio-header-bar` |
| surface toggle | the Structure/JSON switch, inside the header bar | `.studio-surface-toggle` |
| structure surface | the editing view: edit rail, canvas, inspector or checks rail, dock | `EditScreen.tsx`, `surface === "structure"` |
| JSON surface | the raw definition view, the structure surface's one alternative | `panels/JsonView.tsx` |

Both surfaces share the header bar and the surface toggle. Every other term
below belongs to the structure surface alone.

| Term | Names | Lives in |
|---|---|---|
| canvas | the graph surface an author draws a process on | `canvas/CanvasView.tsx` |
| edit rail | the column left of the canvas, holding the palette and the process links | `canvas/EditRail.tsx`, `.studio-rail` |
| palette | the edit rail's "Add to canvas" section: drag a Step, Subprocess or End onto the canvas | `.studio-palette-list` |
| process links | the edit rail's "Process" section: one row per panels-screen view, each with a count | `.studio-rail-row` |
| inspector | the `<aside>` beside the canvas, editing one selected step or path | `EditScreen.tsx`, `.canvas-inspector` |
| inspector panel | one section inside the inspector | `panels/StepsPanel.tsx` and what it nests |
| checks rail | the validation issue list, grouped by check | `panels/ChecksRail.tsx` |
| dock | the collapsible strip below the canvas columns | `dock/EditorDock.tsx` |
| dock tab | one of the dock's three views: Changes, Field matrix, Paths | `dock/EditorDock.tsx`, `DOCK_TABS` |
| player | the step-form preview an author drives | `screens/PlayerScreen.tsx` |

### The panels screen

The edit rail's process links route here, and so does a click on a field
group in the checks rail. Top to bottom: the panels screen header, then a
row of three columns. Those columns are the index rail, the open view, and
the checks rail.

| Term | Names | Lives in |
|---|---|---|
| panels screen | the routed screen holding the four process-wide views | `screens/PanelsScreen.tsx` |
| panels screen header | the top bar: Back to canvas, the open view's name, a save-with-draft note | `.studio-panels-screen-header` |
| index rail | the left column: one entry per view, with a count and an issue badge | `.studio-panels-rail` |
| rail sublist | the index rail's own entry list, under the fields or data sources view alone: one row per entity | `.studio-panels-rail-sublist` |
| open view | the center column: whichever of the four views is not `hidden` | `.studio-panels-screen-view` |
| field catalog | the open view that lists and edits the process's field definitions | `panels/FieldCatalogPanel.tsx` |
| data sources | the open view that lists and edits the process's data source definitions | `panels/DataSourcesPanel.tsx` |
| contract | the open view that edits the process's `ProcessContract`: input fields, output fields, outcomes | `panels/ContractPanel.tsx` |
| field matrix | the open view with the grid of every field against every step; also a dock tab | `panels/FieldMatrixPanel.tsx` |

All four views stay mounted at once; `hidden` shows one and hides the other
three. A view keeps its own edit state across a switch: a half-typed outcome
name, a selected field. Unmounting on every switch would lose that state.

**rail** names a class of component, not one component. A rail is a
fixed-width column beside a screen's main content, scrolled on its own. It
holds a register list, or a validation list. Three rails exist.

The edit rail sits left of the canvas. It holds the palette and the process
links. The checks rail holds the validation issue list. It sits right of the
canvas, or right of the open view on the panels screen. The index rail sits
left of the open view on the panels screen. It holds the view list.

**rail** alone names none of the three. Say *edit rail*, *checks rail* or
*index rail*, every time. The edit rail's own two sections are the palette
and process links, never "the process rail."

**panel** alone names nothing either. The inspector holds inspector panels.
`PanelsScreen` holds four views: the field catalog, data sources, the
contract, and the field matrix. The component name carries the word
`Panels`. The views are not inspector panels.

**dock** names the strip below the canvas columns, and nothing else. It is a
noun here. Several live specs still use "dock" as a verb for the collapsed
checks rail. The class `.studio-checks-rail-docked` carries that verb too.
Neither reading names the strip.

The checks rail renders in three places. It sits beside the canvas in full
until an author selects a step. The inspector then shows a second instance,
collapsed, at its bottom edge. The panels screen carries a third, in full. All
three are the checks rail.

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

## 3. Defined elsewhere

This file links. It does not repeat. A term defined twice drifts.

- Stamp, register row, register tab, measuring rule, field:
  `.claude/rules/design-language.md`.
- `id`, `key`, `label`, `definitionHash`, guard, outcome, trigger:
  `.claude/rules/process-contract.md`.
- Operator, surface, area, participant, process owner: `CLAUDE.md`.
