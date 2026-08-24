## ADDED Requirements

### Requirement: A newly created path defaults to a name derived from its source and target steps

Path creation SHALL no longer default `key` to an empty string. It SHALL
no longer leave `label` absent either. `newPath()` is the one
path-creation function every path-creating gesture calls. Those gestures are
drag-to-connect, `PathsPanel`'s "add path" action, and `insertOnPath.ts`'s
step-dropped-on-a-path gesture. `newPath()` SHALL compute a default `key`
and `label` from the source step and the target step, at the moment of
creation.

The default `label` SHALL name the source step, then an arrow, then the
target step. Each step contributes its own label when it carries one
non-empty after trimming. A step with no such label contributes its key
instead, when the key is non-empty after trimming. A step with neither
contributes the "unnamed step" placeholder.

The default `key` SHALL be a slug built the same way. A side whose name
slugs to an empty string SHALL contribute the placeholder's slug instead.
That way the joined `key` never comes out empty. Neither default
stays in sync with a later rename of either step. Each gets computed
once, at creation. Each stays freely editable afterward, like any other
path field.

A drag to empty canvas creates a new step as part of the same gesture. So
does a step dropped on an existing path. Both leave the new step with an
empty `key` and an empty `label`. The function `newStep()` hardcodes the
one, and its callers seed the other empty. That path's default SHALL come
from the new step's own, likewise defaulted, key and label. It SHALL fall
back to the "unnamed step" placeholder, not to an empty or arrow-only
string.

#### Scenario: A path dragged between two named steps gets a derived label

- **WHEN** a connect-handle drag from step "Manager review" to step
  "Finance sign-off" creates a path
- **THEN** the path's `label` reads "Manager review → Finance sign-off"
- **AND** the path's `key` is a non-empty slug derived from the same two
  steps

#### Scenario: A path between two punctuation-named steps still gets a non-empty key

- **WHEN** a connect-handle drag runs from step "!!!" to step "???"
- **THEN** each side contributes the placeholder's slug, and the path's
  `key` is non-empty

#### Scenario: PathsPanel's "add path" action stays disabled with no target chosen

- **WHEN** the developer opens `PathsPanel` for a step and has not yet
  chosen a target in the new target selector
- **THEN** the "add path" action stays disabled
- **AND** the panel creates no path

#### Scenario: A path added through the Paths tab gets the same derived default

- **WHEN** the developer chooses a target step in `PathsPanel`'s target
  selector, then uses the "add path" action
- **THEN** `newPath()` computes the new path's `key` and `label` from the
  currently selected step and the chosen target
- **AND** this matches how a canvas drag computes them from its own
  source and target
- **AND** neither field ends up empty or absent
- **AND** the target selector resets to no selection, ready for the next
  path

#### Scenario: Renaming a step afterward does not touch an existing path's label

- **WHEN** a path's default `label` came from a step's label at creation
- **AND** the developer later renames that step
- **THEN** the path's `label` stays what it was, unchanged by the rename

#### Scenario: A drag to empty canvas derives its default from the new step

- **WHEN** a connect-handle drag from step A to empty canvas creates both a
  new step and a path to it
- **THEN** `newPath()` derives the path's default `key` and `label` from
  step A and the newly created step's own default key and label

#### Scenario: A path to a freshly created, unnamed step falls back to a placeholder

- **WHEN** a gesture creates a new step with no `key` and no `label`, the
  state its creation leaves it in
- **AND** the same gesture connects a new path to that step
- **AND** a drag to empty canvas makes the new step the target
- **AND** a step dropped on a path makes the new step the source, via
  `insertOnPath.ts` reached from `EditScreen.tsx`
- **THEN** the new path's default `label` names the new step with the
  "unnamed step" placeholder, on whichever side it sits. It is not an
  empty or arrow-only string
- **AND** the placeholder is the same one `CanvasView.tsx`'s own
  `stepLabel()` helper already falls back to

#### Scenario: A path inserted on a path whose target no longer exists falls back for the target side

- **WHEN** the step-dropped-on-a-path gesture runs on a path whose `to`
  names a step the draft no longer holds. This is a pure-function edge.
  The canvas draws no edge for such a path, so the gesture cannot fire
  there in production
- **THEN** the derivation falls back to the "unnamed step" placeholder for
  the target side
- **AND** the new path keeps the original `to` id
