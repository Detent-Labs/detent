<!-- antislop: allow-file all -->
<!-- Matches this capability's own top-of-file allow-file all: every
     requirement uses the fixed SHALL/WHEN/THEN Gherkin grammar
     admin-app/spec.md already carries this exemption for. -->

## ADDED Requirements

### Requirement: The instance detail screen offers a redact action

The instance detail screen SHALL show a "Redact data" action next to the
existing Cancel action, whenever the instance's status is not `running`.
It SHALL disable the action, rather than hide it, once the instance
already carries a `redactedAt` value.

Its confirmation dialog SHALL state plainly that the action permanently
clears the instance's data, comments, and attachments. Confirming SHALL
call `POST /admin/instances/:id/redact` through the existing admin API
client.

#### Scenario: The action is shown for a non-running instance

- **WHEN** the operator opens the detail screen for a `completed`,
  `cancelled`, or `faulted` instance with no `redactedAt` value
- **THEN** the "Redact data" action is shown and enabled

#### Scenario: The action is hidden for a running instance

- **WHEN** the operator opens the detail screen for a `running` instance
- **THEN** the "Redact data" action is not shown

#### Scenario: The action disables once already redacted

- **WHEN** the operator opens the detail screen for an instance whose
  `redactedAt` already holds a value
- **THEN** the "Redact data" action is shown but disabled

#### Scenario: Confirming names what will be cleared

- **WHEN** the operator clicks "Redact data"
- **THEN** a confirmation dialog states that the instance's data,
  comments, and attachments will be cleared permanently, before the
  request fires

### Requirement: A redacted instance shows a badge

Once an instance's `redactedAt` holds a value, the detail screen SHALL
show a "Data redacted on `<date>`" badge. The instance's `data` SHALL
render as empty, since redaction already cleared it. The transition and
event history SHALL still render in full.

#### Scenario: The badge appears after redaction

- **WHEN** the operator opens the detail screen for a redacted instance
- **THEN** a "Data redacted on `<date>`" badge is shown, and the
  rendered `data` is empty

#### Scenario: History stays visible after redaction

- **WHEN** the operator opens the detail screen for a redacted instance
- **THEN** its transition and event history renders the same as an
  unredacted instance's
