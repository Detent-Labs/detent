## MODIFIED Requirements

### Requirement: The inspector's Paths and Timers tabs render from compiled styles

`panels/PathsPanel.tsx`, the body of the step page's Path to section, SHALL
render from compiled component styles.

The path row's `label` and `key` fields SHALL render in that order, `label`
first. Each SHALL take the Step masthead's stacked field pattern
(`StepPage.tsx`'s `fieldLabel`/`fieldLabelText`). The field's label sits
above its control, both flush left, 4px apart. The `key` field's control
SHALL also take the masthead's mono treatment (`monoInput`), the same
treatment `StepPage.tsx` gives a step's own `key`.

The path row's `to` (target step) field SHALL render as a studio select.
So SHALL the "add path" target selector below the list. A studio select is
a native `<select>` with the browser's own chevron removed
(`appearance: none`). A decorative Lucide `ChevronDown` (18px, 1.75 stroke,
slate) sits over the control's trailing edge. The select takes the same
stacked `fieldLabel` pattern as `label` and `key`. Neither selection value
is a value the engine matches by its own text, so neither field takes the
mono treatment.

`panels/TimersPanel.tsx`, the body of the Time limit section, renders no
class this migration covers. It already satisfies this requirement,
unchanged.

#### Scenario: The Paths tab keeps its look

- **WHEN** a browser opens the step page's Path to section
- **THEN** its computed layout, spacing, color and border equal the values
  this requirement now declares
- **AND** that supersedes the pixel-for-pixel match to the deleted
  stylesheet an earlier migration once asserted here

#### Scenario: The path row shows label before key, both stacked

- **WHEN** a browser opens the step page's Path to section
- **THEN** the path row's `label` field renders above its own control,
  before the `key` field
- **AND** the `key` field renders above its own control, in the mono face

#### Scenario: The target step select carries a styled disclosure arrow

- **WHEN** a browser opens the step page's Path to section
- **THEN** the `to` field's `<select>` shows a slate `ChevronDown` glyph in
  place of the browser's own dropdown arrow
- **AND** the "add path" target selector below the path list shows the same
  glyph
