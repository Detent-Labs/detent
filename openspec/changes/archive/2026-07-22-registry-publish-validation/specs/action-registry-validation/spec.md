## ADDED Requirements

### Requirement: Every action's type resolves in the registry

Authoring-time validation SHALL resolve each `Action.type` in a compiled body
against the injected `Registry`, visiting every action position the
definition declares one in: a step's `onEntry`, `onExit`, `onCancel`; each of
its paths' `onPath`; and each of its timers' `onFire.actions`. An `Action`
whose `type` is not registered SHALL produce a located issue and SHALL NOT be
checked further (its `config` is not validated when its `type` is already
unresolved).

An action whose `type` uses the reserved `core.` prefix (`SPAWN_ACTION_TYPE`,
`RETURN_ACTION_TYPE`) SHALL be exempt from this check — these are
engine-dispatched internally and never reach an author-facing registry
lookup by construction (authored bodies with a `core.`-prefixed type are
already rejected by a separate, existing check).

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

#### Scenario: A core.-prefixed action type is not checked against the registry

- **WHEN** a compiled body carries an action whose `type` starts with the
  reserved `core.` prefix
- **THEN** validation does not reject it for being unregistered, regardless
  of whether that exact type string is present in the registry

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
