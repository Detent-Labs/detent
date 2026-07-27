# jwt-authentication Specification

## Purpose

The production-capable `ActorResolver` (`src/auth/jwt.ts`): bearer-token
extraction, `iss`-based verifier dispatch (the local signing key for
`iss: "bps"`, JWKS for any other configured issuer), signature/`exp`/`aud`
verification via `jose`, and claim-to-`Actor` mapping including a
per-issuer configurable roles claim. Both the local and JWKS branches
produce the same `Actor { id, roles }` shape, so a project-local account
(see the `local-user-accounts` capability) and an externally-issued
identity (e.g. Entra ID) are indistinguishable to everything downstream of
the resolver and are accepted simultaneously — adding an external IdP is a
config entry in `AUTH_ISSUERS`, not a rewrite. `AUTH_JWT_SECRET` /
`AUTH_ISSUERS`, read in the composition root (`src/http/server.ts`), select
this resolver over the non-production dev header resolver (see the
`actor-resolution` capability); the two are never active simultaneously.

## Requirements

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
This applies identically to every issuer, local or external — `IssuerConfig`
(`src/auth/jwt.ts`) has no per-issuer subject-claim field, only `iss`,
`jwksUrl`, `audience`, `rolesClaim`. NOT YET BUILT: for an external identity
provider whose `sub` is not a stable, non-PII subject identifier (e.g. Entra
ID, where the stable identifier is the `oid` claim, not `sub`), `Actor.id`
today is whatever that provider's `sub` contains — there is no configurable
subject-claim override to point at `oid` instead. A deployment integrating
such a provider must currently ensure its `sub` claim is already the value
this system should use as the actor's identity; this is a known gap, not a
guarantee the code enforces.

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
