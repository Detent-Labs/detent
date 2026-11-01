## MODIFIED Requirements

### Requirement: A newly created path defaults to a name derived from its source and target steps

Path creation SHALL no longer default `key` to an empty string. It SHALL
no longer leave `label` absent either. `newPath()` is the one
path-creation method every path-creating gesture calls. Those gestures are
drag-to-connect, `PathsPanel`'s "add path" action, and `insertOnPath.ts`'s
step-dropped-on-a-path gesture. `newPath()` SHALL compute a default `key`
and `label` from the source step and the target step, at the moment of
creation.

The default `label` SHALL name the source step, then an arrow, then the
target step. Each step contributes its own label when it carries one
non-empty after trimming. A step with no such label contributes the
"unnamed step" placeholder. A step's key SHALL NOT stand in the label.

The default `key` SHALL be a slug built the same way. The slug SHALL
transliterate first, by the rule the process key derivation states. It SHALL
join its words with `-`. A side whose name slugs to an empty string SHALL
contribute the placeholder's slug instead. That way the joined `key` never
comes out empty.

Neither default
stays in sync with a later rename of either step. Each gets computed
once, at creation. Each stays freely editable afterward, like any other
path field.

A drag to empty canvas creates a new step as part of the same gesture. So
does a step dropped on an existing path. Both leave the new step with an
empty `key` and an empty `label`. The method `newStep()` hardcodes the
one, and its callers seed the other empty.

That path's default SHALL come from the new step's own, likewise
defaulted, key and label. It SHALL fall back to the "unnamed step"
placeholder. An empty or arrow-only string SHALL NOT stand in its place.

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

#### Scenario: A path from a step with an umlaut keeps the letter's reading

- **WHEN** a connect-handle drag runs from step "Prüfung" to step
  "Abschluss"
- **THEN** the path's `label` reads "Prüfung → Abschluss"
- **AND** the path's `key` reads `pruefung-abschluss`

#### Scenario: A step with a key and no label contributes the placeholder

- **WHEN** an author creates a path from a step whose label is empty and
  whose key reads `review`
- **THEN** the path's `label` names that side with the "unnamed step"
  placeholder
- **AND** the label does not contain `review`

### Requirement: The header bar's process key auto-derives from the process label

<!-- "produce" names key derivation's output; "create" elsewhere names a gesture adding a step or path. -->
<!-- antislop: allow synonym-rotation -->
The header bar's `⋮` menu holds a "Process, saved with the draft" group.
That group's key field SHALL auto-fill from the process label as the
developer types. This holds while the draft's key is empty. It also holds
while the key still matches what derivation would produce from the label's
prior value.

Derivation SHALL read only the process label's base-locale entry. An edit
to any other locale's translation SHALL NOT trigger key derivation.

Derivation SHALL lower-case the label. It SHALL then transliterate. The
letters "ä", "ö" and "ü" read "ae", "oe" and "ue", and "ß" reads "ss". The
letters "æ" and "œ" read "ae" and "oe", "ø" reads "o" and "ł" reads "l".
Every other letter SHALL lose its combining marks, so "é" reads "e".

After that, derivation SHALL collapse every run of
characters outside `[a-z0-9]` to a single `_`. It SHALL trim a leading or
trailing `_`. A result starting with a digit SHALL gain a leading `_`.

The first edit the developer types directly into the key field SHALL
disable this auto-fill. That holds for the rest of the draft's lifetime in
the browser. No later label edit SHALL overwrite a key the developer has
hand-set. The key field SHALL remain an ordinary editable text input
throughout. Nothing about it SHALL become read-only or disabled otherwise.

#### Scenario: A new process's key follows its label as the developer types

- **WHEN** the developer types "Expense Approval" into a new draft's
  process label, having never touched the key field
- **THEN** the process key reads `expense_approval`

#### Scenario: A hand-edited process key no longer follows the label

- **WHEN** the developer changes the auto-derived process key to `expenses`
  and then edits the process label further
- **THEN** the process key stays `expenses`

#### Scenario: Editing a non-base-locale translation leaves an already-derived process key untouched

- **WHEN** the developer types a base-locale process label, deriving a
  key, then switches the studio's content locale
- **AND** the developer types a translation into the process label's
  non-base-locale entry
- **THEN** the process key stays unchanged

#### Scenario: A process label with umlauts derives a readable key

- **WHEN** the developer types "Prüfung der Änderung" into a new draft's
  process label, having never touched the key field
- **THEN** the process key reads `pruefung_der_aenderung`

#### Scenario: A letter with an accent loses only its mark

- **WHEN** the developer types "Café Straße" into a new draft's process
  label, having never touched the key field
- **THEN** the process key reads `cafe_strasse`
