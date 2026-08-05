## ADDED Requirements

### Requirement: JSON responses forbid a shared cache

Every JSON envelope this HTTP wrapper returns SHALL carry
`Cache-Control: no-store`. An instance view, an instance record and a comment
list all hold data a participant supplied. No intermediary may keep a copy of
it. This applies to an error envelope as well as to a success envelope.

The attachment download is not a JSON envelope. It carries its own headers, in
the download requirement below.

#### Scenario: A success envelope forbids a cache

- **WHEN** a client sends any request this wrapper answers with a JSON envelope
- **THEN** the response carries `Cache-Control: no-store`

#### Scenario: An error envelope forbids a cache

- **WHEN** a request fails and the wrapper answers with an error envelope
- **THEN** the response carries `Cache-Control: no-store`

## MODIFIED Requirements

### Requirement: Upload an attachment to an instance over HTTP

`POST /instances/:instanceId/attachments` SHALL resolve the actor via the
injected `ActorResolver`. It SHALL parse the JSON body against this
shape:
```
{ filename: string, contentType: string, dataBase64: string }
```
`filename` and `contentType` SHALL be non-empty and no longer than 255
characters each. `contentType` SHALL also match a MIME token pair: one
type and one subtype joined by `/`. Each half holds letters, digits and
the characters `.`, `+`, `-` and `_`. No other character passes. A value
that fails that match SHALL be a `RequestShapeError`, mapped to `400`.

The match rejects a CR or an LF byte. Without it, the download route
carries that byte into a response header. `dataBase64` SHALL be non-empty.
It SHALL decode
`dataBase64` and reject a decoded payload larger than
`MAX_ATTACHMENT_BYTES` as a `RequestShapeError`, mapped to `400`. On
success it SHALL call `uploadAttachment(instanceId,
actor, { filename, contentType, data, sizeBytes })`. It SHALL return
`201` with the created attachment's metadata as the JSON body, without
`data`.

The system SHALL read `MAX_ATTACHMENT_BYTES` once, when the module holding
it loads. It SHALL refuse to start when that value is present and is not a
positive integer. A mistyped limit SHALL NOT resolve to no limit at all.

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

#### Scenario: A contentType outside the MIME token pair is a request-shape error

- **WHEN** a `POST /instances/:instanceId/attachments` request body's
  `contentType` is `"text/html; charset=utf-8\r\nX-Injected: 1"`, or any
  other value outside the token pair
- **THEN** the response is `400` with `error.type` equal to
  `"request-shape"`, and `uploadAttachment` is not called

#### Scenario: A malformed byte limit stops the process

- **WHEN** the deployment sets `MAX_ATTACHMENT_BYTES` to `"5MB"`
- **THEN** the process fails at load with a message naming the variable,
  and no request runs with the limit absent

### Requirement: Download one attachment's bytes over HTTP

`GET /instances/:instanceId/attachments/:attachmentId` SHALL resolve the
actor via the injected `ActorResolver`. On success it SHALL call
`getAttachment(instanceId, attachmentId, actor)`. It SHALL return `200`
with the raw file bytes as the response body, and `content-type` set to
the stored `contentType`. This route does not return a JSON envelope.

The response SHALL also carry `Content-Disposition: attachment`, whose
`filename` parameter holds the stored filename, and
`X-Content-Type-Options: nosniff`. The first header makes the browser save
the bytes instead of rendering them. The second stops the browser from
guessing a type the upload did not declare. An uploaded HTML or SVG file
SHALL NOT run as a document on the engine's origin.

#### Scenario: A successful download returns the raw bytes

- **WHEN** a `GET /instances/:instanceId/attachments/:attachmentId`
  request resolves to an actor who may read the instance
- **THEN** the response is `200`, its `content-type` matches the
  attachment's stored `contentType`, and its body is the raw file bytes

#### Scenario: A download arrives as a file, not as a document

- **WHEN** a `GET /instances/:instanceId/attachments/:attachmentId`
  request resolves to an actor who may read the instance, and the stored
  `contentType` is `text/html`
- **THEN** the response carries `Content-Disposition: attachment` with the
  stored filename and `X-Content-Type-Options: nosniff`
