## 1. Dependency and schema

- [x] 1.1 Add `jose` to the engine package's dependencies (`bun install jose`) and confirm `bun run typecheck` still passes
- [x] 1.2 Add the `auth_users` table to the existing `initSchema` DDL in `src/engine/store.ts` (`user_id` PK, `email` unique not null, `password_hash`, `roles text[] default '{}'`, `disabled boolean default false`)
- [x] 1.3 Test: `initSchema` against an empty database creates `auth_users`, and a duplicate email is rejected by the unique constraint

## 2. Local user accounts

- [x] 2.1 Create `src/auth/users.ts` with `createUser(email, password, roles)` hashing via `Bun.password` (argon2id) and minting a `user_id`
- [x] 2.2 Add `verifyLogin(email, password)`: `Bun.password.verify` against the stored hash, returning `{ userId, roles }` on success
- [x] 2.3 Reject a `disabled` user in `verifyLogin` even with a correct password, with the same generic failure as an unknown email or wrong password
- [x] 2.4 Test (`test/auth-users.test.ts`, DB-backed): hash/verify roundtrip; no plaintext stored; wrong password rejected; unknown email rejected; disabled user rejected

## 3. JWT resolver

- [x] 3.1 Create `src/auth/jwt.ts` with the issuer config type `{ iss, jwksUrl, audience, rolesClaim }` and `jwtResolver(config)` returning an `ActorResolver`
- [x] 3.2 Read the bearer token from the `Authorization` header of the passed `Headers`; throw `ActorResolutionError` on a missing or malformed header
- [x] 3.3 Dispatch on the token's `iss`: `"bps"` verifies against the local signing key, any other configured issuer against its JWKS (via `jose`'s remote JWKS with key caching); an unconfigured `iss` throws `ActorResolutionError`
- [x] 3.4 Verify signature, `exp` and `aud`; map `sub` -> `Actor.id` and the issuer's `rolesClaim` -> `Actor.roles`, defaulting to `[]` when the claim is absent
- [x] 3.5 Test (`test/auth-jwt.test.ts`): valid local token yields the expected `Actor`; expired, wrongly-signed, unknown `iss`, wrong `aud`, malformed and missing header each throw `ActorResolutionError`; roles-claim mapping incl. the empty default
- [x] 3.6 Test: the JWKS branch end-to-end — generate a keypair, build a JWKS from the public key, issue a token with the private key, verify it resolves through the JWKS branch
- [x] 3.7 Test: a configuration carrying both a local key and an external issuer accepts a token from either

## 4. Resolver seam change

- [x] 4.1 Change `devHeaderResolver` in `src/auth/resolve.ts` to take the request's `Headers` and read `X-Actor-Id` / `X-Actor-Roles` itself; delete the `DevHeaderCredential` type
- [x] 4.2 Change `routes.ts::extractCredential(req)` to return `req.headers`; drop the `DevHeaderCredential` import
- [x] 4.3 Verify `bun run typecheck` passes and the existing `test/http.test.ts` is unchanged and green (dev resolver still the default with no auth env set)

## 5. Login route

- [x] 5.1 Create `src/auth/login.ts`: a `POST /auth/login` handler in the existing `HttpResult` shape, calling `verifyLogin` and signing a JWT (`iss: "bps"`, `sub`, roles, `exp` +8h) with `AUTH_JWT_SECRET`
- [x] 5.2 Return `200 { token, expiresAt, actor: { id, roles } }` on success and one identical generic `401` for unknown email, wrong password and disabled user
- [x] 5.3 Test: login happy path; the returned token authenticates a subsequent route call; wrong password and unknown email return identical `401` bodies

## 6. Server wiring and configuration

- [x] 6.1 Read `AUTH_JWT_SECRET` and `AUTH_ISSUERS` in `src/http/server.ts`, parsing and shape-checking `AUTH_ISSUERS` as a JSON array of issuer entries; fail startup loudly on a malformed value
- [x] 6.2 Select the resolver: JWT resolver if either variable is set, `devHeaderResolver` otherwise — never both
- [x] 6.3 Register `POST /auth/login` only when `AUTH_JWT_SECRET` is set (otherwise the path is a plain `404`), and include it in CORS preflight handling
- [x] 6.4 Test: no auth env keeps the dev resolver; `AUTH_JWT_SECRET` alone activates the JWT resolver; `AUTH_ISSUERS` alone activates it; malformed `AUTH_ISSUERS` fails startup
- [x] 6.5 Test: with the JWT resolver active, a route with no token is `401` with `error.type: "actor-resolution"`, a route with a valid token is `200`, and `X-Actor-Id` alone is `401`; `/auth/login` is `404` without a signing key

## 7. Player UI

- [x] 7.1 Replace the Player connection form's actor-id/roles fields with email + password; keep the server-URL field
- [x] 7.2 Call `POST /auth/login` on submit and persist `serverUrl` + token to `localStorage`; remove the persisted `actorId` / `actorRoles`
- [x] 7.3 Send `Authorization: Bearer <token>` from `packages/editor/src/player/client.ts` instead of `X-Actor-Id` / `X-Actor-Roles`
- [x] 7.4 Treat any `401` as an invalid session: discard the token and return to the login screen; add no client-side expiry check
- [x] 7.5 Report a generic login failure without persisting a token when credentials are rejected

## 8. User CLI

- [x] 8.1 Create `src/auth/cli.ts` with `add-user` (email, password, roles), `set-roles` and `set-password` subcommands over `users.ts`; no HTTP surface
- [x] 8.2 Verify `bun run src/auth/cli.ts add-user …` creates a row whose hash verifies the given password

## 9. Verification and documentation

- [x] 9.1 Run the full suite in the devcontainer with `DATABASE_URL` set; confirm the skip count is unchanged and read the verdict off named tests, not the pass count
- [x] 9.2 Run `bun run typecheck`
- [x] 9.3 Update `docs/current-state.md` and `ROADMAP.md` #6 to record what authentication now covers and that authorization remains open
- [x] 9.4 Record the known gap (no rate limit on `/auth/login`) where the deployment docs list operational caveats
- [x] 9.5 Document the two environment variables (`AUTH_JWT_SECRET`, `AUTH_ISSUERS`) alongside `DATABASE_URL` / `CORS_ALLOWED_ORIGINS`
