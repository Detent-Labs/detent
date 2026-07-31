## 1. Devcontainer SMTP catcher

- [x] 1.1 Add a pinned `mailpit` service to `.devcontainer/docker-compose.yml`,
      next to `db`, with no host port published there
- [x] 1.2 Leave the shared compose file publishing no host port for it, like
      `db`. Publishing the web interface as `127.0.0.1:8025:8025` stays a
      local step in the gitignored `docker-compose.override.yml`
- [x] 1.3 Add `SMTP_HOST: mailpit` and `SMTP_PORT: "1025"` to the `app`
      service's `environment`, and `mailpit` to its `depends_on`
- [x] 1.4 Rebuild the devcontainer and confirm the web interface answers on
      `http://localhost:8025` from the host browser

## 2. Handler skeleton and config schema

- [x] 2.1 Create `src/handlers/notification-email.ts` mirroring
      `src/handlers/http.ts`: `NOTIFICATION_EMAIL_ACTION_TYPE`,
      `SMTP_DEFAULT_TIMEOUT_MS = 5_000`, and `notificationEmailConfigSchema`
      (`to`: at least one `z.string().email()`; `subject`; `body`)
- [x] 2.2 Declare the result type `NotificationEmailResult = { messageId:
      string; recipients: string[] }`, the `result` namespace an
      `Action.output` mapping reads
- [x] 2.3 Export `notificationEmailHandlerDef: HandlerDef` carrying that
      `configSchema`
- [x] 2.4 Register it in `createDefaultRegistry` (`src/engine/host.ts`) next
      to `httpHandlerDef`
- [x] 2.5 Create `test/handlers-notification-email.test.ts` with the
      config-schema tests: a valid config passes, a malformed `to` address
      fails, an empty `to` array fails. No DB, no SMTP server, matching
      `test/handlers-http.test.ts`

## 3. SMTP session

- [x] 3.1 Read `SMTP_HOST`, `SMTP_PORT` (default `587`), `SMTP_USER`,
      `SMTP_PASSWORD`, and `SMTP_FROM` from the environment at dispatch time.
      Throw `PermanentError` when `SMTP_HOST` or `SMTP_FROM` is unset, before
      opening a socket. Never substitute a sender address
- [x] 3.2 Implement the reply reader: read a full multi-line SMTP reply, and
      return its three-digit code plus text
- [x] 3.3 Implement the session over `Bun.connect`: `EHLO`, `STARTTLS` via
      `socket.upgradeTLS` (verified present in Bun 1.3.11), a second `EHLO`,
      `AUTH PLAIN`, `MAIL FROM`, `RCPT TO`, `DATA`, `QUIT`
- [x] 3.4 Throw `PermanentError` when credentials are set and the server
      advertises no `STARTTLS`. Never send the password in the clear
- [x] 3.5 Build the message: `From`, `To`, `Subject` (RFC 2047 for non-ASCII),
      `Message-ID` derived from `ctx.idempotencyKey`, `Content-Type:
      text/plain; charset=utf-8`, and a base64 body
- [x] 3.6 Bound the whole session with the action's `timeout` or
      `SMTP_DEFAULT_TIMEOUT_MS`, closing the socket when the bound fires
- [x] 3.7 Send one `RCPT TO` per address in `to` and check every reply before
      `DATA`. Abort on any rejection while nothing has been sent: `5xx`
      permanent, `4xx` transient. Never deliver to part of `to`
- [x] 3.8 Build the returned result before sending the end of `DATA`, and
      treat the `250` on end-of-`DATA` as the point of no return: swallow
      every later failure, including a `QUIT` failure, a socket reset, and a
      timeout during close

## 4. Failure classification

- [x] 4.1 Throw `PermanentError` on a `5xx` reply, carrying the server's own
      reply text
- [x] 4.2 Throw a plain `Error` on a `4xx` reply, a connection failure, and a
      timeout, all of them before the point of no return
- [x] 4.3 Test classification in `test/handlers-notification-email.test.ts`
      against a `Bun.listen` server answering canned `4xx` and `5xx` replies,
      plus a closed port and an unset `SMTP_HOST`. No DB, no real mail server
- [x] 4.4 Test the point of no return: a fake server that accepts the message
      and then drops the connection before `QUIT` yields a succeeded delivery,
      not a retry
- [x] 4.5 Test the all-or-nothing rule: a fake server rejecting the second of
      three `RCPT TO` commands receives no `DATA`. Cover `550` as permanent
      and `450` as transient
- [x] 4.6 Test that an unset `SMTP_FROM` fails permanently with `SMTP_HOST`
      set, opening no socket

## 5. End-to-end send

- [x] 5.1 Add a `test.skipIf(!SMTP_HOST)` test sending a real message to
      Mailpit
- [x] 5.2 Read the message back through Mailpit's `GET /api/v1/messages` and
      assert on recipient, subject, decoded body, and `Message-ID`
- [x] 5.3 Add one DB-backed integration test to `test/definitions.test.ts`,
      mirroring the `http.request` pair at line 318: publishing a
      `notification.email` action with a malformed `to` address is rejected,
      proving `configSchema` reaches `publishBody`. Leave
      `test/registry-check.test.ts` untouched, since it already covers the
      five action positions generically

## 6. Verification and close-out

- [x] 6.1 Run `bun run typecheck` and the full `bun test` suite with
      `DATABASE_URL` set, inside the devcontainer. Check the skip count, not
      only the pass count
- [x] 6.2 Update `docs/current-state.md` with a "Notifications" entry
- [x] 6.3 Mark Roadmap #16 DONE, naming what shipped and what stayed out.
      State plainly that a static recipient list cannot notify the assignee,
      so the participant-inbox gap stays open

## 7. Verification follow-ups (from /opsx:verify)

- [x] 7.1 Cover the `Action.output` path through `deliver()`: a mapping over
      `result.messageId`, an action with no mapping, and an unreadable mapping
      that fails transiently after the message is out
- [x] 7.2 Cover default registration: `createDefaultRegistry` resolves the type,
      and a registry without it dead-letters as unregistered
- [x] 7.3 Assert the declared `timeout` wins over `SMTP_DEFAULT_TIMEOUT_MS` by
      measuring elapsed time, not only that some timeout fired
- [x] 7.4 Name the waiting step in the session-timeout message, so a stalled
      TLS handshake stops reading as a bare deadline
- [x] 7.5 Cover the STARTTLS decision logic: the upgrade is taken when
      advertised, no credential precedes it, and an unusable upgrade retries
      instead of falling back to plaintext
- [x] 7.6 Document the CRLF body normalization in the spec, the design, and
      `docs/current-state.md`, with a test
- [x] 7.7 Add a `notification.email` action to `examples/expense-approval.json`'s
      `escalated_review` step, recompute `definitionHash`, and register the type
      in the three hand-built test registries
