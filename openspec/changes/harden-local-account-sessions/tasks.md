## 1. The account check on every request

- [ ] 1.1 Add a lookup to `src/auth/users.ts` that answers whether a
      `user_id` names a live, enabled account.
- [ ] 1.2 Give `JwtResolverConfig` an optional `isDisabled` callback. Call it
      in the local-issuer branch of `src/auth/jwt.ts`, after `jwtVerify`, and
      raise `ActorResolutionError` when it answers yes or finds no row.
- [ ] 1.3 Wire the callback where the server builds its resolver, closing
      over `db`. Leave the external-issuer branch untouched.
- [ ] 1.4 Add tests: a disabled account's valid token resolves to `401`; a
      deleted account's does too; an enabled account's still resolves; an
      external issuer's token reads no directory entry.

## 2. The client address

- [ ] 2.1 Widen the handler `createServer` returns to Bun's
      `(req, server?)`. Compute the client address once per request, from
      `server.requestIP(req)`, or from `X-Forwarded-For` when `TRUST_PROXY`
      is `1`.
- [ ] 2.2 Pass the address as a third argument to every route handler. Leave
      every handler but the login one unchanged, since a handler may declare
      fewer parameters.
- [ ] 2.3 Add a test that an absent `server` leaves the address undefined and
      the request working, which is how the existing suites call it.

## 3. The two login windows

- [ ] 3.1 Add a second tracking map in `src/auth/login.ts`, keyed on the
      client address, with its own threshold and the same `WINDOW_MS`. Keep
      the function synchronous and `await`-free.
- [ ] 3.2 Make `handleLogin` check both windows. Return the existing `429`
      when either one is over. Skip the address window when the address is
      undefined.
- [ ] 3.3 Replace the capacity refusal in `checkAndRecordAttempt` with
      eviction of the earliest window. Rewrite the comment above it: the
      current one argues for the refusal this task removes.
- [ ] 3.4 Add tests: one address over its threshold gets `429` whatever email
      it names; an unset `TRUST_PROXY` ignores `X-Forwarded-For`; a set one
      reads it; a full map evicts the oldest entry and admits the new email.

## 4. The delegation target

- [ ] 4.1 In `delegateClaim` in `src/runtime/api.ts`, look the calling
      actor's id up in `auth_users`. When it resolves there, require
      `toActorId` to resolve there too, and throw otherwise. Leave the claim
      and the event untouched on that path. The engine's own `delegateClaim`
      in `src/engine/transition.ts` stays unchanged: it holds no directory.
- [ ] 4.2 Add tests: a local delegator naming an unknown target throws and
      changes nothing; a local delegator naming a known target succeeds; a
      delegator absent from the directory succeeds with any target.

## 5. Documentation

- [ ] 5.1 Record `TRUST_PROXY` wherever this repository lists deployment
      configuration.
- [ ] 5.2 Update the delegation paragraph in `docs/authoring-guide.md`
      (line 361 today), which tells an author to delegate and states no rule
      about the target.
- [ ] 5.3 Update `docs/current-state.md` where it describes the resolver, the
      login limiter and delegation.

## 6. Verification

- [ ] 6.1 Run `bun run typecheck`.
- [ ] 6.2 Run the full `bun test` suite with `DATABASE_URL` set. Report the
      pass, fail and skip counts, and compare the skip count against
      `scripts/gates/skip-floor.txt`.
- [ ] 6.3 In a real browser, log in, disable that account from the admin
      area, and confirm the next action in the open session gets rejected.
