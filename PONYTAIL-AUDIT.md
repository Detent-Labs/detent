# Ponytail Audit

Repo-wide over-engineering scan (not a diff review). Findings ranked biggest
cut first. Read-only report — nothing here has been applied. Regenerate with
`/ponytail-audit`; this file is a snapshot, re-run before trusting it after
further changes land.

Last scanned: 2026-07-27. All 9 findings from that scan resolved
2026-07-27 — see "Resolved from the 2026-07-27 scan" below. The
2026-07-26 scan's 8 findings were all resolved 2026-07-27 too — see that
section further down.

## Findings

None outstanding. Regenerate with `/ponytail-audit` for a fresh scan
before trusting this section again.

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
