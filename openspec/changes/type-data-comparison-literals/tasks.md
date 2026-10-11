# Tasks

## 1. Shared literal parsing

- [x] 1.1 Add `packages/web/src/shell/literalValue.ts` per design decision 1. Verify `packages/web/test/shell-literalValue.test.ts` covers numbers, booleans, strings, lists, empty text and bad members.

## 2. Column choice type (engine)

- [x] 2.1 Make `resolveVersionCoverage` return the declared base type per field and version, and update `fieldCell` and `mergeCell`. Verify the `executeReport` tests stay green.
- [x] 2.2 Add optional `type` to `ColumnChoice`, read from the newest declaring version. Verify `test/reports.test.ts` covers the three `instance-data-tables` scenarios.
- [x] 2.3 Assert `type` in the `POST /reporting/reports/columns` response. Verify `test/http-reporting-reports.test.ts` reads it.

## 3. Publish check (engine)

- [x] 3.1 Collect each compared literal in `validateInstanceQueryReferences` and reject one that no live version admits through `typeMatches`. Verify `test/instance-query-cross-process.test.ts` covers every `cross-process-validation` scenario.
- [x] 3.2 Add the invariant to `.claude/rules/authoring-invariants.md`, and to `.claude/rules/process-contract.md` where it lists the DB-resolving checks. Verify both files name the check and its placement.
- [x] 3.3 Explain the rule in `docs/authoring-guide.md` in the `instance.query` comparison section. Verify the guide states the same rule as the delta spec.

## 4. Studio form, catalog and attribute rows

- [x] 4.1 Add `type` to `TargetRef`, sort versions before the merge, and return `{ catalog, error }` from the hook. Verify a pure merge test covers newest-wins and plugin types.
- [x] 4.2 Add `attributeRows.ts` with `recordFromRows`, `duplicateRowIds` and a reseed test. Verify its unit test covers duplicates, empty keys and first-row-wins.
- [x] 4.3 Add pure comparison-row logic for typed literals, `in` lists and operator or field switches. Verify its unit test covers every `studio-plugin-config-form` literal scenario.
- [x] 4.4 Rework `InstanceQueryForm.tsx`: typed literal, list input, disabled state, error row, stale marks only with a catalog, stable attribute rows. Verify a static-markup test covers each state.
- [x] 4.5 Add the studio catalog strings and a `docs/browser-checks.md` entry for the form. Verify the catalog keys exist and the entry names each scenario.

## 5. Report builder

- [x] 5.1 Add `type` to the web `ColumnChoice`. Drop incomplete comparisons in `draftToInput`. Add the remembered-type helpers. Verify `reporting-reportsLogic.test.ts` covers incomplete cases and remembered types.
- [x] 5.2 Add `createDebouncer` and a thin hook, and key the column request on the complete query. Verify a fake-timer test shows one call after five rapid changes, and none for the first request.
- [x] 5.3 Rework `ComparisonRow`: typed control, `in` list text, incomplete mark, reason callout, remembered field types. Verify a static-markup test covers each state.
- [x] 5.4 Add English and German strings and a `docs/browser-checks.md` entry for the builder. Verify `i18n-catalog-parity.test.ts` passes.

## 6. Verification

- [ ] 6.1 Run `bun run typecheck` in the devcontainer, after `bun install` for the `form-ui` copy. Report the printed result.
- [ ] 6.2 Run `bun run build` in the devcontainer. Report the printed result.
- [ ] 6.3 Run the FULL `bun test` with DATABASE_URL set through `scripts/test-gated.sh` and `OPENSPEC_TELEMETRY=0`. Report pass, fail and skip counts.
- [ ] 6.4 Run the prose gate and the whitespace gate on the host over the pushed range. Report the printed result.
- [ ] 6.5 Check both builders in a real browser on the production build, with `playwright-cli` and a named session. Run `/impeccable critique` and `/impeccable audit` on both routes.

## Workflow follow-up

- Run `openspec-verify-change`, then `openspec-sync-specs`, then `openspec-archive-change`.
- Strike the `type-data-comparison-literals` entry from the audit index in `docs/decisions.md` in the archive commit.
- Merge the pinned `origin/main` SHA, push, open the PR, and merge on green CI.
