# Spec Delta

## ADDED Requirements

### Requirement: A caller may state its own maximum for the bound

The read SHALL accept an optional `maxLimit`. The read SHALL then use it for
that call instead of the default maximum of 200. A caller asking for more than
`maxLimit` SHALL receive `maxLimit` items. A caller passing no `maxLimit` keeps
the default enforced maximum. No HTTP route SHALL pass `maxLimit`. The
in-process report execution is its only caller.

#### Scenario: A stated maximum raises the bound for one call

- **WHEN** a caller passes a `maxLimit` of 1000 and a maximum count of 1000
  and 1200 instances match
- **THEN** the read returns 1000 items
- **AND** it reports that the bound truncated the result

#### Scenario: A caller passing no maximum keeps the default

- **WHEN** a caller asks for 1000 items and passes no `maxLimit`
- **THEN** the read returns at most 200 items
