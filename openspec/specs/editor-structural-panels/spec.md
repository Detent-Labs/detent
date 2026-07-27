# editor-structural-panels

## Purpose

Defines the structural authoring UI: panels for the field catalog, data
sources, steps (incl. per-step view), paths, timers, actions, and the
process contract, each editing the Draft model directly.

## Requirements

### Requirement: Panels cover every authorable entity in the Draft
The editor SHALL provide panels for the field catalog, data sources, steps
(including each step's per-step `view` overrides), paths, timers, actions,
and the process contract, each editing the Draft model directly. Every
entity type the contract defines SHALL be reachable and editable through
some panel — including `ProcessBody.dataSources`, a top-level entity
distinct from fields that a field's `dataSource` reference depends on.

#### Scenario: Field catalog panel creates a process-wide field
- **WHEN** an author adds a new field via the field catalog panel
- **THEN** the field is added once to the Draft's catalog and becomes
  available for reference from any step's `view`

#### Scenario: Data sources panel creates a process-wide data source
- **WHEN** an author adds a new data source via the data sources panel
  (a plugin envelope: `type`, `config`, plus `key`)
- **THEN** the data source is added once to the Draft's `dataSources` list
  and becomes selectable from any field's `dataSource` reference

#### Scenario: A field can reference a data source instead of static options
- **WHEN** an author sets a field's `dataSource` to a data source created
  in the data sources panel
- **THEN** the field catalog panel enforces that the same field's
  `options` is not also set, matching the contract's options/dataSource
  XOR invariant

#### Scenario: Step panel edits per-step view overrides
- **WHEN** an author changes a field's `required`/`visible`/`readonly`/
  `order`/`group` override on a specific step
- **THEN** the change is written to that step's `view` entry for the
  field and does not affect the field's catalog definition or any other
  step's view of the same field

#### Scenario: CEL guards are authored as text
- **WHEN** an author edits a path's guard or a timer's deadline expression
- **THEN** the panel presents and accepts the expression as raw CEL text,
  with no non-CEL condition-builder abstraction in v1

### Requirement: Panels expose wait-state and guard-priority concepts directly
The editor SHALL NOT abstract away wait-states or automatic-path
guard priority; panels SHALL surface a step's manual/automatic path
distinction and, for automatic paths, their priority ordering as explicit,
editable authoring concepts.

#### Scenario: Automatic path priority is editable
- **WHEN** a step has two or more automatic paths
- **THEN** the paths panel displays and allows editing each path's
  `priority` value

#### Scenario: Mixed manual/automatic paths are visibly distinguished
- **WHEN** viewing a step's paths in the panel
- **THEN** each path's trigger type (`manual` or `automatic`) is visible
  without opening a separate detail view

### Requirement: Panels edit localized content through a content-locale-scoped input
Wherever a panel edits `ProcessBody.label`/`description`, `Step.label`/
`description`, `FieldDef.label`/`description`, or `FieldOption.label`, it
SHALL do so through an input bound to the Draft's currently selected
content locale, writing the entered text into that `LocalizedText` value's
entry for that locale. This content locale is a Draft-level concept and has
no relationship to the editor's own UI-chrome text, which is a fixed,
single, non-switchable English catalog with no locale state of its own (see
`editor-i18n`) — there is no `useLocale()` hook or UI-chrome locale to be
"independent" of; the content locale is simply the only switchable locale
the editor has.

#### Scenario: Editing a label writes to the current content locale's entry
- **WHEN** the current content locale is `de` and an author types into a
  step's label input
- **THEN** the text is written to that step's `label.de` entry, leaving
  `label.en` (or any other existing locale entry) unchanged

#### Scenario: Switching content locale shows that locale's existing text
- **WHEN** an author switches the content locale from `en` to `de` for a
  field whose `label` is `{ en: "Amount", de: "Betrag" }`
- **THEN** the label input displays `"Betrag"`

#### Scenario: Switching content locale does not affect the UI-chrome text
- **WHEN** an author changes the content-locale switcher
- **THEN** the editor's own UI-chrome text (rendered via `editor-i18n`'s
  fixed English catalog) is unaffected — there is nothing for it to switch
  to

### Requirement: A new content locale can be added from the panel
The content-locale switcher SHALL allow adding a locale not yet used
anywhere in the Draft (free-form entry validated against the `LocaleCode`
format), making it selectable and editable without requiring the process's
`baseLocale` to change.

#### Scenario: Adding a new locale makes it selectable
- **WHEN** an author adds locale `fr` via the content-locale switcher
- **THEN** `fr` becomes a selectable content locale for editing every
  localized field in the Draft

#### Scenario: An invalid locale code is rejected
- **WHEN** an author attempts to add a locale code that does not match the
  `LocaleCode` format
- **THEN** the switcher rejects the input and does not add it
