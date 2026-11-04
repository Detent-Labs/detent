<!-- antislop: allow-file synonym-rotation one-instruction sentence-length run-ons negation-habit paragraph-length -->
<!-- Why: each task line holds its act and its pass check, a checked box adds a word, and control names repeat on purpose. -->

# Tasks

## 1. The string list keeps its text

- [x] 1.1 Add `shownLines` to `panels/shared/pluginConfigText.ts` and a `LinesInput` component in `panels/shared/` per D1. Make it the only string-list textarea, with the rule as visible text and `aria-describedby`, and a caption that states the rule replacing the hint. Pass: `packages/web/test` covers Enter, a typed space, a trailing blank line and a write from elsewhere, and a mutation on a copy that restores the old rewrite fails a named test.
- [x] 1.2 Add a test reading `aria-describedby` to the visible rule; no existing test reads the old label. Pass: the test names the description target, a render with a caption holding the rule prints "one per line" once, and `git grep -n 'plugin.arrayHint' -- packages/web/src` shows it only as visible text.

## 2. A type change clears the config

- [x] 2.1 Add the per-type memory of D2 to `PluginEnvelopeEditor` through the pure `switchedConfig` and `memoryAt`, with `edit` cleared on a type change and the memory cleared when `loadGeneration` moves. Pass: `bun:test` reads those two functions for the cleared key, the kept `description`, a switch back that restores and a restore that empties the memory. It also covers a free-text position with no memory write per keystroke, which `FieldCatalogPanel` relies on. `renderToStaticMarkup` covers an action and a data source position.
- [x] 2.2 Rename `customConfigEditor` to `customConfigEditors` per D4 and move `DataSourcesPanel` to it. Pass: `test` and `packages/web/test` suites for the `instance.query` form stay green with no assertion weakened.
- [x] 2.3 Add `noneOption` per D3. Pass: `renderToStaticMarkup` covers the first option, the hidden config and Description on an empty type, a stored empty type that keeps "Nobody in particular" pickable, and an undefined `registryTypes` with `noneOption` that draws no free-text input and reads a held type through `typeLabel`. `bun:test` reads `switchedConfig` for a switch to nobody and back that restores the config and the description.

## 3. The registry names closed strategies

- [x] 3.1 Add `isClosedConfigSchema` to `src/engine/config-descriptor.ts` using `{ io: "input" }` per D8, and `closedAssignmentStrategyTypes` to `handleGetRegistry`. Pass: `test/config-descriptor.test.ts` covers plain, strict, empty strict, loose, and a strict schema holding `z.date()` that reads not closed. `test/http-studio.test.ts` reads the three strict types and no `static`, and it calls `handleGetRegistry` with an assignment registry holding that `z.date()` schema and reads 200.
- [x] 3.2 Mirror the field in `RegistryInfo` in `api/types.ts` as required. Widen `runValidation`'s parameter per D9. Pass: `bun run typecheck` exits 0.

## 4. The groups route

- [x] 4.1 Add `listGroupsPermitting` to `src/auth/groups.ts` per D7. Pass: a DB test covers the order and these fixtures: global, listed, unlisted and empty list. It drives each through `publishBody` and the statement, since `validateGroupScope` is not exported.
- [x] 4.2 Add `handleListAssignableGroups` to `src/http/studio-routes.ts` and dispatch it in `src/http/server.ts`. Pass: `test/http-assignable-groups.test.ts` covers 200 with `groupId` and `name` alone, 401, 403 for a participant and an author outside the Developer list, admin on a process with a draft, 404 for an author on a process with no draft, and 403 for an admin-only actor there.
- [x] 4.3 Add `getAssignableGroups(processId, token)` to `api/client.ts` and `useAssignableGroups(token, processId)`, returning `{ status: 'loading' | 'ready' | 'failed', groups, message }`. Keep the pattern of `useChildInputFields`, with no idle state and a `message` from `describeCaughtError(err)`. Do not use `useFetchOnce`. Add a required `processId: string` prop to `StepPage` from `EditScreen`'s `ProcessSurface`, and pass `processId="proc_x"` in the renders at `studio-stepPage.test.tsx:99` and `studio-stepPage-sectionRequest.test.tsx:62`. Pass: a client test covers the success and failure shapes, a pure `assignableGroupsFor(result)` test reads the failed status, as `childInputsFor` does, and `docs/openapi.yaml` stays unchanged since it excludes `drafts/*`.

## 5. The who-acts writes

- [x] 5.1 Add `draft/assignmentWrites.ts` per D5 and D6. Pass: `bun:test` covers each `allowedGroups` scenario of the delta: both lists written, one entry kept once, an unread entry leaving, a second step keeping it, a nested bare person field keeping it, an emptied list deleting the key, a switch away and back rewriting the entry, and a re-pick of a held id missing from the list leaving it on the list.
- [x] 5.2 Route `StepPage`'s Who acts writes through it, with the routing rule of D5 in a pure function. Pass: `bun:test` reads that function: a config-only write leaves `allowedGroups` unchanged, and "Nobody in particular" removes the `assignment` key. The browser check presses Edit as JSON.

## 6. The pickers

- [x] 6.1 Add the fixed-list editor with the caption of D11. Add `validateField`'s wrong-kind branch and `plugin.notAList` per D4. Pass: a test reads the caption, the markup holds no `candidates` text outside Edit as JSON, a non-array `candidates` shows the error beside the control, and `packages/web/test/studio-pluginConfigMessages.test.ts` pins the message.
- [x] 6.2 Add `GroupPicker` with its loading, failed, empty and not-offered states and the person-field note. Use `StudioSelect`, a label above and no visible id. Repeated names read through `numberRepeats`. Pass: tests cover each state, an empty route with a held group, two groups sharing a name, and each scenario of "The group strategy picks a group by name" and "The group picker names its effect on a person field".
- [x] 6.3 Add `PersonFieldPicker`: single-person fields by label, nested fields, the held list-field mark and its note. Pass: tests cover each scenario of "The person-field strategy picks a field by label", including a removed or non-person held field, with repeated labels handled through the existing option text helpers.
- [x] 6.4 Add the inline "Add a person field" control. Mint outside the recipe, as `mintAndPlace` does, with `mintCatalogField("person", { [contentLocale]: name.trim() }, baseLocale, takenFieldKeys(draft))`, then write the field and its `fieldId` in one `mutate`. Pass: `bun:test` reads `addPersonField` for the field, the `fieldId` and no form entry gained, and a pure enable rule for spaces. The browser check presses Add and Cancel.
- [x] 6.5 Add `fieldHasWriter` per D12 and the unwritten-field note. Export `structuralWriterIds` from `view-flags.ts`. Pass: tests cover a new field, an editable entry on another step, an entry on this step, a hidden entry, a read-only entry, a literal default, an expression default, an output on this step's `onEntry`, and no note on the placeholder or a held list field.
- [x] 6.6 Add every key of D11 to `i18n/catalogs/studio.ts`. Pass: `git grep -n 'whoActs\.' -- packages/web/src` shows each key read, and no JSX literal holds a string of D11.

## 7. Checks and the header

- [x] 7.1 Add `draft/assignmentConfig.ts` with `assignmentConfigGaps` and `assignmentConfigHolds`, and raise gaps in `runValidation` per D9. Pass: tests cover a stale key, an absent key, a wrong kind, an open strategy's extra key, an undescribed strategy, an unloaded registry and a draft with a structural issue elsewhere. `checkPlace` reads `assignment` for a gap, `issuesBySection` holds it under `assignment`, and `dimensions.registryConfig` still reads `not-run`.
- [x] 7.2 Read `assignmentConfigHolds` in `sectionSummary` per D10. Pass: `packages/web/test/studio-stepSummaries.test.ts` covers an empty group, an emptied list, a held config, an undescribed strategy, a `null` config under a descriptor reading `todo`, an undescribed type with no config staying `done`, a stale key with the draft not compiling, and an emptied list on an end step. Update the `SectionState` comment. A `defaultOpenSection` test opens Who acts for that state on an automatic step. `git grep -n 'assignmentSchemas:\|closedAssignmentTypes:' -- packages/web/src/areas/studio/panels/StepPage.tsx` prints both.
- [x] 7.3 Move `checks.assignment.group` to `inSection` and its new sentence. Pass: `packages/web/test/studio-checkSentence.test.ts` pins the sentence and the Fix target, and a Fix test lands on Who acts with the JSON surface closed.
- [x] 7.4 Update the comment on `runValidation` and the `registryConfigHeldBack` comment in `checksRail.ts`, since the studio now checks one position. Pass: `git grep -n 'config-validation half' -- packages/web/src` prints the two comments, and each names the who-acts exception.

## 8. Docs

- [ ] 8.1 Update `docs/authoring-guide.md`: the fixed-list passage and its "one candidates field", the group passage on `allowedGroups`, and the person-field passage. Pass: the guide names the pickers and the prose gate reports no rise.
- [ ] 8.2 Add a "Who acts pickers" entry to `docs/browser-checks.md` for what stays manual. The entry presses what `bun:test` cannot: a switch back, nobody and back, Edit as JSON, Add and Cancel. Reword `docs/browser-checks.md:6517` to "type `alice` in the list". Reword `:6519` to "Pass: the assignment of step 2 reads Nobody in particular and shows no config box. It does not show `alice`." Reword `:7112` to pick The starter's manager for Done, and a fixed list for To do until it holds a value, since this step has no way out and the config check waits for a compiling draft. Pass: the entry names the production build and each state from 6.2. `git grep -n -E 'under candidates|its own empty|pick a strategy. Pass: the header shows the Done' -- docs/browser-checks.md` prints nothing.
- [ ] 8.3 Record in `docs/decisions.md` the missing `allowedGroups` control and the bare person field that offers nobody, naming the plain text input a participant meets. Narrow ACCORDION-8 to a plugin strategy's schema-key labels, the unstyled envelope and Edit as JSON. Pass: `git grep -n 'allowedGroups' -- docs/decisions.md` prints the entry, and ACCORDION-8 no longer says the curated strategies print schema keys.
- [ ] 8.4 Update `docs/current-state.md` for the new modules and route. Pass: `git grep -n 'assignable-groups' -- docs/current-state.md` prints a line.

## 9. Verification

- [ ] 9.1 Run `bun run typecheck` and report the last lines. Pass: exit 0.
- [ ] 9.2 Run `bun run build` and report the last lines. Pass: exit 0.
- [ ] 9.3 Run the full `bun test` with `DATABASE_URL` set through `rtk test sh scripts/dev-exec.sh sh scripts/test-gated.sh bun test`, in the foreground. Pass: 0 fail, and no silent-green rejection.
- [ ] 9.4 Run `bun run lint` and `bun run e2e`. Pass: both are green.
- [ ] 9.5 On the host, run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` and the same with `whitespace.sh`. Pass: both exit 0.
- [ ] 9.6 Run the browser check on the production build, then `/impeccable critique` and `/impeccable audit`, then `impeccable detect --json`. Pass: each scenario reads as observed, and a typed second name, a strategy switch and each picker state read correctly with real keystrokes.

## Workflow follow-up

- Run `openspec-verify-change`, then `openspec-sync-specs`, then archive.
- Open the second change: the radio list, the field stack, the notes and the warning on automatic steps. It also decides the `allowedGroups` control task 8.3 records.
