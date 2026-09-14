## MODIFIED Requirements

### Requirement: A case's starter may discard it

The task screen SHALL offer a "Discard case" control that calls
`POST /instances/:id/cancel`. This control SHALL be available to the actor who
started the instance, consistent with the engine now authorizing a case's own
starter to cancel it in addition to `system:cancel-any`.

The control SHALL render only while the instance's `status` is `"running"`;
for a non-running instance the screen SHALL show no Discard-case control at
all, matching how the screen already hides Claim/Release/Delegate-to for a
non-running instance. Within a running instance, the control's enabled state
SHALL follow `InstanceView.canCancel` exactly: the screen SHALL NOT re-derive
whether the current actor may cancel from `startedBy` or from a role on its
own. Where `canCancel` is `false`, the control SHALL render disabled rather
than be hidden, with a short explanation naming why the case can no longer be
discarded, so a starter who has used the control before does not read its
disappearance as a bug. Where `canCancel` is `true`, the control SHALL behave
exactly as before this change.

The explanation SHALL be visible text, never a `title` tooltip alone — the
same rule this screen's Claim-disabled state already follows, for the same
reason: a `disabled` button suppresses pointer events, touch devices have no
hover, and assistive technology skips disabled controls.

#### Scenario: The starter discards their own case

- **WHEN** the actor who started an instance clicks "Discard case" while
  `InstanceView.canCancel` is `true`
- **THEN** `POST /instances/:id/cancel` is called and succeeds

#### Scenario: The control is disabled once the case is no longer cancellable

- **WHEN** the task screen opens a running instance whose
  `InstanceView.canCancel` is `false`
- **THEN** the "Discard case" control renders disabled, with a visible-text
  explanation of why, and issues no `POST /instances/:id/cancel` call

#### Scenario: The explanation survives without a pointer

- **WHEN** the "Discard case" control is disabled
- **THEN** the reason it is disabled is readable as visible text, not carried
  only in a `title` attribute

#### Scenario: A finished case shows no Discard-case control

- **WHEN** the task screen opens a completed or cancelled instance
- **THEN** it renders no Discard-case control, matching the existing
  claim-control precedent for a non-running instance
