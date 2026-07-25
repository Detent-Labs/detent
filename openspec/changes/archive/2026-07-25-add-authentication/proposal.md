## Why

Every HTTP route today trusts whatever actor `devHeaderResolver` constructs from
unsigned `X-Actor-Id` / `X-Actor-Roles` headers — any caller can claim any
identity and any role. That is not authentication, and it is the gap named in
`ROADMAP.md` #6. The engine now has a real HTTP surface and a player UI that
uses it, so the boundary needs real credential verification before anything
outside a dev machine touches it.

Scope is authentication only: proving *who* the caller is. Authorization
(gating operations on a role) is a deliberate follow-up change.

## What Changes

- **A JWT `ActorResolver`** (`src/auth/jwt.ts`) that reads
  `Authorization: Bearer`, dispatches on the token's `iss` claim to a verifier,
  checks signature / `exp` / `aud`, and maps claims to `Actor { id, roles }`.
  `iss: "bps"` verifies against the local signing key; any other configured
  issuer verifies against that issuer's JWKS. Both branches produce the same
  `Actor`, so local and IdP-issued identities are accepted simultaneously and
  adding Entra ID later is one config entry, not a rewrite.
- **Project-local user accounts** (`src/auth/users.ts`): a single `auth_users`
  table, `createUser` / `verifyLogin`, password hashing via `Bun.password`
  (argon2id, built into Bun — no dependency). Users are created from a CLI
  (`src/auth/cli.ts`), never over HTTP.
- **`POST /auth/login`** (`src/auth/login.ts`): email + password in, an 8-hour
  token signed with the local key out. Registered only when `AUTH_JWT_SECRET`
  is set — there is no state in which a login route is reachable without a
  signing key.
- **BREAKING (internal seam)**: `routes.ts::extractCredential(req)` stops
  returning the dev-resolver-specific `{actorIdHeader, actorRolesHeader}` pair
  and passes `req.headers` instead, so each resolver reads what it needs. The
  `DevHeaderCredential` type is removed. Route handlers are untouched.
- **Configuration**, read in the composition root (`src/http/server.ts`), same
  convention as `DATABASE_URL` / `CORS_ALLOWED_ORIGINS`: `AUTH_JWT_SECRET`
  (local signing key) and `AUTH_ISSUERS` (JSON array of
  `{iss, jwksUrl, audience, rolesClaim}`). If either is set the JWT resolver is
  active and the dev resolver is not; if neither is set the dev resolver stays
  the default. The two are never active simultaneously, so existing dev/test
  setups keep working unchanged.
- **Player UI** (`packages/editor/src/player/`): the connection form's actor-id
  and roles fields become email + password; the token is persisted to
  `localStorage` instead of the actor fields; `client.ts` sends `Authorization`
  instead of `X-Actor-Id`; a `401` from any route returns to the login screen
  (which also covers 8-hour expiry without client-side lifetime tracking).
- **One new dependency, `jose`.** A hand-rolled HS256 verifier is ~30 lines, but
  JWKS fetching, key caching and key rotation are exactly what turns the Entra
  step into a config entry instead of a build.

Explicitly not built: registration, password reset, MFA, refresh tokens, token
revocation, a session store, user administration over HTTP, and any
authorization check.

## Capabilities

### New Capabilities
- `jwt-authentication`: the JWT `ActorResolver` — bearer-token extraction,
  `iss`-based verifier dispatch (local key vs. JWKS), signature/`exp`/`aud`
  verification, claim-to-`Actor` mapping including the configurable roles
  claim, and the `AUTH_JWT_SECRET` / `AUTH_ISSUERS` configuration that selects
  it over the dev resolver.
- `local-user-accounts`: the `auth_users` table, argon2id password
  hash/verify, disabled-user handling, the `POST /auth/login` route and its
  token issuance, the generic-401 non-disclosure rule, and the user-management
  CLI.

### Modified Capabilities
- `actor-resolution`: a resolver now receives the request's `Headers` rather
  than a resolver-specific credential object; the dev resolver reads
  `X-Actor-Id` / `X-Actor-Roles` off those headers itself and
  `DevHeaderCredential` is gone. The "no production implementation ships in
  core" requirement is replaced: a production-capable JWT resolver now ships.
- `http-wrapper`: `POST /auth/login` is added to the route table (conditionally
  registered); the credential-extraction seam changes shape; a request with no
  or an invalid bearer token is `401` when the JWT resolver is active.
- `editor-player`: the connection form becomes a login form (server URL +
  email + password), the persisted `localStorage` shape changes from
  `actorId`/`actorRoles` to a token, and a `401` returns the user to login.

## Impact

- **Code**: new `src/auth/{jwt,users,login,cli}.ts`; edits to
  `src/auth/resolve.ts` (credential shape), `src/http/routes.ts`
  (`extractCredential`, one new handler), `src/http/server.ts` (config +
  conditional route), `src/engine/store.ts` (`auth_users` in `initSchema`);
  `packages/editor/src/player/` connection form + `client.ts`.
- **Schema**: one new table, `auth_users`, added to the existing `initSchema`
  DDL. No change to `src/schema/definition.ts` — the process-definition
  contract is untouched.
- **Dependencies**: `jose` added to the engine package.
- **Configuration**: two new environment variables, both optional; unset means
  today's behavior.
- **Tests**: new `auth-users`, `auth-jwt` (including a real JWKS round-trip
  with a generated keypair) and HTTP auth suites; `test/http.test.ts` stays
  unchanged and green because with no auth environment set the dev resolver
  still applies.
- **Known gap, recorded not silently accepted**: no rate limit on
  `/auth/login`. The brake is argon2id itself (~100 ms per attempt); a correct
  limiter needs a shared store across processes.
