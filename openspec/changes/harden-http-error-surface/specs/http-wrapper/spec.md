# Spec Delta

## ADDED Requirements

### Requirement: Every route error leaves through the error mapper

A throw from any route handler SHALL reach `mapError` with the request's
method and path. A handler with no guard of its own SHALL NOT let the throw
reach the runtime. The server SHALL NOT run Bun's development mode, so no
error answers an HTML page.

#### Scenario: An unguarded handler throws

- **WHEN** a route handler raises a database error that no handler code
  catches
- **THEN** the response is `500` with `Content-Type` `application/json`,
  `error.type` equal to `"internal"` and no `error.message`
- **AND** the server logs the error with the request's method and path

#### Scenario: The error response has the CORS headers

- **WHEN** a request from an allowed origin meets such a throw
- **THEN** the `500` response has the same `Access-Control-*` headers that a
  mapped error has

#### Scenario: The server runs outside development mode

- **WHEN** the HTTP server starts
- **THEN** `Bun.serve` runs with `development` set to `false`

### Requirement: Claim, release and delegate refuse an unknown instance id

`POST /instances/:instanceId/claim`, `/release` and `/delegate` SHALL answer
`403` with `error.type` equal to `"authorization"` when `instanceId` names no
instance. The text SHALL name the actor and the instance id and nothing else.
A caller with `system:admin` SHALL get the typed not-found answer, because
that role may read any instance.

#### Scenario: A participant claims an unknown id

- **WHEN** an actor without `system:admin` sends
  `POST /instances/inst_doesnotexist/claim`
- **THEN** the response is `403` with `error.type` equal to
  `"authorization"`
- **AND** the log has no `unhandled error` entry

#### Scenario: Release and delegate answer the same

- **WHEN** one actor sends `POST /instances/inst_doesnotexist/release` and
  `POST /instances/inst_doesnotexist/delegate`
- **THEN** both answer `403` with `error.type` equal to `"authorization"`

#### Scenario: An administrator gets the not-found answer

- **WHEN** an actor with `system:admin` claims an unknown id
- **THEN** the response is the `NotFoundError` answer that this capability
  already defines
- **AND** the request writes nothing

#### Scenario: An unknown id and a forbidden id share a status

- **WHEN** a non-admin actor claims an unknown id
- **AND** the same actor claims an existing instance on a step with no
  assignment
- **THEN** both responses have status `403`

## MODIFIED Requirements

### Requirement: A malformed pagination cursor is a client error

A `cursor` query parameter SHALL pass a check before use. It is base64url of a
JSON array of strings of the arity its route encodes. Each position SHALL
also hold a value of the kind its route encodes. The kinds are a timestamp, a
non-negative integer that fits its column, and plain text. A cursor that fails
these checks SHALL raise `RequestShapeError` (400). That covers a failed
decode, a failed parse, a different shape and a value of the wrong kind.

A cursor is input from the caller. The server interpolates its elements into
Postgres casts. A truncated, URL-mangled or hand-edited cursor therefore
answered `500` on routes that a UI drives on every scroll. The `internal`
type also made a bad cursor look like an engine error.

Validation SHALL check the kind of each value and SHALL NOT check that the
value exists. A cursor whose *values* are stale or point past the end SHALL
remain a legitimate empty page. Keyset pagination has always had that
property.

The encode/decode helper pair SHALL exist once. Every caller SHALL import it,
and no copy SHALL exist in a caller.

#### Scenario: A non-base64 cursor is a 400

- **WHEN** a caller sends `GET /instances?cursor=%%%`
- **THEN** the response is `400` with `error.type` equal to `"request-shape"`

#### Scenario: A well-formed but wrong-shaped cursor is a 400

- **WHEN** a cursor decodes to valid JSON that is not an array of the expected
  number of strings
- **THEN** the response is `400`

#### Scenario: A cursor with a wrong value is a 400

- **WHEN** `GET /instances?cursor=` has the base64url of
  `["gestern","inst_x"]`
- **THEN** the response is `400` with `error.type` equal to `"request-shape"`

#### Scenario: A calendar date that does not exist is a 400

- **WHEN** a timestamp position of a cursor holds `2026-02-30 10:00:00+00`
- **THEN** the response is `400`

#### Scenario: Comments, attachments and the record behave the same

- **WHEN** the comment listing, the attachment listing and the instance record
  each get a cursor with a wrong value
- **THEN** each answers `400`

#### Scenario: A stale cursor is still a valid request

- **WHEN** a cursor is well-formed but points past the end of the result set
- **THEN** the response is `200` with an empty page, unchanged from today

#### Scenario: Both paginated surfaces behave identically

- **WHEN** a malformed cursor reaches the instance listing and an
  admin-queries-backed listing
- **THEN** both answer `400`, because both use the same validated helper
