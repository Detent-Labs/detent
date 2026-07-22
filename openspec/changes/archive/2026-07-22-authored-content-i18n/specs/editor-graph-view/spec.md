## ADDED Requirements

### Requirement: Graph node labels resolve through the current content locale
A step node's displayed label SHALL be resolved from its `LocalizedText`
`label` via `resolveLocalizedText`, using the Draft's currently selected
content locale and the process's `baseLocale` as the fallback, rather than
rendering a raw string.

#### Scenario: Node label reflects the selected content locale
- **WHEN** the current content locale is `de` and a step's `label` is
  `{ en: "Review", de: "Prüfen" }`
- **THEN** the graph view's corresponding node displays `"Prüfen"`

#### Scenario: Node label falls back to the base locale
- **WHEN** the current content locale is `fr` and a step's `label` is
  `{ en: "Review" }` with the process's `baseLocale` set to `en`
- **THEN** the graph view's corresponding node displays `"Review"`

#### Scenario: Switching content locale updates node labels
- **WHEN** an author switches the content locale
- **THEN** every node's displayed label updates to reflect the newly
  selected locale (or its base-locale fallback) without requiring any
  other Draft change
