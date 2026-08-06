## 1. The account check on every request

- [x] 1.1 Add a lookup to `src/auth/users.ts` that answers whether a
      `user_id` names a live, enabled account.
- [x] 1.2 Give `JwtResolverConfig` an optional `isActiveAccount` callback. Call it
      in the local-issuer branch of `src/auth/jwt.ts`, after `jwtVerify`, and
      raise `ActorResolutionError` when it answers no. A disabled account
      and a deleted one are the same answer.
- [x] 1.3 Give `resolveAuthResolver` in `src/http/server.ts` a `db`
      parameter, defaulting to `sql`, and pass a callback closing over it.
      `startHttpServer`'s own default expression passes its `db`, which it
      declares first. Leave the external-issuer branch untouched.
- [x] 1.4 Add tests: a disabled account's valid token resolves to `401`; a
      deleted account's does too; an enabled account's still resolves; an
      external issuer's token reads no directory entry; a `jwtResolver` built
      with no callback reads none either.

## 2. The client address

- [x] 2.1 Widen the handler `createServer` returns to Bun's
      `(req, server?)`. Compute the client address once per request, from
      `server.requestIP(req)`, or from the LAST comma-separated entry of
      `X-Forwarded-For` when `TRUST_PROXY` is `1`.
- [x] 2.2 Pass the address as a third argument to every route handler. Leave
      every handler but the login one unchanged, since a handler may declare
      fewer parameters.
- [x] 2.3 Add a test that an absent `server` leaves the address undefined and
      the request working, which is how the existing suites call it.

## 3. The two login windows

- [x] 3.1 Give `checkAndRecordAttempt` in `src/auth/login.ts` a threshold and
      a capacity parameter, since it serves two maps with different numbers.
      Keep the function synchronous and `await`-free.
- [x] 3.2 Add a second tracking map, keyed on the client address, with its
      own threshold and capacity and the same `WINDOW_MS`.
- [x] 3.3 Make `handleLogin` check both windows. Return the existing `429`
      when either one is over. Skip the address window when the address is
      undefined.
- [x] 3.4 Replace the capacity refusal in `checkAndRecordAttempt` with
      eviction of the earliest window. Rewrite the comment above it: the
      current one argues for the refusal this task removes. Both maps get the
      sweep, the capacity check and the eviction.
- [x] 3.5 Add tests: one address over its threshold gets `429` whatever email
      it names; an unset `TRUST_PROXY` ignores `X-Forwarded-For`; a set one
      reads its last entry and ignores what sits in front; a full map evicts
      the oldest entry and admits the new key, for each map.

## 4. The delegation target

- [x] 4.1 Let `updateAssignment` in `src/engine/transition.ts` take a `guard`
      that may return a promise, and await it. Give the engine's
      `delegateClaim` an optional `validateTarget` callback, called in that
      guard after the claimant check. The engine still holds no directory.
- [x] 4.2 Add `UnknownDelegateError` beside the other assignment errors, and
      map it to `422` / `"unknown-delegate"` in `src/http/errors.ts`.
- [x] 4.3 In `delegateClaim` in `src/runtime/api.ts`, look the calling
      actor's id up in `auth_users`. When it resolves there, pass a
      `validateTarget` that requires `toActorId` to resolve there too. Leave
      the claim and the event untouched on that path.
- [x] 4.4 Add the type to `packages/web/src/api/types.ts` and its case to
      `parseErrorBody` in `client.ts`, so the delegate dialog prints the
      message rather than a generic internal failure.
- [x] 4.5 Add tests: a local delegator naming an unknown target throws
      `UnknownDelegateError` and changes nothing; a local delegator naming a
      known target succeeds; a delegator absent from the directory succeeds
      with any target; a non-claimant naming an unknown target still gets
      `NotClaimantError`; the route answers `422`.

## 5. Documentation

- [x] 5.1 Record `TRUST_PROXY` in `README.md`, beside `CORS_ALLOWED_ORIGINS`
      and `METRICS_TOKEN` in the environment-variable list.
- [x] 5.2 Update the delegation paragraph in `docs/authoring-guide.md`
      (line 372 today, "Use delegation for the one-off case"), which states
      no rule about the target.
- [x] 5.3 Update `docs/current-state.md` where it describes the resolver, the
      login limiter and delegation. Two places state "performs no
      per-request database lookup" as a current fact (lines 1075 and 2267
      today); both become false.
- [x] 5.4 Fix the comment above the role-grant test in
      `test/auth-server.test.ts`, which states the same fact.

## 6. Verification

- [x] 6.1 Run `bun run typecheck`.
- [ ] 6.2 Run the full `bun test` suite with `DATABASE_URL` set. Report the
      pass, fail and skip counts, and compare the skip count against
      `scripts/gates/skip-floor.txt`.
- [ ] 6.3 In a real browser, log in, disable that account from the admin
      area, and confirm the next action in the open session gets rejected.
