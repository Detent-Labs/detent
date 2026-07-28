## RENAMED Requirements

- FROM: `### Requirement: Editing is the carried-over panel surface, loading and saving against the draft routes`
- TO: `### Requirement: Editing is a canvas-primary surface with the carried-over panels as an inspector, loading and saving against the draft routes`

## MODIFIED Requirements

### Requirement: Editing is a canvas-primary surface with the carried-over panels as an inspector, loading and saving against the draft routes

The `/processes/:id/edit` screen SHALL carry over the editor's Draft model
(`draft/`), structural panels (`panels/` — steps, paths, timers, actions,
subprocess spec, view editor, field catalog, data sources, contract),
UI-chrome i18n and live validation, with file-based persistence replaced by
the draft routes: the draft is loaded with `GET /drafts/:processId` and
saved with `PUT /drafts/:processId`, carrying the revision that load
returned.

The screen's layout SHALL be canvas-primary: an interactive graph (see the
`studio-canvas` capability) occupies the main area, with the selected
element's panel rendered as a fixed-width inspector beside it, replacing the
previous stacked-panels-only column. Every panel's fields, validation, and
mutation behavior are unchanged by this — only where they are mounted.

Live validation SHALL remain exactly what it is today — the engine's own
publish-time chain run in the browser, reporting issues in place — and SHALL
NOT block saving, since a work-in-progress draft is expected to be invalid.

Publishing is NOT part of this screen in this change.

#### Scenario: A draft round-trips through the panels

- **WHEN** a draft is loaded, a step is added through the panels, and the
  draft is saved and reloaded
- **THEN** the new step is present and the panels render it identically

#### Scenario: A draft round-trips through the canvas

- **WHEN** a draft is loaded, a step is repositioned and connected to
  another step via the canvas, and the draft is saved and reloaded
- **THEN** the new position and path are present and the canvas renders them
  identically

#### Scenario: An invalid draft is still saveable

- **WHEN** live validation reports issues for the current draft
- **THEN** the issues are displayed and the save action remains available and
  succeeds
