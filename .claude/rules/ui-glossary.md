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

| Term | Names | Lives in |
|---|---|---|
| canvas | the graph surface an author draws a process on | `canvas/CanvasView.tsx` |
| inspector | the `<aside>` beside the canvas | `EditScreen.tsx`, `.canvas-inspector` |
| inspector panel | one section inside the inspector | `panels/StepsPanel.tsx` and what it nests |
| edit rail | the creation palette: add a step, a path, an outcome | `canvas/EditRail.tsx` |
| checks rail | the validation issue list | `panels/ChecksRail.tsx` |
| dock | the collapsible strip below the canvas columns | `dock/EditorDock.tsx` |
| panels screen | the routed screen holding the four process-wide views | `screens/PanelsScreen.tsx` |
| field matrix | the grid of every field against every step, on the panels screen and in the dock | `panels/FieldMatrixPanel.tsx` |
| player | the step-form preview an author drives | `screens/PlayerScreen.tsx` |
| JSON surface | the raw definition view | `panels/JsonView.tsx` |

**rail** alone names nothing. Two rails exist and they sit on opposite sides of
the canvas. Say *edit rail* or *checks rail*, every time.

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
