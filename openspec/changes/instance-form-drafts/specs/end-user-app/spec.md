<!-- antislop: allow-file passive-voice -- SHALL requirements act on the screen and draft as subjects, so the passive register is correct here -->

# end-user-app

## ADDED Requirements

### Requirement: The task screen offers a Save control for unfinished input

The task screen SHALL show a **Save** control beside the claim and submit
actions. The same claim-gated condition that enables path-submit SHALL govern
it. Clicking Save SHALL send the participant's editable field values to
`PUT /instances/:instanceId/draft` without submitting and without advancing
the step. On success the screen SHALL show a saved confirmation that names the
save time.

#### Scenario: A claimant saves without submitting

- **WHEN** the claimant edits fields and clicks Save
- **THEN** the screen sends the editable values to the draft route, stays on
  the task, and shows a saved confirmation

#### Scenario: Save is unavailable when submission is unavailable

- **WHEN** a task's submission controls are unavailable (unclaimed, a
  non-candidate, or a non-running instance)
- **THEN** the screen offers no active Save control

### Requirement: The task screen restores a saved form draft on open

On open, the task screen SHALL seed editable fields from the draft's data when
the view carries a `draft`. Otherwise the screen SHALL seed them from the
instance's committed values. The screen SHALL also show a notice that a form
draft was restored, naming its save time. Readonly fields SHALL keep their
committed values.

#### Scenario: A saved form draft pre-fills the form

- **WHEN** a participant reopens a task whose view carries a draft for the
  current step
- **THEN** the editable fields show the draft's values and a notice states
  that a form draft was restored

#### Scenario: No form draft leaves the form on committed values

- **WHEN** a participant opens a task whose view carries no draft
- **THEN** the fields seed from the instance's committed values and no restore
  notice appears
