---
paths:
  - "packages/web/**"
  - "packages/form-ui/**"
  - "openspec/**"
  - "docs/browser-checks.md"
  - "DESIGN.md"
---

# UI glossary: one word per thing

Each term below has one word. Never reach for a synonym. `CLAUDE.md` and
`PRODUCT.md` already apply this rule to *operator* and *surface*. Antislop's
`synonym-rotation` check enforces it in prose.

## 1. Chrome: the parts of the screen

In this codebase, "chrome" names the one header every area shares.

### The shell

Every area's chrome is one component, `Chrome.tsx` in `src/shell/`. It wraps
whichever area is open and renders the same header around it every time.

| Term | Names | Lives in |
|---|---|---|
| header | the top of every area, holding the register tab, the area nav and the account group. It wraps where its items run out of room | `Chrome.tsx` |
| register tab | the label naming the open area, at the header's left edge; full definition in `design-language.md` | `Chrome.tsx` |
| area nav | the open area's own navigation buttons, right of the register tab | passed into `Chrome` as its `nav` prop |
| account group | the identity span and the account menu trigger, right-aligned in the header | `Chrome.tsx` |
| account menu | the popover the account group opens: profile, language, area switch, logout | `Chrome.tsx` |

The area switch lives inside the account menu; `design-language.md`'s
register-tab entry states how it filters the actor's own permitted set.

### The process surface

A draft opens on this one screen, `EditScreen.tsx`. Top to bottom: the header
bar, the tab row, then one tab body.

| Term | Names | Lives in |
|---|---|---|
| process surface | the one screen a draft opens on: the tab row and the body under it | `screens/EditScreen.tsx` |
| header bar | the process-identity row: back control, name, state line, Test, Publish and the `⋮` menu. Save stands beside the state line while the draft is dirty | `panels/ProcessHeaderBar.tsx` |
| state line | the header bar's one status text: Unsaved changes or Saved, then the published version | `panels/ProcessHeaderBar.tsx` (`DraftStateLine`) |
| restore notice | the notice under the header bar that offers a stored copy of unsaved work after a session ended. It stands over the form editor too | `panels/RestoreNotice.tsx` |
| tab row | the row of six tabs over the body | `panels/ProcessTabRow.tsx` |
| edge fade | the fade at an edge of the tab row with more tabs past it | `panels/ProcessTabRow.tsx` |
| tab | one of the six. The authoring order runs Map, Steps, Fields, Forms, Checks and Settings | `routing.ts` |
| sub-row | the strip of a tab's views under the tab row. The Fields tab's reads Catalog and Where fields appear. The Settings tab's reads Process, Where values come from, What it takes in and gives back, and Access | `panels/SubRow.tsx` |
| structure surface | the six tab bodies together, the JSON surface's one alternative | `EditScreen.tsx`; gated by `structureActive`, a prop of `panels/ProcessHeaderBar.tsx` |
| JSON surface | the raw definition view, the structure surface's one alternative | `panels/JsonView.tsx` |

The open tab stands in the address, at `/studio/processes/:id/edit/:tab`. An
open view adds one segment, as in `/edit/fields/matrix`. All six bodies stay
mounted at once, and `hidden` shows one. A body keeps its own
half-typed state across a switch: an outcome name, a selected field.
Unmounting on every switch would lose that state.

The form editor opens inside the origin tab's panel, under the tab row. The
origin tab's own body stays mounted beside it, hidden. The route carries the
step's id as `formStepId`, and a press on any tab leaves the editor.

A hidden field matrix draws the last draft it drew while visible. The commit
that reveals the view draws the live draft. Typing on the Catalog view
therefore costs the hidden matrix nothing.

Test, Publish and the `⋮` trigger trail the header bar. Save stands beside the
state line, and only while the draft is dirty. `panels/ProcessHeaderBar.tsx`
renders all of them. The *draft toolbar* retired: `DraftToolbar.tsx` no longer
mounts, and only its `useDraftToolbarActions` hook survives.

The `⋮` menu holds two groups. Views carries the JSON surface, Versions and
Player. Draft carries Discard draft.

The content-locale switcher stands on the Settings tab's Process view, under
its label "Language you are editing". The header bar names a locale only when
the content locale differs from the base language. It then prints an "Editing"
note, which opens that Process view. The switcher shows *content locale*, the
authored text. The account menu's own switcher shows *language*, the UI locale.

The studio's area nav has no draft control. Checks stands as a tab, on the
tab row below. Its own count carries the severity color, and no other
control duplicates it.

Every other term below belongs to one tab.

| Term | Names | Lives in |
|---|---|---|
| Map tab | the tab holding the canvas bar and the canvas. Say *Map tab* for the tab and *canvas* for the graph surface on it | `screens/EditScreen.tsx` |
| canvas | the graph surface an author draws a process on | `canvas/CanvasView.tsx` |
| canvas bar | the row between the tab row and canvas: add controls, a reachability report, and selection controls | `canvas/CanvasBar.tsx` |
| steps rail | the Steps tab's left column: one numbered row per step, in the draft's own order | `panels/StepsRail.tsx` |
| grip | the steps rail's own drag control, trailing each row | `panels/StepsRail.tsx` (`GripVertical`) |
| step page | the Steps tab's wide right column, open on the one selected step | `panels/StepPage.tsx` |
| masthead | the step page's top zone. It holds the step number, the kind phrase, the name, the description, and the issues no section claims | `panels/StepPage.tsx` |
| section | one subject group on the step page, one of six, open one at a time | `panels/sectionsFor.ts` |
| section header | the button that opens and closes one section. It carries the section's name, a one-line summary and a mark | `panels/StepPage.tsx` |
| Developer view | a disclosure over raw JSON, CEL or machine values. The step page's, in More, holds the step's key and JSON, and each way-out row's holds that way out's key. The change-list row, each process list row, the form editor and a condition or rule input hold one. A field's own editor keeps its key there, under "What this field asks". The Settings tab's Process view and the Publish dialog hold the key, the process id and the revision. Every Developer view stands closed on open, bar a condition input's, which opens by itself over unparseable source. | `panels/StepPage.tsx`, `panels/PathsPanel.tsx`, `panels/ChangeList.tsx`, `panels/ProcessSettingsPanel.tsx`, `panels/ProcessHeaderBar.tsx`, `screens/ProcessesScreen.tsx`, `panels/FieldCatalogPanel.tsx`, `screens/FormEditorScreen.tsx`, `panels/shared/ConditionInput.tsx`, `panels/shared/RuleInput.tsx` |
| sentence | the line that reads a condition in words. It stands under a condition input's rows and under a Read by row's place. On the canvas, a way out's sentence sits on its line, as "Otherwise" does | `panels/shared/ConditionInput.tsx`, `panels/shared/conditionLogic.ts::readerSentence`, `canvas/mapWords.ts` |
| Read by zone | the field editor's effect-half zone under "Used in". It lists each expression that reads the field, by place and sentence | `panels/FieldCatalogPanel.tsx`, rows from `panels/readByRows.ts` |
| rewrite line | the line under a field's label that says how many conditions a key change updated | `panels/FieldCatalogPanel.tsx` |
| Fields views | the Fields tab's sub-row and its two bodies, Catalog and Where fields appear | `panels/FieldsTabViews.tsx` |
| entity rail | the left column of the Catalog and Where values come from views: one row per entity | `panels/EntityTabs.tsx` |
| field catalog | the Catalog view's editor over the process's field definitions | `panels/FieldCatalogPanel.tsx` |
| field matrix | the Fields tab's Where fields appear view: a grid of every field against every step | `panels/FieldMatrixPanel.tsx`, `panels/FieldMatrixGrid.tsx` |
| Settings tab | the tab holding the process-wide settings in four views. The Process view holds the base language, the content-locale switcher and the add-locale control. It also holds the cancellable setting, the collaboration defaults and a Developer view. After a publish, that Developer view adds the version and the definition hash | `panels/SettingsTab.tsx`, `panels/ProcessSettingsPanel.tsx` |
| data sources | the Settings tab's Where values come from view, over the process's data source definitions | `panels/DataSourcesPanel.tsx` inside `panels/SettingsTab.tsx` |
| contract | the Settings tab's What it takes in and gives back view, over the `ProcessContract`: input fields, output fields, outcomes | `panels/ContractPanel.tsx` inside `panels/SettingsTab.tsx` |
| change list | the folded register of entity rows the Publish dialog and the Versions screen both draw over `describeChanges`'s output | `panels/ChangeList.tsx`, `panels/PublishChanges.tsx` |
| Forms tab | the tab holding one card per step that declares a view, with a legend above the cards | `panels/FormsTab.tsx` |
| form card | one bordered plate on the Forms tab. It carries a kicker, a heading, a count and a miniature | `panels/FormsTab.tsx` (`FormCard`), row data in `panels/formCardRows.ts` |
| form editor | the page a step's own form opens on. It stands inside the origin tab's panel, under the tab row: Steps, or Forms after a Forms card. It holds the breadcrumb, the palette, the form canvas and the form preview | `screens/FormEditorScreen.tsx`, mounted by `screens/EditScreen.tsx` |
| breadcrumb | the three-crumb path at the form editor's top: the origin tab, the step, then Form. The first two crumbs are buttons and the last is the current page | `screens/FormEditorScreen.tsx` |
| form canvas | the drop target where an author arranges a step's view entries into groups and tabs. Bare *canvas* names only the graph surface above | `screens/FormEditorScreen.tsx` |
| form preview | the form editor's trailing pane, under the canvas at 80rem and below, mounting the renderer a participant meets | `panels/FormPreview.tsx` |
| form tab strip | the row of a step form's own tabs, above the form canvas | `panels/FormTabStrip.tsx` |
| checks rail | the validation issue list, grouped by check | `panels/ChecksRail.tsx` |
| Access view | the Settings tab's view over the process's Developer, Owner and Reader access lists | `panels/AccessPanel.tsx` inside `panels/SettingsTab.tsx` |

The word *section* also names a form's group on the Forms tab's legend. The
form editor's palette says *Group*. The table's row names the step page's
subject group.

*issue* is the word for one validation result, whatever check raised it
(`draft/issues.ts`'s `EditorIssue`, rendered by `panels/shared/IssueList.tsx`).

The word **Developer** names three things here. `PRODUCT.md` calls the
studio's own audience "process author", the word to use instead. A
process's own `developer` access role is the Access view's top standing,
beside `owner` and `reader`. The Developer view above is a third, unrelated
meaning.

<!-- antislop: allow synonym-rotation -->
<!-- Why: "configuration pane" is a retired word listed for the record; "Settings" names the tab. -->
The tab row replaced the ribbon over the bench. Seven words went with it: *ribbon*, *ribbon bar*, *bench*, *steps register*, *configuration pane*,
*section register* and *process links*. Say *tab row* for the row. Say *steps
rail* for the numbered column, and *step page* for the editor beside it. The
word *masthead* survives on the step page, and nowhere else.

The header bar lost its screen nav row. The word *screen nav* retired with
it. Say *back control* for what that row held: the header bar's first control.

The process surface replaced the panels screen too. Six words went with it:
*panels screen*, *panels screen header*, *index rail*, *open view*, *surface
toggle* and *rail sublist*. Say *tab* for one of the six. Say *entity rail*
for the row list the Catalog view and the Where values come from view keep.

The six-tab row retired six tabs: Paths, Field matrix, Data sources,
Contract, Changes and Access. The Canvas tab became the Map tab. A step's
paths have one home, the step page's Ways out section. The field matrix, the data sources, the contract and the
access lists stand as views. The change list stands in the Publish dialog and
on the Versions screen.

*Inspector* retired ahead of both, with the inspector column. The step page is
what succeeds it. Say *step page*.

*Palette* left this table with the canvas bar row above. The word survives on
the form editor's own field list (`screens/FormEditorScreen.tsx`), whose
`draft/mintField.ts` export is still named `PALETTE_FIELD_KINDS`. Say
*palette* only for that list.

The participant meets the form tab strip inside `FieldForm`, drawn from the
same `view.tabs`, and it takes the same name. A code identifier stays out of
scope for this glossary's rules. In `packages/form-ui/src/FieldForm.tsx:399`,
`styles.tabRow` names a compiled style, code the rule above never reaches.

The step page has no tab row of its own. Its accordion of sections takes the
place of one.

**inert** carries two readings here, both HTML terms used for their literal
meaning rather than a rotated synonym for either. The field matrix stamps a step
column `data-inert` when that step declares no view: a state fact about the
column. Two preview containers carry the `inert` HTML attribute itself. Those
are the field catalog's, and the form editor's participant preview. That is a
behavior. Neither takes keyboard or pointer interaction, and a screen reader
skips both.

The field matrix splits into two components: a bare grid and a wrapper. The
bare grid, `FieldMatrixGrid`, holds the headers, the cells, the keyboard
model and the bulk badges. The wrapper, `FieldMatrixPanel`, adds the toolbar
and the legend, and turns the badges on through the grid's `showBulkBadges`
prop (`FieldMatrixGrid.tsx:485`, `:505`). Only the wrapper mounts the bare
grid.

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

### Outside the process surface

Five studio screens sit outside the process surface: the process list
(`screens/ProcessesScreen.tsx`), Versions (`screens/VersionsScreen.tsx`), the
migration plan screen (`screens/MigrationPlanScreen.tsx`), Tools
(`screens/ToolsScreen.tsx`) and Templates (`screens/TemplatesScreen.tsx`).
The app area's Task screen (`app/screens/TaskScreen.tsx`) is the
participant's one-task screen. The admin area's instance detail
(`admin/screens/InstanceScreen.tsx`) is the operator's one-instance screen.

The profile page (`shell/ProfilePage.tsx`) belongs to no area. The account
menu opens it regardless of which area is active.

**rail** names a class of component rather than one component. A rail is a
column that holds a register list or a validation list, and scrolls on its
own. The steps rail and the entity rail sit beside a tab's own main content.
The checks rail is the exception: it fills the whole Checks tab, with no
main content beside it (`screens/EditScreen.tsx:1137-1146`).

**rail** alone names none of the three. Say *checks rail*, *steps rail* or
*entity rail*, every time.

**panel** alone names nothing either. A `*Panel` component serves as one
section body on the step page, or as a tab's or view's body elsewhere
(`FieldCatalogPanel.tsx`, `DataSourcesPanel.tsx`, `ContractPanel.tsx`,
`FieldMatrixPanel.tsx`).

**dock** names nothing here any more, as a verb or as a noun. Nothing docks.

## 2. Domain terms as the UI shows them

The JSON definition is the definition contract. Its words win in docs, specs,
commit messages and conversation. UI text prints the author's word per the
author's-word table below. A rendering layer may hold a different
word internally, and that word stays inside the layer.

The first table's "The word we use" column binds docs, specs, code and
conversation.

| JSON term | The word we use | The layer's own word | Rule |
|---|---|---|---|
| Step | step | `node` (canvas geometry) | never *node* outside `canvas/` |
| Path | path | `edge` (canvas geometry) | never *edge* outside `canvas/` |
| Expression | CEL | `CelNode` (the parsed AST) | *CEL* names the source text |

An authoring control prints the author's word. The contract's word stands
only in a Developer view. A caption never prints a JSON property name.

| Contract word | Author's word |
|---|---|
| path | way out |
| guard | only if |
| trigger manual / automatic | A person chooses / Happens by itself |
| priority | tried in this order |
| assignment | who acts |
| timer | time limit |
| onEntry / onExit actions | what happens when entered / when left |
| terminal step | an end |
| subprocess step | a call to another process |
| data source | where values come from |
| outcome | how it ended |
| required / readonly / visible | Required / Read-only / Asked |
| contract | what this process takes in and gives back |

The capability `studio-guided-vocabulary` carries the same table. A change to
one changes the other.

These rules bind docs, specs, commit messages and conversation. UI text
follows the author's-word table. A code identifier stays out of scope:
`EdgeStyle` in `studio/screens/EditScreen.tsx:41` and the key
`stepsRail.dragHandle` are code, and the rule above does not reach them.

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
- Operator, surface, area, participant, process owner: `CLAUDE.md` and
  `PRODUCT.md`.
