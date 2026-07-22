## ADDED Requirements

### Requirement: A missing base-locale entry surfaces as a located issue
When the `authored-content-localization` invariant (every `LocalizedText`
value must contain the process's `baseLocale` entry) is violated, the
editor SHALL normalize it into an `EditorIssue` carrying the entity type
and id it belongs to, displayed on that entity's panel — the same
treatment every other structural invariant already receives.

#### Scenario: A step missing its base-locale label is flagged on the step
- **WHEN** a step's `label` has no entry for the process's `baseLocale`
- **THEN** the issue is displayed on that step's entry in the steps panel,
  not as an undifferentiated global error

#### Scenario: A field option missing its base-locale label is flagged on the field
- **WHEN** a `FieldOption.label` has no entry for the process's `baseLocale`
- **THEN** the issue is displayed on that option's owning field in the
  field catalog panel
