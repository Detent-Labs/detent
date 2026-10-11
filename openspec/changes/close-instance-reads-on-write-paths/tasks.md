# Tasks

## 1. Write result at the Runtime API Layer

- [ ] 1.1 Add `InstanceWriteResult` and `toWriteResult` to `src/runtime/internal.ts`. A unit test shows the keys and the omitted `null` assignment.
- [ ] 1.2 Return the write result from `cancelInstance`, `claimStep`, `releaseClaim` and `delegateClaim`. A DB test of each call shows no `data` member.
- [ ] 1.3 Export the type from `src/runtime/api.ts`. The tests keep their source, and `bun run typecheck` passes.

## 2. Write result over HTTP

- [ ] 2.1 Confirm the four handlers pass the write result through. An HTTP test per route shows the body has no `data` member.
- [ ] 2.2 Add an HTTP test for a `system:cancel-any` holder who cancels a completed instance. The body has `status` `completed` and no `assignment`.
- [ ] 2.3 Add an HTTP test for a candidate who claims a test instance. The test comment cites CLAIM-1.
- [ ] 2.4 Document `InstanceWriteResult` in `docs/openapi.yaml` and point the four 200 responses at it. The OpenAPI tests pass.

## 3. A finished instance's status reaches readers only

- [ ] 3.1 Add `throwToReader` and `submitRefusal`. Wrap `submitAndTransition` and `saveInstanceDraft` with them, after the transaction ends.
- [ ] 3.2 Add DB and HTTP tests for submit and draft save. An unrelated actor gets `AuthorizationError`, and 403 over HTTP. The starter and the losing claimant get `InstanceNotRunningError`.
- [ ] 3.3 Add DB tests for a revoked starter. Submit and draft save on a completed instance throw `AuthorizationError`. Submit on a running assignment-less step succeeds. The unrelated actor's finished, running and unknown refusals share one message pattern.
- [ ] 3.4 Make `canActorCancelInstance` call `loadInstanceForActor` for a starter on a non-running instance. A revoked starter's cancel throws `AuthorizationError`, and answers 403 over HTTP.
- [ ] 3.5 Check that the re-cancel tests in `test/http.test.ts` still pass. A starter on a non-cancellable step re-cancels with 200.
- [ ] 3.6 Fold the unknown-instance throw into `submitRefusal` for non-administrators in `submitAndTransition` and `saveInstanceDraft`. Flip `test/instance-drafts.test.ts:212` and `test/http.test.ts:436` to expect the refusal and 403. Keep an administrator case in each.
- [ ] 3.7 Rewrite the 403 and 409 texts of submit, draft and cancel in `docs/openapi.yaml`. Limit the draft `500` text to administrators. The OpenAPI tests pass.

## 4. A revocation holds on the started scope and the record

- [ ] 4.1 Move the live-assignment SQL out of `buildVisibleRowSet` into one shared fragment. The plan guards in `test/instance-visibility.test.ts` pass.
- [ ] 4.2 Add `notRevokedFor` to `InstanceListFilter` and `buildInstanceWhere`. Set it in `handleListInstances` for `scope=started`, for non-administrators, with principals `[actor.id, ...actor.roles]`.
- [ ] 4.3 Add tests for the started scope. A revoked starter loses the row, unless the starter holds the claim. A candidate on a claimed step loses it. A restore brings it back. An HTTP test shows an administrator keeps it.
- [ ] 4.4 Add a paging test. A walk with limit two over five started instances, one revoked, returns full pages and each other instance once.
- [ ] 4.5 Add a plan guard for the started scope beside the existing ones. The denial probe uses the primary key.
- [ ] 4.6 Load through `loadInstanceForActor` in the author fallback of `getInstanceRecord`. Tests cover a revoked author, a restored author, an administrator and a test-instance starter.
- [ ] 4.7 Rewrite the `scope=started` description and the record 403 text in `docs/openapi.yaml`. The OpenAPI tests pass.

## 5. The visibility routes

- [ ] 5.1 Add `UnknownActorError` to `src/errors.ts`. Map it to 422 `unknown-actor` in `src/http/errors.ts` and re-export it from `src/runtime/api.ts`.
- [ ] 5.2 Check the target with `knownUserIds` in `changeVisibility` for revoke and grant, after the permission test. Restore skips it.
- [ ] 5.3 Add four tests. An unknown target gets 422 on revoke and grant. Restore of an unknown target works. A caller without standing gets 403. An external-provider administrator skips the check.
- [ ] 5.4 Fold `NotFoundError` from the instance load into `AuthorizationError` in `changeVisibility`, with the same message text. A test compares the unknown and known bodies.
- [ ] 5.5 Delete the three visibility `500` entries in `docs/openapi.yaml`. Add the unknown instance to each `403` text. Add the `422` to revoke and grant only.

## 6. Records of the open items

- [ ] 6.1 Delete this change's entry from the 2026-10-10 audit index in `docs/decisions.md`.
- [ ] 6.2 Add an open entry for the residual existence answer. It names `not-claimed`, `not-claimant`, the claim 409 and the unknown-id 500. It tells `harden-http-error-surface` to answer 403, never 404.
- [ ] 6.3 Add an open entry for the submit route's body, citing the owner ruling of 2026-10-11. Add the double-submit loser to the CLAIM-1 entry. No entry describes an exploitation path.
- [ ] 6.4 Add the started-cases revoke check to `docs/browser-checks.md`, beside the involved-cases check.

## 7. Browser check

- [ ] 7.1 Build the production bundle and start the stack. The report names the container, `PORT_APP` and a matching `index-*.js` hash.
- [ ] 7.2 On the task screen, claim, release, delegate and cancel an instance. Each action succeeds and the view reloads with no console error.
- [ ] 7.3 On the admin instance screen, cancel a running instance. The status shows cancelled after the reload.
- [ ] 7.4 Revoke a starter through the API, then open `/app/started`. The starter has no claim and exists in the directory. The row is gone, and a restore brings it back.

## 8. Verification

- [ ] 8.1 Run `bun run typecheck`. The report prints its result.
- [ ] 8.2 Run `bun run build`. The report prints its result.
- [ ] 8.3 Run the full `bun test` through `scripts/test-gated.sh` with `DATABASE_URL` set. The report prints the pass, fail and skip counts.
- [ ] 8.4 Run the prose gate and the whitespace gate over the pushed range on the host. The report prints both results.
