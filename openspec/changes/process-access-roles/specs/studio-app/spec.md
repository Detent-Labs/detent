## MODIFIED Requirements

### Requirement: The process list shows draft and published state per process

The `/processes` screen SHALL list one row per process on the actor's own
Developer or Owner list, per the `process-access-roles` capability. An actor
holding `ADMIN_ROLE` SHALL see every process instead.

`GET /processes` and `GET /drafts` SHALL stay unfiltered. The participant's
Start-a-process screen and the operator's pickers read them too, and both
need the full list. The `/processes` screen SHALL instead read the actor's
own Developer- and Owner-listed process ids. It SHALL narrow its combined
rows to that set in the browser.

<!-- antislop: allow synonym-rotation -->
<!-- "render" (paint a row) and "surface" (the named Access panel below) name different concepts. -->
Each row SHALL render whether a draft exists. Where one does, the row SHALL
render who last saved it and when. The row SHALL also render the latest
published version with its `definitionHash`. A process with a draft but no
published version SHALL render correctly. A process with published versions
but no draft SHALL also render correctly.

<!-- antislop: allow synonym-rotation -->
<!-- "Discard" names the existing toolbar control. "delete" names removing a list entry in the Access surface below. -->
Actions SHALL be: create a new process, open a process for editing, and
discard its draft. Discarding SHALL need a confirmation and SHALL call
`DELETE /drafts/:processId`, leaving published versions untouched.

#### Scenario: A never-published process appears

- **WHEN** a draft exists for a process with no `definitions` rows
- **THEN** the row renders with its draft metadata and an empty published
  column

#### Scenario: A published process with no draft appears

- **WHEN** a process has published versions and no draft
- **THEN** the row renders the latest version and its hash, and offers
  creating a draft rather than opening one

#### Scenario: Discarding removes only the draft

- **WHEN** an author confirms discard for a process with published versions
- **THEN** the draft disappears from the list and the published version and
  hash still render

#### Scenario: A process outside the actor's lists stays hidden

- **WHEN** an actor holds `system:developer`
- **AND** the actor is on process A's Developer list but not process B's
- **AND** both processes have published versions
- **THEN** the list shows process A's row
- **AND** the list omits process B's row

#### Scenario: An admin sees every process

- **WHEN** an actor holding `ADMIN_ROLE` opens `/processes`
- **THEN** the list shows every process, regardless of that actor's own
  Developer or Owner lists

### Requirement: Creating a new process mints a prefixed id client-side

Creating a process SHALL mint a `proc_`-prefixed UUIDv4 id in the browser.
It SHALL use the minting path the Draft model already uses for every other
entity kind. That path generates `${prefix}_${crypto.randomUUID()}` and
parses it through the contract's own branded id schema. Creating SHALL then
write the row with a `PUT /drafts/:processId` at `revision = 0`. There SHALL
be no separate create-then-save round trip and no server-side id allocation.

The `/processes` screen SHALL offer the create-new-process action only to an
actor holding `CREATE_ROLE`. This is a presentational check alone. The
`PUT /drafts/:processId` call it issues carries the authoritative check, per
`process-drafts`.

Creating SHALL first offer a choice of starting body. The empty choice SHALL
seed the body the studio seeds today. The template choice SHALL seed the body
and the layout of a template the author picks. The picker SHALL list the
templates the account may read.

A process seeded from a template SHALL claim no base version, because a
template is no published version.

#### Scenario: A new process is one round trip

- **WHEN** an author holding `CREATE_ROLE` creates a new process
- **THEN** the browser issues exactly one `PUT /drafts/:processId`, with
  `revision` 0, and the process id carries the `proc_` prefix

#### Scenario: The empty choice behaves as before

- **WHEN** an author creates a new process and picks the empty choice
- **THEN** the draft body declares the base locale and nothing else

#### Scenario: The template choice seeds body and layout

- **WHEN** an author creates a new process from a template
- **THEN** the draft holds that template's body and layout
- **AND** the draft has no base version

#### Scenario: An author with no readable template still creates a process

- **WHEN** an author creates a new process while no template exists
- **THEN** the picker offers the empty choice and states that no template
  exists

#### Scenario: The screen hides the create action without the create role

- **WHEN** an actor holds `system:developer` but not `CREATE_ROLE`
- **THEN** the `/processes` screen offers no create-new-process action

## ADDED Requirements

### Requirement: A process's Access surface manages its Developer, Owner and Reader lists

A process's edit screen SHALL offer an Access surface to an actor listed as
its Developer or its Owner. That listing follows the `process-access-roles`
capability. The surface SHALL render that process's Developer, Owner and
Reader lists, each as users and groups.

A Developer SHALL add and delete entries on the Developer list and on the
Owner list from this surface. An Owner SHALL add and delete entries on the
Reader list from this surface. Neither role SHALL see a control for the
other's list. The server enforces every write authoritatively, per
`process-access-roles`.

An actor reaching the edit screen through `ADMIN_ROLE` alone SHALL also
reach the Access surface. It SHALL offer every control this requirement
names, regardless of that actor's own Developer or Owner entry.

#### Scenario: A Developer manages Developer and Owner entries

- **WHEN** an actor listed as a process's Developer opens its Access surface
- **THEN** the surface offers adding and deleting entries on the Developer
  list and on the Owner list

#### Scenario: An Owner manages the Reader list

- **WHEN** an actor listed as a process's Owner opens its Access surface
- **THEN** the surface offers adding and deleting entries on the Reader list

#### Scenario: A Developer holding no Owner entry sees no Reader control

- **WHEN** an actor listed as a process's Developer, but not its Owner,
  opens its Access surface
- **THEN** the surface offers no control over the Reader list

#### Scenario: An admin reaches the Access surface unconditionally

- **WHEN** an actor holding `ADMIN_ROLE`, with no Developer or Owner entry
  of their own, opens a process's Access surface
- **THEN** the surface offers every control this requirement names
