# Detent audit, HEAD 5f41cd8a, 2026-10-10

Read only. The audit changed no file in the working tree, and `git status` is
clean. Before the run, I re-indexed the knowledge graph in full mode. Nine
agents checked the code (A to H, with the studio split into E1 and E2). I
cross-checked every high finding and every reproducible medium finding myself.

The evidence tags have three values. Reproduced means the finding quotes
program output. Confirmed means I read the code and confirmed the finding.
Assumed means a guess, and the line names the missing proof.

## Summary

| Severity | Count |
|---|---|
| critical | 0 |
| high | 7 |
| medium | 43 |
| low | 79 |

I merged two duplicate findings: C-4 = D-2 (CSV) and C-6 = F-6 (date filter).
I downgraded E1-1, E1-3 and E2-1 from high to medium. I downgraded G-4 from
medium to low. Each of these findings states its reason.

**The five main findings**

1. **C-1** The route `POST /instances/:id/cancel` returns the full instance
   with its `data`. An account with only the cancel-any role reads data that
   `GET` refuses it. A starter after a visibility revoke can do the same.
2. **B-2** A timer exit from a subprocess step does not cancel the child. A
   stale return then moves the parent on while a new child already runs. That
   breaks the boundary "synchronous, no fan-out".
3. **B-1** A guardless default path leaves a subprocess step at once on entry,
   before any child exists. The invariants allow this path.
4. **B-3** The handlers `process.start` and `instance.transition` resolve
   assignments with `static` only. All three `org.*` strategies return no
   candidate there.
5. **F-1** A window switch (Alt-Tab) discards unsaved input in the data list
   editor and in the UI strings editor.

## Critical findings

None.

## High findings

### C-1: Cancel returns the full instance without read permission and bypasses a visibility revoke

- **Case:** Two ways lead to the same read.
  - First way: an account with only the cancel-any role (`system:cancel-any`)
    cancels a completed instance it never took part in.
    - The function `cancelInstance` takes the fast path
      (`requireRole(actor, CANCEL_ANY_ROLE)`). It loads the instance through
      `loadInstanceForRead`, with no visibility check.
    - The function `engineCancelInstance` returns a non-running instance
      unchanged. The handler `handleCancel` then answers 200 with `data`,
      `assignment` and `startedBy`. The route `GET /instances/:id` would
      answer 403, since `read` depends on `ADMIN_ROLE`.
  - Second way: the starter whose visibility an admin revoked can still cancel
    through `POST /instances/:id/cancel`. The cancel response carries the full
    instance data that the read route refuses her. The function
    `canActorCancelInstance` returns `true` for the starter of a non-running
    instance.
- **Mechanism:** The write path answers with the full read body. The no-op
  branch for non-running instances turns it into a read with no side effect.
- **Location:** `src/runtime/instances.ts:399-411`, `:441-471`;
  `src/engine/transition.ts:693-700`; `src/http/routes.ts:559-565`;
  `src/auth/authorize.ts:103-109`
- **Severity:** high
- **Evidence:** confirmed (cross-checked). I did not run it over HTTP, since
  that needs writes to the database.
- **Counter-evidence sought:** The functions `mapError`/`toRes` do not filter
  the body (`src/http/errors.ts:114-137`). No test combines a revoke with a
  cancel. The spec `instance-visibility-set/spec.md:430-433` does not count
  cancel as a "direct read".
- **Known:** new. It contradicts the owner ruling "access stays revocable".
- **Suggestion:** Cancel answers with `{instanceId, status, transitionSeq}`. A
  non-running instance throws `InstanceNotRunningError`, as `claimStep` already
  does. That changes the HTTP response and `docs/openapi.yaml`. So it needs an
  OpenSpec change (`runtime-api`, `instance-visibility-set`).

### B-2: A timer exit leaves the subprocess child running, and a stale return meets a new wait-state

- **Case:** One case ends with two active runs.
  - The parent `loan` waits in the subprocess step `check`. The step carries a
    timer `PT1H` whose `targetPath` names the path `escalate`. On entry with
    `transitionSeq` 3, the step spawns the child C3 (`credit_check`). The
    child C3 waits on a manual task.
  - After one hour the timer forces `escalate`, and the parent moves on. The
    child C3 keeps running too, with tasks and actions. So one case has two
    active runs.
  - The escalation may lead back to `check`. The entry with seq 4 then spawns
    the child C4.
  - Someone then completes the task of C3. The return checks only
    `parent.currentStepId === child.parent.stepId`, and both values are
    `check`. So it writes the `outputMapping` of C3 into the parent. It moves
    the parent on by the outcome of C3 while C4 runs.
  - The later return of C4 is a silent no-op.
- **Mechanism:** Only the cancel sweep removes children. Neither the spawn nor
  the return checks the entry into the step or the child id.
- **Location:** `src/engine/subprocess.ts:82-83`, `:195-210`;
  `src/engine/transition.ts:612-641` (the only child cancel), `:883-890`;
  `src/engine/migration.ts:431-446` (the same case with a pending spawn)
- **Severity:** high
- **Evidence:** confirmed (cross-checked: `git grep` finds the child cancel
  only in `sweepCancelledChildren`). I did not run it at runtime.
- **Known:** new. It breaks the hard boundary "Subprocesses are synchronous
  call-and-return only. No fan-out." The spec expects a timer on a subprocess
  step in so many words (`subprocess-execution/spec.md:216-219`).
- **Suggestion:** A commit that leaves a subprocess step cancels its running
  child. The spawn creates a child only while the parent still waits in the
  step. The return checks the expected child id. For that, the parent instance
  carries the id of its active child. That is an OpenSpec change
  (`subprocess-execution`, instance field).

### B-1: A guardless default leaves the subprocess step at once

- **Case:** Every loan ends rejected.
  - In `examples/subprocess-loan-parent.json` an author makes the path
    `rejected` of the step `check` the else branch: no guard, `priority: 2`.
    The file `authoring-invariants.md` allows this in so many words.
  - An instance enters `check`, and the commit enqueues
    `core.spawnSubprocess`. The loop in `resolveAutomatic` goes on, because
    `check` is all-automatic.
  - The function `selectAutomaticPath` evaluates without `child`. The guard
    `child.outcome == "approved"` throws, so it yields `false`. The guardless
    path yields `true`.
  - The instance moves to `rejected` and ends `completed` before a child
    exists. The spawn then sees `status !== "running"` and creates nothing.
    So every loan ends rejected without a check.
- **Location:** `src/engine/transition.ts:827-848`, `:764-770`;
  `src/schema/definition.ts:947-950`; `src/engine/subprocess.ts:82-83`;
  `openspec/specs/subprocess-execution/spec.md:174-176` ("MUST … guard on
  `child.outcome`", enforced nowhere)
- **Severity:** high
- **Evidence:** confirmed (cross-checked). I did not run it at runtime.
- **Known:** new
- **Suggestion:** The function `resolveAutomatic` ends its loop at a step with
  `type === "subprocess"`, and only the return leaves it. A publish rule joins
  it: every path of a subprocess step reads `child`. That changes a rule in
  `.claude/rules/`. So it needs an OpenSpec change (`authoring-invariants`,
  `docs/authoring-guide.md`).

### B-3: `process.start` and `instance.transition` know only the `static` strategy

- **Case:** A started instance gets no assignee.
  - The process `access_request` uses `org.group-members` with
    `group_finance` on its start step. The process `it_onboarding` starts it
    through `process.start`.
  - The handler builds `createDefaultAssignmentRegistry()` from
    `src/engine/registry.ts`. That registry knows only `static`.
  - The function `resolveStepAssignment` does not find the type. It sets
    `candidates: []` with `assignment.unresolved`/`no-candidates`. The started
    instance has no assignee.
  - The same holds for every step that `instance.transition` enters on the
    target instance. It holds for all three `org.*` strategies.
- **Mechanism:** Two functions share one name. The file `server.ts:20` imports
  the full one from `assignment-strategies.ts`. Both handlers import the static
  one.
- **Location:** `src/handlers/process-start.ts:28`, `:48`, `:98`;
  `src/handlers/instance-transition.ts:26`, `:129-131`;
  `src/engine/registry.ts:193-197`, `:265-266`;
  `src/engine/assignment-strategies.ts:127-133`
- **Severity:** high
- **Evidence:** confirmed (imports and the `no-candidates` branch
  cross-checked).
- **Known:** new. No test combines the two handlers with an `org.*` strategy.
- **Suggestion:** The type `HandlerContext` carries the assignment registry
  from `host.ts`. The static factory gets the name
  `createStaticAssignmentRegistry`. That touches no definition contract topic. Per
  `CLAUDE.md` it is still a change, because it touches several files.

### F-1: A focus refetch discards input in the data list editor and the UI strings editor

- **Case:** Unsaved operator input vanishes on a window switch.
  - An operator opens `/admin/data-lists/products` and types three new value
    rows. The operator renames the column `unit_price`. The operator switches
    to a spreadsheet with Alt-Tab and returns.
  - The `focus` event fires `refresh()`. The function `load()` sets `label`,
    `columns` and `rows` to the server state. The input is gone without a
    message.
  - On `/admin/ui-strings`, `load()` calls `setDrafts({})`, and all typed
    translations vanish.
- **Location:** `packages/web/src/areas/admin/useRefresh.ts:12-15`;
  `…/admin/screens/DataListScreen.tsx:218-244`;
  `…/admin/screens/UiStringsScreen.tsx:118-133`
- **Severity:** high
- **Evidence:** confirmed (cross-checked). I did not run it in a browser.
- **Counter-evidence sought:** The Users and Groups screens keep drafts apart
  (`UsersScreen.tsx:217-219`, `GroupsScreen.tsx:160-161`). The spec
  `admin-app/spec.md:816-825` requires the refetch. It does not require the
  overwrite. No test renders the two screens.
- **Known:** new
- **Suggestion:** The refetch fills only `detail` or `overrides`. Only the
  first load or an own save sets the editing state. This UI change needs an
  OpenSpec change (`admin-app`).

### E1-2: The groups link and the account menu leave an unsaved draft without a prompt

- **Case:** An unsaved draft vanishes without a prompt.
  - An author renames a field label in the draft `purchase_requisition`. The
    header bar shows "Unsaved changes". The author picks "Manage assignment
    groups for this process" in the `⋮` menu.
  - That calls `go("/admin/groups?processId=…")`, the shell's unguarded `go`.
    The area switches and `DraftProvider` unmounts. The unsaved work is gone
    without `confirm()`.
  - The same happens through the account menu: on an area switch, on the
    profile, and on logout.
- **Location:** `packages/web/src/areas/studio/root.tsx:85-88` (the guard sits
  only in `guardedNavigate`), `:153-154`, `:169`;
  `…/studio/panels/ProcessHeaderBar.tsx:1005`
- **Severity:** high
- **Evidence:** confirmed (cross-checked). The package `packages/web`
  registers no `beforeunload`.
- **Known:** new. It breaks `studio-app/spec.md:66-95` ("Every control that
  navigates away from an open draft SHALL check the dirty state").
- **Suggestion:** The file `root.tsx` builds a guarded `go`. It passes that
  `go` to `EditScreen` and `Chrome`. A delta spec goes into `studio-app`.

### E2-2: The `instance.query` form writes every comparison value as a string

- **Case:** A number comparison never matches.
  - An author builds an `instance.query` data source with the row
    `where: priority (number) eq 1`. The literal field writes `value: "1"`.
  - At runtime the engine queries `body->'data' @> {"field_prio":"1"}`. The
    instance data holds the number 1, so nothing matches. The participant sees
    an empty select field.
  - With `ne`, every instance matches instead. The same holds for boolean
    values. No check reports the error.
- **Location:**
  `packages/web/src/areas/studio/panels/shared/InstanceQueryForm.tsx:249-254`;
  `src/runtime/queries.ts:318-326`; `src/engine/instance-query-source.ts:21-30`
- **Severity:** high
- **Evidence:** reproduced. I cross-checked the code. Postgres returns
  `'{"field_n":5}'::jsonb @> {"field_n":"5"}` → `false`, and with `5` →
  `true`.
- **Known:** new
- **Suggestion:** The type `TargetRef` gets the field type, and the form parses
  the literal by that type. For `in`, a list field appears. That is an
  OpenSpec change (the studio data sources, and the API that returns the field
  type).

## Medium findings (one line each)

- **A-1** CEL in `process.start.inputMapping` skips the parse, type, time-function, structure and length checks. It runs unbounded in the outbox worker: `src/cel/check.ts:225-295`, `src/engine/definitions.ts:563-582`, `src/engine/seeded-create.ts:49`. Reproduced (`timestamp()` plus three nested `all` → 0 structure and 0 CEL check results). Partly known: FIELDS-17 (`docs/decisions.md:1192`). OpenSpec change.
- **A-2** The idempotent compile branch accepts a hand-written cancel sink of any shape (`outcome: "approved"`). A cancel of the child hands the parent "approved": `src/schema/compile.ts:1248-1252`, `definition.ts:1154-1162`, `transition.ts:296-300`. Confirmed. New. OpenSpec change.
- **A-3** Publish does not compile CEL `matches()` with an author's regex. An invalid pattern parks silently, and a backtracking one blocks the event loop: `src/cel/check.ts:161`, cel-js `lib/functions.js:356-362`. Reproduced (`matches("(")` → `{"ok":true}`; `^(a+)+$`: `n=20` 4 ms, `n=24` 74 ms, `n=26` 287 ms). New. OpenSpec change.
- **A-4** Guards, view flags and `validation.rule` may return a non-bool. The guard `data.status` parks every instance silently: `src/cel/check.ts:256-283`, `src/cel/eval.ts:166`. Reproduced (`checkAgainstFields("data.s")` → ok, `evalGuard` → false). New, and the spec `cel-expressions:381-385` defines it this way. OpenSpec change.
- **B-4** The outbox lease starts at the batch claim, but the deadline runs per row. A second process claims rows again. The tx2 CAS has no claim marker, so it can overwrite a foreign success: `src/engine/outbox.ts:195-204`, `:236-238`, `:250-252`, `:335-352`. Mechanism confirmed, consequences assumed (a repro with two workers is missing). New.
- **B-5** A writeback can make tx2 fail for good. One trigger is a value the database refuses to store in a `jsonb` column. The row then stays `claimed`. The worker redelivers it every 30 s and never moves it to the dead letters: `src/engine/outbox.ts:334`, `:355-362`. Control flow confirmed, trigger assumed. The ARCH-1 fix is incomplete.
- **B-6** The column `resolve_state` stays `pending` after a cascade ends. The resolution claim scans a growing set every 500 ms: `src/engine/transition.ts:396`, `src/engine/resolution.ts:61-71`. Confirmed, scale assumed (EXPLAIN missing). New.
- **B-7** With `DATA_RETENTION_DAYS` set, the retention sweep reads every unredacted instance through `body->>'status'` every 500 ms: `src/engine/retention.ts:97-106`, `store.ts:284-287`. Confirmed, scale assumed. New.
- **B-8** The worker ticks run serially per tenant. One tenant's hanging `http.request` target blocks the outbox of every tenant: `src/engine/host.ts:315-326`. Confirmed. New.
- **C-2** A claim on a test instance hands `data` to a candidate without read permission: `src/runtime/claims.ts:32-36`, `src/http/routes.ts:309-315`. Confirmed. The entry CLAIM-1 (`decisions.md:1548`) does not name the response body.
- **C-3** A visibility revoke has no effect on `GET /instances?scope=started` or on `/record`: `src/runtime/queries.ts:270-300`, `record.ts:57-60`. Confirmed. New. OpenSpec change.
- **C-4 (= D-2)** The CSV export does not neutralize formulas (`=`, `+`, `-`, `@`, tab): `src/runtime/reports.ts:436-438`, `:453-476`. Confirmed. New. OpenSpec change (`reporting-data-tables`).
- **C-5** The report and the CSV end at 50 rows (`DEFAULT_LIST_LIMIT`), and the CSV hides `truncated`: `src/runtime/reports.ts:366`, `:472-476`. Confirmed. New.
- **C-6 (= F-6)** The date filter of the report builder computes in UTC and drops the "To" day: `packages/web/src/areas/reporting/screens/ReportBuilderScreen.tsx:273-288`. Confirmed. New.
- **C-7** The login lockout counts per e-mail across all tenants. A success in tenant A resets the window for tenant B: `src/auth/login.ts:54`, `:145-155`. Confirmed. Partly known: SEC-5 (`decisions.md:624`).
- **C-8** In SaaS mode, a token from an external IdP never finds its tenant. The code uses `iss` as the key, and `KEY_PATTERN` forbids `:` and `/`. Locations: `src/auth/jwt.ts:33-45`, `src/http/server.ts:452-459`, `src/tenancy/provision.ts:17`. Confirmed (fails closed). New. OpenSpec change.
- **C-19** The reporting aggregates load the whole period with its history into memory, the history twice. The span has no bound: `src/engine/reporting.ts:96-122`, `:261`, `:400`; `reporting-routes.ts:100-110`. Confirmed. Partly known: `decisions.md:30`.
- **D-1** The route `POST /auth/login` throws past `mapError`. Without `NODE_ENV`, Bun returns its development error page with the error message embedded: `src/auth/login.ts:117-175`, `src/http/server.ts:840`, `:901`; `docker/engine.Dockerfile`. Reproduced: the login input raises a database encoding error (SQLSTATE 22021). The error page has 67 KB of `text/html`, with the message embedded as base64. With `development:false`, the response has 21 bytes. Related to ERR-3.
- **D-3** The handler `instance.transition` drives a foreign instance as `SYSTEM_ACTOR`. A participant types the id of that instance into a free text field: `src/handlers/instance-transition.ts:62-143`, `src/engine/definitions.ts:401-406`. Confirmed. New. OpenSpec change.
- **E1-1** The list `KNOWN_KEYS` lacks `collaboration`. The JSON surface refuses every apply once an author ticks "Comments": `packages/web/src/areas/studio/draft/load-guard.ts:19`. Reproduced (`checkDraftShape({collaboration})` → "unrecognized top-level field"). I downgraded it from high: the error is visible, and the author loses no data. A workaround exists.
- **E1-3** A 401 on save logs the author out and discards the unsaved draft (token lifetime 8 h): `studio/root.tsx:171`, `panels/DraftToolbar.tsx:102-111`, `shell/App.tsx:80-84`. Confirmed. I downgraded it, because the case needs an expired token.
- **E1-4** Layout changes (positions, groups, path style) do not count as unsaved, and a navigation discards them: `studio/screens/EditScreen.tsx:380`, `draftToolbarState.ts:10-12`. Confirmed. New.
- **E1-5** A nested shape error in the JSON surface (`"steps": {}`) passes the guard and crashes the studio area: `draft/load-guard.ts:53-60`, `EditScreen.tsx:509-523`. Code path confirmed. I did not run it in a browser. New.
- **E2-1** A manual path keeps a guard after a trigger switch, though the step page no longer lists it. At runtime the guard hides the button: `panels/PathsPanel.tsx:288`, `:306`; `src/runtime/fields.ts:292-296`. Confirmed. I downgraded it from high, because the guard stays visible in the Paths tab and in the JSON. New, with a spec contradiction (`studio-app:1257` against `studio-condition-builder:416`).
- **E2-3** A subprocess `inputMapping` offers the parent's fields as keys, and publish then refuses them: `panels/SubprocessSpecEditor.tsx:108-115`. Confirmed. New.
- **E2-4** The subprocess editor shows "pinned" but never writes `versionBinding`. The editor does not prefill the mappings: `panels/SubprocessSpecEditor.tsx:44-90`. Confirmed. New.
- **E2-5** A switch of the step kind leaves `subprocess`, `outcome` and `paths` behind with no control: `draft/performedBy.ts:19-32`. Confirmed. New.
- **E2-6** The control "+ Add row" deletes every `visible` override when the visibility overrides differ: `panels/FieldCatalogPanel.tsx:725-728`, `:997-1001`. Confirmed. New. OpenSpec change.
- **E2-7** A label change renames the field key, and the CEL readers keep the old key: `panels/FieldCatalogPanel.tsx:701-710`, `fieldCatalogLogic.ts:23-35`. Confirmed. The trigger is new, related to FIELDS-17/18.
- **E2-8** In the plugin editor's raw text mode, stale JSON text overwrites the `listKey`. The config of step A lands in step B: `panels/shared/PluginEnvelopeEditor.tsx:212-225`, `StepPage.tsx:550-557`. Confirmed. This consequence is new, related to FIELDS-15.
- **E2-9** The attribute rows in the `instance.query` form lose focus on every keystroke (`key={key}`): `panels/shared/InstanceQueryForm.tsx:141-152`, `:269-277`. Confirmed. New.
- **E2-10** The condition builder does not read back integer and negative literals. The call `celLiteral(1e21)` produces invalid CEL: `panels/shared/conditionLogic.ts:251-255`. Reproduced (`data.prioritaet > 3` → `raw`, `data.amount > -5.0` → `raw`, `celLiteral(1e21,"double")` → `1e+21.0`). New.
- **E2-11** Hidden tabs (Field matrix, Changes) recompute everything on every keystroke: `panels/FieldMatrixGrid.tsx:438-446`, `ChangesView.tsx:124-127`. Mechanism confirmed, size assumed (a profiler measurement is missing). Partly known: FIELDS-14.
- **F-2** The header of the admin area's instance detail shows an expired claim. It also shows a stale `transitionSeq` at 200 record elements and more: `packages/web/src/areas/admin/screens/InstanceScreen.tsx:156-168`. Confirmed. New.
- **F-3** The package form-ui and the engine disagree on cleared fields. A cleared number keeps its value. A date and an option become `type-mismatch`, and a required field with `""` passes: `packages/form-ui/src/FieldForm.tsx:616`, `:682-691`, `submit.ts:17-24`, `src/runtime/fields.ts:416-421`. Confirmed. New.
- **F-4** The reporting area does not end the session on a 401: `packages/web/src/areas/reporting/root.tsx:59`. Confirmed. New, and it breaks `unified-shell:144-146`.
- **F-5** The report builder offers no way to type the comparison `in`, and `eq`/`ne` always send a string: `ReportBuilderScreen.tsx:384-390`. Confirmed. New.
- **F-7** In the admin lists (instances, outbox, migrations), stale responses overwrite newer ones: `packages/web/src/shell/usePagedList.ts:46-58`. Mechanism confirmed, timing assumed. New.
- **G-1** The CI lockfile gate checks a lockfile that `bun install` rewrote before the check: `.github/workflows/check.yml:82-85`, `:110-111`. Evidence: `gh pr view 19` shows only `packages/web/package.json` as changed, with `check` SUCCESS. New.
- **G-2** The gates `whitespace.sh` and `prose.sh` report "nothing to check" with rc=0 when `git diff` fails on the range: `scripts/gates/whitespace.sh:35`, `prose.sh:74-81`, `range.sh:47-48`. Reproduced (`deadbeef…..HEAD` → both rc=0, `git diff --check` rc=128). New.
- **G-3** Since the split, the index guard in `migration.test.ts` checks an empty barrel `runtime/api.ts`: `test/migration.test.ts:1540-1556`. Confirmed. New.
- **G-5** Credentials for `http.request` sit in plain text in the immutable definition and in every outbox row: `src/handlers/http.ts:43-48`, `src/engine/transition.ts:421-422`. Confirmed. New. OpenSpec change.
- **H-4** The guide `docs/authoring-guide.md:1060-1062` promises that a group change reaches a waiting step. The code freezes the candidates at entry. Confirmed. New.

## Low findings (one line each)

**Definition contract (A)**

- **A-5** Publish checks view flags on a subprocess step against `child`, but the runtime evaluates them without `child`: `src/cel/check.ts:273-276`, `src/runtime/fields.ts:229`.
- **A-6** Seven invariants have no rejecting test (`src/schema/definition.ts`, list in `reports/A.md`). Four of them are a terminal step without paths, the timer `targetPath`, `duration` XOR `deadline`, and `pinnedVersion`/`contractRef`. The other three are the outcome binding, length bounds, and `unmappableStep`/duplicate step ids/sink `key`.
- **A-7** The file `canonical-json.ts` describes the number handling wrongly. The code has reached its `ponytail:` ceiling, but without consequence: `src/schema/canonical-json.ts:2-5`, `:14-15`.
- **A-8** Publish stores `Action.execution` and `idempotencyKey`, but nothing reads them: `definition.ts:623`, `:625`, `transition.ts:261`.
- **A-9** Comment drift in `definition.ts:163-165`, `:181-183` and `check.ts:52-53`. The entry `docs/decisions.md:799` describes finished work.

**Engine (B)**

- **B-9** The timer, spawn, return and sweep routines do not check the pin hash: `src/engine/timers.ts:72-82`, `subprocess.ts:78`.
- **B-10** The comment misses that the assignment also resolves on submit, under the row lock: `registry.ts:155-156`, `transition.ts:438-449`.
- **B-11** The admin outbox list has no index for its `ORDER BY created_at DESC, idempotency_key DESC`: `admin-queries.ts:97-110`.
- **B-12** The exponential backoff has no cap, and `maxAttempts` has no bound: `definition.ts:615-619`, `outbox.ts:35-46`.
- **B-13** The duration `P1D` means exactly 24 h, so the clock time shifts across a DST change. The guide says nothing about it: `duration.ts:36-38`, `docs/authoring-guide.md:790-791`.
- **B-14** Some exports have no importer. The duplicate name `createDefaultAssignmentRegistry` is the root of B-3: `assignment-strategies.ts:76`, `:107`, `registry.ts:180`, `host.ts:106`, `instance-drafts.ts:15`.
- **B-15** The function `initSchema` carries backward retrofits, and the reporting queries the history twice: `store.ts:184-190`, `:330-332`, `reporting.ts:261`, `:400`.
- **B-16** The call `tx.unsafe` inserts an unescaped role name (`GRANT … TO "${engineRole}"`). No outside input controls it: `store.ts:964-967`.

**Runtime and tenants (C)**

- **C-9** The connection pools per tenant open several times at start and never close: `src/tenancy/connections.ts:75-91`, `:111` (orphaned connections: assumed).
- **C-10** A cursor with a wrong value leads to 500, because the fix for ERR-8 checks only the shape: `src/pagination.ts:11-30`.
- **C-11** A saved report with an invalid date returns 500 on every run: `src/http/reporting-routes.ts:54-59`.
- **C-12** The definition cache holds every draft snapshot until a restart: `src/engine/definitions.ts:817-843`.
- **C-13** An editor can displace the owner of a report, and the spec requires the opposite: `src/runtime/reports.ts:159-182`.
- **C-14** Two tenants can receive the same database, because `database_url` is not UNIQUE: `src/tenancy/provision.ts:80-98`, `store.ts:57-63`.
- **C-15** The admin connection for provisioning loses URL parameters such as `sslmode`: `src/tenancy/provision.ts:64`.
- **C-16** A visibility revoke does not check the target account, so a typo yields 204: `src/runtime/visibility.ts:35-45`.
- **C-17** A claim on an unknown instance returns 500 instead of 404: `src/engine/transition.ts:991-995`.
- **C-18** Some exports in `src/tenancy/` have no importer: `store.ts:31`, `connections.ts:42`, `provision.ts:33`.

**HTTP, auth, handlers (D)**

- **D-4** The code has reached the `ponytail:` ceiling in `notification.email`. Group candidates have no bound, and a relay limit makes the mail fail for everyone: `src/handlers/notification-email.ts:352-366`.
- **D-5** The Developer access list has no effect on `POST /drafts/:pid/publish` and `POST /processes`. The spec contradicts itself, so the owner must decide: `src/http/studio-routes.ts:299-336`.
- **D-6** The code never validates an account's e-mail as an address, so CRLF reaches `RCPT TO` and `To:`. Only an admin writes the e-mail: `admin-routes.ts:209-232`, `notification-email.ts:241`, `:317`.
- **D-7** Write routes reveal the existence and status of an instance id (500 against 403): `src/runtime/visibility.ts:30-44`, `instances.ts:274`, `:324`.
- **D-8** The JWT check has no algorithm list, and it does not need `exp` from external issuers: `src/auth/jwt.ts:115`, `:133`.
- **D-9** Doc and spec drift: the head of `cli.ts`, the count in `authorize.ts:11-14`, "no fifth value" in `authorization`, and the ids in `process-access-roles`.
- **D-10** The exports `InstanceTransitionConfig` and `referencingPublishedProcesses` are dead: `instance-transition.ts:39`, `groups.ts:182`.

**Studio (E1, E2)**

- **E1-6** The canvas re-parses every guard on each `pointermove`, a remnant of PERF-3: `canvas/CanvasView.tsx:1461-1612`.
- **E1-7** Every keystroke in the `processId` of a `process.start` action fires `GET /processes`. A fetch that fails stays "done" for good: `draft/chainingFetch.ts:76-96`.
- **E1-8** In the player and in Tools, late responses overwrite a newer selection: `screens/PlayerScreen.tsx:171-193`, `ToolsScreen.tsx:137-180`.
- **E1-9** The migration plan drops a duplicate source mapping without a message: `screens/migrationPlanLogic.ts:183-202`.
- **E1-10** The control "Create" on the Templates screen overwrites an existing template with the same key without a prompt: `screens/TemplatesScreen.tsx:125-141`.
- **E1-11** A broken `%` escape in the address makes `decodeURIComponent` throw and crashes the area: `studio/routing.ts:85-130`, also `admin/routing.ts`, `app/routing.ts` (assumed, and untested in a browser).
- **E1-12** The functions `stepIssueCount` and `issueCountForEntityType` have no production caller, and a test comment is wrong: `draft/panel-rail.ts:80-85`, `:143-148`.
- **E1-13** The tests of `sectionsFor` and `checkDraftShape` stay green when a schema field is missing: `packages/web/test/studio-sectionsFor.test.ts:9-21`, `studio-load-guard.test.ts:31-44`.
- **E2-12** The mapping editor silently overwrites another row and discards a cleared row: `panels/shared/FieldExpressionMapEditor.tsx:28-64`.
- **E2-13** A cleared deadline expression leaves the timer in a state without an input field: `panels/TimersPanel.tsx:91-98`, `:180-200`.
- **E2-14** The boolean value field shows "No", though the row is empty: `panels/shared/ConditionBuilder.tsx:92-103`.
- **E2-15** A removed data source leaves field references dangling: `panels/EntityTabs.tsx:692-698`.
- **E2-16** A failed catalog fetch marks every reference as stale: `panels/shared/useTargetProcessCatalog.ts:61-64`.
- **E2-17** The control "Add path" always creates a manual path: `panels/PathsPanel.tsx:220-224`.
- **E2-18** The contract editor saves an outcome without trimming it: `panels/ContractPanel.tsx:23-31`.
- **E2-19** Visible text sits as a literal in the code instead of in the catalog (list in `reports/E2.md`). Known class: STEP-4 (`decisions.md:1565`).
- **E2-20** The function `flattenFields` is a dead export and duplicates `flattenDraftFields`: `panels/shared/useTargetProcessCatalog.ts:39-41`.

**Other web and form-ui (F)**

- **F-8** With no available paths, the form stays editable, for example on a completed case: `packages/form-ui/src/PathButtons.tsx:27-28`, `TaskScreen.tsx:454-473`.
- **F-9** The timer scan reaches its `ponytail:` ceiling at 201 timers. The header then shows "No timer armed": `admin/screens/InstanceScreen.tsx:150-154`.
- **F-10** In the outbox, "Discard" discards without a prompt, while "Retry" asks: `admin/screens/OutboxScreen.tsx:172-195`.
- **F-11** A failed column selection appears as an empty selection: `ReportBuilderScreen.tsx:165-171`.
- **F-12** The shell does not reconcile the session between tabs. A second tab can restore a session after a logout: `shell/App.tsx:80-121`, `session.ts:64-70`.
- **F-13** Before its first screen, the app waits for `/ui-strings` without a time limit: `main.tsx:16-27`, `i18n/overrides.ts:43-54`.
- **F-14** The tab announcement expands `$` patterns in the label. This is the form-ui site of FIELDS-19: `packages/form-ui/src/tabs.ts:175-182`.
- **F-15** Dead exports and parameters (`reporting/api/client.ts`, `fieldLabel`, `PathButtons.style` and others): list in `reports/F.md`.
- **F-16** The package form-ui declares React `^18` as a peer, while the consumer uses React 19: `packages/form-ui/package.json`.
- **F-17** The migrations screen has neither a refresh button nor a focus refetch, and the spec requires both: `admin/screens/MigrationsScreen.tsx`.
- **F-18** The Users and Groups screens load the whole directory on every focus: `UsersScreen.tsx:257-283`, `GroupsScreen.tsx:198-236`.

**Tests, infrastructure (G)**

- **G-4** The hash guard covers 3 of 9 examples. Today `it-offboarding.json` and `it-onboarding.json` carry a stale `definitionHash` (reproduced). I downgraded it, because `scripts/seed.ts:119` computes the hash itself.
- **G-6** Dependabot runs as `npm` and never updates `bun.lock`: `.github/dependabot.yml:3-11`.
- **G-7** The gate `silent-green.sh` misses `test.todo`, a changed output format and a shrinking test count: `scripts/gates/silent-green.sh:55-66`.
- **G-8** The gate `machine-paths.sh` does not detect the Git Bash form of a home path, macOS paths or JSON-escaped paths: `scripts/gates/machine-paths.sh:28`.
- **G-9** The round-trip test for `strip-compiled` names 6 of 9 examples. All 9 pass today (reproduced): `test/strip-compiled.test.ts:13-20`.
- **G-10** Three tests assert only what the response is not, or nothing at all: `test/http-body-size.test.ts:28-40`, `migration.test.ts:239-246`, `openapi-exclusions.test.ts:19-22`.
- **G-11** The workflow sets no `permissions`, and the token sits in the bind-mounted `.git`: `.github/workflows/check.yml:20-27`.
- **G-12** The test preload creates the login role `detent_audit_probe` with a fixed password, cluster-wide: `test/preload-db.ts:47-67`.
- **G-13** The script `dev-webhook-sink.ts` names a health check that does not exist: `scripts/dev-webhook-sink.ts:6-7`.

**Docs against code (H)**

- **H-1** In `docs/openapi.yaml`, the route `GET /instances` lacks `scope=visible`, `kind` and the process-scoped `read`: `:247-259`, `:336-337`.
- **H-2** The file `docs/openapi.yaml` allows a submit by a candidate without a claim, but the code refuses it: `:385`, `:418`.
- **H-3** Further auth statements in openapi are stale (visibility, grants, `/metrics` as "Unauthenticated", SaaS 401/503): `:52-53`, `:349-368` and others.
- **H-5** The guide says that "operators and reserved roles" may cancel despite `cancellable: false`. That is false: `docs/authoring-guide.md:54-57`, `:488-492`.
- **H-6** The guide places Save, Discard and Publish in the area nav: `docs/authoring-guide.md:900-901`, `:983-985`.
- **H-7** ROADMAP stages 40 and 63 and `decisions.md:290-291`, `:340-343` report a stale status: `ROADMAP.md:47-48`, `:135-136`, `:271-299`.
- **H-8** The README counts three handlers instead of four, and eight roles instead of ten: `README.md:64`, `:66`.
- **H-9** The section "Repository layout" in `CLAUDE.md` lacks `src/tenancy/`, `src/cel/`, `errors.ts`, `log.ts`, `pagination.ts`, `docker/`, `e2e/` and `scripts/`.
- **H-10** The spec `authorization` contradicts itself (five permissions against "no fifth", `/admin/*`, DEVELOPER): `spec.md:271`, `:285-291`, `:968-1005`.
- **H-11** The line anchors in `docs/decisions.md` have drifted. The entry TEST-1 names 86 routes, but 90 exist: `:509-515`, `:771`, `:819`.
- **H-12** Code comments state stale facts (`health.ts` does not exist): `src/http/metrics.ts:5`, `src/auth/authorize.ts:11-14`.

**Coordinator (K)**

- **K-1** The studio chunk `root-vhG1_LB5.js` has 524.01 kB (gzip 148.70 kB), above Vite's warning threshold of 500 kB. The studio loads it lazily per area, so it reaches authors only. I matched the chunk by a `grep` for `headerBar.manageGroups`.

## Known items with a changed status

- Fixed and confirmed: CQ-3 (dirty gate after the conflict reload), TEST-2
  (real concurrency) and TEST-3 (`http.test.ts:2385-2395`). The same holds for
  ERR-3 (within `mapError`), the old ARCH-2, and PERF-1/PERF-2 (indexes).
- Fixed only in part: ERR-8 (C-10), ARCH-1 from 2026-07-29 (B-5), PERF-3
  (E1-6), ERR-3 outside `mapError` (D-1).
- Still open as documented: TEST-1, DEP-1, SEC-2, SEC-3, SEC-5, SEC-6, SEC-9,
  CLAIM-1, `initSchema` without a lock.
- Stale in `docs/decisions.md`: `:799` (done), plus the line anchors (H-11).

## Checks (devcontainer `workflow-engine-app-1`, bun 1.3.11, no server running)

| Command | Result | Quoted line |
|---|---|---|
| `bun run typecheck` | Exit 0 | `form-ui typecheck: Exited with code 0` / `web typecheck: Exited with code 0` |
| `bun run lint` | Exit 0 | `Found 0 warnings and 0 errors.` (584 files, 96 rules) |
| `bun run build` | Exit 0, one warning | `✓ built in 45.80s`; `Some chunks are larger than 500 kB` (K-1) |
| `sh scripts/test-gated.sh bun test` | Exit 0, gate passed | `4999 pass / 1 skip / 0 fail`, `Ran 5000 tests across 259 files. [82.09s]`, DB `workflow_engine_test` |
| `bun run test:tz` | Exit 0 | `20 pass / 0 fail`, `Ran 20 tests across 1 file.` |
| `bun audit` | Exit 0 | `No vulnerabilities found` |

**Skip count:** 1. That equals the floor in `scripts/gates/skip-floor.txt`. The
floor holds the value 1, from its sole commit `1634128e`, with a reason. The
skip is `packages/web/test/reporting-reportingLogic.test.ts:84`
(`skipIf(!ZURICH)`), and `test:tz` runs this test.

**Own cross-check:** The headless boundary holds. A `git grep` finds no import
from React or from `packages/` in `src/`. No file in `packages/` reaches into
`src/` past the exports map.

## Not checked

- **Browser:** The checks from `docs/browser-checks.md` stay manual, since no
  stack ran. Code reading alone backs all UI findings (E1-2, E1-4, E1-5, E2-1,
  E2-6, E2-8, E2-9, F-1, F-7, E1-11 and others).
- **`e2e/`:** I did not run it. The flows need a running stack.
- **Runtime repros with write access:** Some repros would have needed to
  write data into the database. They are C-1, C-3, B-1 to B-5, D-3 and H-4.
  Code reading backs them, and I did not run them.
- **Volumes and run times:** no EXPLAIN, no profiler. So the scale of B-6,
  B-7, B-11, C-19, E1-6 and E2-11 stays an assumption.
- **Dead exports:** The LSP tool does not start
  (`TypeScript 7.0.2 … provides no tsserver.js`). I used `git grep -w` and the
  knowledge graph instead. These two do not rule out re-exports and dynamic
  access.
- **Read only in part:** `FormEditorScreen.tsx` (parts), `canvas/geometry.ts`,
  `arrange.ts`, `layout.ts`, several `draft/view-*.ts`, and some reporting
  screens. The same holds for `docker/nginx.conf` and the schemas under
  `components/schemas` in `docs/openapi.yaml`. I also did not read the specs
  `instance-visibility-set`, `instance-audit-log`, `transactional-outbox` and
  `data-retention` in full. Each agent report lists the details in its own
  "Not checked" section.

## Sources

All paths are relative to this directory. The German originals are not part of
the record.

- Agent reports: `reports/A.md` to `reports/H.md`, `reports/E1.md` and
  `reports/E2.md`. Each finding appears there under the same number, with the
  case narrative, mechanism, counter-evidence and repro proposal. That text is
  the template for the tasks of a plan.
- Coordinator cross-checks: `verify-ledger.md`. It holds the quoted repro
  output and the reason for each regrading.
- The record does not include the raw check logs. The table above quotes the
  lines that matter.
