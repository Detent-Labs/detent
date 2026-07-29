## MODIFIED Requirements

### Requirement: Environment configuration selects the JWT resolver over the dev resolver

The composition root (`src/http/server.ts`) SHALL read `AUTH_JWT_SECRET` (the
local signing key) and `AUTH_ISSUERS` (a JSON array of
`{iss, jwksUrl, audience, rolesClaim}`), following the same convention as
`DATABASE_URL` and `CORS_ALLOWED_ORIGINS`. If either variable is set, the JWT
resolver SHALL be the server's `ActorResolver` and `devHeaderResolver` SHALL
NOT be. The two SHALL NEVER be active simultaneously. A malformed
`AUTH_ISSUERS` value SHALL fail server startup rather than silently disabling
issuers.

If **neither** variable is set, the server SHALL fail to start, unless
`ALLOW_INSECURE_DEV_AUTH=1` is set explicitly. That flag — and only that flag
— selects `devHeaderResolver`, and doing so SHALL emit a startup warning
naming the headers being trusted and stating that authentication is disabled.
Selecting the unsigned-header resolver is therefore always a recorded
decision, never the consequence of an omitted variable: the failure message
SHALL name `AUTH_JWT_SECRET`, `AUTH_ISSUERS` and the flag, so the operator can
tell which of the three they meant.

No call site SHALL be able to reach `devHeaderResolver` by omission:
`createServer`'s `resolver` parameter SHALL have no default, so a resolver is
always passed deliberately by whoever constructs a server.

When `AUTH_JWT_SECRET` is set, it SHALL encode (UTF-8) to at least 32 bytes,
the output size of the HMAC-SHA-256 the local `HS256` tokens use; a shorter
value SHALL fail startup with an error naming the variable, in the same
fail-loud manner as a malformed `AUTH_ISSUERS`. The same validated value SHALL
be the one used as the login route's signing key, so the verification key and
the issuing key cannot diverge.

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

#### Scenario: A server cannot be constructed without choosing a resolver

- **WHEN** `createServer` is called
- **THEN** its `resolver` argument is required — omitting it is a type error,
  not a silent selection of the unsigned-header resolver
