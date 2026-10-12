# Tasks

## 1. The plugin editor text (E2-8)

- [ ] 1.1 Derive the textarea text in `PluginEnvelopeEditor` from the stored config, and drop every `setConfigText` call. Test with a pure helper. A picked list key, a generated form write and invalid text each give the right text.
- [ ] 1.2 Key `StepPage` in `EditScreen` and `DataSourceRow` in `DataSourcesPanel` per entity. Test with static markup that two entities render two keyed instances.

## 2. Focus after a removal (FIELDS-15)

- [ ] 2.1 Give the steps rail's current row and its add control fixed ids, and move focus to them after `onRemoveStep`. Test the id helpers and the choice of target.
- [ ] 2.2 Give the data source rail rows and the add control ids, and move focus after a data source removal. Test the target for a middle, a last and an only source.

## 3. The timer deadline (E2-13)

- [ ] 3.1 Write `{lang: "cel", src: ""}` from the deadline input when the text is empty. Test with a pure handler that the timer keeps `deadline` and gains no `duration`.

## 4. The data source removal (E2-15)

- [ ] 4.1 Add `draft/data-source-removal.ts` with the reach count, `hasDataSourceReach` and the removal recipe. Test an unused source and a source on three fields at two depths. Test a column mapping and an unknown id.
- [ ] 4.2 Add `RemoveDataSourceDialog.tsx`, shaped like `RemoveFieldDialog`, with its catalog keys. Test the markup: counts, Cancel focus, no row for a zero count.
- [ ] 4.3 Branch `DataSourcesTab`: remove at once with no reach, open the dialog otherwise. Verify with the browser check in 6.5.

## 5. The chaining fetch (E1-7)

- [ ] 5.1 Give `resolveChainingTargets` the shared `listing` holder, filter by the list, and forget a failed read. Adapt `studio-draftProvider-chainingFetch.test.ts` to the new signature. Add a test that 17 prefixes send one list request.
- [ ] 5.2 Hold the `listing` ref in `DraftProvider`. Test that a failed list read retries on the next call.

## 6. Docs and verification

- [ ] 6.1 Add a checklist entry to `docs/browser-checks.md` for the four findings. Verify it names the route and the pass condition.
- [ ] 6.2 Strike FIELDS-15 and this change's entry in `docs/decisions.md`. Verify with a search that neither remains.
- [ ] 6.3 Run `bun run typecheck`, then `bun run build`, then the full gated `bun test` with `DATABASE_URL` set, in the lane's devcontainer.
- [ ] 6.4 Run the antislop and whitespace gates over the pushed range, as the push gate does.
- [ ] 6.5 Check the four findings in a browser on the production build, then run `/impeccable critique` and `/impeccable audit` on the Data sources tab.

## Workflow follow-up

- Verify, sync the delta specs, archive, push, open the PR and merge on green CI.
