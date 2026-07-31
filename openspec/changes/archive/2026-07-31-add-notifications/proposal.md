## Why

`packages/app`'s inbox is poll-only. A participant learns about a new task
only by opening My-tasks. The engine can call an external system on a
transition (`http.request`, Roadmap #5e), but it cannot send an email. So
"notify on assignment" and "notify when a reminder timer fires" have no
answer today. Roadmap #17 (escalation) already ships a recipe naming an
action position for a notifying action. Only a webhook handler exists to put
there.

## What Changes

- A new action-handler type, `notification.email`, registered by default in
  `createDefaultRegistry` (`src/engine/host.ts`) next to `httpHandlerDef`.
  No schema change. The five existing action positions (`onEntry`, `onExit`,
  `onCancel`, a path's `onPath`, a timer's `onFire.actions`) already carry
  it. `checkActionRegistry` already validates all five.
- `src/handlers/notification-email.ts`, mirroring `src/handlers/http.ts`. It
  exports `NOTIFICATION_EMAIL_ACTION_TYPE`,
  `notificationEmailConfigSchema`, and `notificationEmailHandlerDef`. The
  config declares `to` (one or more valid addresses), `subject`, and a
  plain-text `body`. It stays static and publish-validated: no instance
  `data`, no database lookup.
- A minimal SMTP client on `Bun.connect` plus STARTTLS, with no new npm
  dependency. This is the same ladder `http.request` climbed with `fetch`.
  Connection details come from the environment (`SMTP_HOST`, `SMTP_PORT`,
  `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`), never from the process body.
  That matches the `DATABASE_URL` and `AUTH_JWT_SECRET` convention.
- A `Message-ID` header derived from `ctx.idempotencyKey`. A cooperating
  mail system can dedupe a retried delivery on it. It is the counterpart of
  `http.request`'s `Idempotency-Key`.
- Failure classification mapped onto the outbox's existing
  permanent-vs-transient semantics. An SMTP `5xx` reply and an unset
  `SMTP_HOST` are permanent. An SMTP `4xx` reply, a connection failure, and
  the handler's own timeout are transient.
- A `mailpit` service in `.devcontainer/docker-compose.yml`. The end-to-end
  send test then runs against a real SMTP endpoint instead of a mock. The
  DB-backed suites use that same "real dependency" pattern against `db`.

<!-- antislop: allow passive-voice -->
This change breaks nothing. An existing deployment that authors no
`notification.email` action and sets no `SMTP_*` variable is unaffected.

## Capabilities

### New Capabilities

- `notification-email-action-handler`: the `notification.email` action
  handler. It covers default registration and publish-time config
  validation. It also covers SMTP delivery over environment-supplied
  connection details, the idempotency-derived `Message-ID`, the per-attempt
  timeout, and the permanent-vs-transient failure classification.

### Modified Capabilities

- `development-toolchain`: the devcontainer gains an SMTP catcher service.
  The handler's end-to-end test needs a real endpoint to send to. The
  `SMTP_HOST` and `SMTP_PORT` variables point the engine at it.

## Impact

- New files: `src/handlers/notification-email.ts`,
  `test/notification-email.test.ts`, and
  `openspec/specs/notification-email-action-handler/spec.md`.
- Modified files: `src/engine/host.ts` (`createDefaultRegistry` gains one
  registration) and `.devcontainer/docker-compose.yml` (a `mailpit` service,
  plus `app`'s `environment` and `depends_on`). The registry-validation test
  that covers `http.request` at the five action positions also changes.
- No schema change, no HTTP route, no database migration, and no new npm
  dependency.
- Roadmap #16's own follow-on stays out of scope. Recipients are static
  addresses, not resolved from `Step.assignment`. That needs an
  actor-id-to-email lookup the engine does not have.
