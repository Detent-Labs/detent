## Context

The HTTP wrapper resolves an actor through one seam, `ActorResolver`
(`src/auth/resolve.ts`, `(credential: unknown) => Promise<Actor>`), injected
once at server startup. The only implementation that ships is
`devHeaderResolver`, which trusts unsigned `X-Actor-Id` / `X-Actor-Roles`
headers. The seam is correct; the implementation behind it is not
authentication, and the `http-wrapper` spec says so explicitly ("the added
write routes are unauthenticated under the shipped resolver").

Two deployment realities shape the design. The engine must work standalone,
with no external identity provider, for on-prem installs and for development.
And it must be attachable to Entra ID (with on-prem AD reaching Entra via Entra
Connect) later, including a migration period where local and IdP identities are
both accepted, without rewriting the boundary.

Downstream of the resolver nothing changes: the Runtime API Layer and the
engine take `actor: Actor` and that still means "already-trusted actor". No
token, claim, or login concept crosses that line.

## Goals / Non-Goals

**Goals:**

- Real credential verification at the HTTP boundary, replacing unsigned-header
  trust.
- Project-local BPS user accounts that work with no external IdP.
- An external IdP addable later as *configuration*, not a rewrite — including
  mixed operation, local and IdP identities accepted simultaneously.
- Existing tests and dev setups keep working with no environment set.

**Non-Goals:**

- The engine does not become an identity provider: no registration, no password
  reset, no MFA, no session store, no refresh tokens, no revocation list.
- No user administration over HTTP. Users are created from a CLI.
- No authorization checks. Every *authenticated* actor keeps today's
  permissions; the gap narrows from "anyone" to "anyone with an account", it
  does not close.
- No change to `src/schema/definition.ts`. The process-definition contract is
  untouched.

## Decisions

### One resolver that dispatches on `iss`, not two resolvers behind a switch

A single `jwtResolver(config)` reads `Authorization: Bearer`, looks at the
token's `iss` claim, and selects the verifier:

```
iss = "bps"                                              -> local signing key
iss = "https://login.microsoftonline.com/<tenant>/v2.0"  -> that issuer's JWKS
```

Both branches produce the same `Actor { id, roles }`, so everything downstream
is identical for a local and an IdP-issued identity. Adding Entra ID is one
entry in `AUTH_ISSUERS`.

*Alternative rejected:* two separate resolvers selected by a config switch.
That forces an either/or and makes mixed operation impossible — which is
exactly what a migration period needs.

*Alternative rejected:* session cookies. They pull in CORS credential handling,
CSRF protection and a session store, and make the IdP path no easier.

### `jose` as the one new dependency

A hand-rolled HS256 verifier is ~30 lines. JWKS fetching, key caching and key
rotation are not, and they are precisely what turns the Entra step into a
config entry instead of a build. One library serves both issuer branches, so
the local and IdP paths cannot drift in their verification semantics.

### The resolver receives `req.headers`, not a resolver-shaped credential

`extractCredential(req)` currently returns `{actorIdHeader, actorRolesHeader}` —
the dev resolver's private shape leaking into the transport layer. It instead
passes `req.headers`, so each resolver reads what it needs (`Authorization`
for JWT, `X-Actor-Id` for dev). `DevHeaderCredential` is removed. This is the
only edit in `routes.ts` besides the new login handler; route handlers are
untouched.

### Configuration selects the resolver; the two are never both active

Read in the composition root (`src/http/server.ts`), same convention as
`DATABASE_URL` / `CORS_ALLOWED_ORIGINS`:

- `AUTH_JWT_SECRET` — local signing key. Absent: local login is off and
  `/auth/login` is not registered.
- `AUTH_ISSUERS` — JSON array of `{iss, jwksUrl, audience, rolesClaim}`.
  Absent or empty: local issuer only.

If either is set, the JWT resolver is active and `devHeaderResolver` is not. If
neither is set, the dev resolver stays the default — today's behavior, which is
what keeps `test/http.test.ts` unchanged and green.

There is no state in which `/auth/login` is reachable without a signing key:
the route is registered only when `AUTH_JWT_SECRET` is set, and is otherwise a
`404`.

### One table, in the existing `initSchema` DDL

```sql
auth_users (
  user_id       text primary key,
  email         text unique not null,
  password_hash text not null,
  roles         text[] not null default '{}',
  disabled      boolean not null default false
)
```

`user_id` becomes `Actor.id` — the same value that appears in
`assignment.candidates`, `assignment.claimedBy` and `startedBy`. For an Entra
identity that value is the `oid` claim (stable across renames), never `email`.
Password hashing uses `Bun.password` (argon2id), built into the runtime, so
hashing adds no dependency.

### 8-hour token, no refresh, no revocation

The price is stated rather than hidden: a role change takes effect at the next
login, and a stolen token is valid for up to 8 hours. What is bought is that
rotation, refresh-token storage and a revocation list do not have to be built,
and the client needs no lifetime tracking — a `401` from any route returns the
user to login, which covers expiry as a special case.

### Non-disclosure on login failure

Wrong password, unknown email and disabled user all produce one identical
generic `401`, so the route does not reveal which email addresses exist.

### New files

| File | Contents |
|---|---|
| `src/auth/jwt.ts` | `jwtResolver(config)`: reads `Authorization: Bearer`, selects the verifier by `iss`, verifies signature / `exp` / `aud`, maps claims to `Actor`. Throws `ActorResolutionError`. |
| `src/auth/users.ts` | `createUser` / `verifyLogin` against `auth_users`; password hashing via `Bun.password`. |
| `src/auth/login.ts` | `POST /auth/login` handler in the existing `HttpResult` shape; signs an 8-hour token with the local key. |
| `src/auth/cli.ts` | `bun run src/auth/cli.ts add-user …` — create a user, set roles, change a password. No HTTP surface. |

### Player UI is in scope

`packages/editor/src/player/` is the only frontend consumer and would otherwise
break. The connection form (server URL + actor id + roles, persisted to
`localStorage`) becomes a login form (server URL + email + password). The token
is persisted instead of the actor fields; `client.ts` sends `Authorization`
instead of `X-Actor-Id`. A `401` from any route returns to the login screen.

## Risks / Trade-offs

- **No rate limit on `/auth/login`** → The brake is argon2id itself (~100 ms per
  attempt, built into `Bun.password`). An in-memory counter would be porous
  across multiple processes and a correct one needs a shared store.
  Deliberately left open and recorded here rather than silently accepted.
- **A stolen token is valid for up to 8 hours** → Accepted, in exchange for not
  building refresh/revocation. Mitigation if it ever matters: shorten the
  lifetime, which is a one-constant change.
- **A role change takes effect only at next login** → Same trade; the
  alternative is per-request role lookup, which reintroduces a DB hit on every
  route.
- **The JWKS branch is only exercised against a real IdP much later** → A test
  generates a keypair, builds a JWKS from it, issues a token with it, and
  verifies through the JWKS branch. The IdP path is proven at landing, not
  first exercised when Entra is connected.
- **`AUTH_ISSUERS` is unvalidated JSON from the environment** → Parsed and
  shape-checked at startup; a malformed value fails the server start loudly
  rather than silently disabling issuers.
- **Authenticated ≠ authorized** → Any account can still publish, cancel any
  instance, and act as any actor id it is assigned. Stated in the proposal and
  scoped into the follow-up change; the resolver seam stays the single place
  where that changes.

## Migration Plan

1. Land the schema and user layer first: `auth_users` in `initSchema`,
   `users.ts`, the CLI. Nothing observable changes yet.
2. Land `jwt.ts` and the `extractCredential` seam change together — the dev
   resolver keeps working because it now reads the headers itself.
3. Land `/auth/login` and the server wiring. With no environment set the dev
   resolver is still the default, so existing deployments and
   `test/http.test.ts` are unaffected.
4. Land the Player login form.
5. Per deployment: create users with the CLI, set `AUTH_JWT_SECRET`, restart.
   The switch is that one variable.
6. Adding Entra later: add an entry to `AUTH_ISSUERS`. Local and Entra tokens
   are accepted simultaneously; local accounts are retired when the migration
   completes by unsetting `AUTH_JWT_SECRET`.

Rollback at any point is unsetting `AUTH_JWT_SECRET` / `AUTH_ISSUERS`, which
restores the dev resolver. The `auth_users` table is additive and harmless if
unused.

## Open Questions

- Where the reserved `admin` role and the operations it gates are defined —
  deferred to the authorization follow-up change, not decided here.
- Whether the CLI should also list and disable users, or only create them and
  set roles/passwords. Starting with create / set-roles / set-password; more
  subcommands are additive.
- Whether `AUTH_ISSUERS` needs a per-issuer clock-skew tolerance. Left to
  `jose`'s default until a real IdP shows it is needed.
