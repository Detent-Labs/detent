## MODIFIED Requirements

### Requirement: The header bar holds back, name, state, Test, Publish and the menu

The process surface SHALL carry a header bar above the tab row, directly under
the shared header. No row SHALL stand between the two while no banner stands.

The bar SHALL hold, in order, a back control, the process name and the draft's
state. The Test control, the Publish control and the `⋮` menu trail them. The
back control reads "← Processes". Its accessible name SHALL read "Back to
processes".

#### Scenario: A clean draft's bar holds six things

- **WHEN** an author opens a saved draft of a published process
- **THEN** the bar reads the back control, the name, the state, Test, Publish
  and the `⋮` menu
- **AND** no key, revision, hash or locale code prints in the bar

#### Scenario: The back control keeps the leave guard

- **WHEN** an author presses the back control while a change has not landed
- **THEN** that change saves first, and the leave dialog asks only if the save fails

### Requirement: The header bar keeps no command logic

`useDraftToolbarActions` SHALL compute when each command is available and what it
does. The bar SHALL keep no copy of that logic.

#### Scenario: The bar calls the one hook

- **WHEN** an author presses Publish or Try again
- **THEN** the call runs the logic `useDraftToolbarActions` holds

### Requirement: The header bar's state says what holds for the draft

The state SHALL read "Saving…" from a change until its save answers. It SHALL read
"Saved just now" for the first minute after a save in this session. It SHALL then read
"Saved at" and a time. It SHALL read "Saved" where no save has run in this session.

It SHALL read "Unsaved changes", in the refusal tone, in four cases. A save has
failed. A conflict stands over a dirty draft. A restore notice holds a change back. The
JSON surface holds text no Apply has taken.

Where a published version exists, the state SHALL add that version and the word
"published". The version SHALL print in the mono face.

A save point restore is a stored write, so it counts as a save for these readings.

The visible state SHALL be no live region, so a save stays quiet for an author typing.
A polite status beside it SHALL announce three moments. They are "Unsaved changes" on
entering that state, "Saved" on leaving it, and the version after a publish. That
announcement moves no focus. Only the Try again rule in `studio-process-tabs` sends
focus to the state.

#### Scenario: A dirty draft's bar names its state

- **WHEN** a save has failed and the draft carries the change
- **THEN** the bar prints "Unsaved changes" in the refusal tone

#### Scenario: A save names its time

- **WHEN** a save succeeds
- **THEN** the state reads "Saved just now"
- **AND** it reads "Saved at" and the time of that save a minute later

#### Scenario: A restore names its time

- **WHEN** a save point restore lands
- **THEN** the state reads "Saved just now"

#### Scenario: Unapplied JSON reads as unsaved

- **WHEN** the JSON surface holds text no Apply has taken, over a clean draft
- **THEN** the bar prints "Unsaved changes" in the refusal tone

#### Scenario: A published process names its version

- **WHEN** an author opens a saved draft whose base version is 1
- **THEN** the state reads "Saved" and "v1 published"

#### Scenario: A process with no published version prints no version

- **WHEN** an author opens a draft with no base version
- **THEN** the state prints no version

#### Scenario: A change reads as saving

- **WHEN** an author changes the draft
- **THEN** the state reads "Saving…" in the muted tone until the save answers

#### Scenario: A save stays silent for a screen reader

- **WHEN** an author types and an automatic save succeeds
- **THEN** the polite status announces nothing
