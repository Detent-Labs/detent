# action-registry-validation

## Purpose

Authoring-time validation that resolves every action's `type` against the
handler `Registry` and checks its `config` against the handler's declared
`configSchema`, producing located issues analogous to `CelIssue`. Invoked by
`publishBody` (see `definition-store`) so an unregistered handler type or a
malformed plugin config is a publish error, never a runtime dead-letter.

## Requirements

### Requirement: Every action's type resolves in the registry

Authoring-time validation SHALL resolve each `Action.type` in a compiled body
against the injected `Registry`, visiting every action position the
definition declares one in: a step's `onEntry`, `onExit`, `onCancel`; each of
its paths' `onPath`; and each of its timers' `onFire.actions`. An `Action`
whose `type` is not registered SHALL produce a located issue and SHALL NOT be
checked further (its `config` is not validated when its `type` is already
unresolved).

No action type SHALL be exempt from this check, including one using the
reserved `core.` prefix. The previous exemption rested on the premise that a
`core.`-prefixed type "can never be present in an authored body"; that premise
was falsified by the compile pass's idempotent early return, which skipped the
only check enforcing it. With the prefix ban now on the write path and ahead
of that return (`definition-contract`), a `core.`-prefixed action cannot reach
this check from a published body at all — so removing the exemption costs
nothing and removes a second layer that would have to be re-argued if any
other path ever produced one.

The engine's two internal handlers (`SPAWN_ACTION_TYPE`, `RETURN_ACTION_TYPE`)
SHALL declare `configSchema`s describing the config they are actually
dispatched with, so that a config reaching them is shape-checked rather than
accepted as author-controlled `unknown`.

#### Scenario: An action with a registered type passes

- **WHEN** a compiled body's action has a `type` present in the registry
- **THEN** the type check for that action produces no issue

#### Scenario: An action with an unregistered type is rejected

- **WHEN** a compiled body's action has a `type` absent from the registry
- **THEN** validation produces a located issue naming the action's location
  and its unregistered `type`, and does not also report a config issue for
  that same action

#### Scenario: Every action position is visited

- **WHEN** a compiled body declares actions in `onEntry`, `onExit`,
  `onCancel`, a path's `onPath`, and a timer's `onFire.actions`, each with an
  unregistered type
- **THEN** validation produces one located issue per action, covering all
  five positions

#### Scenario: A core.-prefixed action type is checked like any other

- **WHEN** validation encounters an action whose `type` starts with the
  reserved `core.` prefix
- **THEN** it is resolved against the registry and, when the resolved handler
  declares a `configSchema`, its `config` is parsed against that schema —
  it is not skipped

#### Scenario: The internal handlers declare their config shape

- **WHEN** the subprocess handlers are registered
- **THEN** the spawn handler declares a `configSchema` for
  `{ subprocessStepId, parentSeq }` and the return handler one for
  `{ parentInstanceId, childOutcome }`

### Requirement: A resolved action's config is checked against its handler's schema

When a handler declares a `configSchema`, authoring-time validation SHALL
parse the action's `config` against it and SHALL produce a located issue for
each violation when the parse fails. A handler with no declared
`configSchema` SHALL accept any `config` — the schema is opt-in per handler,
not required.

#### Scenario: A config matching its handler's schema passes

- **WHEN** a resolved action's `config` satisfies its handler's declared
  `configSchema`
- **THEN** validation produces no issue for that action's config

#### Scenario: A config violating its handler's schema is rejected

- **WHEN** a resolved action's `config` fails its handler's declared
  `configSchema`
- **THEN** validation produces at least one located issue identifying the
  action's location and the schema violation

#### Scenario: A handler with no declared schema accepts any config

- **WHEN** a resolved action's handler has no `configSchema`
- **THEN** validation produces no config issue for that action, regardless
  of the `config`'s shape

### Requirement: Every located issue is reported, not only the first

Validation SHALL collect every issue across every action in the body before
returning, mirroring the existing CEL validation contract of surfacing a
whole publish's worth of fixes at once.

#### Scenario: Multiple invalid actions each produce an issue

- **WHEN** a compiled body has two actions that each fail validation (for any
  combination of an unregistered type or a schema-violating config)
- **THEN** the returned issues include one entry for each, not only the
  first encountered
