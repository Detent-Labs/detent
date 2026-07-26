# array-crud-by-index-consolidation

## Purpose

A structural (mechanism-level) constraint on the editor's array-CRUD-by-index
UI: `PathsPanel`, `TimersPanel`, `ViewEditor`, `ActionListEditor`, and
`FieldCatalogPanel` (both its option rows and its sub-field rows) share one
implementation of remove-by-index and update-by-index (`removeAt`/`updateAt`
in `packages/editor/src/draft/list-ops.ts`), instead of independently
maintained, structurally identical `filter`/`map` copies. External behavior
(what each panel renders, how edits update its list) is unaffected — this is
a pure, behavior-preserving extraction. This capability exists purely to
keep the "don't re-duplicate this" constraint from silently regressing as
more array-CRUD-by-index call sites are added. Companion to
[[field-expression-map-consolidation]] and [[registry-error-consolidation]],
added for the same `PONYTAIL-AUDIT.md` report's finding 2.

## Requirements

### Requirement: Remove-by-index and update-by-index share one implementation

`PathsPanel`, `TimersPanel`, `ViewEditor`, `ActionListEditor`, and
`FieldCatalogPanel` (both its option rows and its sub-field rows) SHALL
compute their remove-by-index and update-by-index array operations through
two shared pure functions, `removeAt` and `updateAt`
(`packages/editor/src/draft/list-ops.ts`), not independently-maintained,
structurally identical `filter`/`map` implementations. Each call site SHALL
keep its own domain-named wrapper (e.g. `removePath`, `updateTimer`) that
delegates to the shared functions and calls the panel's own
`onChange`/`setRows`/`setOptions`. The removed/updated array's contents and
each wrapper's external signature SHALL be unchanged from
pre-consolidation behavior.

#### Scenario: Removing a row by index

- **WHEN** a user removes a row at a given index from any of the six lists
  (paths, timers, view fields, actions, field options, sub-fields)
- **THEN** `removeAt` returns a new array with that index's element excluded
  and every other element in its original order, and the panel's own
  `onChange`/`setRows`/`setOptions` is called with the result, unchanged
  from pre-consolidation behavior

#### Scenario: Updating a row by index

- **WHEN** a user edits a field of a row at a given index in any of the six
  lists
- **THEN** `updateAt` returns a new array where that index's element is
  shallow-merged with the given patch and every other element is unchanged,
  and the panel's own `onChange`/`setRows`/`setOptions` is called with the
  result, unchanged from pre-consolidation behavior

#### Scenario: Index out of range is a no-op

- **WHEN** `removeAt` or `updateAt` is called with an index that does not
  match any element in the list
- **THEN** the returned array's contents are unchanged from the input list
  (no element removed or updated), matching `Array.prototype.filter`/`map`
  semantics
