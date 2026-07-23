## ADDED Requirements

### Requirement: ActorResolver is a pluggable extension point with no default production implementation

The engine SHALL expose an `ActorResolver` type,
`(credential: unknown) => Promise<Actor>`, in `src/auth/resolve.ts`. No
default production implementation SHALL ship in core. A host wires exactly
one `ActorResolver` at startup, alongside the existing `Registry`/
`resolveBody` injection.

#### Scenario: No ActorResolver is exported as a default

- **WHEN** `src/auth/resolve.ts` is inspected for exports
- **THEN** it exports the `ActorResolver` type and the dev header-based
  resolver only — no resolver is presented as suitable for production use

### Requirement: A resolver that cannot authenticate a credential throws a distinct error

An `ActorResolver` implementation, when given a credential it cannot turn
into a trusted `Actor`, SHALL throw `ActorResolutionError` rather than
returning a placeholder or default `Actor`.

#### Scenario: An unresolvable credential throws ActorResolutionError

- **WHEN** an `ActorResolver` is invoked with a credential it cannot
  authenticate
- **THEN** it throws `ActorResolutionError` and produces no `Actor`

### Requirement: The dev header-based resolver constructs an Actor from trusted headers

One concrete `ActorResolver`, documented as non-production, SHALL be
shipped for local/dev/example use: given a credential shaped as
`{ actorIdHeader: string | undefined, actorRolesHeader: string | undefined
}` (the `X-Actor-Id` / `X-Actor-Roles` header values), it SHALL construct
`Actor { id: actorIdHeader, roles: actorRolesHeader split on "," (empty
array if absent) }` when `actorIdHeader` is present, and SHALL throw
`ActorResolutionError` when `actorIdHeader` is missing or empty.

#### Scenario: Valid headers resolve to an Actor

- **WHEN** the dev resolver is called with `X-Actor-Id: user_1` and
  `X-Actor-Roles: employee,finance-approver`
- **THEN** it resolves to `Actor { id: "user_1", roles: ["employee",
  "finance-approver"] }`

#### Scenario: A missing actor-id header is rejected

- **WHEN** the dev resolver is called with no `X-Actor-Id` header present
- **THEN** it throws `ActorResolutionError`

#### Scenario: A missing roles header resolves to an empty roles array

- **WHEN** the dev resolver is called with `X-Actor-Id: user_1` and no
  `X-Actor-Roles` header
- **THEN** it resolves to `Actor { id: "user_1", roles: [] }`
