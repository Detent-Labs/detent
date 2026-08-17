## ADDED Requirements

### Requirement: JSON request-body decoding has one implementation

Reading a JSON request body SHALL run through one shared `readJson(req)` in
`src/http/routes.ts`. That helper decodes the body. It raises
`RequestShapeError` (400) when the body is not valid JSON.

`readJson` SHALL have one implementation, which the sibling route modules
import. A module SHALL NOT carry its own copy. A route SHALL NOT restate
the decode as its own `try { await req.json() } catch { … }` block. The same
rule already governs `guarded`, `errorContext`, `resolveActor` and
`parseLimit`.

`routes.ts::parseJsonBody` SHALL call `readJson` for its own decode step. Its
zod parse and its second `RequestShapeError` stay as they are.

`readJson` decodes. It does not check the decoded value's shape. Its return
type asserts an object, and a caller that needs that guarantee SHALL keep its
own runtime check. The `http-wrapper` requirement titled
`Request bodies are parsed, never cast` governs that half. This requirement
does not relax it.

#### Scenario: A body-reading route gets malformed JSON

- **WHEN** a caller sends a body that is not valid JSON to any route that
  reads one
- **THEN** the shared `readJson` throws `RequestShapeError` and the route
  answers 400 with `error.type` equal to `"request-shape"`

#### Scenario: A sibling route module carries no copy

- **WHEN** a developer reads `admin-routes.ts`, `studio-routes.ts` or
  `account-routes.ts`
- **THEN** each imports `readJson` from `routes.ts`
- **AND** none of the three declares that name
- **AND** none of the three carries a `try { await req.json() } catch { … }`
  block of its own

#### Scenario: The schema-parsing helper reuses the decoder

- **WHEN** a route calls `routes.ts::parseJsonBody(req, schema)` with a body
  that is not valid JSON
- **THEN** the `RequestShapeError` comes from the shared `readJson`, and the
  message is the same one every other body-reading route returns

### Requirement: Version-number parsing has one implementation

Reading a definition version out of a request SHALL run through one shared
`parseVersion(raw, label)` in `src/http/routes.ts`. It accepts `unknown`, so
a path segment and a request-body field both reach it. It raises
`RequestShapeError` (400) with the message `<label> must be an integer` when
the value does not parse to an integer.

`parseVersion` SHALL have one implementation, which the sibling route modules
import. A module SHALL NOT carry its own copy under any name.

#### Scenario: A version path segment is not an integer

- **WHEN** a caller sends `abc` as a `:version`, `:fromVersion` or
  `:toVersion` path segment
- **THEN** the shared `parseVersion` throws `RequestShapeError` and the route
  answers 400 with `error.type` equal to `"request-shape"`

#### Scenario: A version body field is not an integer

- **WHEN** a caller sends a non-integer `fromVersion` or `toVersion` in a
  migration request body
- **THEN** the same shared `parseVersion` throws, and the message names the
  field the caller sent
