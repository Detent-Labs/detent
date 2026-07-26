# Ponytail Audit

Repo-wide over-engineering scan (not a diff review). Findings ranked biggest
cut first. Read-only report — nothing here has been applied. Regenerate with
`/ponytail-audit`; this file is a snapshot, re-run before trusting it after
further changes land.

Last scanned: 2026-07-26.

## Findings

1. shrink `DataSourcesPanel`/`StepsPanel`/`FieldCatalogPanel` each hand-roll
   an identical add/remove/update-by-index triplet against `mutate`
   (`d.X ??= []; d.X.push(...)` / `d.X?.splice(index,1)` /
   `Object.assign(d.X?.[index], patch)`) — the same shape the `removeAt`/
   `updateAt` fix addressed, but that fix targets pure prop-array transforms
   (returns a new array); these three mutate a root-level draft array
   in-place, a different call convention the earlier fix couldn't cover.
   Extract a shared `mutate`-based CRUD helper.
   [packages/editor/src/panels/DataSourcesPanel.tsx:16-34,
   StepsPanel.tsx:41-65, FieldCatalogPanel.tsx:167-185]
2. shrink `startOutboxWorker`/`startResolutionWorker`/`startTimerScheduler`
   — byte-identical poll-loop body (`stopped`/`timer`/`tick`/`setTimeout`,
   11 lines), differing only in the drain call. Extract one
   `pollForever(tick, intervalMs)` helper.
   [src/engine/outbox.ts:230-252, src/engine/resolution.ts:110-133,
   src/engine/timers.ts:61-83]
3. shrink `runValidation` has four near-identical loops mapping a
   validator's issue list into `EditorIssue` — the same mapping-loop shape
   already deduped elsewhere into `mapConfigIssues`. Extract one
   `pushIssues(items, source)` helper.
   [packages/editor/src/draft/validation.ts:61-97]
4. shrink `run` and `runLogin` in the Player store are near-identical
   (setLoading/setError/try/catch/finally), differing only in the
   401→logout branch. Collapse into one `run(fn, { isLogin })` helper.
   [packages/editor/src/player/store.tsx:142-170]
5. stdlib `firstText` (PlayerView.tsx) and `firstLocalizedText`
   (FieldInput.tsx) are identical one-line "first value of a locale record"
   helpers, duplicated in the same directory. Move one into `player/types.ts`
   or a shared util and import it.
   [packages/editor/src/player/FieldInput.tsx:5-9, PlayerView.tsx:6-9]
6. yagni `FieldExpressionMapEditor`'s `emptyLabel` prop is declared and
   rendered but never passed by either caller (`SubprocessSpecEditor`,
   `ActionListEditor`). Drop the prop and the
   `entries.length === 0 && emptyLabel` branch.
   [packages/editor/src/panels/shared/FieldExpressionMapEditor.tsx:11,23,57]
7. shrink `TOKEN_LIFETIME = "8h"` and
   `TOKEN_LIFETIME_MS = 8 * 60 * 60 * 1000` encode the same duration twice
   in different forms, kept in sync by hand. Derive one from the other.
   [src/auth/login.ts:21-22]
8. delete `PlayerClientError`'s message ternary
   (`error.type === "validation" ? "validation" : ... : error.message`) —
   nothing reads `Error.prototype.message` on a caught `PlayerClientError`;
   every catch site reads `.error` or `.status` instead. Simplify to
   `super(error.type)`.
   [packages/editor/src/player/client.ts:6]

Net if all applied: -~100 lines, -0 deps.

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
