## MODIFIED Requirements

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

The `filename` parameter SHALL travel percent-encoded. A stored filename
holds up to 255 characters of any kind, a quote and a carriage return among
them. Encoding settles the header-injection question rather than answering
it per character.

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

#### Scenario: A filename with a quote travels percent-encoded

- **WHEN** the stored filename carries a `"` character
- **THEN** the `Content-Disposition` header's `filename` parameter carries
  the percent-encoded form, not the raw character

## ADDED Requirements

### Requirement: `BINARY_ROUTES` declares every route that returns stored bytes

`src/http/server.ts` exports `BINARY_ROUTES`, the declared list of routes
that return stored bytes rather than a JSON envelope. Each entry states its
method, its pattern, and whether it carries a `filename`. A `filename` entry
sends `Content-Disposition: attachment`. `GET /metrics` carries none: it
returns binary bytes with no filename.

The suite SHALL assert every `BINARY_ROUTES` entry's response against its
declared shape. The route table decides binary-ness only at runtime, inside
each handler. A person keeps the ledger by hand instead: nothing derives it.
A route added outside `BINARY_ROUTES` needs that same person to add the
entry, the way `admin-routing.test.ts`'s own route list needs one.

`CLAUDE.md` names an `/admin/*` route collision among the defects that
shipped past a green suite. That is the same drift class. Only a per-route
list, kept in sync by hand, can hold that route-level fact.

#### Scenario: A ledger entry with a filename declares attachment

- **WHEN** the suite drives a `BINARY_ROUTES` entry marked `filename: true`
- **THEN** the response carries `Content-Disposition: attachment`

#### Scenario: A ledger entry with no filename declares nothing

- **WHEN** the suite drives a `BINARY_ROUTES` entry marked `filename: false`
- **THEN** the response carries no `Content-Disposition` header

#### Scenario: A JSON envelope declares nothing

- **WHEN** a route outside `BINARY_ROUTES` returns a JSON envelope
- **THEN** the response carries no `Content-Disposition` header
