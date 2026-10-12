# Proposal

## Why

Four studio editors keep state that drifts away from the draft.

A `db.list` data source shows a JSON textarea that still reads `{}` after the author picks a list key. The next keystroke in that textarea writes `{}` back and drops `listKey`. On the step page, "Switch to JSON" on step A carries A's config into step B after "Next". A keystroke then writes A's config into B.

A timer in "deadline" mode flips to "duration" when the author clears the deadline text. The page then draws no input at all.

Removing a data source leaves every `field.dataSource` pointing at its id. The Checks tab then prints a raw `dataSource_…` id.

Each keystroke in the `processId` of a `process.start` action fires `GET /processes`. Typing `proc_credit_check` sends 17 requests.

The 2026-10-10 audit logged these as E2-8, E2-13, E2-15 and E1-7. FIELDS-15 names the missing `key` props and joins E2-8.

## What Changes

- The plugin editor's JSON textarea shows the stored `config` whenever the author did not just type that text (E2-8). Picking a list key, using the generated form or moving to another entity never leaves stale text behind.
- `StepPage` and `DataSourceRow` mount per entity, keyed by the step id and the data source id (E2-8, FIELDS-15). After a removal, focus moves to the rail row that becomes current. An empty rail hands it to the add control. Previous and Next keep focus on the walk, since the keyed page remounts their button.
- An emptied deadline stays a deadline (E2-13). The timer keeps `deadline: {lang: "cel", src: ""}`, the field the "deadline" choice seeds, so the kind select, the input and the draft agree.
- Removing a data source that fields use confirms first, and clears the references (E2-15). The dialog counts the fields and the column mappings. One draft mutation removes the source, unsets `dataSource` on every field that names it and drops the `columnMapping` of those fields. A source no field uses leaves at once.
- The studio lists processes once per mount for `process.start` targets (E1-7). It reads a body only for an id that list holds. A failed read is not remembered.
- Removing FIELDS-15 and this change's entry from `docs/decisions.md`.

No schema, definition contract or engine code moves. Every new write produces a body the existing rules accept.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-plugin-config-form`: the raw JSON text follows the stored config. The step page and the data source editor mount per entity.
- `studio-app`: removing a data source that fields use confirms first and clears the references. A removal moves focus to the rail.
- `studio-step-page`: a timer keeps the kind the author chose when the deadline text is empty. The walk between steps keeps keyboard focus.
- `studio-checks-rail`: the chaining targets load from one process list per mount.

## Impact

- Code: `packages/web/src/areas/studio/`. That covers `PluginEnvelopeEditor.tsx`, `DataSourcesPanel.tsx`, `EntityTabs.tsx`, `StepPage.tsx`, `StepsRail.tsx`, `TimersPanel.tsx`, `EditScreen.tsx`, `draft/chainingFetch.ts` and `draft/store.tsx`. It adds a data source removal helper, a removal dialog and studio catalog strings.
- Tests: the existing `studio-draftProvider-chainingFetch` suite changes with the new fetch signature.
- Docs: `docs/browser-checks.md` gets a checklist entry. The audit index in `docs/decisions.md` strikes this change, and FIELDS-15 leaves the same file.
- Specs: the four capabilities above. `docs/authoring-guide.md` stays as it is, since no authoring rule changes.
- Residual: an id absent from the process list at mount stays unresolved until the screen mounts again. A process published in another tab shows as not checked until then.
