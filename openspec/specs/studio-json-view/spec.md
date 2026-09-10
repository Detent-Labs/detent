# studio-json-view Specification

## Purpose

A third editing surface on the studio area of `packages/web`'s `/processes/:id/edit` screen
(see `studio-app`), alongside the structure surface: a raw,
pretty-printed JSON view over the draft body, replacing rather than
two-way-bound. Editing and clicking Apply parses the text, runs it through
the same load-time shape guard (`checkDraftShape`, in
`packages/web/src/areas/studio/draft/load-guard.ts`) the editor's file-based Load
already used, and — only on success — replaces the whole draft body through
the Draft model's existing `replace()` path (the same one Load/Import used).
The JSON surface and every draft-body-mutating component (`ProcessHeaderBar`,
`FieldCatalogPanel`, `DataSourcesPanel`, `ContractPanel`, Canvas, and the
steps/paths/timers/actions panels nested under it) are mutually exclusive —
only one is shown, and interactable, at a time — so a stale JSON textarea can
never silently clobber a panel edit made while it was open, or vice versa.

## Requirements

<!-- antislop: allow synonym-rotation -->
### Requirement: The edit screen offers a JSON surface alongside Structure

The process surface (`/processes/:id/edit`) SHALL offer a JSON surface. An
author opens it from the header bar's `⋮` menu. No Structure control and no
JSON control SHALL stand beside the header bar any more. The JSON entry
lives inside that menu, instead of as a separate toggle beside it.

The tab body covers every component that changes the draft body. That includes
the process header, the field catalog, the data sources and the contract. It
also includes the canvas, the step page, and the paths, timers and actions
sections. The JSON surface prints the draft body it currently holds as
pretty-printed JSON text.

The process surface SHALL keep only one of the two visible at a time. Only the
visible one SHALL accept interaction. No component that changes the draft body
SHALL be reachable while the JSON surface stands open. No control from the JSON
surface SHALL be reachable while a tab stands open.

The header bar menu's JSON entry SHALL name its own state. An author reads
from it whether the entry opens the JSON surface or leaves it.

`DraftToolbar` (save/publish/discard) and the content-locale switcher change no
draft body. Both SHALL stay visible and usable whichever of the two stands
open.

#### Scenario: Switching to the JSON surface shows the current draft

- **WHEN** the developer picks the JSON entry in the header bar's `⋮` menu
- **THEN** the JSON surface prints the draft's current body, pretty-printed
- **AND** no tab body remains reachable

#### Scenario: Switching back to Structure reflects the current draft

- **WHEN** the developer picks the same header-bar-menu entry a second time
- **THEN** the tab that stood open before prints the draft state the store
  currently holds
- **AND** that state carries any JSON edit already applied

#### Scenario: The header bar carries no surface pair

- **WHEN** the developer reads the header bar's row without opening its `⋮`
  menu
- **THEN** no Structure control and no JSON control stand there directly
- **AND** opening the `⋮` menu is what reaches the JSON entry

### Requirement: Applying valid JSON replaces the draft body

Editing the JSON text and invoking Apply SHALL parse the text as JSON and, if
it parses to a plain JSON object, SHALL replace the draft's entire body with
the parsed value through the same replace path Load/Import already uses —
never a partial or field-by-field merge.

#### Scenario: Valid JSON is applied

- **WHEN** the developer edits the JSON text to a syntactically valid JSON
  object and clicks Apply
- **THEN** the draft's body is replaced by the parsed object, and Canvas and
  Panels reflect it once shown

#### Scenario: Empty or whitespace-only text is applied as an empty draft

- **WHEN** the developer clears the JSON text (empty or whitespace-only) and
  clicks Apply
- **THEN** the draft's body is replaced by an empty object, not rejected as
  invalid

### Requirement: Invalid or malformed JSON is rejected without changing the draft

Applying text that fails to parse as JSON, that parses to a non-object value
(array, string, number, boolean, or `null`), or that parses to an object
failing the same load-time shape check the editor's file-based Load already
applies (a known top-level field present with the wrong type, e.g. `fields`
not an array) SHALL leave the draft's current body unchanged and SHALL show
an inline error describing the failure. No partial replacement SHALL occur.

#### Scenario: Malformed JSON is rejected

- **WHEN** the developer edits the JSON text to a value containing a syntax
  error and clicks Apply
- **THEN** the draft is unchanged and an inline error is shown

#### Scenario: A syntactically valid but non-object JSON value is rejected

- **WHEN** the developer edits the JSON text to a syntactically valid JSON
  array, string, number, boolean, or `null` and clicks Apply
- **THEN** the draft is unchanged and an inline error is shown

#### Scenario: A well-typed-at-the-root but shape-invalid object is rejected

- **WHEN** the developer edits the JSON text to a JSON object where a known
  field has the wrong type (e.g. `"fields": "not an array"`) and clicks
  Apply
- **THEN** the draft is unchanged and an inline error describing the
  offending field is shown

### Requirement: The JSON surface synchronizes in one direction only

The JSON text SHALL be (re-)seeded from the currently held draft only at the
moment the JSON surface is shown. Text typed into the JSON surface SHALL NOT
affect the draft until Apply is invoked, and unapplied JSON text SHALL NOT be
preserved across leaving and re-entering the JSON surface.

#### Scenario: Leaving and returning to the JSON surface discards unapplied edits

- **WHEN** the developer edits the JSON text without clicking Apply, switches
  to Structure, and then switches back to the JSON surface
- **THEN** the JSON surface shows the current draft, not the discarded
  unapplied edit

#### Scenario: Typing in the JSON surface does not affect Structure until applied

- **WHEN** the developer edits the JSON text without clicking Apply
- **THEN** Canvas and Panels (when shown) continue to reflect the draft as it
  stood before the edit

### Requirement: The JSON surface renders from compiled styles

`panels/JsonView.tsx` SHALL compile from typed StyleX style objects,
reading `form-ui/tokens.stylex`. The resulting layout SHALL match the
previous stylesheet declaration for declaration.

#### Scenario: The JSON surface keeps its look

- **WHEN** a browser opens the JSON surface
- **THEN** its computed layout, spacing, color and border equal the
  values the deleted stylesheet declared
