## 1. Make the insecure resolver opt-in and loud

- [x] 1.1 In `src/http/server.ts::resolveAuthResolver`, add the
  `ALLOW_INSECURE_DEV_AUTH` parameter to the `env` argument type and, when
  neither `AUTH_JWT_SECRET` nor a parsed `AUTH_ISSUERS` is present, throw
  unless the flag is exactly `"1"`
- [x] 1.2 When the flag is set, `console.warn` once, naming `X-Actor-Id` /
  `X-Actor-Roles` and stating that authentication is disabled, then return
  `devHeaderResolver`
- [x] 1.3 Make the thrown message name all three of `AUTH_JWT_SECRET`,
  `AUTH_ISSUERS` and `ALLOW_INSECURE_DEV_AUTH`, so the operator can tell which
  one they meant to set
- [x] 1.4 Remove the `resolver: ActorResolver = devHeaderResolver` default from
  `createServer` (`server.ts:169`); `startHttpServer`'s own default already
  calls `resolveAuthResolver`, so it keeps working
- [x] 1.5 Confirm by grep that no call site relied on the removed default —
  `tsc --noEmit` is the actual gate here

## 2. Validate the signing key

- [x] 2.1 In `resolveAuthResolver`, when `AUTH_JWT_SECRET` is set, check
  `new TextEncoder().encode(secret).length >= 32` and throw naming the
  variable and suggesting `openssl rand -base64 32` otherwise
- [x] 2.2 Check it before constructing `jwtResolver`, so an invalid
  configuration fails at startup rather than at first request
- [x] 2.3 Confirm `startHttpServer` passes the same value as `loginSecret`
  (`server.ts:378`) so the issuing key and the verification key cannot diverge

## 3. Sweep and fail closed in the login rate limiter

- [x] 3.1 In `src/auth/login.ts::checkAndRecordAttempt`, before the capacity
  branch at `:54`, delete every entry whose `t - windowStart > WINDOW_MS`
- [x] 3.2 Change the capacity branch to return `"limited"` when the map is
  still full after the sweep
- [x] 3.3 Keep the whole function synchronous and `await`-free — the comment
  at `:39-45` states why, and it stays true
- [x] 3.4 Update the fail-open sentence in that comment and at `:54` to
  describe the new behavior; the current wording documents the removed rule

## 4. Equalize the login timing

- [x] 4.1 In `src/auth/users.ts`, add a module-scope
  `const DUMMY_HASH = Bun.password.hash(crypto.randomUUID())` — a promise, no
  top-level `await`, so importing the module stays synchronous for
  `src/auth/cli.ts`
- [x] 4.2 Rewrite `verifyLogin`'s tail so exactly one
  `Bun.password.verify` runs on every path:
  `const valid = await Bun.password.verify(password, row?.password_hash ?? (await DUMMY_HASH)); if (!row || !valid || row.disabled) return undefined;`
- [x] 4.3 Correct the doc comment at `users.ts:20-24`: it currently claims
  more than the code delivered, and after this change it should state that
  both the result *and* the work performed are identical across the three
  failure cases

## 5. Content-Security-Policy in the four browser packages

- [x] 5.1 Add a `transformIndexHtml` plugin with `apply: "build"` to
  `packages/app/vite.config.ts` that injects the policy meta tag, building
  `connect-src` from `'self'` plus `process.env.VITE_API_URL` when set
- [x] 5.2 Repeat for `packages/admin`, `packages/studio`, `packages/editor` —
  four near-identical blocks; do not extract a shared package for five lines
- [x] 5.3 Policy value: `default-src 'self'; script-src 'self'; style-src
  'self' 'unsafe-inline'; img-src 'self' data:; connect-src <derived>;
  object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors
  'none'`
- [x] 5.4 Run `bun run build` in each package and confirm the meta tag is in
  `dist/index.html` with the expected `connect-src`
- [x] 5.5 Run `bun run dev` in one package and confirm no policy is injected
  and react-refresh still works

## 6. Devcontainer and documentation

- [x] 6.1 Add `ALLOW_INSECURE_DEV_AUTH: "1"` to the app service's environment
  in `.devcontainer/docker-compose.yml`, with a comment stating that it
  disables authentication and is for the devcontainer only
- [x] 6.2 `docs/current-state.md`: update the auth-configuration entry
  (`:548-556`) — the fallback is now an explicit flag, `AUTH_JWT_SECRET` has
  a minimum length, and the rate limiter fails closed
- [x] 6.3 `docs/current-state.md`: correct the rate-limit entry (`:614-625`),
  which currently describes the fail-open behavior
- [x] 6.4 `README.md`: document the three variables and the flag next to the
  run instructions, including `openssl rand -base64 32`

## 7. Tests

- [x] 7.1 `resolveAuthResolver` throws when nothing is configured and the flag
  is absent, and returns `devHeaderResolver` when the flag is `"1"`
- [x] 7.2 `resolveAuthResolver` throws for a 31-byte `AUTH_JWT_SECRET` and
  accepts a 32-byte one
- [x] 7.3 Update the assertion at `test/auth-server.test.ts:33`, which pins
  the current no-configuration fallback — it is asserting the behavior this
  change removes, so it changes deliberately (to: throws without the flag,
  returns `devHeaderResolver` with it)
- [x] 7.4 Lengthen `test/auth-server.test.ts:17`'s `SECRET` (currently
  `"auth-server-test-secret"`, 23 bytes) past 32 — it is passed to
  `resolveAuthResolver` at seven sites in that file and would otherwise throw
  under the new minimum. Lengthen `test/auth-login.test.ts:19`
  (`"auth-login-test-secret-value"`, 28 bytes) too: it reaches `handleLogin`
  directly and so is not forced to change, but leaving it models a
  configuration the server now refuses
- [x] 7.5 `checkAndRecordAttempt`: at capacity with expired windows, a new
  email is tracked; at capacity with live windows, it returns `"limited"`;
  an already-tracked email is unaffected. The existing suite injects a clock,
  so all three are pure-function tests
- [x] 7.6 `handleLogin` end-to-end: a capacity-full map produces 429 and does
  not reach `verifyLogin`
- [x] 7.7 `verifyLogin` does the same work for an unknown email as for a
  known one. The repo has no mocking anywhere and this change must not
  introduce the first one, so assert it as a coarse *ratio*: time a
  known-email-wrong-password call and an unknown-email call, and assert the
  unknown-email duration is at least half the known one. The pre-fix ratio is
  ~1/100, so a 1/2 bound separates the two behaviors with a wide margin and
  does not depend on machine speed. Comment the bound so a future reader does
  not tighten it into a flaky test
- [x] 7.8 Confirm no suite depended on `createServer`'s removed default

## 8. Verification

- [x] 8.1 Run `bun run typecheck` from the repo root and confirm it passes
- [x] 8.2 Run the FULL `bun test` suite with `DATABASE_URL` set, from the
  repo root, and confirm it passes — check the skip count, not only the pass
  count
- [x] 8.3 Start the server with no auth variables and confirm it exits with
  the naming error; start it with the flag and confirm the warning appears
- [x] 8.4 Verify each new rejecting test fails without its fix, on a scratch
  copy of the tree — never by mutating the shared working tree
