# Spec Delta

<!-- antislop: allow-file passive-voice -->
<!-- Why: the file quotes the catalog value "How it is taken" word for word, in headings and in bullets. -->

## REMOVED Requirements

### Requirement: The path inspector shows a "triggered by" control, and the guard for either trigger under an "Only when" heading

**Reason**: The requirement's own heading and two scenario names quote the
words "triggered by" and "a condition". Stage 64's vocabulary table
replaces both. A MODIFIED block cannot rename them. The requirement returns
as two requirements with the author's words and the same behavior.

**Migration**: Read "A way out's row shows a "How it is taken" control".
Then read "A way out's guard stands under "Only when" for either trigger".

## ADDED Requirements

### Requirement: A way out's row shows a "How it is taken" control

A way out's row SHALL render the path's existing `trigger` field as a
two-option segmented control, labeled "How it is taken". The options are "A
person chooses" (`trigger: "manual"`) and "Happens by itself"
(`trigger: "automatic"`). This SHALL set the same field the row set before.
Choosing "A person chooses" SHALL drop the path's `priority` and SHALL keep
its guard. Choosing "Happens by itself" SHALL keep a guard the path already
carries.

#### Scenario: Choosing "Happens by itself" makes the path automatic

- **WHEN** the developer selects "Happens by itself" in a way out's "How it
  is taken" control
- **THEN** the path's `trigger` becomes `automatic`

#### Scenario: Switching to a person's choice drops the priority and keeps the guard

- **WHEN** an automatic way out carries a priority and a guard
- **AND** the developer selects "A person chooses"
- **THEN** the path has no `priority` key
- **AND** its guard stays as it was

### Requirement: A way out's guard stands under "Only when" for either trigger

The row SHALL render the existing `ConditionBuilder` row UI under an "Only
when" heading for both triggers. On an automatic way out the guard decides
whether the engine takes it. On a manual way out the guard decides whether
the person gets the button. The row SHALL say so beside the guard. The
`priority` input SHALL render for an automatic way out alone.

#### Scenario: An automatic way out shows the guard under "Only when"

- **WHEN** a way out's `trigger` is `automatic`
- **THEN** the existing `ConditionBuilder` row UI renders under an "Only
  when" heading
- **AND** a `priority` input renders beside it

#### Scenario: A manual way out shows its guard editor

- **WHEN** the developer opens a manual way out
- **THEN** the "Only when" heading and the `ConditionBuilder` row UI render
- **AND** no `priority` input renders
