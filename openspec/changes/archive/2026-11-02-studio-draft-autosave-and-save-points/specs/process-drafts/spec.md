## ADDED Requirements

### Requirement: A draft keeps named save points beside it

The engine SHALL store a draft's save points in their own table, outside the
draft's body and layout. A save point SHALL hold an opaque id, the process id and a
name. It SHALL hold a copy of the persisted body and layout. It SHALL also hold the
draft revision it copied, the creating actor and the creation time.

A save point SHALL NOT reach a published version or any `definitionHash`. Deleting
a draft SHALL delete its save points in the same transaction. A publish SHALL leave
them alone.

#### Scenario: A save point copies the persisted draft

- **WHEN** an actor creates a save point at the draft's current revision
- **THEN** the save point holds the stored body and layout
- **AND** the draft's body, layout and revision do not move

#### Scenario: A stale revision creates nothing

- **WHEN** an actor creates a save point with a revision the draft has passed
- **THEN** the call raises the draft conflict error
- **AND** the store gains no save point

#### Scenario: The list leaves out each copy

- **WHEN** an actor lists a draft's save points
- **THEN** each entry names its id, name, revision, actor and time, newest first
- **AND** no entry holds a body or a layout

#### Scenario: Discarding a draft removes its save points

- **WHEN** an actor deletes a draft that holds save points
- **THEN** the store holds none for that process

#### Scenario: A hash reads no save point

- **WHEN** a draft holding save points publishes
- **THEN** the version's hash equals the hash of the same body on a draft holding none

#### Scenario: Only the draft module reads the draft's body

- **WHEN** a save point copies or restores a draft
- **THEN** the read and the write run through `src/engine/drafts.ts`

### Requirement: A save point's name and number stay bounded

The engine SHALL trim a name and SHALL refuse an empty one. A name SHALL hold at most
200 characters, and two save points MAY share one. A draft SHALL hold at most 50 save
points. A create or a restore at that bound SHALL raise the request-shape error and
change nothing.

#### Scenario: The bound refuses the fifty-first

- **WHEN** a draft holds 50 save points and an actor creates another
- **THEN** the call raises the request-shape error
- **AND** the draft still holds 50

#### Scenario: The engine refuses an empty name

- **WHEN** an actor creates a save point whose name is empty after trimming
- **THEN** the call raises the request-shape error

### Requirement: Restoring a save point keeps the current work

A restore SHALL run in one transaction, with the draft's row locked first. The
caller SHALL name the revision it read and a name for the current work. A stale
revision SHALL raise the draft conflict error.

The engine SHALL then store the current body and layout as a new save point under
that name. It SHALL write the restored body and layout onto the draft and advance
`revision` by one. It SHALL record the actor and the time, and leave `base_version`
alone. The restored save point SHALL stay.

#### Scenario: A restore puts the old state back and keeps the new one

- **WHEN** an actor restores a save point at the draft's current revision
- **THEN** the draft holds that save point's body and layout at the next revision
- **AND** a new save point holds the body and layout the draft held before

#### Scenario: A stale restore changes nothing

- **WHEN** an actor restores with a revision the draft has passed
- **THEN** the call raises the draft conflict error
- **AND** the draft and its save points stay as they were

#### Scenario: A restore at the bound changes nothing

- **WHEN** a draft holds 50 save points and an actor restores one
- **THEN** the call raises the request-shape error
- **AND** the draft and its save points stay as they were

### Requirement: Save point routes share the draft routes' gate

`src/http/server.ts` SHALL dispatch four routes to `src/http/studio-routes.ts`.

- `GET /drafts/:processId/save-points`
- `POST /drafts/:processId/save-points`
- `POST /drafts/:processId/save-points/:savePointId/restore`
- `DELETE /drafts/:processId/save-points/:savePointId`

Each SHALL take the gate `GET /drafts/:processId` takes for an existing process.
That gate is `ADMIN_ROLE` alone, or an authoring role plus a place on the process's
Developer list.

#### Scenario: An author off the Developer list gets 403

- **WHEN** an actor holding `system:author` calls any save point route for a
  process whose Developer list does not name them
- **THEN** the answer is 403

#### Scenario: An admin passes with no list entry

- **WHEN** an actor holding `system:admin` lists a draft's save points
- **THEN** the answer is 200

### Requirement: Save point routes answer like the draft routes

The list SHALL answer `{ items, limit }`, and each item SHALL name its creating
account where a local one exists. A create SHALL read `{ name, revision }` and answer
201. A restore SHALL read `{ revision, keepName }` and answer 200 with the saved
draft. A delete SHALL answer 204.

No request SHALL carry a body or a layout. A malformed request or the bound SHALL
answer 400. An unknown draft or save point SHALL answer 404. A stale revision SHALL
answer 409.

#### Scenario: Another process's save point reads as absent

- **WHEN** an actor restores or deletes a save point id held by another process
- **THEN** the answer is 404 and neither draft moves

#### Scenario: A stale restore answers 409

- **WHEN** an actor restores with a revision the draft has passed
- **THEN** the answer is 409 with `error.type` equal to `"draft-conflict"`
