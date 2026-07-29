# Ponytail Audit

Repo-wide over-engineering scan (not a diff review). Findings ranked biggest
cut first. Read-only report — nothing here has been applied. Regenerate with
`/ponytail-audit`; this file is a snapshot, re-run before trusting it after
further changes land.

Last scanned: 2026-07-29. Re-verified every 2026-07-28 finding (none has been
applied — they are all still open) and scanned the three Process Studio
changes that landed since: `studio-canvas`, `studio-lifecycle`, and
`studio-json-view`. Two findings got measurably worse in that window (1 and
12); the genuinely new code is lean, one nit aside (finding 18). The
pre-existing engine/schema/cel/editor/form-ui code was left unscanned this
round (already covered three times over; see "Checked, not flagged" further
down).

## Findings

1. `delete` `packages/studio/src/{draft,panels,registry,i18n}` (2578 lines,
   30 files) duplicate `packages/editor/src/{draft,panels,registry,i18n}` —
   verified with `diff`, not eyeballed. Only four files genuinely diverge
   (`draft/io.ts` 76 diff lines, studio correctly dropping the
   File-System-Access-only path; `i18n/catalog.ts` 42; `panels/
   StepsPanel.tsx` 17, the canvas's controlled-`expanded` prop; `draft/
   ids.ts` 8) — every other file is byte-identical. **Grew since the
   2026-07-28 scan**: `studio-json-view` added `draft/load-guard.ts` as a
   fifth byte-identical copy (verbatim port, by the change's own design) and
   `studio-canvas` was the only change to make a studio panel diverge at
   all. Extract into a shared workspace package the same way
   `packages/form-ui` is already shared between `editor` and `app`; delete
   the studio copies and import. Note the interaction with the roadmap:
   `studio-tools-and-player` deletes `packages/editor` outright, which
   resolves this by subtraction — so the cheap move is to sequence that
   change rather than build the shared package first.
   [packages/studio/src/draft/store.tsx:1-119, packages/studio/src/draft/load-guard.ts:1-62, packages/studio/src/panels/StepsPanel.tsx:1-236]
2. `delete` `EditScreen.tsx`'s `ProcessHeader` (32 lines) duplicates editor
   `App.tsx`'s `ProcessHeader` (21 lines) minus the `description` field —
   folds into finding 1's shared package. [packages/studio/src/screens/EditScreen.tsx:27-58]
3. `delete` `packages/studio/src/i18n/catalog.ts` — 114 of 129 lines are
   verbatim copies of editor's catalog (same panels, same keys); only
   `app.title`/`draftToolbar.*` differ from editor's `fileToolbar.*`/
   `graph.*`. Share the catalog, override the differing keys per app.
   [packages/studio/src/i18n/catalog.ts:1-129]
4. `dedup` Four near-identical fetch-wrapper API clients — `request()` +
   `parseErrorBody()` + a `*ClientError` class — in `app`, `admin`,
   `studio`, and editor's `player/client.ts`: same `API_BASE` fallback,
   same try/catch-as-network-error, same status-throw. One shared
   `createApiClient(errorMapper)` factory, each package supplying only its
   error-type union. [packages/app/src/api/client.ts:8-62, packages/admin/src/api/client.ts:19-63, packages/studio/src/api/client.ts, packages/editor/src/player/client.ts:4-35]
5. `dedup` Three identical session stores (`StorageLike`, `browserStorage`,
   `loadSession`/`persistSession`/`clearSession`) in `app`, `admin`,
   `studio` — differ only by storage key and admin's extra `roles` field.
   Shared `createSessionStore<T>(key)` factory. [packages/app/src/session.ts:1-37, packages/admin/src/session.ts:1-38, packages/studio/src/session.ts:1-37]
6. `dedup` Three identical `useRoute()` History-API hooks in `app`,
   `admin`, `studio` — same `useState`/`popstate` body, differing only in
   the `Route` union and its match/path functions (`admin/routing.ts`'s own
   comment admits it was "adapted from packages/app/src/routing.ts").
   Shared `useHistoryRoute<R>(matchRoute, routePath)`. [packages/app/src/routing.ts:30-46, packages/admin/src/routing.ts:36-52, packages/studio/src/routing.ts:25-41]
7. `delete` `resolveActor`/`guarded` reimplemented byte-for-byte in both
   `src/http/admin-routes.ts` and `src/http/studio-routes.ts` instead of
   imported from `routes.ts` — both files' own docstrings admit the
   duplication ("Same shape as routes.ts::guarded"). Export both from
   `routes.ts` and import. [src/http/admin-routes.ts:16-28, src/http/studio-routes.ts:17-29]
8. `delete` `parseLimit` reimplemented identically in `admin-routes.ts`
   instead of imported from `routes.ts` (comment: "Same rule as
   routes.ts::parseLimit"). [src/http/admin-routes.ts:30-37]
9. `delete` `encodeCursor`/`decodeCursor` reimplemented identically in the
   new `src/engine/admin-queries.ts` — exact duplicate of the private
   functions already in `runtime/api.ts`. Export once, import both.
   [src/engine/admin-queries.ts:44-49]
10. `delete` Test bootstrap (`DB`, `reg`, `fetch`, `beforeAll`/`beforeEach`
    truncate, `authedReq`) copy-pasted into `http-admin.test.ts` and
    `http-studio.test.ts` from `http.test.ts`'s pattern; studio's
    `authedReq` variant (optional `body` param) already subsumes the
    other two. Shared `test/helpers/http-fixture.ts`.
    [test/http-admin.test.ts:14-30, test/http-studio.test.ts:14-38]
11. `yagni` Admin's 6-variant `ClientError` union + `parseErrorBody`'s
    type-switch — all 12 `catch` sites across admin's five screens check
    only `err instanceof AdminClientError && err.status === 401`; none
    reads `.error.type`/`.message`. Collapse to a single `message: string`
    derived as `parsed?.error?.message ?? \`HTTP ${res.status}\``.
    [packages/admin/src/api/client.ts:26]
12. `shrink` `src/http/server.ts`'s hand-rolled route matcher grew 6 new
    `OPTIONS`-preflight `if` blocks + 8 new dispatch `if` blocks for the
    admin/studio routes on top of the original five (previously judged
    "appropriately minimal at this route count" in the 2026-07-24 scan —
    that verdict no longer holds). **Worse since 2026-07-28**:
    `studio-lifecycle` added four more routes (publish, version body,
    migration-plan GET/PUT, orphan-keys), putting the file at 393 lines and
    52 method-dispatch branches across 23 routes. A small iterated route
    table (`{method, match, methods, handler}[]`) now pays for itself
    several times over. [src/http/server.ts]
13. `delete` `packages/app`'s `Actor.roles` and `InstanceView.status`/
    `.processId`/`.version`/`ProcessSummary.version` are typed but never
    read anywhere in the package. [packages/app/src/api/types.ts:6-9,38-46,48-54]
14. `stdlib` `waitingLabel` hand-computes minute/hour/day relative-time
    buckets with `Math.floor` division chains; `Intl.RelativeTimeFormat`
    already covers this. [packages/app/src/screens/inboxLogic.ts:81-89]
15. `native` `LoginScreen`'s submit button gates on
    `disabled={loading || !email || !password}`, duplicating what
    `required` on the email/password `<input>`s already gives free; keep
    only `disabled={loading}`. [packages/app/src/screens/LoginScreen.tsx:48,52,54]
16. `shrink` `t()`'s fallback chain `catalog[locale][key] ?? catalog.en[key]
    ?? key` is unreachable — `de` is typed `Record<keyof typeof en,
    string>`, so every key exists in every locale by construction.
    [packages/app/src/i18n/catalog.ts:94-96]
17. `shrink` `App.tsx` repeats the `typeof localStorage === "undefined" ?
    undefined : localStorage` guard inline twice instead of reusing
    `session.ts`'s `browserStorage()` default-parameter pattern.
    [packages/app/src/App.tsx:14,24]
18. `shrink` `selectVersion(selection, which, version)` is a one-line
    `{...selection, [which]: version}` spread with its own exported type and
    unit test, called from one place. Inline it at the call site and keep
    `canDiff`/`diffJson` (both carry real logic).
    [packages/studio/src/screens/versionDiffLogic.ts:11-13]

net: -3100 lines, -0 deps possible.

Not applied — this is a report only. Route each finding through its own
OpenSpec change before landing, per this repo's prior ponytail-audit
resolutions.

## Resolved from the 2026-07-27 scan

Each landed via its own OpenSpec change (propose → design-reviewed against
CLAUDE.md/openspec/specs → apply → verify → sync → archive), archived
under `openspec/changes/archive/2026-07-27-*`.

- ~~`mapError`'s 18 sequential `err instanceof X` branches~~ (finding 1) —
  replaced with two ordered `{ctor, status, type}` lookup tables plus
  `.find()`, `ConcurrencyConflict` and the untyped fallback kept as
  explicit cases. Bundled with findings 2 and 8 (same file/subsystem).
  OpenSpec change: `dedupe-http-route-handling`.
- ~~11 route handlers' identical try/catch~~ (finding 2) — extracted a
  `guarded(fn)` helper; `handleSubmit`'s `AutomaticCascadeLoop` branch
  stayed bespoke, per the finding's own scope note. Bundled into
  `dedupe-http-route-handling`.
- ~~`typeMatches`/`expectedTypeLabel`'s duplicate switches~~ (finding 3) —
  replaced with one `JS_TYPE: Record<BaseFieldType, string>` table; the
  plugin-type fail-open branch stayed explicit ahead of the table, and the
  table's exhaustiveness over the closed `BaseFieldType` enum turns a
  future unhandled type into a compile error instead of a silent runtime
  accept — addressing the finding's own trust-boundary caveat directly.
  OpenSpec change: `dedupe-runtime-field-type-check`.
- ~~`claimStep`/`releaseClaim` duplication~~ (finding 4) — extracted a
  shared `updateAssignment` helper; the review caught that a naive split
  would let the assignment's timestamp and its audit event's timestamp
  drift apart, so the helper computes the timestamp once and threads it
  through. Verified against the assignment suites, including the
  concurrent-claim race test. OpenSpec change: `dedupe-engine-claim-release`.
- ~~`FieldInput`'s duplicate option-list maps and duplicate text
  branches~~ (finding 5) — hoisted one `options` expression for
  `select`/`multiselect`; deleted the `isFreeTextFallback` branch since it
  rendered byte-identically to the chain's existing final `else`. OpenSpec
  change: `dedupe-editor-field-input`.
- ~~Nine dead `z.infer` type aliases~~ (finding 6) — deleted
  (`Timestamp`, `DefinitionStatus`, `Compatibility`, `Execution`,
  `RetryPolicy`, `TimerAction`, `PublishedProcessBody`,
  `InstanceFaultedReason`, `InstanceEventKind`); every backing Zod schema
  kept. Bundled with findings 7 and 9 (`RetryPolicy`'s dead alias vs.
  `retryPolicy`'s now-wired schema are unrelated; see finding 7). OpenSpec
  change: `wire-outbox-retry-policy`.
- ~~`retryPolicy` authored, grammar-checked, and read by nothing~~
  (finding 7) — `drainOutbox` now reads `action.retry` per-action
  (`maxAttempts`, `backoff`, `baseDelay`), falling back to the prior
  hardcoded defaults when absent; retired the `ponytail:` marker on
  `BACKOFF_BASE_MS`. `transactional-outbox`'s spec updated (MODIFIED
  Requirements). Bundled with findings 6 and 9 since all three touch
  `definition.ts` and 6/9 have no spec-worthy content of their own.
  OpenSpec change: `wire-outbox-retry-policy`.
- ~~`extractCredential`/`resolveActor` duplication~~ (finding 8) —
  collapsed into one `resolveActor(req, resolver)` reading `req.headers`
  directly; the explanatory comment moved onto it. Bundled into
  `dedupe-http-route-handling`.
- ~~Dead `compatibility` field on the version wrapper~~ (finding 9) —
  removed `processVersion.compatibility`, and — once its only two
  consumers (this field and finding 6's `Compatibility` alias) were both
  gone — the now-fully-dead `compatibility` enum schema too.
  `examples/expense-approval.json` updated to match. Bundled into
  `wire-outbox-retry-policy`.

Net (2026-07-27 scan): 6 OpenSpec changes covering all 9 findings, one
review-caught fix along the way (finding 1's proposal wrongly claimed no
capability spec covered `src/http/`; `http-wrapper` does — corrected
before implementation). 861 tests pass (859 + 2 new, covering finding 7's
per-action override behavior), 0 fail, -0 deps throughout. No
gamestoppers.

### Checked 2026-07-29, not flagged

The three Process Studio changes that landed this day, scanned in full:

- `packages/studio/src/canvas/` (`CanvasView.tsx` 334 lines, plus
  `layout.ts`/`geometry.ts`/`connection.ts` at 73/31/31) — a hand-rolled SVG
  canvas is the *lazy* choice here, not the over-engineered one: the
  alternative was a graph-editing library for two interactions
  (drag-a-node, drag-from-a-handle). `connection.ts` wraps the engine's own
  `checkPathTriggerConsistency` rather than restating the rule, and that
  function was extracted from `definition.ts`'s `superRefine` so there is
  one implementation, not two. `geometry.ts`'s `dragDelta` is a one-line
  subtraction, but it has a real call site and a test, matching the studio
  spec's extract-the-testable-logic convention.
- `versionDiffLogic.ts::diffJson` (55 lines) — a from-scratch JSON diff with
  no library added, arrays deliberately compared whole instead of running a
  real array-diff algorithm. Correct trade at this body size. (Its
  `selectVersion` sibling is finding 18.)
- `panels/draftJsonLogic.ts` + `JsonView.tsx` (34 + 52 lines) — reuses the
  Draft model's existing `replace()` path and `migrationPlanLogic.ts`'s
  parse/format shape; seeds text once on mount with no resync effect. No new
  mutation surface, nothing speculative. (The *guard* it calls,
  `load-guard.ts`, is a duplicate — that's finding 1, not this.)
- `MigrationPlanScreen.tsx` (162 lines) — a JSON textarea over
  `MigrationSpec` rather than a field-by-field form, with validation left to
  the server that already owns it. Exactly the ladder's answer.
- `src/engine/drafts.ts` (166 lines) / `src/http/studio-routes.ts` (187
  lines) — thin; `markDraftPublished` is a plain `UPDATE` deliberately kept
  outside `saveDraft`'s revision check. The duplicated `resolveActor`/
  `guarded`/`parseLimit` helpers in the route file are findings 7-8, not new.

### Checked this scan, not flagged

- The editor's single-locale `i18n/catalog.ts` — flagged in this scan's first
  pass as YAGNI (one `en` object, ~120 keys, no second locale, no switcher),
  **withdrawn 2026-07-27** on a concept review. It is the one finding that
  reversed a deliberate scope decision, and the decision was right: the JSON
  contract is multi-locale by construction (`LocalizedText`, `baseLocale`, and
  the invariant that every text in the body carries a `baseLocale` entry), and
  the editor is the authoring tool for exactly that content. The catalog costs
  nothing at runtime — a property read behind `t(key)` — while inlining it is a
  diff across every panel that has to be paid twice when a second locale is
  authored. The 2026-07-24 scan cut the *switcher* and kept the catalog; that
  is the correct line. [packages/editor/src/i18n/catalog.ts]
- `@panzoom/panzoom`, `mermaid`, `immer` — each does real work at a real call
  site; none is a stdlib/native re-implementation.
- `mermaid-isomorphic` + `playwright` (editor devDeps) — drive a real browser
  render in `graph-view-rendering.test.tsx`; that check can't be faked cheaply.
- `jose` — JWT verification. Hand-rolling crypto to save a dep is the wrong
  trade.
- `src/engine/poll.ts`, `draft/list-ops.ts`, `draft/draft-array-crud.ts`,
  `player/locale-text.ts` — the 2026-07-26 extractions; all minimal, all with
  multiple call sites.
- `Action.execution` (`"async" | "blocking"`) — documented in CLAUDE.md as
  reserved-not-built, unlike `retry` which was documented nowhere before this
  scan's finding 7 wired it into `drainOutbox` and the `transactional-outbox`
  spec. `execution` is *not* deletable either, for the same reason finding 7's
  resolution turned on: it is inside `ProcessBody`, so removing it would move
  the `definitionHash` of every stored body that carries it.

## Checked, not flagged (deliberate, per CLAUDE.md)

- `devHeaderResolver` as the sole `ActorResolver` — documented: "no real
  identity provider ships in core."
- Action `Registry` — documented plugin envelope, has a real second handler
  (`http.request`) beyond the exempted `core.*` internal dispatch.
- `DataSourceRegistry` with only a `"static"` handler — documented: "the
  registry mechanism holds more than one type... deferred until a concrete
  need exists."
- `packages/editor/src/registry/exampleRegistry.ts` + `RegistryPanel.tsx` —
  documented v1 demo toggle (editor has no author-supplied-code execution
  surface).
- `src/http/server.ts`'s five-route if-chain — appropriately minimal at this
  route count; a table-driven dispatcher would be the over-engineering here.
- `src/engine/idempotency.ts`'s hand-rolled UUIDv5 — Node's `crypto` has no
  built-in v5; documented as a deliberate no-dependency choice.
- `migrateInstances`/`findOrphanKeys` keyset-pagination loop (finding 4,
  2026-07-24 scan) — reviewed 2026-07-26, declined. The audit already flagged
  it low priority; the per-row bodies differ substantially (4-way outcome
  categorization with two error types vs. parse-and-check with one), and the
  two queries themselves differ in SELECT columns and WHERE predicate, so a
  real extraction would need the query injected via callback — more
  indirection than the ~8-10 lines of loop boilerplate it would save.
  [src/engine/migration.ts:543-592 vs 606-638]
- `src/auth/authorize.ts`'s `requireRole`/two role constants — reviewed
  2026-07-26, used with genuinely different roles at two real call sites
  (`src/http/routes.ts`, `src/runtime/api.ts`), not speculative.
- `src/auth/login.ts`'s `checkAndRecordAttempt(map, email, now)` — reviewed
  2026-07-26, all three parameters are exercised with different values in
  tests (a fresh `Map`, a controllable clock), real seams not dead
  flexibility; the in-memory `Map` limiter doesn't overlap with
  `idempotency.ts` (deterministic key derivation only, no counter state).
- `jwt.ts`/`resolve.ts`'s `ActorResolver` extension point — reviewed
  2026-07-26, genuinely two implementations (`devHeaderResolver`,
  `jwtResolver`), justifying the interface.
- `client.ts`'s `authHeaders()` wrapper — reviewed 2026-07-26, three call
  sites, not one.

## Resolved from the 2026-07-26 scan

Each landed via its own OpenSpec change (propose → apply → verify → sync
→ archive), archived under `openspec/changes/archive/2026-07-27-*`.

- ~~`DataSourcesPanel`/`StepsPanel`/`FieldCatalogPanel` root-level-draft-
  array CRUD duplication~~ (finding 1) — extracted
  `addToDraftArray`/`updateInDraftArray`
  (`packages/editor/src/draft/draft-array-crud.ts`); `removeFromDraftArray`
  was considered and dropped during implementation (a bare `mutate`
  pass-through with nothing shared to lift). `StepsPanel`'s `removeStep`
  and its `initialStep`/`setExpanded` bookkeeping stayed out of scope
  (different shape / step-specific, per design). OpenSpec change:
  `dedupe-editor-panel-crud`.
- ~~`startOutboxWorker`/`startResolutionWorker`/`startTimerScheduler`
  poll-loop duplication~~ (finding 2) — extracted `pollForever(tick,
  intervalMs)` (`src/engine/poll.ts`), including the identical
  swallow-and-retry `catch` body, not just the `setTimeout` shell. Highest
  scrutiny of this batch (engine core, load-bearing delivery/timer
  semantics); verified via the full test suite plus a standalone script
  directly exercising `pollForever`'s timing/stop semantics, since the
  wrapper had no pre-existing dedicated test. OpenSpec change:
  `dedupe-engine-poll-loops`.
- ~~`runValidation`'s four validator-issue-mapping loops~~ (finding 3) —
  extracted `pushIssues(issues, body, items, source)`
  (`packages/editor/src/draft/validation.ts`); the Zod-issues branch
  stayed out of scope (different input shape, different `resolveLoc`
  target). OpenSpec change: `dedupe-editor-validation-issues`.
- ~~Player store `run`/`runLogin` duplication~~ (finding 4) — collapsed
  into `run(fn, { isLogin })`. Verified end-to-end against a real running
  HTTP server (seeded user, wrong-password and corrupted-token 401 paths
  both driven through the actual UI via `playwright-cli`), since neither
  path had automated coverage (`run`/`runLogin` are closures inside
  `PlayerProvider`, and this project has no jsdom/testing-library setup
  for interactive component tests). OpenSpec change: `dedupe-editor-player`.
- ~~`firstText`/`firstLocalizedText` duplication~~ (finding 5) — deduped
  into `firstLocalizedText` (`packages/editor/src/player/locale-text.ts`),
  imported by both `FieldInput.tsx` and `PlayerView.tsx`. Bundled with
  finding 4 and finding 8 into the same OpenSpec change
  (`dedupe-editor-player`) — same directory, same subsystem.
- ~~`FieldExpressionMapEditor`'s unused `emptyLabel` prop~~ (finding 6) —
  dropped the prop and its dead render branch; confirmed zero callers
  repo-wide both before and after. Bundled with finding 1 into
  `dedupe-editor-panel-crud`.
- ~~`TOKEN_LIFETIME`/`TOKEN_LIFETIME_MS` duplicate duration encoding~~
  (finding 7) — both now derive from `TOKEN_LIFETIME_HOURS = 8`
  (`src/auth/login.ts`); produced values unchanged (`"8h"` / `28800000`).
  Considered and rejected: passing the millisecond count directly to
  `jose`'s `setExpirationTime` — a `number` there is an absolute
  Unix-seconds timestamp to `jose`, not a relative duration, which would
  have silently broken token expiry. OpenSpec change:
  `dedupe-auth-token-lifetime`.
- ~~`PlayerClientError`'s unread message ternary~~ (finding 8) —
  simplified to `super(error.type)`; confirmed no catch site anywhere
  reads `Error.prototype.message` on a caught `PlayerClientError` (every
  site reads `.error` or `.status`). Bundled with findings 4 and 5 into
  `dedupe-editor-player`.

Net (2026-07-26 scan): findings 1-8 all landed, -21 net lines across
touched source files (108 insertions, 129 deletions;
`packages/editor/src/panels`, `packages/editor/src/player`,
`packages/editor/src/draft/validation.ts`, `src/engine/{outbox,
resolution,timers,poll}.ts`, `src/auth/login.ts`), -0 deps throughout. No
gamestoppers — every finding was a pure, verified behavior-preserving
refactor with no schema/contract/engine-behavior change.

## Resolved from the 2026-07-24 scan

- ~~Field-id→CEL-expression map editor duplication~~ (finding 1) — extracted
  shared `FieldExpressionMapEditor`, used by `ActionListEditor` and
  `SubprocessSpecEditor`; also fixed a field-switch duplication bug found
  during implementation.
- ~~`addX`/`removeX`/`updateX` array-CRUD-by-index duplication~~ (finding 2)
  — extracted `removeAt`/`updateAt` helper, fixed across all six sites
  (`PathsPanel`, `TimersPanel`, `ViewEditor`, `ActionListEditor`,
  `FieldCatalogPanel`). Note: this covered prop-array sites only — see
  finding 1 above for the related but distinct root-level-draft-array sites
  it didn't reach.
- ~~`checkActionRegistry`/`checkDataSourceRegistry` outer loop duplication~~
  (finding 3) — extracted shared `checkTypedConfig` helper, deduping the
  registry-validation loop.
- ~~`packages/editor/src/draft/validate.ts`~~ — deleted (zero callers,
  superseded by `validation.ts::runValidation`).
- ~~`RegistryValidationError`/`AssignmentRegistryValidationError`
  duplication~~ — merged, plus a third identical class
  (`DataSourceRegistryValidationError`) found and folded in during
  implementation.
- ~~`checkActionRegistry`/`checkAssignmentRegistry` Zod-issue mapping-loop
  duplication~~ — deduped into `mapConfigIssues`, plus a third identical
  copy (in `checkDataSourceRegistry`) found and folded in during
  implementation.
- ~~AssignmentRegistry plugin system~~ — already cut; `checkAssignmentRegistry`
  is now a direct `type !== "static"` check, no registry.
- ~~Editor i18n locale-switcher plumbing~~ — already cut; `i18n/` is just
  `catalog.ts`, a plain `t(key)` lookup.
- ~~Unused `_registry` param on `createServer`~~ — already gone; `createServer`
  takes no registry argument.
- ~~`HandlerDef.outputSchema`~~ — already gone, no references anywhere.

Net (2026-07-24 scan): findings 1-3 landed (~48-58 lines cut); finding 4
declined as not worth the indirection. -0 deps throughout.
