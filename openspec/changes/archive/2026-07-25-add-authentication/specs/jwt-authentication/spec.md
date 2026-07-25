## ADDED Requirements

### Requirement: A JWT ActorResolver ships as a production-capable implementation

The engine SHALL ship `jwtResolver(config)` in `src/auth/jwt.ts`, an
`ActorResolver` implementation suitable for production use. Given a request's
`Headers`, it SHALL read the bearer token from the `Authorization` header,
verify it, and resolve it to an `Actor { id, roles }`. It SHALL throw
`ActorResolutionError` for every credential it cannot verify, and SHALL NOT
return a placeholder or default `Actor`.

#### Scenario: A valid locally-signed token resolves to an Actor

- **WHEN** `jwtResolver` is called with headers carrying
  `Authorization: Bearer <token>` where the token is signed with the configured
  local key and is unexpired
- **THEN** it resolves to an `Actor` whose `id` is the token's `sub` claim and
  whose `roles` come from the token's roles claim

#### Scenario: A missing Authorization header is rejected

- **WHEN** `jwtResolver` is called with headers carrying no `Authorization`
  header
- **THEN** it throws `ActorResolutionError`

#### Scenario: A malformed bearer token is rejected

- **WHEN** `jwtResolver` is called with an `Authorization` header whose value is
  not a well-formed `Bearer <jwt>`
- **THEN** it throws `ActorResolutionError`

#### Scenario: An expired token is rejected

- **WHEN** `jwtResolver` is called with a correctly-signed token whose `exp`
  claim is in the past
- **THEN** it throws `ActorResolutionError`

#### Scenario: A wrongly-signed token is rejected

- **WHEN** `jwtResolver` is called with a token whose signature does not verify
  against the key configured for its `iss`
- **THEN** it throws `ActorResolutionError`

#### Scenario: A token with the wrong audience is rejected

- **WHEN** `jwtResolver` is called with a correctly-signed token whose `aud`
  claim does not match the audience configured for its issuer
- **THEN** it throws `ActorResolutionError`

### Requirement: The resolver dispatches on the token's iss claim

`jwtResolver` SHALL select its verifier from the token's `iss` claim. The
issuer `"bps"` SHALL verify against the local signing key. Any other issuer
SHALL verify against the JWKS configured for that issuer in `AUTH_ISSUERS`. An
`iss` matching no configured issuer SHALL throw `ActorResolutionError`. Both
branches SHALL produce the same `Actor { id, roles }` shape, so that local and
externally-issued identities are indistinguishable to everything downstream of
the resolver and are accepted simultaneously.

#### Scenario: An unknown issuer is rejected

- **WHEN** `jwtResolver` is called with a well-formed token whose `iss` is
  neither `"bps"` nor a configured issuer
- **THEN** it throws `ActorResolutionError`

#### Scenario: A JWKS-issued token resolves through the JWKS branch

- **WHEN** a keypair is generated, a JWKS is built from its public key, an
  issuer entry pointing at that JWKS is configured, and a token is issued with
  the private key
- **THEN** `jwtResolver` verifies that token through the JWKS branch and
  resolves it to the expected `Actor`

#### Scenario: Local and external issuers are accepted in the same configuration

- **WHEN** the resolver is configured with both a local signing key and an
  external issuer entry
- **THEN** a token from either issuer resolves to an `Actor`, with no
  configuration switch selecting one over the other

### Requirement: Claims map to Actor via a configurable roles claim

`jwtResolver` SHALL map the token's `sub` claim to `Actor.id` and the claim
named by the issuer's configured `rolesClaim` to `Actor.roles`. A token
carrying no such claim SHALL resolve to `roles: []` rather than being rejected.
For an external identity provider the `Actor.id` value SHALL be the provider's
stable subject identifier (for Entra ID, the `oid` claim), never an email
address.

#### Scenario: The configured roles claim populates Actor.roles

- **WHEN** an issuer is configured with `rolesClaim: "groups"` and a token
  carries `groups: ["employee", "finance-approver"]`
- **THEN** the resolved `Actor.roles` is `["employee", "finance-approver"]`

#### Scenario: A token with no roles claim resolves to empty roles

- **WHEN** a valid token carries no claim under the configured `rolesClaim`
- **THEN** the resolved `Actor.roles` is `[]`

### Requirement: Environment configuration selects the JWT resolver over the dev resolver

The composition root (`src/http/server.ts`) SHALL read `AUTH_JWT_SECRET` (the
local signing key) and `AUTH_ISSUERS` (a JSON array of
`{iss, jwksUrl, audience, rolesClaim}`), following the same convention as
`DATABASE_URL` and `CORS_ALLOWED_ORIGINS`. If either variable is set, the JWT
resolver SHALL be the server's `ActorResolver` and `devHeaderResolver` SHALL
NOT be. If neither is set, `devHeaderResolver` SHALL remain the default. The
two SHALL NEVER be active simultaneously. A malformed `AUTH_ISSUERS` value
SHALL fail server startup rather than silently disabling issuers.

#### Scenario: No auth environment keeps the dev resolver

- **WHEN** the server starts with neither `AUTH_JWT_SECRET` nor `AUTH_ISSUERS`
  set
- **THEN** the active resolver is `devHeaderResolver` and existing
  header-based requests behave exactly as before

#### Scenario: A signing key activates the JWT resolver

- **WHEN** the server starts with `AUTH_JWT_SECRET` set
- **THEN** the active resolver is the JWT resolver, and a request carrying only
  `X-Actor-Id` is rejected

#### Scenario: Issuers alone activate the JWT resolver

- **WHEN** the server starts with `AUTH_ISSUERS` set and `AUTH_JWT_SECRET`
  unset
- **THEN** the active resolver is the JWT resolver and only externally-issued
  tokens are accepted

#### Scenario: Malformed issuer configuration fails startup

- **WHEN** the server starts with an `AUTH_ISSUERS` value that is not a JSON
  array of valid issuer entries
- **THEN** startup fails with an error naming the configuration variable
