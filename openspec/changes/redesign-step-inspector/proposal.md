<!-- antislop: allow-file synonym-rotation -- "edit screen" and "change" name unrelated concepts here -->

## Why

The step inspector (`StepsPanel`, `.canvas-inspector`) sits in the canvas
edit screen's third column. It is a flat, single-open accordion of eight
peer entries: identity, assignment, paths, timers, actions, subprocess,
view, developer view.

Choosing an entry expands a `<section>` that renders below
the whole entry list, not under the entry itself. The visual link between
what a developer clicks and what appears is weak.

The view entry silently navigates away instead of expanding. Nothing marks
that it differs from its seven siblings. The developer view holds a raw
JSON dump. It sits as a peer of the real editing sections, not as the
debug tool it is. A developer spends more time re-orienting in this column
than the editing itself should cost.

## What Changes

- Restructure the inspector into three visually distinct zones instead of
  one flat entry list. An always-visible identity zone carries no
  disclosure. It holds key, label, description, the performed-by control,
  the conditional outcome field, the initial-step control, and the view
  button.
- A behavior zone uses a tab row: Assignment, Paths, Actions, Timers.
  Subprocess joins that row when performed-by is Subprocess. A
  diagnostics drawer sits at the bottom. It holds the per-step issue
  count, the developer view demoted to a toggle, and the existing docked
  checks rail.
- Replace the disclosure interaction for the behavior editors with a tab
  row. One tab's content shows at a time. Switching tabs replaces the
  previous tab's content in place. It no longer expands a `<section>`
  further down the column.
- A path edge click still resolves to its source step and opens straight
  to its paths. It now selects the Paths tab instead of expanding the
  paths section.
- A terminal step's Paths tab shows an empty state, not a path editor.
  The empty state reads: "Terminal steps have no outgoing paths." The
  assignment no-assignment warning stops showing on a terminal step too.
  An existing rule already exempts a terminal step the same way:
  `terminal === true || assignment !== undefined`.
- The developer view stops being a peer disclosure entry. It becomes a
  small toggle link inside the diagnostics drawer. It still shows the
  same read-only raw JSON.
- **BREAKING** (studio-only, no persisted-data impact): the inspector's
  accessible structure changes. Eight `aria-expanded` disclosure buttons
  become a `role="tablist"` of four or five tabs plus a small set of
  always-visible fields. Fix any test or tooling that asserts the old
  disclosure shape, such as `aria-expanded`/`aria-controls` on a "paths"
  or "timers" entry.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `studio-canvas`: six requirements retire, four requirements replace
  them, and one requirement's wording changes in place. The
  "Selecting a node or edge shows its detail in a permanent,
  selection-driven inspector..." requirement (the old
  section-disclosure model) retires. A new requirement, "Selecting a
  node or edge shows its detail in a three-zone, tab-driven
  inspector...," replaces it.

  The "step inspector's Developer view" requirement retires; a new
  "step inspector's diagnostics drawer" requirement replaces it. The
  "A terminal step disables the inspector's 'add path' control"
  requirement retires outright. A terminal step's Paths tab now shows
  an empty state with no path editor. No "add path" control remains
  to disable.

  The "view entry shows form status and a 'Build the form' label"
  requirement retires. Its form-status summary and "Build the form"
  label move into the identity zone's view button. The three-zone
  requirement above describes that button.

  Two more requirements retire and get renamed replacements. Both
  follow the same "identity section" -> "identity zone" rename the
  rest of this change makes. One is "The identity section's type and
  terminal controls render as a 'performed by' segmented control".
  The other is "The identity section constrains a terminal step's
  outcome to the process's declared outcomes".

  One requirement, "A step node on the canvas offers an inline
  rename", keeps its header. Only its body changes. It is a MODIFIED
  requirement, not a retire-and-replace pair. It no longer describes
  the identity zone as something a developer opens.

## Impact

- `packages/web/src/areas/studio/panels/StepsPanel.tsx`: restructured. It
  drops `openSection`, `sections`, and `chooseSection` disclosure state
  for an `activeTab` state and the three-zone layout. It still mounts
  `PathsPanel`, `TimersPanel`, `ActionListEditor`, `PluginEnvelopeEditor`,
  `SubprocessSpecEditor`, `IssueList`, and `ChecksRail` with their
  existing props.
- `packages/web/src/areas/studio/app.css`: new rules for the identity
  zone, the tab row, and the diagnostics drawer. It retires
  `.step-section-index` and `.step-section-entry` styling once nothing
  mounts them. `EditScreen.tsx`'s multi-select `.canvas-selection` column
  is a separate presentation and stays as it is.
- `packages/web/src/i18n/catalogs/studio.ts`: new keys for the
  "Behavior" zone label. New keys also cover the terminal-empty-paths
  copy. `catalog.ts` is only the `t()` lookup helper. The key map
  lives in the i18n catalog. Existing `stepSections.*` keys for
  section names carry over as tab labels where they still apply.

  Keys that named the old accordion shape retire. Two keys move
  instead of retiring. `stepSections.viewFieldsConfigured` and
  `stepSections.viewBuildForm` both move from the old "view" entry.
  Both now belong to the identity zone's view button. One more key
  keeps its name but changes value: `stepSections.developerView` goes
  from "Developer view" to "View raw JSON". The diagnostics drawer
  reuses that new value for its toggle label.
- No part of this change touches `Draft`, the definition contract, the
  Runtime API Layer, or any HTTP route. It is presentation-layer only,
  inside the studio area.
- `EditScreen.tsx`'s `.canvas-inspector` mount point, the multi-select
  summary (`.canvas-selection`), and the checks rail's three placements
  keep their shape. Only what mounts inside `.canvas-inspector` for a
  single-step or single-path selection changes.
- `docs/browser-checks.md`: three passages describe the retired
  accordion in prose. They get rewritten to describe the identity
  zone, behavior tabs, and diagnostics drawer instead.
- `docs/current-state.md`: optionally touched. Two passages name the old
  `StepsPanel` expanded-accordion state and its navigation shape; a
  convenient but non-required update in the same pass.
- `.claude/rules/ui-glossary.md`: the edit-screen table's "inspector panel"
  row and the "field tabs" paragraph's tab-pattern list both name the
  retired accordion shape. They get updated for the identity zone, the
  behavior zone's tab row, and the diagnostics drawer.
