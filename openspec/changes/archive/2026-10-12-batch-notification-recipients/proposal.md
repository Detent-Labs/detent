# Proposal

## Why

The `notification.email` handler sends one message to every resolved
recipient in one SMTP session. A step that uses `org.group-members` on a
group of 300 members, with `toActors: ["candidate"]`, issues 300 `RCPT TO`
commands. A relay with a recipient limit answers `452` from the limit on. RFC
5321 requires only 100. The reply is transient, so the row retries until it
dead-letters. Nobody gets the mail.

The `ponytail:` mark in the handler named this ceiling. The shipped
strategies now reach it.

The handler also trusts every stored account address. `createUser` checks
nothing. `POST /admin/users` checks only that the string has content. An
address with CR, LF, `<` or `>` reaches the `RCPT TO` command and the `To:`
header verbatim. A plain typo such as `max.muster` draws a `5xx`. The
all-or-nothing rule then drops the mail for every other candidate.

These are findings D-4 and D-6 of the 2026-10-10 audit. The owner ruled on
2026-10-12 for batches instead of a cap. The owner also ruled for validation
at write plus a skip at send.

## What Changes

- The handler splits the resolved recipient list into batches of at most 100.
  It runs one SMTP session per batch. Each batch stays all-or-nothing, so the
  rule that the server accepts every recipient before `DATA` holds per
  batch.
- Each batch message lists only its own recipients in `To:`. Its `Message-ID`
  carries a per-batch suffix. A list of 100 or fewer sends one message with
  the same `Message-ID` as today.
- `createUser` rejects an email that is not a valid address. `POST
  /admin/users` answers `400`. The CLI `add-user` command reports the refusal
  and exits non-zero.
- `resolveRecipients` drops a stored address that is not a valid address. It
  writes one `log.warn` line naming the instance, the action and the account.
  The handler records no event. No migration runs.
- The `ponytail:` mark on the candidate list names the new ceiling.

The definition contract, the event kinds and the schema stay as they are.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `notification-email-action-handler`: the recipient list sends in batches of
  at most 100. A stored address that is no valid address drops out with a
  warning.
- `local-user-accounts`: `createUser` and the CLI reject an invalid email.
- `admin-user-management`: `POST /admin/users` answers `400` for an invalid
  email.

## Impact

- `src/handlers/notification-email.ts`, `src/auth/users.ts`,
  `src/auth/cli.ts`, `src/http/admin-routes.ts`.
- `test/handlers-notification-email.test.ts`, `test/auth-users.test.ts`,
  `test/auth-cli.test.ts`, and `test/http-admin.test.ts`.
- `docs/authoring-guide.md`: the "Who a notification reaches" section states
  the recipient rules.
- `docs/decisions.md`: the audit index entry for this change gets struck.
