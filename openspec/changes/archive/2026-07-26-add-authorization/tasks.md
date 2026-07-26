## 1. Authorization primitive

- [x] 1.1 Create `src/auth/authorize.ts`: export `PUBLISH_ROLE =
      "system:publish"`, `CANCEL_ANY_ROLE = "system:cancel-any"`,
      `AuthorizationError extends Error`, and `requireRole(actor: Actor,
      role: string): void` throwing `AuthorizationError` when `role` is
      absent from `actor.roles`.
- [x] 1.2 Unit tests for `requireRole`: role present passes, role absent
      throws `AuthorizationError`, empty `roles` array throws. Plus (added
      during verification): the two constants carry their documented literal
      values, and a canary asserting `src/auth/authorize.ts`'s export shape
      stays fixed (no registry/plugin envelope creeps in).

## 2. Gate publish

- [x] 2.1 In `src/http/routes.ts::handlePublish`, call `requireRole(actor,
      PUBLISH_ROLE)` immediately after `resolveActor`, before parsing the
      request body or calling `publishBody`.
- [x] 2.2 Test: publish by an actor carrying `system:publish` succeeds
      (existing publish scenarios still pass).
- [x] 2.3 Test: publish by an actor without `system:publish` returns 403
      with `error.type === "authorization"`, and no version is persisted.

## 3. Gate cancel-any-instance

- [x] 3.1 In `src/runtime/api.ts::cancelInstance`, call `requireRole(actor,
      CANCEL_ANY_ROLE)` as the first statement, before
      `loadInstanceForRead`.
- [x] 3.2 Test: cancel by an actor carrying `system:cancel-any` succeeds
      (existing cancel scenarios still pass), including the no-op-on-
      already-terminal case.
- [x] 3.3 Test: cancel by an actor without `system:cancel-any` returns 403
      with `error.type === "authorization"`, and the instance is unchanged
      — for both an existing and a nonexistent `instanceId` (role check
      precedes the existence check).

## 4. Error mapping

- [x] 4.1 In `src/http/errors.ts::mapError`, add the `AuthorizationError` →
      `403`, `{ error: { type: "authorization", message } }` branch
      alongside the existing `Not*`/`AlreadyClaimed*` 403 branches.
- [x] 4.2 Test: `mapError` on an `AuthorizationError` returns the expected
      `{status, body}` shape.

## 5. Confirm unaffected surfaces

- [x] 5.1 Test: an actor with neither reserved role can still
      `createProcessInstance`, `getInstanceView`, `submitAndTransition`,
      `claimStep`, and `releaseClaim` on a step it is an assignment
      candidate for and has claimed — unaffected by this change. Already
      covered: `user1` (`roles: []`) is untouched by this change and the
      full claim/release/submit block in `test/http.test.ts` (lines ~575-660)
      exercises it unmodified — that coverage passing green *is* this
      guarantee holding, so no new test was needed.

## 6. Docs

- [x] 6.1 Update `docs/current-state.md`'s Authentication entry: replace
      "Authorization is still out of scope" with a description of the
      `system:publish` / `system:cancel-any` gate and a pointer to grant
      them via `cli.ts set-roles`.
- [x] 6.2 Update `ROADMAP.md` stage 7: mark the authorization gap as
      closed, referencing this change.

## 7. Verification

- [x] 7.1 Run `bun run typecheck`. Clean (both `typecheck:engine` and the
      editor workspace filter).
- [x] 7.2 Run the full `bun test` suite with `DATABASE_URL` set (inside the
      devcontainer, where it's already wired). 844 pass / 4 fail / 2232
      expect() calls across 848 tests / 52 files. The 4 failures are all
      `packages/editor/test/graph-view-rendering.test.tsx` ("generated graph
      diagram > ..."), a `mermaid-isomorphic` headless-Chromium dependency
      failing to launch a browser in this container — pre-existing,
      unrelated to this change (this change touches no file under
      `packages/editor`), named individually and confirmed not part of this
      change's diff rather than dismissed on pass-count alone.
