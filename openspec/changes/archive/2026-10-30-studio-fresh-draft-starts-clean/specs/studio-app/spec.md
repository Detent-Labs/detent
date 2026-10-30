## ADDED Requirements

### Requirement: A new process mints a prefixed id client-side in one write

Creating a process SHALL mint a `proc_` id in the browser as
`${prefix}_${crypto.randomUUID()}`, a UUIDv4. It SHALL parse that id through
the contract's branded id schema, the path every other entity kind uses. It
SHALL write the row with one `PUT /drafts/:processId` at `revision = 0`.
There SHALL be no create-then-save round trip and no server-side id. The
`/processes` screen SHALL offer the action only to an actor holding
`CREATE_ROLE`, as a presentational check.

#### Scenario: A new process is one round trip

- **WHEN** an author holding `CREATE_ROLE` creates a new process
- **THEN** the browser issues exactly one `PUT /drafts/:processId`, with
  `revision` 0, and the process id carries the `proc_` prefix

#### Scenario: The screen hides the create action without the create role

- **WHEN** an actor holds `system:developer` but not `CREATE_ROLE`
- **THEN** the `/processes` screen offers no create-new-process action

#### Scenario: The create role check is presentational alone

- **WHEN** a client skips the screen and sends `PUT /drafts/:processId` for
  an actor without `CREATE_ROLE`
- **THEN** the write path's own check answers, per `process-drafts`

### Requirement: The empty choice seeds every list empty

Creating SHALL first offer a choice of starting body. The picker SHALL list
the templates the account may read. The empty choice SHALL seed every list
in place and empty. A template start SHALL seed that template's body and
layout. A process seeded from a template SHALL claim no base version,
because a template is no published version.

#### Scenario: The empty choice seeds every list empty

- **WHEN** an author creates a new process and picks the empty choice
- **THEN** the draft body holds `key` as an empty string, `label` as an
  empty object, and `baseLocale` as `"en"`
- **AND** it holds `fields` as an empty array and `workflow.steps` as an
  empty array
- **AND** it has no `workflow.initialStep` and no other key

#### Scenario: A fresh empty draft reports one gap alone

- **WHEN** the engine's own structural validation reads the body the empty
  choice seeds
- **THEN** it reports exactly one Zod issue, the missing
  `workflow.initialStep`

#### Scenario: The template choice seeds body and layout

- **WHEN** an author creates a new process from a template
- **THEN** the draft holds that template's body and layout
- **AND** the draft has no base version

#### Scenario: An author with no readable template still creates a process

- **WHEN** an author creates a new process while no template exists
- **THEN** the picker offers the empty choice and states that no template
  exists

## REMOVED Requirements

### Requirement: Creating a new process mints a prefixed id client-side

**Reason**: Its scenario "The empty choice behaves as before" pins a body
that declares the base locale and nothing else. That body opens on four Zod
issues. The successor requirements seed every list empty. A MODIFIED block
would have to keep that scenario's name over reversed content.

**Migration**: Two requirements succeed it. The first is "A new process
mints a prefixed id client-side in one write". It carries the id, the one
write and the create-role gate unchanged. "The empty choice seeds every list empty"
carries the picker and the template start, and seeds the new empty body.
Code or test comments that quote this requirement's name take the first
successor's name.
