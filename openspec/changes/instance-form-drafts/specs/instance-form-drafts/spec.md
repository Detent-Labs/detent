<!-- antislop: allow-file passive-voice -- SHALL requirements act on the draft and instance as subjects, so the passive register is correct here -->

# instance-form-drafts

## Purpose

A participant can save an unfinished form on a running instance and resume
it later. Saving never submits or advances the step.

## ADDED Requirements

### Requirement: One mutable form draft per instance

The engine SHALL persist a participant's unfinished form input in a dedicated
`instance_drafts` table, keyed by `instance_id`. An instance holds at most one
draft. The table SHALL carry the draft's data and the step id where it was
saved. It SHALL also carry the saving actor and the save time. The engine
SHALL expose get, save, and delete operations over that table.

#### Scenario: A second save for the same instance replaces the first

- **WHEN** an actor saves a draft twice for the same instance
- **THEN** exactly one `instance_drafts` row exists for that instance, and its
  data reflects the second save

#### Scenario: A saved draft reads back

- **WHEN** an actor saves a draft and then reads it
- **THEN** the read returns the saved data, the step it was saved on, the
  saving actor, and a save time

### Requirement: A form draft stores the input exactly as entered

The draft store SHALL store the field-to-value map exactly as the participant
entered it. It SHALL validate only two things: the map is a plain JSON object,
and its size stays within `MAX_DRAFT_ENVELOPE_BYTES`. It SHALL run no type,
option, constraint, rule, or required check. Submission stays the only path
that validates the input.

#### Scenario: An incomplete or wrong-typed draft is stored

- **WHEN** an actor saves a draft whose values would fail submission
  validation
- **THEN** the save succeeds and the draft stores those values unchanged

#### Scenario: A non-object draft is refused

- **WHEN** a save supplies data that is an array, a string, a number, or null
- **THEN** it raises `RequestShapeError` and writes no row and changes none

### Requirement: A form draft records the step it was saved on

A save SHALL record the instance's current step id at the time of the save. A
draft SHALL be offered only when its recorded step matches the instance's
current step.

#### Scenario: A draft from a previous step is not offered

- **WHEN** an instance holds a draft saved on step A, and the instance later
  rests on step B
- **THEN** the draft is not offered, even though the row still exists

### Requirement: A form draft is cleared when the instance moves, ends, or is redacted

The engine SHALL delete the instance's draft on a step transition, a version
migration, a cancel, and a redaction. A participant who returns to a step
after the instance moved away therefore starts with no draft.

#### Scenario: A submit clears the draft

- **WHEN** a participant submits and the instance moves to another step
- **THEN** the instance holds no draft

#### Scenario: A cancel clears the draft

- **WHEN** an instance holding a draft is cancelled
- **THEN** the instance holds no draft

#### Scenario: A version migration clears the draft

- **WHEN** a running instance holding a draft is migrated to a new version
- **THEN** the instance holds no draft after the migration

#### Scenario: A redaction clears the draft

- **WHEN** a completed instance holding a draft is redacted
- **THEN** the instance holds no draft after the redaction
