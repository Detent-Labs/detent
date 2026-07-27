# Ponytail Audit

Repo-wide over-engineering scan (not a diff review). Findings ranked biggest
cut first. Read-only report — nothing here has been applied. Regenerate with
`/ponytail-audit`; this file is a snapshot, re-run before trusting it after
further changes land.

Last scanned: 2026-07-26. All 8 findings from that scan resolved
2026-07-27 — see "Resolved from the 2026-07-26 scan" below.

## Findings

None outstanding. Regenerate with `/ponytail-audit` for a fresh scan
before trusting this section again.

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
