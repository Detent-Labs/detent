## Purpose

Holds a reusable authored process body that seeds a new process. An author
therefore starts from a prepared body rather than an empty canvas. A template
is a snapshot, never a published artifact and never a dependency.

## ADDED Requirements

### Requirement: A template holds one authored body and its layout under a flat key

The engine SHALL hold templates in a dedicated `templates` table. A flat
template key SHALL be its primary key. Each row SHALL carry the authored body,
a layout object, the actor id that last wrote it, and a timestamp.

The table SHALL carry no version column and no definition hash. The engine
never publishes a template, and no instance pins one.

The engine SHALL NOT hold a template in `definitions`. That table holds the
immutable published bodies. The resolution and timer workers rehydrate running
instances from them. A template row there would reach every reader of that
table. A participant could then start an instance of a template.

The table SHALL carry no label column. The stored body already declares
`label` and `description`, and every reader takes them from the body.

#### Scenario: Schema initialization creates the templates table

- **WHEN** schema initialization runs against an empty database
- **THEN** a `templates` table exists whose primary key is the template key

#### Scenario: One key holds at most one template

- **WHEN** a curator writes a template twice under one key
- **THEN** exactly one `templates` row exists for that key

#### Scenario: A template never appears among published processes

- **WHEN** a caller lists published processes while a template exists
- **THEN** the response carries no entry for that template

### Requirement: The engine holds a template body as authored and checks only its envelope

The engine SHALL hold the body exactly as the caller supplies it. That is the
authored, uncompiled shape. The engine SHALL NOT parse the body against the
published or the authored process body schema. It SHALL apply no structural
refinement.

A template seeds a draft. The draft store accepts a body that violates the
authoring-time invariants. A stricter check on the template than on its own
target would create a third class of body. An author could save it as a draft
but not as a template.

The engine SHALL still check the request envelope, because a write is a trust
boundary. The body SHALL be a JSON object. The layout SHALL be a JSON object.
The two together SHALL stay under the size bound the draft envelope declares.
The engine SHALL reject a violating envelope with a request-shape error.

The write path SHALL carry no revision check. A template faces no concurrent
editing pressure, unlike a draft an author holds open on a canvas.

#### Scenario: A body no schema accepts still reaches the table

- **WHEN** a curator writes a template whose body holds a step with no exit
- **THEN** the write succeeds
- **AND** a later read returns that body unchanged

#### Scenario: The engine rejects a body that is not an object

- **WHEN** a curator writes a template whose body is an array
- **THEN** the engine reports a request-shape error and writes no row

#### Scenario: The engine rejects an oversized envelope

- **WHEN** a curator writes a template whose body and layout together exceed
  the declared size bound
- **THEN** the engine reports a request-shape error and writes no row

### Requirement: A dedicated role gates the template routes

The engine SHALL expose four routes over the templates table. They list the
templates, read one template, write one template, and delete one template.

The list route SHALL carry no body. It SHALL carry the template key, the
`label` and the `description` the body declares, and the write provenance.
The read route carries the body. A body may reach the declared size bound.
A list carrying every body would answer a picker with megabytes it never
reads. The draft list already draws that line the same way.

The write route and the delete route SHALL need `system:templates`. The list
route and the read route SHALL accept `system:templates` or
`system:developer`. An author can therefore read what a curator writes.

The role SHALL imply nothing else. An actor holding `system:templates` alone
SHALL NOT publish, cancel an instance, administer a user, or read a draft.

A delete SHALL strand nothing. No process, draft or instance references a
template.

#### Scenario: A curator writes a template

- **WHEN** an actor holding `system:templates` writes a template
- **THEN** the write succeeds

#### Scenario: The list carries a label but no body

- **WHEN** a caller lists the templates
- **THEN** each entry carries the template key and the body's `label`
- **AND** no entry carries the body

#### Scenario: An author reads a template but writes none

- **WHEN** an actor holding only `system:developer` lists the templates
- **THEN** the read succeeds
- **AND** a write by that actor fails with an authorization error

#### Scenario: A curator reaches no draft

- **WHEN** an actor holding only `system:templates` reads a draft
- **THEN** the read fails with an authorization error

#### Scenario: A caller with no identity reaches no template

- **WHEN** a caller carrying no valid identity lists the templates
- **THEN** the read fails and the response carries no template

#### Scenario: A delete strands no process

- **WHEN** a curator deletes a template that seeded a process
- **THEN** the delete succeeds and that process keeps its body

### Requirement: A template seeds a new process through the existing draft route

Seeding SHALL add no route. The browser SHALL read the template. It SHALL then
send the body and the layout to the existing draft write route. It SHALL use a
freshly minted process id and the first revision of that draft.

The seeded draft SHALL hold the template's body and layout unchanged. It SHALL
declare no base version, because a template is no published version.

A curator who creates a template from a published version SHALL get the
authored shape. That path SHALL strip the compile pass's cancel-sink
injection. A draft seeded from a published version already gets that
treatment.

#### Scenario: A process seeded from a template holds its body

- **WHEN** an author creates a process from a template
- **THEN** a draft exists under a new process id
- **AND** its body equals the template's body

#### Scenario: A seeded draft claims no base version

- **WHEN** an author creates a process from a template
- **THEN** the resulting draft carries no base version

#### Scenario: A template made from a published version carries no cancel sink

- **WHEN** a curator creates a template from a published version
- **THEN** the stored body carries no engine-injected cancel-sink step

### Requirement: A template edit changes no process it already seeded

A template SHALL be a snapshot. The engine SHALL record no link between a
template and the processes it seeded.

A new body on a template SHALL leave every existing draft untouched. It SHALL
leave every published version untouched. Nothing SHALL propagate from a
template after the seeding.

#### Scenario: A template edit leaves a seeded draft alone

- **WHEN** an author seeds a process from a template
- **AND** a curator then writes a different body to that template
- **THEN** the seeded draft still holds the body the author seeded it with
