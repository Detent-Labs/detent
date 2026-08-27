<!-- antislop: allow-file passive-voice -->
<!-- Carries the main spec's own directive and reason: the fixed SHALL/WHEN/THEN Gherkin grammar is structurally passive. -->

## MODIFIED Requirements

### Requirement: An instance's personal data can be redacted from the admin area

`src/http/admin-routes.ts` SHALL expose `POST
/admin/instances/:id/redact`. It SHALL be gated by `system:admin`, like
every other `/admin/*` route. The handler SHALL call the existing
`redactInstance(instanceId, db, { actor: actor.id })`
(`src/engine/retention.ts`). The actor it passes is the requesting actor
the route already resolves. The audit log's `redact` entries then name
who asked for the redaction.

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

#### Scenario: The redaction names the requesting actor

- **WHEN** an actor holding `system:admin` redacts a completed instance
- **THEN** the audit log's `redact` entries carry that actor's id
