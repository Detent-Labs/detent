## MODIFIED Requirements

### Requirement: A case's starter may discard it

The task screen SHALL offer a "Discard case" control that calls
`POST /instances/:id/cancel`. This control SHALL be available to the actor who
started the instance, consistent with the engine now authorizing a case's own
starter to cancel it in addition to `system:cancel-any`.

The control SHALL render only while the instance's `status` is `"running"`.
For a non-running instance, the screen SHALL render no Discard-case control
at all. That matches how the screen already hides Claim/Release/Delegate-to
for a non-running instance. Within a running instance, the control's enabled
state SHALL follow `InstanceView.canCancel` exactly. The screen SHALL NOT
re-derive whether the current actor may cancel from `startedBy` or from a
role on its own.

Where `canCancel` is `false`, the control SHALL render
disabled rather than disappear. A short explanation SHALL name why the actor
can no longer discard the case. That way, a starter who has used the control
before does not read its disappearance as a bug. Where `canCancel` is
`true`, the control SHALL behave exactly as before this change.

The explanation SHALL be visible text, never a `title` tooltip alone,
matching this screen's Claim-disabled state. The reason is the same. A
`disabled` button suppresses pointer events, touch devices have no hover,
and assistive technology skips disabled controls.

#### Scenario: The starter discards their own case

- **WHEN** the actor who started an instance clicks "Discard case" while
  `InstanceView.canCancel` is `true`
- **THEN** the screen calls `POST /instances/:id/cancel`, and it succeeds

#### Scenario: The control becomes disabled once the case is no longer cancellable

- **WHEN** the task screen opens a running instance whose
  `InstanceView.canCancel` is `false`
- **THEN** the "Discard case" control renders disabled, with a visible-text
  explanation of why, and issues no `POST /instances/:id/cancel` call

#### Scenario: The explanation survives without a pointer

- **WHEN** the "Discard case" control renders disabled
- **THEN** the reason it renders disabled is readable as visible text, never
  a `title` attribute alone

#### Scenario: A finished case shows no Discard-case control

- **WHEN** the task screen opens a completed or cancelled instance
- **THEN** it renders no Discard-case control, matching the existing
  claim-control precedent for a non-running instance
