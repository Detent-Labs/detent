## MODIFIED Requirements

### Requirement: The data list routes carry their own role

Write routes SHALL need `system:datalists`. Read routes SHALL accept
`system:datalists`, `system:developer` or `system:author`. The two authoring
roles read so the studio can offer the existing keys. An actor holding none of
the three SHALL receive an authorization error.

The data-source panel builds the `"db.list"` picker from that read. An author
refused it cannot bind a field to a data list at all. That binding is the
authoring path `system:author` exists to open.

Neither authoring role SHALL write. The narrow grant stays what it was.

#### Scenario: An actor without a role cannot read
- **WHEN** an actor holding none of the three roles calls `GET
  /admin/data-lists`
- **THEN** the route answers with an authorization error

#### Scenario: A developer reads but does not write
- **WHEN** an actor holding only `system:developer` calls
  `PUT /admin/data-lists/:listKey/values`
- **THEN** the route answers with an authorization error

#### Scenario: An author reads but does not write
- **WHEN** an actor holding only `system:author` calls `GET /admin/data-lists`
- **THEN** the route returns the keys
- **AND** a `PUT /admin/data-lists/:listKey/values` by that actor answers with
  an authorization error

#### Scenario: The data list role writes
- **WHEN** an actor holding `system:datalists` writes a value set
- **THEN** the route accepts it
