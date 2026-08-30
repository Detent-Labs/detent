## ADDED Requirements

### Requirement: The instance view carries the process's base locale

`getInstanceView` SHALL include a `baseLocale` field in the returned
`InstanceView`. It SHALL carry the resolved `ProcessBody.baseLocale` of the
instance's own pinned version. The field SHALL always be present, the same
way `step` and `columns` always are. It describes the process rather than
transient instance state.

A caller resolves a field's `LocalizedText` label against the active locale,
and uses this field as the fallback. A label missing an entry for the active
locale still resolves to the authored base-locale text, not an empty value.

#### Scenario: Every view carries the process's base locale

- **WHEN** an authorized actor calls `getInstanceView` for any instance
- **THEN** the returned view carries `baseLocale`, equal to the resolved
  body's own `baseLocale`

#### Scenario: The base locale reports regardless of status

- **WHEN** an authorized actor calls `getInstanceView` for a completed,
  cancelled, or faulted instance
- **THEN** the returned view still carries `baseLocale`
