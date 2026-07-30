<!-- antislop: allow-file all -->
<!-- Matches this capability's own top-of-file allow-file all: every
     requirement uses the fixed SHALL/WHEN/THEN Gherkin grammar
     admin-operations-api/spec.md already carries this exemption for. -->

## ADDED Requirements

### Requirement: An instance's personal data can be redacted from the admin area

`src/http/admin-routes.ts` SHALL expose `POST
/admin/instances/:id/redact`. It SHALL be gated by `system:admin`, like
every other `/admin/*` route. The handler SHALL call the existing
`redactInstance(instanceId, db)` (`src/engine/retention.ts`) unchanged.

On success, the response SHALL be status 200 with the redacted instance
summary as its body. A `running` instance SHALL be refused with status
409, type `instance-running`, the `InstanceRunningError` mapping added
to `http/errors.ts`.

#### Scenario: Redacting a completed instance

- **WHEN** `POST /admin/instances/:id/redact` is requested by an actor
  holding `system:admin`, naming a `completed` instance
- **THEN** the response is 200, and the instance's `data` is cleared and
  its comments/attachments are deleted

#### Scenario: Redacting a running instance is refused

- **WHEN** `POST /admin/instances/:id/redact` is requested naming a
  `running` instance
- **THEN** the response is 409 with type `instance-running`, and the
  instance is unchanged

#### Scenario: Redacting twice is idempotent

- **WHEN** `POST /admin/instances/:id/redact` is requested twice for the
  same instance
- **THEN** both responses are 200, and the second call changes nothing

#### Scenario: An actor without the admin role is refused

- **WHEN** `POST /admin/instances/:id/redact` is requested by an actor
  whose roles do not include `system:admin`
- **THEN** the response is 403 and `redactInstance` is not called
