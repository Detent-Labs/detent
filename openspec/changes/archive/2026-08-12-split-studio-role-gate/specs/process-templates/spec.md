## MODIFIED Requirements

### Requirement: A dedicated role gates the template routes

The engine SHALL expose four routes over the templates table. They list the
templates, read one template, write one template, and delete one template.

The list route SHALL carry no body. It SHALL carry the template key, the
`label` and the `description` the body declares, and the write provenance.
The read route carries the body. A body may reach the declared size bound.
A list carrying every body would answer a picker with megabytes it never
reads. The draft list already draws that line the same way.

The write route and the delete route SHALL need `system:templates`. The list
route and the read route SHALL accept `system:templates`, `system:developer`
or `system:author`. An author of either kind can therefore read what a curator
writes.

The route returning a published version's body SHALL accept the same three
roles. A
curator creates a template from a published version. Refusing that body would
leave the role able to write a template and unable to get one.

The role SHALL imply nothing else. An actor holding `system:templates` alone
SHALL NOT publish, cancel an instance, administer a user, or read a draft.

A draft SHALL stay closed to the curator. A draft holds unfinished, private
work. A published body is the one every participant already runs. The pair is
therefore split rather than opened together.

A delete SHALL strand nothing. No process, draft or instance references a
template.

#### Scenario: A curator writes a template

- **WHEN** an actor holding `system:templates` writes a template
- **THEN** the write succeeds

#### Scenario: The list carries a label but no body

- **WHEN** a caller lists the templates
- **THEN** each entry carries the template key and the body's `label`
- **AND** no entry carries the body

#### Scenario: A developer reads a template but writes none

- **WHEN** an actor holding only `system:developer` lists the templates
- **THEN** the read succeeds
- **AND** a write by that actor fails with an authorization error

#### Scenario: An author reads a template but writes none

- **WHEN** an actor holding only `system:author` lists the templates
- **THEN** the read succeeds
- **AND** a write by that actor fails with an authorization error

#### Scenario: A curator reaches no draft

- **WHEN** an actor holding only `system:templates` reads a draft
- **THEN** the read fails with an authorization error

#### Scenario: A curator reads a published version's body

- **WHEN** an actor holding only `system:templates` reads a published
  version's body
- **THEN** the read succeeds

#### Scenario: A caller with no identity reaches no template

- **WHEN** a caller carrying no valid identity lists the templates
- **THEN** the read fails and the response carries no template

#### Scenario: A delete strands no process

- **WHEN** a curator deletes a template that seeded a process
- **THEN** the delete succeeds and that process keeps its body
