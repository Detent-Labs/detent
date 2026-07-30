<!-- antislop: allow-file passive-voice -->
## ADDED Requirements

### Requirement: Post a comment on an instance over HTTP

`POST /instances/:instanceId/comments` SHALL resolve the actor via the
injected `ActorResolver`. It SHALL parse the JSON body against `{ text:
string }`, with `text` non-empty after trim and no longer than
`MAX_COMMENT_LENGTH` (10,000 characters). On success it SHALL call
`postComment(instanceId, actor, text)` and return `201` with the created
comment as the JSON body, with no response envelope. An empty, missing,
or over-length `text` SHALL be rejected as a `RequestShapeError`, mapped
to `400`. This matches `/delegate`'s existing treatment of a missing
`toActorId`.

#### Scenario: A successful post returns 201

- **WHEN** a `POST /instances/:instanceId/comments` request resolves to
  an actor who may read the instance, with valid, non-empty text in the
  body
- **THEN** the response is `201` with the created comment

#### Scenario: Empty text is a request-shape error

- **WHEN** a `POST /instances/:instanceId/comments` request body's
  `text` is empty or whitespace-only after trim
- **THEN** the response is `400` with `error.type` equal to
  `"request-shape"`, and `postComment` is not called

### Requirement: List an instance's comments over HTTP

`GET /instances/:instanceId/comments` SHALL resolve the actor via the
injected `ActorResolver` and accept `limit`/`cursor` query parameters,
the same shape `GET /instances/:instanceId/record` already accepts. It
SHALL call `listComments(instanceId, actor, { limit, cursor })` and
return `200` with the resulting page as the JSON body.

#### Scenario: A successful list returns 200 with a page

- **WHEN** a `GET /instances/:instanceId/comments` request resolves to
  an actor who may read the instance
- **THEN** the response is `200` with a page of that instance's
  comments

### Requirement: An unauthorized actor gets 403 on either comment route

`AuthorizationError` thrown by `postComment` or `listComments` SHALL map
to `403` with `error.type` equal to `"authorization"`, the same mapping
every other instance-visibility check already uses.

#### Scenario: An unrelated actor is refused on both routes

- **WHEN** an actor who may not read the instance calls either
  `POST /instances/:instanceId/comments` or
  `GET /instances/:instanceId/comments`
- **THEN** the response is `403` with `error.type` equal to
  `"authorization"`

### Requirement: Both comment routes answer CORS preflight requests

The HTTP wrapper SHALL handle `OPTIONS /instances/:instanceId/comments`
requests as a CORS preflight, matching the existing claim, release, and
record routes. It SHALL respond `204 No Content` with the standard CORS
headers, without invoking `postComment` or `listComments`.

#### Scenario: Preflighting either comment route

- **WHEN** an `OPTIONS /instances/:instanceId/comments` request is made
- **THEN** the response is `204` with the CORS headers, and neither
  `postComment` nor `listComments` is invoked
