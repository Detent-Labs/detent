<!-- antislop: allow-file passive-voice -->
## ADDED Requirements

### Requirement: Upload an attachment to an instance over HTTP

`POST /instances/:instanceId/attachments` SHALL resolve the actor via the
injected `ActorResolver`. It SHALL parse the JSON body against this
shape:
```
{ filename: string, contentType: string, dataBase64: string }
```
`filename` and `contentType` SHALL be non-empty and no longer than 255
characters each. `dataBase64` SHALL be non-empty. It SHALL decode
`dataBase64` and reject a decoded payload larger than
`MAX_ATTACHMENT_BYTES` as a `RequestShapeError`, mapped to `400`. On
success it SHALL call `uploadAttachment(instanceId,
actor, { filename, contentType, data, sizeBytes })`. It SHALL return
`201` with the created attachment's metadata as the JSON body, without
`data`.

#### Scenario: A successful upload returns 201

- **WHEN** a `POST /instances/:instanceId/attachments` request resolves
  to an actor who may read the instance, with a body under
  `MAX_ATTACHMENT_BYTES` once decoded
- **THEN** the response is `201` with the created attachment's metadata,
  and the body does not include `data`

#### Scenario: An oversized upload is a request-shape error

- **WHEN** a `POST /instances/:instanceId/attachments` request body's
  `dataBase64`, once decoded, exceeds `MAX_ATTACHMENT_BYTES`
- **THEN** the response is `400` with `error.type` equal to
  `"request-shape"`, and `uploadAttachment` is not called

#### Scenario: An over-length filename or contentType is a request-shape error

- **WHEN** a `POST /instances/:instanceId/attachments` request body's
  `filename` or `contentType` exceeds 255 characters
- **THEN** the response is `400` with `error.type` equal to
  `"request-shape"`, and `uploadAttachment` is not called

### Requirement: List an instance's attachments over HTTP

`GET /instances/:instanceId/attachments` SHALL resolve the actor via the
injected `ActorResolver` and accept `limit`/`cursor` query parameters,
the same shape `GET /instances/:instanceId/comments` already accepts. It
SHALL call `listAttachments(instanceId, actor, { limit, cursor })` and
return `200` with the resulting page as the JSON body. No item in that
page SHALL include `data`.

#### Scenario: A successful list returns 200 with a page

- **WHEN** a `GET /instances/:instanceId/attachments` request resolves
  to an actor who may read the instance
- **THEN** the response is `200` with a page of that instance's
  attachment metadata

### Requirement: Download one attachment's bytes over HTTP

`GET /instances/:instanceId/attachments/:attachmentId` SHALL resolve the
actor via the injected `ActorResolver`. On success it SHALL call
`getAttachment(instanceId, attachmentId, actor)`. It SHALL return `200`
with the raw file bytes as the response body, and `content-type` set to
the stored `contentType`. This route does not return a JSON envelope.

#### Scenario: A successful download returns the raw bytes

- **WHEN** a `GET /instances/:instanceId/attachments/:attachmentId`
  request resolves to an actor who may read the instance
- **THEN** the response is `200`, its `content-type` matches the
  attachment's stored `contentType`, and its body is the raw file bytes

### Requirement: A missing or mismatched attachment surfaces the same as any other not-found

`NotFoundError` thrown by `getAttachment` SHALL map to `500`, the same
mapping every other not-found condition in this HTTP wrapper already
uses. This applies whether `attachmentId` does not exist, or exists but
belongs to a different instance than the one in the URL.

#### Scenario: A download for a mismatched attachment id returns 500

- **WHEN** a `GET /instances/:instanceId/attachments/:attachmentId`
  request resolves to an actor who may read `:instanceId`, but
  `:attachmentId` belongs to a different instance
- **THEN** the response is `500`, and no other instance's file bytes are
  returned

### Requirement: An unauthorized actor gets 403 on any attachment route

`AuthorizationError` thrown by `uploadAttachment`, `listAttachments`, or
`getAttachment` SHALL map to `403` with `error.type` equal to
`"authorization"`, the same mapping the comment routes already use.

#### Scenario: An unrelated actor is refused on every attachment route

- **WHEN** an actor who may not read the instance calls
  `POST /instances/:instanceId/attachments`,
  `GET /instances/:instanceId/attachments`, or
  `GET /instances/:instanceId/attachments/:attachmentId`
- **THEN** the response is `403` with `error.type` equal to
  `"authorization"`

### Requirement: Every attachment route answers CORS preflight requests

The HTTP wrapper SHALL handle `OPTIONS` requests on
`/instances/:instanceId/attachments` and
`/instances/:instanceId/attachments/:attachmentId` as CORS preflight,
matching the existing comment routes. It SHALL respond `204 No Content`
with the standard CORS headers, without invoking `uploadAttachment`,
`listAttachments`, or `getAttachment`.

#### Scenario: Preflighting an attachment route

- **WHEN** an `OPTIONS` request is made to either attachment route
- **THEN** the response is `204` with the CORS headers, and no runtime
  API function is invoked
