## ADDED Requirements

### Requirement: The instance view carries whether the calling actor may cancel it

`getInstanceView` SHALL include a `canCancel: boolean` field in the returned
`InstanceView`, resolved through the same authorization predicate
`cancelInstance` applies to its own caller: `system:cancel-any`, a stored
per-process `"cancel"` grant, or the instance's `startedBy` matching the
calling actor AND the current step's effective `cancellable` resolving to
`true`, per the `cancellation` capability's process/step-default rule. Both
call sites SHALL share one implementation of this predicate, so the two
cannot drift the way `requireSubmitAuthority` already exists to keep
`submitAndTransition` and `saveInstanceDraft` from drifting.

`canCancel` SHALL be `false` for an instance whose `status` is not
`"running"`, mirroring `availablePaths`. It reports whether the calling
actor's own next call to `cancelInstance` would succeed, not whether some
other actor could cancel the instance.

#### Scenario: A starter sees canCancel true on a cancellable step

- **WHEN** the instance's starter calls `getInstanceView` for their own
  running instance, resting on a step whose effective `cancellable` resolves
  to `true`
- **THEN** the returned view carries `canCancel: true`

#### Scenario: A starter sees canCancel false on a non-cancellable step

- **WHEN** the instance's starter calls `getInstanceView` for their own
  running instance, resting on a step whose effective `cancellable` resolves
  to `false`
- **THEN** the returned view carries `canCancel: false`

#### Scenario: An operator sees canCancel true regardless of the step

- **WHEN** an actor holding `system:cancel-any`, or a stored `"cancel"` grant
  over the instance's process, calls `getInstanceView` for a running instance
  resting on a step whose effective `cancellable` resolves to `false`
- **THEN** the returned view carries `canCancel: true`

#### Scenario: A non-running instance always reports canCancel false

- **WHEN** any authorized actor calls `getInstanceView` for a completed,
  cancelled, or faulted instance
- **THEN** the returned view carries `canCancel: false`
