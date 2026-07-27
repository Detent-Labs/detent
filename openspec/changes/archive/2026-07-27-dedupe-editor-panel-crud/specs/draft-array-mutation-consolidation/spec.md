## ADDED Requirements

### Requirement: Add and update on a root-level draft array share one implementation

`DataSourcesPanel`, `FieldCatalogPanel`, and `StepsPanel` SHALL compute
their add-to-root-draft-array and update-in-root-draft-array operations
through shared helpers in `packages/editor/src/draft/draft-array-crud.ts`,
not independently-maintained, structurally identical `mutate`-callback
implementations. Each call site SHALL keep its own domain-named wrapper
(e.g. `addDataSource`, `updateField`) that delegates to the shared helpers
and calls the panel's own `mutate`. Any step-specific behavior layered
around the triple (e.g. `StepsPanel`'s `initialStep` bookkeeping) SHALL
stay local to that panel, composed around the shared helper rather than
folded into it. The Draft's contents and each wrapper's external signature
SHALL be unchanged from pre-consolidation behavior.

#### Scenario: Adding an item to a root-level draft array

- **WHEN** an author adds a new data source, field, or step via its panel
- **THEN** the shared add helper appends the new item to the corresponding
  root-level Draft array (initializing it if absent) and the panel's own
  `mutate` call commits the change, unchanged from pre-consolidation
  behavior

#### Scenario: Updating an item in a root-level draft array

- **WHEN** an author edits a field of an existing data source, field, or
  step via its panel
- **THEN** the shared update helper shallow-merges the patch into the
  item at that index within the Draft's array (a no-op if the index is out
  of range) and the panel's own `mutate` call commits the change, unchanged
  from pre-consolidation behavior

#### Scenario: Step-specific bookkeeping stays outside the shared helper

- **WHEN** an author adds a new step (setting `initialStep` on the first
  step) or removes the step currently set as `initialStep`
- **THEN** `StepsPanel` performs that `initialStep` bookkeeping itself,
  composed around the shared add/update helpers, and the shared helpers
  remain unaware of `initialStep`
