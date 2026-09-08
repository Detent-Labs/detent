## ADDED Requirements

### Requirement: Publish states a blocked draft's reason before the click

The loaded draft may report `canPublish: true` while the studio's own
validation finds a blocking issue. In that case, the Publish control SHALL
stay available, exactly as it does today. Beside it, the screen SHALL
state in visible text that a blocking issue stands in the way.

The control SHALL reference that text through `aria-describedby`, the same
pattern the permission-denied case already uses. This case SHALL NOT set
`aria-disabled`. The control stays fully operable, and a developer who
clicks through still reaches the confirmation dialog, which restates the
same warning per this capability's own dialog requirement.

Where the draft's issues are all advisory, or the draft is clear, this text
SHALL NOT render. The control renders exactly as it does today in either
case.

A draft reporting `canPublish: false` SHALL keep rendering per this
capability's existing unavailable-control requirement, whatever its issues.
This requirement's own text SHALL NOT also render there: a caller without
the permission never reaches this requirement's condition.

#### Scenario: A blocked-but-permitted draft warns before the click

- **WHEN** a draft loads with `canPublish: true` and one blocking issue
- **THEN** the Publish control renders available, with no `aria-disabled`
- **AND** visible text beside it states that a blocking issue stands in the
  way
- **AND** the control references that text through `aria-describedby`

#### Scenario: An advisory-only draft shows no pre-click warning

- **WHEN** a draft loads with `canPublish: true` and only advisory issues
- **THEN** the Publish control renders exactly as it does for a clear draft

#### Scenario: A permission-denied draft keeps its existing reason

- **WHEN** a draft loads with `canPublish: false`, whether or not it also
  carries a blocking issue
- **THEN** the control renders per the existing unavailable-control
  requirement
- **AND** this requirement's own text does not also render
