# field-expression-map-consolidation

## Purpose

A structural (mechanism-level) constraint on the editor's field-id → CEL
expression map UI: `SubprocessSpecEditor`'s `inputMapping`/`outputMapping`
fields and `ActionListEditor`'s per-action output mapping share one
implementation (`FieldExpressionMapEditor`), instead of
independently-maintained, structurally identical copies. External behavior
(what each panel renders, how edits update the mapping) is unaffected, except
for one latent bug fixed as part of consolidating the logic: switching a
mapping row's field used to duplicate the entry instead of replacing it (see
the field-move scenarios below). This capability exists purely to keep the
"don't re-duplicate this" constraint from silently regressing as more
field-expression-map call sites are added. Companion to
[[registry-error-consolidation]], added for the same `PONYTAIL-AUDIT.md`
report's finding 1.

## Requirements

### Requirement: One shared component renders every field-expression map

`SubprocessSpecEditor`'s `inputMapping`/`outputMapping` fields and
`ActionListEditor`'s per-action output mapping SHALL render and edit their
field-id → CEL expression map through one shared component
(`FieldExpressionMapEditor`), not independently-maintained, structurally
identical implementations. Each call site SHALL supply its own legend and
add/remove label text as props; an optional `placeholder` and an optional
`emptyLabel` prop are also available, used by whichever call sites have
matching UI text (`ActionListEditor` uses `placeholder` today; neither call
site currently uses `emptyLabel`). The mapping shape
(`Partial<Record<FieldId, DraftOf<Expression>>>`) and the `onChange`
bubbling contract SHALL be unchanged from the pre-consolidation behavior,
except where pre-consolidation behavior was itself a bug (see the field-move
scenarios below).

#### Scenario: Editing a subprocess mapping entry's expression

- **WHEN** a user changes the CEL expression of a row in a subprocess step's
  `inputMapping` or `outputMapping` editor, without changing its field
- **THEN** the shared component's `setEntry` updates that row's expression
  in place, and the resulting mapping is written back through the panel's
  existing `onChange` bubbling, unchanged from pre-consolidation behavior

#### Scenario: Switching a subprocess mapping entry's field replaces, not duplicates, the row

- **WHEN** a user changes the field of a row in a subprocess step's
  `inputMapping` or `outputMapping` editor (e.g. from one catalog field to
  another) while it already carries an expression
- **THEN** the shared component's `moveEntry` handler removes the entry
  under the old field id and adds it under the new field id in a single
  update, so exactly one row remains, carrying the preserved expression —
  fixing a latent bug where the pre-consolidation `MappingEditor`/`ActionRow`
  code (two sequential `setEntry` calls reading the same stale closure)
  would leave the old row in place and duplicate it under the new field

#### Scenario: Editing an action's output mapping entry

- **WHEN** a user changes the field or expression of a row in an action's
  output-mapping editor within `ActionListEditor`
- **THEN** the shared component behaves identically to the subprocess
  scenarios above (in-place expression edit, or field-switch via
  `moveEntry`), using the `actions.*` label keys and the action panel's
  existing `resultCelPlaceholder`

#### Scenario: Adding a new mapping entry picks the first unused field

- **WHEN** a user adds a new entry to a field-expression map (subprocess
  mapping or action output mapping) that does not yet cover every catalog
  field
- **THEN** the shared component's add handler selects the first field not
  already a key in the mapping, matching the pre-consolidation
  `MappingEditor`/`ActionRow` behavior
