## Why

A step's `view` is today an ordered list of override rows: visible,
required, readonly, group. `StepsPanel`'s `ViewEditor` renders that list
with `↑`/`↓` buttons, and the array order is the only display order a
form has. No screen in the studio shows what a participant's form will
look like. An author arranges it blind, then opens Player to see the
result.

A wireframe review of the studio area (`Detent Wireframes.dc.html`,
frame D11) proposes a visual, drag-and-drop form editor that replaces
this list. It needs two layout properties the schema does not carry
yet. One is a column count for the view. The other is a per-field
span. Both are purely presentational. Neither changes what a field
validates or submits.

## What Changes

- Add `columns` to `View`: `1 | 2`, optional, defaulting to `1` when
  absent. Add `span` to `ViewField`: `1 | 2`, optional, defaulting to
  `1` when absent. Both are layout-only. An existing view with neither
  property renders exactly as it does today: one column, every field
  full width. Both keys are absent from every stored body, so
  `definitionHash` does not move for any published version.
- These are the only two keys this change adds to
  `src/schema/definition.ts`. `ROADMAP.md` stage 27 rules that nothing
  in that stage enters the file. This is a deliberate exception, and
  `design.md` argues it. A participant's form renders from the pinned
  immutable version, so layout it needs has nowhere else to live.
- Both reach the Runtime API Layer too. `InstanceView` gains a
  `columns` field: the current step's `view.columns`, or `1` when
  absent. Each `ResolvedViewField` gains a resolved `span`: the
  matching `ViewField.span`, or `1` when absent.
- `packages/form-ui`'s `FieldForm` renders fields in a `columns`-wide
  grid instead of one stacked column. A field whose `span` is `2`
  spans both columns, regardless of the grid width. On a one-column
  view, a `span: 2` field still renders full width. It cannot exceed
  the grid it sits in. This is the one renderer both the studio Player
  and the participant's Task screen already share. Both call sites
  pass the view's `columns`, so the layout becomes identical
  everywhere the moment it ships.
- A group field inherits the form's own `columns` rather than
  declaring a count of its own. A group inside a one-column form
  therefore keeps today's stacked rendering exactly. That is what
  keeps the change invisible to an existing published form.
- Build a new drag-and-drop form editor in the studio area. It opens
  from the step's section index's View entry (see the
  `studio-edit-shared-modal` change for that index). It replaces
  `ViewEditor`'s override-row list.
  - A left palette lists the catalog fields not yet on the form.
    Dragging one onto the canvas adds it to the view.
  - A toggle above the canvas sets the view's `columns`. Outside the
    JSON view, it is the only control that writes the key.
  - The canvas renders the form itself at that column count. Each
    placed field is a card carrying its own overrides as small marks:
    required, readonly, a CEL badge when an override is an expression,
    and a dashed mark when it is conditionally hidden. A group's own
    fields sit under a labelled rule, at the form's own column count.
  - Position on the canvas SHALL be the view array's order, read left
    to right then down. This is the same order the `↑`/`↓` buttons
    already express, so a form built before this editor existed loads
    into its existing order unchanged.
  - A selected field's strip below the canvas edits `visible`,
    `required`, and `readonly` as a three-way choice (yes, no, or a
    CEL expression), plus `group` and `span`.
- `StepsPanel`'s View entry, once past this change, opens this new
  editor instead of scrolling to reveal the override-row list inline.

## Capabilities

### New Capabilities
- `studio-form-editor`: the drag-and-drop visual editor for a step's
  form layout, replacing the override-row list.

### Modified Capabilities
- `runtime-api`: the "Resolve a display-ready view of an instance"
  requirement changes. `InstanceView` gains `columns`; each resolved
  field gains `span`.
- `form-ui`: gains a requirement for rendering fields across a
  `columns`-wide grid, each honoring its own `span`.
- `studio-player`: the Player's form pane renders through the same
  `columns`/`span`-aware `FieldForm`. It reflows to one column under a
  width threshold, record panel last.
- `studio-canvas`: the "Selecting a node or edge expands its detail in
  a permanent inspector beside the canvas" requirement changes again.
  The View entry in the step's section index (from
  `studio-edit-shared-modal`) now opens the new form editor. It no
  longer scrolls to an inline override-row list.

## Impact

- `src/schema/definition.ts`: adds `columns` to `view` and `span` to
  `viewField`, both optional.
- `src/runtime/api.ts`: `ResolvedViewField` gains `span`; `InstanceView`
  gains `columns`; `resolveFields` and `getInstanceView` populate them.
- `packages/form-ui/src/types.ts`: its own `ResolvedViewField` gains
  `span`. This is the only browser-side copy. The app and studio areas
  import and re-export this one rather than declaring their own.
- `packages/web/src/areas/app/api/types.ts` and
  `.../studio/api/types.ts`: their hand-mirrored `InstanceView` gains
  `columns`. `.../admin/api/types.ts` stays unchanged: its own
  `InstanceView` carries no `fields`, because the admin instance screen
  renders no form.
- `packages/form-ui/src/FieldForm.tsx`: grid rendering keyed on
  `columns`/`span`, plus the grid CSS in `form-ui`'s own stylesheet.
- `packages/web/src/areas/app/screens/TaskScreen.tsx`: passes the
  view's `columns` to `FieldForm`, so a participant sees the layout the
  author built.
- New: a form-editor component under
  `packages/web/src/areas/studio/`, replacing
  `packages/web/src/areas/studio/panels/ViewEditor.tsx`.
- `packages/web/src/areas/studio/panels/StepsPanel.tsx`: the View
  entry's click handler opens the new editor instead of the inline
  list.
- `packages/web/src/areas/studio/screens/PlayerScreen.tsx`: passes the
  view's `columns` to `FieldForm`, plus reflow styling at the
  two-column threshold.
- `docs/authoring-guide.md`: §View and §4 both enumerate what a view
  overrides ("visible, required, readonly, its order, its group"). Both
  gain `span`, §View gains `columns`, and §4's procedure changes for
  the drag-and-drop editor.
- `ROADMAP.md`: stage 27's "Nothing here enters
  `src/schema/definition.ts`" rule records this one exception, and the
  stage gains a sub-item for this change.
- No change to `src/engine/`, `src/http/`, or how the engine validates
  a submission: `columns`/`span` never reach `submitAndTransition`.
