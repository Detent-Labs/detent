## MODIFIED Requirements

### Requirement: The canvas edit screen lays out a palette, the canvas, the inspector, and a checks rail

The canvas edit screen SHALL show three columns, in order. The first is
a rail. It holds the place-on-canvas palette. Below the palette sits the
`studio-app` capability's Process section: the Fields, Data sources,
Contract, and Field matrix links.

The second column is the canvas. The third column shows either the
`studio-checks-rail` capability's checks rail or the selection-driven
inspector, never both at once.

The third column SHALL show the checks rail when the developer has
selected no step and no path. It SHALL show the inspector when the
developer selects exactly one step, or a path. It SHALL show the
selection's own count and delete control when the selection holds more
than one step. See the `studio-checks-rail` capability for the rail's own
collapsed presentation in the step-selected state.

The three columns SHALL fill the window's height that the screen's own
header rows leave, above a floor of 36rem. A window taller than that floor
therefore shows a taller canvas, and no empty band below the columns. A
window shorter than the floor holds the columns at the floor, and the page
scrolls. The columns keep their widths. The two side columns stay fixed,
and the canvas between them takes the rest.

#### Scenario: All three columns appear

- **WHEN** the canvas edit screen loads
- **THEN** the rail, the canvas, and the third column each appear as
  their own column

#### Scenario: The third column shows the checks rail with nothing selected

- **WHEN** the developer has selected no step and no path
- **THEN** the third column shows the checks rail, not the inspector

#### Scenario: The third column shows the inspector once the developer selects a step

- **WHEN** the developer selects one step, or a path
- **THEN** the third column shows the inspector, not the full checks
  rail

#### Scenario: The third column shows the count with several steps selected

- **WHEN** the developer selects more than one step
- **THEN** the third column shows the selection count and its delete
  control
- **AND** it shows neither the inspector nor the full checks rail

#### Scenario: A tall window grows the columns rather than leaving a band below them

- **WHEN** the canvas edit screen loads in a window whose remaining height
  is above the floor
- **THEN** the three columns end at the bottom of the window, and the
  canvas is taller than 36rem

#### Scenario: A short window holds the columns at the floor

- **WHEN** the canvas edit screen loads in a window whose remaining height
  is below the floor
- **THEN** the three columns keep the 36rem floor and the page scrolls to
  reach their bottom edge
