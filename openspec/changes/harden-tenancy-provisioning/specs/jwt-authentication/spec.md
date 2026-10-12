<!-- antislop: allow-file passive-voice em-dash sentence-length trailing-negation run-ons negation-habit -->
<!-- Both MODIFIED requirements are copied whole from the live spec, as the MODIFIED rule demands.
     The copy carries the live spec's findings, and only the tenant lines are new. -->
# Spec Delta

## MODIFIED Requirements

### Requirement: Claims map to Actor via a configurable roles claim

`jwtResolver` SHALL map the token's `sub` claim to `Actor.id` and the claim
named by the issuer's configured `rolesClaim` to `Actor.roles`. A token
carrying no such claim SHALL resolve to `roles: []` rather than being rejected.
This applies identically to every issuer, local or external — `IssuerConfig`
(`src/auth/jwt.ts`) has no per-issuer subject-claim field, only `iss`,
`jwksUrl`, `audience`, `rolesClaim` and `tenant`. NOT YET BUILT: for an external identity
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
`{iss, jwksUrl, audience, rolesClaim}` plus an optional `tenant`), following the same convention as
`DATABASE_URL` and `CORS_ALLOWED_ORIGINS`. If either variable is set, the JWT
resolver SHALL be the server's `ActorResolver` and `devHeaderResolver` SHALL
NOT be. The two SHALL NEVER be active simultaneously. A malformed
`AUTH_ISSUERS` value SHALL fail server startup rather than silently disabling
issuers.

If **neither** variable is set, the server SHALL fail to start unless
`ALLOW_INSECURE_DEV_AUTH=1` is set explicitly. That flag — and only that
flag — selects `devHeaderResolver`. Doing so SHALL emit a startup warning
naming the trusted headers and stating that authentication is disabled.
Selecting the unsigned-header resolver is therefore always a recorded
decision, never the consequence of an omitted variable. The error message
SHALL name `AUTH_JWT_SECRET`, `AUTH_ISSUERS` and the flag. This lets the
operator tell which of the three they meant.

No call site SHALL be able to reach `devHeaderResolver` by omission.
`createServer`'s `resolver` parameter SHALL have no default. Whoever
constructs a server SHALL always pass a resolver deliberately.

When `AUTH_JWT_SECRET` is set, it SHALL encode (UTF-8) to at least 32 bytes.
This is the output size of the HMAC-SHA-256 the local `HS256` tokens use. A shorter
value SHALL fail startup with an error naming the variable. This is the same
fail-loud treatment a malformed `AUTH_ISSUERS` value already gets. The same
validated value SHALL also be the login route's signing key. The
verification key and the issuing key therefore cannot diverge.

#### Scenario: No auth environment and no flag fails startup

- **WHEN** the server starts with neither `AUTH_JWT_SECRET` nor `AUTH_ISSUERS`
  set, and `ALLOW_INSECURE_DEV_AUTH` unset or not `1`
- **THEN** startup fails with an error naming both variables and the flag, and
  no server listens

#### Scenario: The explicit flag selects the dev resolver, loudly

- **WHEN** the server starts with no auth variables and
  `ALLOW_INSECURE_DEV_AUTH=1`
- **THEN** the active resolver is `devHeaderResolver`, a warning is emitted at
  startup stating that authentication is disabled and that `X-Actor-*` headers
  are trusted verbatim, and header-based requests behave exactly as before

#### Scenario: A signing key activates the JWT resolver

- **WHEN** the server starts with `AUTH_JWT_SECRET` set to a value of at least
  32 encoded bytes
- **THEN** the active resolver is the JWT resolver, and a request carrying only
  `X-Actor-Id` is rejected

#### Scenario: A too-short signing key fails startup

- **WHEN** the server starts with `AUTH_JWT_SECRET` set to a value shorter
  than 32 encoded bytes
- **THEN** startup fails with an error naming `AUTH_JWT_SECRET`, and no server
  listens — the value is not accepted with a warning

#### Scenario: Issuers alone activate the JWT resolver

- **WHEN** the server starts with `AUTH_ISSUERS` set and `AUTH_JWT_SECRET`
  unset
- **THEN** the active resolver is the JWT resolver and only externally-issued
  tokens are accepted

#### Scenario: Malformed issuer configuration fails startup

- **WHEN** the server starts with an `AUTH_ISSUERS` value that is not a JSON
  array of valid issuer entries
- **THEN** startup fails with an error naming the configuration variable

#### Scenario: An issuer entry may name a tenant

- **WHEN** the server starts with an `AUTH_ISSUERS` entry that carries
  `tenant: "acme"`
- **THEN** startup parses the entry and keeps the tenant

#### Scenario: A tenant that is not a string fails startup

- **WHEN** the server starts with an `AUTH_ISSUERS` entry whose `tenant` is a
  number
- **THEN** startup fails with an error naming the configuration variable

#### Scenario: A server cannot be constructed without choosing a resolver

- **WHEN** `createServer` is called
- **THEN** its `resolver` argument is required — omitting it is a type error,
  not a silent selection of the unsigned-header resolver
