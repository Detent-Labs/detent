## Purpose

The `instance.transition` action type moves an instance that already exists
along one named manual path. It closes the write half of the pattern
`instance.query` opened. A process reads other processes' instances as options.
This action moves the one an author picked.

## ADDED Requirements

### Requirement: The action type is author-visible and registry-resolved

The engine SHALL register an action type `instance.transition` in the default
action registry, beside `http.request`, `notification.email` and
`process.start`.

The type SHALL carry no `core.` prefix. An author SHALL be able to place it
wherever an authored body offers an action position.

The registry SHALL resolve the type and check its config at publish time. It
does that the way it resolves every other action type.

#### Scenario: The type resolves at publish

- **WHEN** an author publishes a body carrying an `instance.transition` action
  whose config satisfies the type's config schema
- **THEN** publish accepts the body

#### Scenario: An invalid config rejects the publish

- **WHEN** an author publishes a body carrying an `instance.transition` action
  whose config omits a required key
- **THEN** publish throws and persists no version

### Requirement: The config names a process, a field and a path

The action's config SHALL carry exactly three keys, each a flat string:

- `processId`: the process whose instance this action transitions.
- `instanceIdField`: the id of a field in the ACTING instance's own catalog.
  That field's value at delivery time is the target instance's id.
- `pathId`: the id of a path on the target process's step. The action drives
  the target instance along this path.

The config SHALL NOT accept an expression for the target instance. A field id
is the shape `instance.query` already writes a picked option's value into. It
is also the only shape a publish-time reference check can resolve.

Every config value is a flat string. The studio SHALL therefore generate this
action's config form from the config schema, with no hand-written surface.

#### Scenario: The target resolves from the acting instance's data

- **WHEN** an `instance.transition` action delivers, and the acting instance's
  `data` holds an instance id under `instanceIdField`
- **THEN** the action loads that instance as its target

#### Scenario: An empty field parks nothing and reports

- **WHEN** the acting instance holds no value under `instanceIdField`
- **THEN** the delivery fails permanently, naming the empty field, and the
  acting instance keeps its own progress

<!-- OpenSpec matches a scenario heading verbatim, so this one's wording stays as authored. -->
<!-- antislop: allow passive-voice -->
#### Scenario: A target of the wrong process is refused

- **WHEN** the resolved instance's `processId` differs from the config's
  `processId`
- **THEN** the delivery fails permanently, naming both process ids, and the
  target instance does not move

### Requirement: The action drives the target as the system actor

The action SHALL execute the target's transition as the system actor, never as
the participant whose submission enqueued it.

The target path's guard therefore evaluates against the system actor. A guard
on the target path SHALL NOT read the triggering participant's identity or
roles.

The engine chooses the system actor because the triggering participant holds no
role inside the target process. A guard reading that participant's roles would
compare an identity that means nothing where the engine evaluates it. A guard
reading the system actor in one delivery and a participant in another would be
worse still. An outbox row enqueued before the engine recorded actor ids
carries none. The guard's answer would then depend on the row's age.

#### Scenario: A guard on the target path sees the system actor

- **WHEN** the target path carries a guard reading `actor.id`
- **THEN** the guard evaluates against the system actor's id

### Requirement: The path must be manual and must leave the target's current step

The action SHALL drive the target only along a path that the target's CURRENT
step declares. That path's trigger SHALL be `manual`.

A target standing on a different step SHALL NOT move. A target whose status is
not `running` SHALL NOT move.

Each of those three refusals SHALL fail the delivery permanently rather than
consume a retry. A target that has left the path's source step does not return
to it. A cancelled instance does not resume. A later delivery therefore cannot
succeed.

A concurrent delivery can lose a write race on the same target. That happens
when two deliveries both find it standing on the path's source step before
either commits. Such a delivery SHALL fail permanently too, not merely on a
later retry.

The engine MAY deliver two acting instances' outbox rows at the same time.
This race is therefore reachable within one delivery, not only across a
delivery and its own redelivery. A loser learns nothing a retry would
improve. The winner's commit already moved the target, the same fact the
current-step refusal covers.

#### Scenario: Two participants pick the same target

- **WHEN** two acting instances deliver an `instance.transition` naming one
  target and one path, and the first moves the target
- **THEN** the second delivery fails permanently, naming the step the target
  stands on, and the target moves once

#### Scenario: Two concurrent deliveries race for the same target

- **WHEN** two acting instances deliver an `instance.transition` naming one
  target and one path
- **AND** both find the target standing on the path's source step before
  either commits
- **THEN** exactly one delivery moves the target, and the other fails
  permanently on that same delivery, never on a retry

<!-- OpenSpec matches a scenario heading verbatim, so this one's wording stays as authored. -->
<!-- antislop: allow passive-voice -->
#### Scenario: An automatic path is refused

- **WHEN** the config's `pathId` names a path whose trigger is `automatic`
- **THEN** the delivery fails permanently and the target does not move

#### Scenario: A cancelled target does not move

- **WHEN** the target instance's status is `cancelled`
- **THEN** the delivery fails permanently, naming the status, and the target
  does not move

### Requirement: A refused guard fails permanently

The action SHALL treat a guard that refuses the target path as a permanent
error.

A guard is pure and total, and the action evaluates it against the same system
actor on every delivery. Its answer therefore cannot change between two
deliveries of the same row. Retrying a refused guard burns four further
deliveries and reports the same refusal at the end.

#### Scenario: The target path's guard refuses

- **WHEN** the target path's guard evaluates false against the target's data
- **THEN** the delivery fails permanently, naming the path, and the target does
  not move

### Requirement: A redelivery moves the target at most once

Outbox delivery is at-least-once. The action's transition commits outside the
transaction that marks the row delivered. The engine MAY therefore deliver the
same row again after its transition already committed.

The action SHALL move a target at most once per outbox row. It SHALL look for
an `instance.transitioned-by-action` event on the target carrying this
delivery's idempotency key before transitioning. It SHALL report success
without transitioning again when it finds one.

This check SHALL run before the current-step check. Without that ordering a
redelivery of a successful transition is indistinguishable from the collision
above. The engine would then dead-letter a delivery that in fact succeeded.

#### Scenario: A redelivery after a committed transition succeeds silently

- **WHEN** the engine delivers a row again, and the target already carries that
  row's `instance.transitioned-by-action` event
- **THEN** the delivery reports success and the target does not move again

#### Scenario: A redelivery after a crashed transition completes it

- **WHEN** the engine redelivers a row whose event is missing from a target
  still standing on the path's source step
- **THEN** the delivery transitions the target and appends the event

### Requirement: The transition drives the target to rest

The action SHALL run the target instance to rest after committing the named
transition. The target therefore takes an automatic path leaving the new step
in the same delivery.

#### Scenario: The target's new step leaves by an automatic path

- **WHEN** the action moves a target onto a step whose only outgoing path is
  automatic and whose guard passes
- **THEN** the target continues along that path in the same delivery

### Requirement: The action does not cross the v1 boundaries

The action SHALL move exactly one instance per delivery. It SHALL NOT fan out
to a set of instances.

The action SHALL execute after the acting instance's own state commits, like
every other action. It SHALL NOT block the acting instance's transition.

A failed delivery SHALL NOT roll back the acting instance's own transition.

#### Scenario: The acting instance keeps its progress when the action fails

- **WHEN** an `instance.transition` delivery fails permanently
- **THEN** the acting instance stays on the step its own transition reached

### Requirement: Publish resolves instanceIdField in the publishing body's own catalog

Publishing SHALL resolve every `instance.transition` action's
`instanceIdField` against the publishing body's field catalog.

A field id the catalog does not carry SHALL fail the publish. The error SHALL
name the action's location in the body and the unresolved field id.

This check rejects rather than reports, unlike the target-process references.
The acting body's own catalog is a fact the publish holds in hand. It does not
move after the check. A typo here would otherwise dead-letter every delivery of
the action, one instance at a time. Publishing would report nothing at
authoring time.

#### Scenario: An unknown field rejects the publish

- **WHEN** an `instance.transition` action names an `instanceIdField` the
  publishing body's catalog does not declare
- **THEN** publishing throws, names the action's location and that field id,
  and persists no version

#### Scenario: A declared field publishes

- **WHEN** the `instanceIdField` names a field the publishing body declares
- **THEN** publishing does not reject the action for that reference
