<!-- antislop: allow-file passive-voice -->
## ADDED Requirements

### Requirement: Post a free-text comment on an instance through the runtime API

`postComment(instanceId, actor, text, db?)` SHALL apply the same
visibility rule `getInstanceView` applies. That rule admits
`system:admin`. It also admits the instance's `startedBy`. It also
admits the current step's `claimedBy`. It also admits an eligible
assignment candidate on the current step.

On success it SHALL insert an `instance_comments` row. That row carries
a fresh `comment_`-prefixed id, the instance id, the calling actor's id,
`text` unchanged, and the current timestamp. It SHALL return the created
row.

`text` SHALL be trusted as already validated non-empty and within bound
by the caller. This is the same division of labour `delegateClaim`
already applies to `toActorId`. `postComment` itself performs no
independent length or emptiness check.

An actor failing the visibility rule SHALL receive an
`AuthorizationError`. This is the same error `getInstanceView` raises
for an actor who may not read the instance.

#### Scenario: An eligible candidate posts a comment

- **WHEN** an actor who is an eligible candidate on the instance's
  current step calls `postComment`
- **THEN** a row is inserted into `instance_comments` and the created
  comment is returned

#### Scenario: An actor with no relation to the instance is refused

- **WHEN** an actor who is not the starter, the claimant, an eligible
  candidate, or `system:admin` calls `postComment`
- **THEN** it throws `AuthorizationError` and no row is inserted

### Requirement: List an instance's comments through the runtime API

`listComments(instanceId, actor, page, db?)` SHALL apply the same
visibility rule `postComment` applies. It SHALL return a page of the
instance's comments ordered `createdAt` ascending, then `id` ascending.
It SHALL reuse the same `limit`/`cursor` keyset-pagination shape
`listInstances` and `getInstanceRecord` already use.

#### Scenario: Listing returns comments oldest first

- **WHEN** an instance has three comments posted in sequence and an
  eligible actor calls `listComments`
- **THEN** they are returned in the order they were posted, not
  reverse-chronological

#### Scenario: A full page returns a cursor for the next page

- **WHEN** an instance has more comments than the requested `limit`
- **THEN** the returned page includes a `cursor` that fetches the next
  page

#### Scenario: An actor with no relation to the instance is refused

- **WHEN** an actor who is not the starter, the claimant, an eligible
  candidate, or `system:admin` calls `listComments`
- **THEN** it throws `AuthorizationError`
