# Area H: Docs against code

State: HEAD `5f41cd8a`, read only. No finding breaks a security rule in the
code. Where spec and code diverge, the code is stricter or equally strict in
each case. The docs are what is wrong.

## Findings

### H-1: `docs/openapi.yaml` describes `GET /instances` incompletely (scope, filter, gate)
- Case:
  - An integrator reads `GET /instances` in the published API document. The
    document gives `scope` with `enum: [mine, started, all]`
    (`docs/openapi.yaml:258`). It states the rule "`scope=all` ... require the
    `system:admin` role" (`:251-252`, 403 at `:336-337`).
  - The code also accepts `scope=visible` (`src/http/routes.ts:443-447`).
    That scope returns the took-part list (`routes.ts:538`). The screen
    `packages/web/src/areas/app/screens/InvolvedScreen.tsx:151` uses that
    list. The code also filters by `kind=published|test`
    (`routes.ts:450-455`, `:517`). The document states neither of the two.
  - A further gap: the code allows `GET /instances?scope=all&processId=proc_x`
    without `system:admin`. It does so when the caller holds a `read` grant
    or a reader-list entry for `proc_x` (`routes.ts:477-482`,
    `src/auth/authorize.ts:126-137`). For that call the document says 403.
- Location: `docs/openapi.yaml:247-259`, `:336-337`;
  `src/http/routes.ts:443-455`, `:472-483`, `:538`
- Severity: low
- Evidence: confirmed (all cited lines read; `grep "visible\|name: kind"` in
  `openapi.yaml` finds no hit for the scope or the parameter)
- Counter-evidence sought: not applicable (low)
- Known: new
- Suggestion: Add `visible` to the enum and `kind` as a parameter. Extend the
  gate line by the process-scoped `read` path. The spec
  `http-api-documentation:120-124` requires the auth statement per route.

### H-2: `docs/openapi.yaml` lets a non-claiming candidate submit, which the code refuses
- Case:
  - Step `review` has an assignment, and nobody has claimed it. Candidate
    `user_a` sends `POST /instances/inst_1/submit`, as the document permits.
    The document says: "the claimant, or an eligible candidate on an
    unclaimed step, may submit" (`docs/openapi.yaml:385`, likewise 403 at
    `:418`).
  - The code throws `NotClaimedError` as soon as `assignment.claimedBy` is
    empty (`src/runtime/instances.ts:275-277`). The result is 403
    `not-claimed` (`src/http/errors.ts:103`). Without an assignment, the
    code admits the starter or a `system:admin` (`instances.ts:278-279`).
    The document lacks that rule.
- Location: `docs/openapi.yaml:385`, `:418`; `src/runtime/instances.ts:273-281`
- Severity: low
- Evidence: confirmed (function `requireSubmitAuthority` read in full; spec
  `assignment-claim-enforcement:12` names "claimant-only enforcement")
- Counter-evidence sought: not applicable (low). The audit checked whether
  `submitAndTransition` claims the step itself first. It does not
  (`instances.ts:312-333`).
- Known: new
- Suggestion: Change the description to "only the claimant; without an
  assignment, the starter or `system:admin`". The route `PUT .../draft`
  already states this correctly at `:442-444`.

### H-3: Further auth statements in `docs/openapi.yaml` lag behind the code
- Case and location, per route:
  - The route `GET /instances/{id}` (`docs/openapi.yaml:349-351`, 403 at
    `:368`) names admin, starter, claimant and candidate. So do the comment
    and attachment routes, which say "same participant-visibility rule"
    (`:630`, `:677`, `:720`, `:781`, `:826`). The code
    (`src/runtime/internal.ts:170-206`) also reads the principal set and
    revocations. The principal set holds former candidates, roles and
    groups. A revoked starter gets 403, and a former candidate gets 200. A
    non-admin reads a test instance only as its starter
    (`internal.ts:185-189`).
  - The routes `POST /processes` (`:106`, 403 at `:135`) and
    `POST .../cancel` (`:883-884`, 403 at `:901`) name only the role. The
    code also admits a stored `publish` or `cancel` grant
    (`src/http/routes.ts:655`, `src/runtime/instances.ts:400`). For cancel,
    the document also omits one rule. The starter may cancel only on a
    `cancellable` step (`instances.ts:401-410`).
  - The tag `observability` says "Unauthenticated Prometheus scrape target"
    (`:52-53`). The route requires `METRICS_TOKEN` (`:1263-1270`,
    `src/http/server.ts:804-807`).
  - The sentence "Every route runs through the Runtime API Layer" (`:22`)
    does not hold for `/livez`, `/readyz`, `/metrics` and `/ui-strings`
    (`server.ts:790-809`, `src/http/admin-routes.ts:846-851`).
  - In SaaS mode any route can return 401 for an unknown tenant. It can
    return 503 when the tenant database is unreachable
    (`server.ts:826-838`). The document names this nowhere.
- Severity: low
- Evidence: confirmed (all lines read)
- Counter-evidence sought: not applicable (low)
- Known: new
- Suggestion: Bring the descriptions up to date. Point to the spec
  requirements there instead of repeating them (the pattern of CQ-2).

### H-4: `docs/authoring-guide.md` promises that a group change reaches a waiting step
- Case:
  - Process `access_request` has step `review` with `org.group-members` and
    `groupId: group_finance` = `[user_a, user_b]`. An instance enters
    `review`, and `assignment.candidates` becomes `[user_a, user_b]`. Then
    an operator removes `user_b` through
    `PATCH /admin/groups/group_finance/members`.
  - The guide says: "this list is NOT frozen at step entry. A membership
    change made after the instance enters the step still reaches it"
    (`docs/authoring-guide.md:1060-1062`).
  - In the code `user_b` stays a candidate. The function `setGroupMembers`
    writes only the row in `groups` (`src/auth/groups.ts:93-96`, route
    `src/http/admin-routes.ts:438`). The claim checks the list stored at
    entry (`src/engine/transition.ts:1079-1080`, `isEligibleCandidate` at
    `:95-97`). So `user_b` can still claim, and can read through the
    principal set.
  - The spec says the opposite of the guide: "Every step that has not yet
    entered sees it on its next entry"
    (`openspec/specs/group-based-assignment/spec.md:24-27`). The test checks
    exactly that (`test/assignment-group-strategy.test.ts:70-83`).
- Location: `docs/authoring-guide.md:1060-1062`
- Severity: medium (docs only, but they present an access removal as
  immediate. Whoever relies on that lets a removed member keep waiting
  tasks.)
- Evidence: confirmed (strategy `src/engine/assignment-strategies.ts:61-81`,
  `getGroupMembers` `groups.ts:117-125`, the claim path, spec and test read)
- Counter-evidence sought:
  - The audit searched for code that resolves waiting assignments again on
    a membership change. The search `grep getGroupMembers` in `src/` hits
    only `assignment-strategies.ts`, `groups.ts`, `fields.ts`, `reports.ts`
    and `store.ts`. No site writes `assignment.candidates` outside step
    entry.
  - The search found none. The code follows the spec. Only the guide is
    wrong.
- Known: new
- Suggestion: Reverse the sentence: "Resolved fresh at every step entry; an
  instance already waiting keeps the list it entered with. Use delegation or
  a re-entry." The guide change lands in the same commit as any later rule
  change (the `CLAUDE.md` rule).

### H-5: `docs/authoring-guide.md` lets "operators and reserved roles" cancel despite `cancellable: false`
- Case:
  - A process has `cancellable: false`. Operator `ops` holds only
    `system:admin` and calls `POST /instances/inst_1/cancel`. The guide says
    "operators and actors with reserved roles remain authorized regardless"
    (`docs/authoring-guide.md:56-57`, likewise `:491-492`).
  - The code admits only `system:cancel-any`, a `cancel` grant, or the
    starter on a cancellable step (`src/runtime/instances.ts:399-411`,
    `:441-471`). The operator `ops` gets 403, regardless of `cancellable`.
    The spec names exactly these two ways
    (`openspec/specs/cancellation/spec.md:142-145`).
- Location: `docs/authoring-guide.md:54-57`, `:488-492`
- Severity: low
- Evidence: confirmed
- Counter-evidence sought: not applicable (low)
- Known: new
- Suggestion: Write "an actor holding `system:cancel-any`, or a `cancel`
  grant over the process" in place of "operators and reserved roles".

### H-6: `docs/authoring-guide.md` puts Save, Discard and Publish in the area nav
- Case:
  - The guide says "Studio's own area nav carries **Save**, **Discard
    draft** and **Publish**" (`docs/authoring-guide.md:900-901`). It also
    says "the area nav's Save, Discard draft and Publish" (`:983-985`).
  - The code renders them in the header bar. The area nav has no draft
    control any more (`packages/web/src/areas/studio/root.tsx:73-76`,
    `panels/ProcessHeaderBar.tsx:394`). The glossary rule says the same
    (`.claude/rules/ui-glossary.md`, section "The process surface").
- Location: `docs/authoring-guide.md:900-901`, `:983-985`
- Severity: low
- Evidence: confirmed
- Counter-evidence sought: not applicable (low)
- Known: new
- Suggestion: Write "header bar" in place of "area nav" at both sites.

### H-7: `ROADMAP.md` stages 40 and 63 and `docs/decisions.md:340-343` report an outdated state
- Case:
  - Stage 40 says "DRAFT SCOPE NOT BUILT" (`ROADMAP.md:47-48`). It also
    says "Today every author reaches every draft" (`:69-70`, likewise
    `:216-218`). The file `docs/decisions.md:342-343` says "every author
    reaches every draft today". Since `process-access-roles` (archived
    2026-09-17), a non-admin sees only the drafts whose developer list names
    that actor. That actor reads or writes only those drafts
    (`src/http/studio-routes.ts:105-109`, `:121-136`, `:138-151`). The
    mechanism is the developer list instead of an `"author"` grant, and the
    described gap is closed all the same.
  - Stage 40 says "`src/auth/authorize.ts` declares eight constants"
    (`ROADMAP.md:135-136`, `:142`, `:194`). The file declares ten,
    `CREATE_ROLE` and `OWNER_ROLE` included (`authorize.ts:30-60`, spec
    `authorization:27`). The file `docs/decisions.md:290-291` speaks of
    "three permissions". There are five (`authorize.ts:84`).
  - Stage 63 stands under "Open stages", but reports "PHASES 0-5 DONE" and
    "closing the migration" (`ROADMAP.md:271-299`). The tree holds only
    `global.css` and `tokens.css` (`git ls-files packages | grep .css$`).
- Location: `ROADMAP.md:47-48`, `:69-70`, `:135-136`, `:142`, `:194`,
  `:216-218`, `:271-299`; `docs/decisions.md:290-291`, `:340-343`
- Severity: low
- Evidence: confirmed
- Counter-evidence sought: not applicable (low)
- Known: new (`decisions.md:285` describes the topic, but not the staleness)
- Suggestion: Shorten stage 40 to "FILTER NOT BUILT" and point to
  `process-access-roles`. Move stage 63 into the done table. Correct the
  numbers.

### H-8: The `README.md` status grid miscounts handlers and roles
- Case:
  - The line "Three action handlers ship" (`README.md:66`) names
    `http.request`, `notification.email` and `process.start`. The host
    registers four, `instance.transition` included (`src/engine/host.ts:52-58`,
    `src/handlers/instance-transition.ts`). The file `CLAUDE.md:273-274`
    counts correctly.
  - The phrase "the eight reserved roles" (`README.md:64`) omits
    `system:create` and `system:owner` (`src/auth/authorize.ts:56-60`, spec
    `authorization:27` "ten reserved role strings").
- Location: `README.md:64`, `:66`
- Severity: low
- Evidence: confirmed
- Counter-evidence sought: not applicable (low)
- Known: new
- Suggestion: State four handlers, `instance.transition` included, and ten
  roles.

### H-9: The `CLAUDE.md` section "Repository layout" omits parts of the tree
- Case:
  - The section (`CLAUDE.md:249-301`) names only `schema/definition.ts`,
    `engine/`, `runtime/`, `http/`, `auth/` and `handlers/` under `src/`.
  - It omits `src/tenancy/` (4 files: `cli.ts`, `connections.ts`,
    `provision.ts`, `store.ts`) and `src/cel/` (`check.ts`, `eval.ts`). It
    omits `src/errors.ts`, `src/log.ts`, `src/pagination.ts` and
    `src/validate.ts`. The section mentions the last one only through the
    exports map. It also omits the other five files in `src/schema/`, and
    `docker/`, `e2e/`, `scripts/`, `docs/` and `openspec/`.
  - The line on `src/auth/` (`:272`) names no grants, groups or process
    access lists (`grants.ts`, `groups.ts`, `process-access.ts`).
  - The section says the file `tsconfig.json` "covers src + test" (`:258`).
    That file also includes `e2e`, `playwright.config.ts` and
    `scripts/e2e.ts` (`tsconfig.json:17`).
- Location: `CLAUDE.md:249-301`
- Severity: low
- Evidence: confirmed (`git ls-files src` against the section)
- Counter-evidence sought: not applicable (low)
- Known: new (the audit brief named `src/tenancy/`)
- Suggestion: Add lines for `src/tenancy/`, `src/cel/`, the four single files
  in `src/` and the top-level directories.

### H-10: The spec `authorization` contradicts itself, and the code follows the newer rule each time
- Case:
  - The scenario "The module exports the permission seam" requires "the
    `Permission` type admits no fifth value"
    (`openspec/specs/authorization/spec.md:285-291`). The requirement above
    it requires "exactly five", with `"visibility"` (`:180-182`). The code
    has five (`src/auth/authorize.ts:84`).
  - The spec says "every `/admin/*` route calls `requireRole` with
    `ADMIN_ROLE`" (`:271`, likewise `:727`). The data-list routes take
    `DATALISTS_ROLE`, or `DEVELOPER_ROLE`/`AUTHOR_ROLE`
    (`src/http/admin-routes.ts:505-508`). The same spec requires that at
    `:1103-1116`.
  - The spec says "`DEVELOPER_ROLE` SHALL admit every studio route" and "No
    route loses a caller" (`:968`, `:978`, scenario `:982-985`). A
    `system:developer` who is not on the developer list gets 403 for
    `GET /drafts/proc_x` (`src/http/studio-routes.ts:105-109`, `:146-151`).
    Lines `:277-283` of the same spec describe that list.
- Location: `openspec/specs/authorization/spec.md:271`, `:285-291`, `:727`,
  `:968-1005`
- Severity: low (in all three cases the code is as strict as the older line,
  or stricter)
- Evidence: confirmed
- Counter-evidence sought: not applicable (low)
- Known: new
- Suggestion: Run one spec sweep, an OpenSpec change against
  `authorization`. Move the scenario to five values. Extend the `/admin/*`
  sentence by the data-list exception. Extend the developer requirement by
  the developer list.

### H-11: `docs/decisions.md` points with stale line anchors into `src/http/server.ts` and `studio-canvas`
- Case:
  - Since the last merge, every anchor in `server.ts` from line 229 on sits
    four lines lower.
  - Finding 11 (`docs/decisions.md:509-515`) needs these moves: `Route`
    `:229→:233`, `seg` `:302→:306`, `match` `:335→:339`, OPTIONS
    `:799→:816`, `Bun.serve` `:884→:901`, `createServer` `:522→:526`, tenant
    resolution `:809-811→:826-828`.
  - The entry TEST-1 (`:771`) says "86 entries (`src/http/server.ts:554`)".
    The table has 90 entries from `:558` on (counted mechanically).
  - The entry ARCH-2 (`:819`) needs `:268→:272`.
  - The entry "palette" (`:518-519`) names `studio-canvas` `648/1772/1781`.
    The word sits at `646/1794/1803` today.
- Location: `docs/decisions.md:509-515`, `:518-519`, `:771`, `:819`
- Severity: low
- Evidence: confirmed (`grep -n` on both files)
- Counter-evidence sought: not applicable (low)
- Known: the file already lists the entries themselves (`decisions.md:507`,
  `:518`, `:769`, `:818`). The anchor drift is new.
- Suggestion: Re-point the anchors. Or switch to symbol names in place of line
  numbers, as "Refused simplifications" does.

### H-12: Code comments with stale facts
- Case:
  - The comment at `src/http/metrics.ts:5` refers to "`health.ts`'s
    handlers". No such file exists (`git ls-files | grep health.ts` = 0).
    The handlers sit in `src/http/server.ts:517-524`.
  - The header of `src/auth/authorize.ts:11-14` says "Seven gated
    operations" and "four fixed permissions". The map has five
    (`:103-109`), and the spec counts ten sites (`authorization:176`).
  - The line `authorize.ts:33` says that `ADMIN_ROLE` gates "every
    `/admin/*` route" (see H-10).
- Location: `src/http/metrics.ts:5`; `src/auth/authorize.ts:11-14`, `:33`
- Severity: low
- Evidence: confirmed
- Counter-evidence sought: not applicable (low)
- Known: the line `authorize.ts:33` falls under `docs/decisions.md:824`
  (CQ-2). The lines `:11-14` and `metrics.ts:5` are new.
- Suggestion: Strip the numbers from the comments and point to the spec (the
  CQ-2 fix).

## Checked without a finding

- OpenAPI against routes, compared mechanically:
  - The code has 93 routes. Those are 90 table entries
    (`src/http/server.ts:558-762`) plus `/livez`, `/readyz` and `/metrics`
    (`:790-809`). The document has 28 operations. All 28 exist with the
    same method and the same path.
  - The 65 undocumented routes all fall under the exclusion list
    (`docs/openapi.yaml:11-20`). The split: admin 33, reporting 13, drafts
    6, processes 6 (2 version reads, 4 access routes), migration-plans 2,
    templates 4, registry 1. No route stands in the code without docs and
    without an exclusion.
  - The value `security: []` stands exactly at login, livez, readyz and
    ui-strings (`:67`, `:1172`, `:1187`, `:1224`). That matches the code
    (`server.ts:559-576`, `:790-795`). The document lists no 404, as
    `http-api-documentation:128-130` requires.
- The `CLAUDE.md` layout, single statements:
  - The exports map (9 entries) matches the `exports` of `package.json`.
  - The handler list (4) matches `host.ts:52-58`.
  - The eleven studio tabs match
    `packages/web/src/areas/studio/routing.ts:14-24`.
  - The admin, app and reporting screens match the files under
    `areas/*/screens`.
  - The ui-strings routes sit in `admin-routes.ts:846-884`.
  - Node 22 and `postgres:latest` match `.devcontainer/Dockerfile:4` and
    `docker-compose.yml:88`.
  - H-9 lists the gaps.
- The file `docs/current-state.md`:
  - Of all its backtick paths, 0 are missing from the tree. Its 113 spec
    references all exist.
  - A path or its directory covers every tracked file under `src/`. Tenancy
    sits at `:138-145`.
  - Only the tool scripts under `scripts/` have no index entry, since they
    form no subsystem.
- The authoring guide against rules and code:
  - Field types, formats and controls (`docs/authoring-guide.md:89-116`)
    match `ALLOWED_BY_TYPE` (`src/schema/definition.ts:447-454`).
  - The path rules (`:668-694`, `:995-1002`) match
    `checkPathTriggerConsistency` (`definition.ts:884-908`).
  - Also checked: the key regex and the CEL limits (2000 nodes, depth 64,
    two macros). Also the time functions, the timer rules and the plugin
    names. Each plugin name is registered in `registry.ts`, `host.ts`,
    `assignment-strategies.ts` or `handlers/`. Also the area roles
    (`packages/web/src/shell/areas.ts:26-31`).
  - Findings H-4 to H-6.
- Rule files:
  - All line anchors in `.claude/rules/process-contract.md` and
    `authoring-invariants.md` point to the named site. The audit
    spot-checked 30 anchors, among them `definition.ts:683`, `:942-945`,
    `check.ts:161` and `definitions.ts:224-240`.
  - The 15 event kinds and the 16 `FIELD_KINDS` match.
- The ROADMAP done table:
  - Every named change exists under `openspec/changes/archive/`. Every named
    spec exists under `openspec/specs/` (script, 0 misses).
  - Stage 43 "STUDIO UI NOT BUILT" holds. The name `validationMode` appears
    in `packages/web/src` only in `draft/changeSet.ts:122` and in the
    catalog.
  - Findings H-7.
- Security SHALLs against code, without a breach:
  - Frontend headers: `frontend-security-headers:107-126` against
    `src/http/static.ts:39-44` and `docker/nginx.conf:23-26`.
  - JWT secret of at least 32 bytes: `server.ts:378`, `:415-419`.
  - Login only with a secret: `server.ts:559-566`.
  - Argon2id: `src/auth/users.ts:67`, `:80`.
  - Reporting gates: `reporting-routes.ts:130-133`, spec
    `authorization:1009-1024`.
  - Every `/admin/*` route except the data lists uses `ADMIN_ROLE` (script
    over `admin-routes.ts`).
  - Tenant 401/503: `server.ts:826-838`, `multi-tenancy:69-71`.
  - Instance read: `src/runtime/internal.ts:170-206` against
    `authorization:833-873`.
  - Record read: `src/runtime/record.ts:47-61` against `:766-790`.
  - Cancel: `instances.ts:399-471` against `cancellation:142-145`.
  - Public `/ui-strings`: `admin-routes.ts:846-851`.
  - Idempotency key as UUIDv5: `src/engine/idempotency.ts:29-31`.
  - The `definitionHash` as JCS over `ProcessBody`:
    `src/schema/hash.ts:14-16`.
- README installation steps against `package.json`:
  - The scripts `typecheck`, `build`, `check`, `e2e` and `serve` exist with
    the described effect.
  - The `DATABASE_URL` matches the compose credentials
    (`docker-compose.yml:29`, `:91-93`).
  - The claim "over 500 `skipIf` sites" holds (1659 counted).
  - The files `scripts/preflight.sh`, `dev-up.sh`, `dev-up.ps1` and
    `enable-hooks.sh` exist, the keepalive at `:43-55`.
  - Four E2E flows exist (`e2e/*.e2e.ts`). The CI job `e2e` exists
    (`.github/workflows/check.yml:122`).
  - Nginx listens on 8080, and both `HEALTHCHECK`s exist
    (`docker/*.Dockerfile`).
  - Findings H-8.

## Repro proposals

Both serve only as confirmation. The evidence already stands in the code the
audit read.

1. H-4 (DB test in the devcontainer): Create group `G` with `[A, B]`. Publish
   a process with step `review`, strategy `org.group-members`, `groupId: G`
   and `allowedGroups: [G]`. Create an instance and run it to `review`. Call
   `setGroupMembers(G, [A])`, then `claimStep(inst, B)`. Expected per the
   guide: 403. Expected per the code: the claim succeeds, with
   `assignment.claimedBy === B`.
2. H-2: Take an instance on a step with an assignment that nobody has
   claimed. As a candidate, send `POST /instances/<id>/submit` with a valid
   `pathId`. Expected: 403 with `error.type = "not-claimed"`.

## Not checked

- Request and response schemas in `docs/openapi.yaml` (`components/schemas`)
  against the actual body shapes. The audit did not compare them
  mechanically. It compared only the auth statements and the route list.
- UI specs (studio-*, end-user-app, admin-app, reporting-app),
  `docs/browser-checks.md` and `docs/runbooks/*`. They sit outside the audit
  brief, which put security and contract specs first.
- Not every security-related spec in full. The audit read `authorization`
  (parts 25-300 and 725-1288), `multi-tenancy` and `http-api-documentation`.
  It read `cancellation` (part), `group-based-assignment` (part),
  `instance-query` (the visible scope) and `frontend-security-headers`
  (grep). It did not read `instance-visibility-set`, `instance-audit-log`,
  `transactional-outbox`, `data-retention` or
  `permission-grant-administration` in full.
- ROADMAP done stages: the audit checked that each change and spec exists. It
  did not check that the code holds the content of every stage.
- An antislop run over this report: the audit brief forbids lint runs.
