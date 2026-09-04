## MODIFIED Requirements

### Requirement: The checks rail states a publish verdict it can verify

The checks rail reports what the studio's own validation measured. It holds no
permission and reads no actor. So its all-clear state SHALL NOT assert that the
caller may publish.

The rail SHALL read the same report the Publish control reads. That report is
the `canPublish` field `process-drafts` owns. Every placement of the rail SHALL
receive it. The rail renders in the canvas ribbon's bar, and on the panels
screen.

Two placements stand where three stood. The step bench replaced two of them
with one summary in the ribbon bar. Those two were the inspector's bottom
edge and the standing column beside the canvas. The rule itself holds. Every
placement states the same verdict.

The all-clear state SHALL carry two statements. One names the validation
verdict. The other names the publish verdict. Each SHALL come from its own
catalog key, so neither reads as a consequence of the other.

Where the report reads false, the second statement SHALL name the publish
permission this process needs. It SHALL NOT say that the draft is ready to
publish. A rail saying so contradicts the control that refuses the act, on the
same screen.

An open or held-back check SHALL keep the all-clear state hidden, exactly as it
does today. The publish verdict SHALL change nothing about when that state
shows.

#### Scenario: A clear draft the caller may publish

- **WHEN** the checks rail shows its all-clear state
- **AND** the loaded draft reports `canPublish: true`
- **THEN** the rail states its clear validation verdict
- **AND** it states that the draft is ready to publish

#### Scenario: A clear draft the caller may not publish

- **WHEN** the checks rail shows its all-clear state
- **AND** the loaded draft reports `canPublish: false`
- **THEN** the rail states its clear validation verdict
- **AND** it states that publishing needs the publish permission for this
  process
- **AND** it does not state that the draft is ready to publish

#### Scenario: Every placement of the rail states the same verdict

- **WHEN** the rail renders in the canvas ribbon's bar, or on the panels
  screen
- **THEN** each placement states the publish verdict the other states
