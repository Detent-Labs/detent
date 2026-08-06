## ADDED Requirements

### Requirement: A route that returns stored bytes declares its disposition

`src/http/server.ts` sends `Content-Disposition: attachment` on a result that
carries a filename. Without it a browser renders stored bytes inline, and
stored bytes can hold markup an author never wrote.

Every route that returns stored bytes SHALL send that header. A JSON envelope
SHALL NOT send it.

The suite SHALL assert this over the route table, not over one route. A new
binary route then arrives covered.

`CLAUDE.md` names an `/admin/*` route collision among the defects that shipped
past a green suite. That is the same drift class.

#### Scenario: A binary result declares attachment

- **WHEN** a route returns stored bytes with a filename
- **THEN** the response carries `Content-Disposition: attachment`
- **AND** the filename travels percent-encoded

#### Scenario: A JSON envelope declares nothing

- **WHEN** a route returns a JSON envelope
- **THEN** the response carries no `Content-Disposition` header

#### Scenario: A new binary route arrives covered

- **WHEN** a change adds a route that returns stored bytes
- **THEN** the route-table assertion covers it without a new test case
- **AND** a route that omits the header fails the suite
