## MODIFIED Requirements

### Requirement: ActorResolver is a pluggable extension point with no default production implementation

The engine SHALL expose an `ActorResolver` type,
`(credential: unknown) => Promise<Actor>`, in `src/auth/resolve.ts`. A host
wires exactly one `ActorResolver` at startup, alongside the existing `Registry`/
`resolveBody` injection. Core SHALL ship two implementations: the
non-production `devHeaderResolver` (below) and the production-capable
`jwtResolver` (see the `jwt-authentication` capability). Which of the two the
HTTP server uses is decided by environment configuration, never by both being
active at once.

#### Scenario: No ActorResolver is exported as a default

- **WHEN** `src/auth/resolve.ts` is inspected for exports
- **THEN** it exports the `ActorResolver` type and the dev header-based
  resolver only — the production JWT resolver lives in `src/auth/jwt.ts`, and
  neither is applied unless a host wires it

#### Scenario: Exactly one resolver is active per server

- **WHEN** the HTTP server is constructed
- **THEN** it holds exactly one `ActorResolver`, and no route consults a second
  one

### Requirement: The dev header-based resolver constructs an Actor from trusted headers

One concrete `ActorResolver`, documented as non-production, SHALL be shipped
for local/dev/example use: given the request's `Headers`, it SHALL read
`X-Actor-Id` and `X-Actor-Roles` itself and construct `Actor { id: X-Actor-Id,
roles: X-Actor-Roles split on "," (empty array if absent) }` when `X-Actor-Id`
is present, and SHALL throw `ActorResolutionError` when `X-Actor-Id` is missing
or empty.

#### Scenario: Valid headers resolve to an Actor

- **WHEN** the dev resolver is called with headers carrying `X-Actor-Id: user_1`
  and `X-Actor-Roles: employee,finance-approver`
- **THEN** it resolves to `Actor { id: "user_1", roles: ["employee",
  "finance-approver"] }`

#### Scenario: A missing actor-id header is rejected

- **WHEN** the dev resolver is called with headers carrying no `X-Actor-Id`
- **THEN** it throws `ActorResolutionError`

#### Scenario: A missing roles header resolves to an empty roles array

- **WHEN** the dev resolver is called with headers carrying `X-Actor-Id: user_1`
  and no `X-Actor-Roles`
- **THEN** it resolves to `Actor { id: "user_1", roles: [] }`

## ADDED Requirements

### Requirement: A resolver receives the request headers, not a resolver-specific credential shape

The credential passed to an `ActorResolver` SHALL be the request's `Headers`.
Each resolver SHALL read whatever it needs from them — `Authorization` for the
JWT resolver, `X-Actor-Id` / `X-Actor-Roles` for the dev resolver. The
transport layer SHALL NOT pre-extract any resolver-specific field.

#### Scenario: Both shipped resolvers accept the same credential

- **WHEN** the same request `Headers` object is passed to the dev resolver and
  to the JWT resolver
- **THEN** each reads the headers it needs and neither requires a different
  credential shape from the caller

#### Scenario: The DevHeaderCredential type no longer exists

- **WHEN** `src/auth/resolve.ts` is inspected for exports
- **THEN** no `DevHeaderCredential` type is exported, and no caller constructs
  `{ actorIdHeader, actorRolesHeader }`
