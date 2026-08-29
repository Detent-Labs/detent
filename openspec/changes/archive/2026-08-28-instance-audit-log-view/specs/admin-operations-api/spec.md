<!-- antislop: allow-file passive-voice -->
<!-- The SHALL/WHEN/THEN Gherkin grammar this repo's specs use is structurally passive; see admin-operations-api/spec.md under openspec/specs/ for the same directive and reason. -->

## ADDED Requirements

### Requirement: An instance's audit log is readable from the admin area

`src/http/admin-routes.ts` SHALL expose `GET
/admin/instances/:id/audit`. It SHALL be gated by `system:admin`, like
every other `/admin/*` route. The handler SHALL call the audit-log read
the `instance-audit-log` capability now exposes. It SHALL support the
same `limit`/`cursor` paging query parameters `GET
/instances/:id/record` already accepts.

On success the response SHALL be status 200, its body an `items`/`cursor`
page of audit entries as `instance-audit-log` defines them.

#### Scenario: An admin reads an instance's audit entries

- **WHEN** `GET /admin/instances/:id/audit` is requested by an actor
  holding `system:admin`, naming an instance whose log holds entries
- **THEN** the response is 200 with those entries in `seq` order

#### Scenario: An actor without the admin role is refused

- **WHEN** `GET /admin/instances/:id/audit` is requested by an actor
  whose roles do not include `system:admin`
- **THEN** the response is 403 and no entries are returned

#### Scenario: Paging follows the same cursor convention as the record read

- **WHEN** a page of entries is requested with a `cursor` from a prior
  response
- **THEN** the next page starts immediately after the entry that cursor
  names, with no gap and no repeat

### Requirement: An instance's chain verification is reachable from the admin area

`src/http/admin-routes.ts` SHALL expose `GET
/admin/instances/:id/audit/verify`, gated by `system:admin`. The handler
SHALL call the existing `verifyInstanceChain`
(`src/engine/admin-queries.ts:259`) and SHALL NOT recompute a digest of
its own. The response body SHALL carry `ok` and `failedSeq` exactly as
`verifyInstanceChain` returns them.

This is a separate route from the entry listing above. Paging through
entries this way never triggers a full-chain verification. Verifying
the chain never requires paging through every entry's value.

#### Scenario: An intact chain verifies through the route

- **WHEN** `GET /admin/instances/:id/audit/verify` is requested for an
  instance whose chain is unaltered
- **THEN** the response is 200 with `ok: true` and `failedSeq: null`

#### Scenario: A tampered chain is reported through the route

- **WHEN** `GET /admin/instances/:id/audit/verify` is requested for an
  instance whose audit log was altered outside the application
- **THEN** the response is 200 with `ok: false` and `failedSeq` naming
  the first failing entry

#### Scenario: An actor without the admin role is refused

- **WHEN** `GET /admin/instances/:id/audit/verify` is requested by an
  actor whose roles do not include `system:admin`
- **THEN** the response is 403 and `verifyInstanceChain` is not called
