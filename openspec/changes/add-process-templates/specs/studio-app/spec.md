## ADDED Requirements

### Requirement: The templates screen lists, creates and deletes a template

The studio area SHALL carry a templates screen. It SHALL list one row per
template, labelled by the `label` the stored body declares. A body may declare
no label for the active content locale. The row SHALL then fall back to the
template key, so no row renders nameless.

The screen SHALL create a template from a published version of a process, and
from no other source. That path SHALL strip the compile pass's cancel-sink
injection, because a template holds the authored shape.

A draft SHALL NOT be a source. `system:templates` cannot read one. Opening
drafts to a curator would hand them every unfinished body in the
installation.

The screen SHALL delete a template behind a confirmation. A delete SHALL
leave every process untouched.

The screen SHALL need `system:templates`. An actor holding only
`system:developer` SHALL NOT reach it. That actor still reads the templates
through the picker.

#### Scenario: A template made from a published version appears in the list

- **WHEN** a curator creates a template from a published version
- **THEN** the list carries a row for it, labelled by the body's label

#### Scenario: A template whose body declares no label still renders

- **WHEN** the list renders a template whose body carries no label for the
  active content locale
- **THEN** the row shows the template key

#### Scenario: Deleting a template asks first

- **WHEN** a curator deletes a template
- **THEN** the screen asks for a confirmation before it calls the engine

#### Scenario: An author reaches no templates screen

- **WHEN** an actor holding only `system:developer` opens the templates screen
- **THEN** the screen refuses and states which role the account lacks

## MODIFIED Requirements

### Requirement: An authenticated actor without the developer role sees an explanatory empty state

The shell SHALL read the roles the login response carries. When the account
holds neither `system:developer` nor `system:templates`, the shell SHALL
render an explanatory screen. That screen SHALL state that the account lacks
studio access. The shell SHALL NOT redirect to `/login`, because the
credentials are valid. It SHALL NOT render a partly populated screen.

An account holding `system:templates` alone SHALL enter the area and reach
the templates screen only. Every other studio screen SHALL refuse it and
SHALL state which role the account lacks.

This client-side check only decides what the shell renders. Every studio route
SHALL stay gated server-side whatever the browser decides.

#### Scenario: A participant account learns why studio is empty

- **WHEN** an actor holding neither studio role logs in to studio
- **THEN** an explanatory empty state renders
- **AND** the shell renders neither the login screen nor any process or draft
  data

#### Scenario: A curator enters the area and reaches one screen

- **WHEN** an actor holding only `system:templates` logs in to studio
- **THEN** the templates screen renders
- **AND** the process list refuses and names the missing role

#### Scenario: The frontend check is not the control

- **WHEN** a client that skipped the shell check calls a draft route directly
- **THEN** the server still answers 403

### Requirement: Creating a new process mints a prefixed id client-side

Creating a process SHALL mint a `proc_`-prefixed UUIDv4 id in the browser.
It SHALL use the minting path the Draft model already uses for every other
entity kind. That path generates `${prefix}_${crypto.randomUUID()}` and
parses it through the contract's own branded id schema. Creating SHALL then
write the row with a `PUT /drafts/:processId` at `revision = 0`. There SHALL
be no separate create-then-save round trip and no server-side id allocation.

Creating SHALL first offer a choice of starting body. The empty choice SHALL
seed the body the studio seeds today. The template choice SHALL seed the body
and the layout of a template the author picks. The picker SHALL list the
templates the account may read.

A process seeded from a template SHALL claim no base version, because a
template is no published version.

#### Scenario: A new process is one round trip

- **WHEN** an author creates a new process
- **THEN** the browser issues exactly one `PUT /drafts/:processId`, with
  `revision` 0, and the process id carries the `proc_` prefix

#### Scenario: The empty choice behaves as before

- **WHEN** an author creates a new process and picks the empty choice
- **THEN** the draft body declares the base locale and nothing else

#### Scenario: The template choice seeds body and layout

- **WHEN** an author creates a new process from a template
- **THEN** the draft holds that template's body and layout
- **AND** the draft carries no base version

#### Scenario: An author with no readable template still creates a process

- **WHEN** an author creates a new process while no template exists
- **THEN** the picker offers the empty choice and states that no template
  exists
