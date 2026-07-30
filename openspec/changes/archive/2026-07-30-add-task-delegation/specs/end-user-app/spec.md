<!-- antislop: allow-file passive-voice -->
## ADDED Requirements

### Requirement: Claimed tasks offer a Delegate-to action

The task screen SHALL offer a "Delegate to" control whenever the current
user holds the claim. It is a text input for a target actor id, plus a
submit action calling `POST /instances/:id/delegate`. On success the
form returns to its claimed presentation, with the new claimant
reflected. The current user can no longer submit or release the task,
once delegated away.

#### Scenario: The claimant delegates to another actor

- **WHEN** a user who holds the claim enters a target actor id and submits
  the Delegate-to control
- **THEN** `POST /instances/:id/delegate` is called and, on success, the
  claim moves to the named actor

#### Scenario: A delegated-away task no longer belongs to the delegator

- **WHEN** a user who just delegated their claim away re-opens the same
  task
- **THEN** the form reflects an unclaimed-by-them state, with no Release
  or path-submit action available to them

#### Scenario: The Delegate-to control is unavailable before claiming

- **WHEN** a user opens an unclaimed, assignment-bearing task
- **THEN** no Delegate-to control is shown until the task is claimed
