<!-- antislop: allow-file passive-voice -->
## ADDED Requirements

### Requirement: Upload an attachment to an instance through the runtime API

`uploadAttachment(instanceId, actor, { filename, contentType, data, sizeBytes }, db?)` SHALL apply the same
visibility rule `postComment` applies (`loadInstanceForActor`). That rule
admits `system:admin`. It also admits the instance's `startedBy`. It also
admits the current step's `claimedBy`. It also admits an eligible
assignment candidate on the current step.

On success it SHALL insert an `instance_attachments` row. That row
carries a fresh `attachment_`-prefixed id, the instance id, the calling
actor's id, `filename`, `contentType`, `sizeBytes`, and `data` unchanged.
It SHALL return the created row's metadata, without `data`.

`data` and `sizeBytes` SHALL be trusted as already decoded and checked by
the caller.

`uploadAttachment` performs no independent decoding and no independent
size check.

An actor failing the visibility rule SHALL receive an
`AuthorizationError`. This is the same error `postComment` raises for an
actor who may not read the instance.

#### Scenario: An eligible candidate uploads an attachment

- **WHEN** an eligible candidate on the instance's current step calls
  `uploadAttachment` with decoded data under the size cap
- **THEN** a row is inserted into `instance_attachments` and the created
  attachment's metadata is returned, without `data`

#### Scenario: An actor with no relation to the instance is refused

- **WHEN** an actor who is not the starter, the claimant, an eligible
  candidate, or `system:admin` calls `uploadAttachment`
- **THEN** it throws `AuthorizationError` and no row is inserted

### Requirement: List an instance's attachments through the runtime API

`listAttachments(instanceId, actor, page, db?)` SHALL apply the same
visibility rule `uploadAttachment` applies. It SHALL return a page of the
instance's attachments ordered `createdAt` ascending, then `id`
ascending. It SHALL reuse the same `limit`/`cursor` keyset-pagination
shape `listComments` already uses. It SHALL NOT include `data` in any
returned item.

#### Scenario: Listing returns attachment metadata only

- **WHEN** an eligible actor calls `listAttachments` on an instance with
  one uploaded attachment
- **THEN** the returned item includes `filename`, `contentType`,
  `sizeBytes`, and `createdAt`. It does not include `data`

#### Scenario: A full page returns a cursor for the next page

- **WHEN** an instance has more attachments than the requested `limit`
- **THEN** the returned page includes a `cursor` that fetches the next
  page

#### Scenario: An actor with no relation to the instance is refused

- **WHEN** an actor who is not the starter, the claimant, an eligible
  candidate, or `system:admin` calls `listAttachments`
- **THEN** it throws `AuthorizationError`

### Requirement: Read one attachment's bytes through the runtime API

`getAttachment(instanceId, attachmentId, actor, db?)` SHALL apply the
same visibility rule `uploadAttachment` applies. On success it SHALL
return the attachment's `filename`, `contentType`, and `data`.

The lookup SHALL match both `attachmentId` and `instanceId`. An
`attachmentId` belonging to a different instance counts as not found,
the same as one that does not exist at all. `getAttachment` SHALL raise
`NotFoundError` in that case, never that other instance's data.

#### Scenario: An eligible actor downloads an attachment

- **WHEN** an eligible candidate on the instance's current step calls
  `getAttachment` for one of that instance's attachments
- **THEN** the attachment's `filename`, `contentType`, and `data` are
  returned

#### Scenario: An actor with no relation to the instance is refused

- **WHEN** an actor who is not the starter, the claimant, an eligible
  candidate, or `system:admin` calls `getAttachment`
- **THEN** it throws `AuthorizationError`

#### Scenario: An attachment belonging to a different instance is not found

- **WHEN** an eligible candidate on instance A calls `getAttachment` with
  instance A's id and an `attachmentId` that belongs to instance B
- **THEN** it throws `NotFoundError`, and no data from instance B's
  attachment is returned

#### Scenario: An unknown attachment id is not found

- **WHEN** an eligible candidate calls `getAttachment` with an
  `attachmentId` that does not exist
- **THEN** it throws `NotFoundError`
