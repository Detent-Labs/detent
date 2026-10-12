# Tasks

## 1. Validate account addresses at write

- [x] 1.1 Export `emailAddressSchema` from `src/auth/users.ts`. Make `createUser` refuse a rejected address before it hashes the password. Verify with new `test/auth-users.test.ts` cases for no domain, CR and LF, `<`, and a plain address.
- [x] 1.2 Make `handleAdminCreateUser` answer 400 through `RequestShapeError` for an invalid trimmed email. Check before the write. Verify with a new `test/http-admin.test.ts` case that asserts status 400 and no row.
- [x] 1.3 Verify `add-user` in `src/auth/cli.ts` reports the refusal and exits non-zero. Use a new `test/auth-cli.test.ts` case that asserts no row and a non-zero exit.

## 2. Send in batches and skip malformed stored addresses

- [x] 2.1 Make the handler's `to` entries use `emailAddressSchema` from `src/auth/users.ts`. Verify `test/handlers-notification-email.test.ts` and `test/config-descriptor.test.ts` still pass.
- [x] 2.2 Drop a stored address that fails `emailAddressSchema` in `resolveRecipients`. Write one `log.warn` naming the instance, the action and the account id. Verify with a handler test where one of three candidates holds `max.muster`. Insert that row with direct SQL, since `createUser` now refuses it.
- [x] 2.3 Add `SMTP_MAX_RECIPIENTS_PER_SESSION = 100`. Move the socket, deadline and cleanup into `deliverBatch`, one session per batch. Give each batch its own `To:` header. Add a `-<n>` suffix to the `Message-ID` when more than one batch exists. Verify the existing handler tests pass unchanged.
- [x] 2.4 Return the whole list as `recipients` and the first batch's `Message-ID` as `messageId`. Replace the `ponytail:` mark on `actorIdsFor` with one that names the new ceiling. Verify with handler tests for 100, 101 and 250 addresses. Add an SMTP stub that answers `452` past the hundredth `RCPT TO`. Cover a `550` and a `450` in the second batch.
- [x] 2.5 Verify a retried delivery repeats every batch's `Message-ID`. Verify a list of only malformed addresses opens no connection and succeeds.
- [x] 2.6 Stop starting batches once the elapsed time plus the next batch's timeout exceeds `CLAIM_LEASE_MS`, and fail as transient. Name the new ceiling in the `ponytail:` mark. Verify with tests for a stopped second batch and a first batch that always starts.

## 3. Documentation

- [x] 3.1 Document batching and the skipped address in `docs/authoring-guide.md`, under "Who a notification reaches". Verify by reading that section against the delta spec.
- [x] 3.2 Strike the `batch-notification-recipients` entry in the audit index in `docs/decisions.md`. Verify the entry no longer appears in the index.

## 4. Verification

- [x] 4.1 Run `bun run typecheck` in the devcontainer. Verify it prints no error.
- [x] 4.2 Run `bun run build` in the devcontainer. Verify it exits 0.
- [x] 4.3 Run the full `bun test` through `scripts/test-gated.sh` with DATABASE_URL set. Verify the gate prints no rejection and no failed test.
- [ ] 4.4 Run the prose gate and the whitespace gate over the pushed range on the host. Verify both exit 0.
- [x] 4.5 Run `openspec validate batch-notification-recipients`. Verify it reports the change valid.
