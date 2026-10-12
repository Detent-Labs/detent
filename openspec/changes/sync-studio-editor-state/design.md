# Design

## Context

See `proposal.md` for the four findings. Three facts shape the approach.

`PluginEnvelopeEditor` keeps `configText` in `useState`, seeded once. Only its generated-form and custom-editor writes refresh it. The raw textarea and any picker outside the editor never do. `StepPage` and `DataSourceRow` mount with no `key`, so React reuses one instance across entities.

`DraftProvider` runs an effect on every draft change. It collects each `process.start` site and calls `resolveChainingTargets`. That function starts one `listProcesses` per `processId` it has not seen. The draft reducer clones the whole draft with `structuredClone`, which keeps key order.

`RemoveFieldDialog`, `useConfirmDialog` and `fieldRemovalReach` form the studio's confirmation pattern. The owner chose its counts-only shape on 2026-09-13. On 2026-10-12 the owner ruled that a data source removal clears the references and confirms with a count. A source no field uses leaves at once.

The visual shape, from `/impeccable shape`, draws no new box, color or motion. The dialog copies the 2px divider box of `RemoveFieldDialog`. The confirming control is an outlined `btn-secondary btn-destructive`, never filled red. Cancel holds the initial focus, since the studio has no undo.

## Goals / Non-Goals

**Goals:**

- No editor shows text that the draft does not hold.
- No write lands in an entity other than the one on screen.
- No removal leaves a reference that resolves to nothing.

**Non-Goals:**

- Leave `definition.ts`, the engine and the publish checks alone.
- Leave `ActionListEditor` and `FieldCatalogPanel` alone. Each keys its own `PluginEnvelopeEditor` already, and the derived text covers the rest.
- Skip a local mode state for the timer. A hand-authored body can still hold a timer with neither `duration` nor `deadline`. The Checks tab reports it, and the UI can no longer create it.
- Skip a backoff for failed chaining reads. A failed read retries on the next draft change, nothing more.

## Decisions

**1. The textarea text derives from the stored config.** The editor keeps `edit: {text, base, error} | null`. The `base` is `JSON.stringify(config)` at the time of the keystroke. Each render compares `base` with `JSON.stringify(value?.config ?? {})`.

A match shows the author's text and error. A mismatch shows the stored config, pretty-printed. A valid parse goes to `onChange`, and its string becomes `base`. Invalid text records the stored config's string, so it survives until the config moves.

Every `setConfigText` call goes. The derivation covers the generated form, the custom editor and the pickers. `switchToJson` clears `edit`.

One alternative derives the text only while the textarea lacks focus. That fails when a picker takes the focus. Another alternative pretty-prints on every render. That reformats the text under the caret while the author types.

**2. `StepPage` and `DataSourceRow` mount per entity.** `EditScreen` passes `key={pageStep?.id ?? "none"}`. `DataSourcesPanel` passes `key={ds.id}`. The key replaces the shared button, which closes FIELDS-15. It also drops the JSON mode and the half-typed state of the earlier entity.

The remount drops the focus that sat on the removed control. A removal therefore hands focus on. `onRemoveStep` and the data source removal wait one animation frame. They then focus the current row of the rail. The steps rail gives that row a fixed id. The data source rail gives its rows the source id. An empty rail hands focus to its first add control, which also gets an id.

The steps rail has one add control per step kind.

The alternative keeps one `StepPage` and resets state in an effect. That leaves one frame where step B shows the state of step A.

**3. The timer keeps the deadline as an empty expression.** The `ExpressionInput` handler in `TimersPanel` passes `deadline ?? {lang: "cel", src: ""}`. Then `modeOf` reads the deadline, the select agrees, and the input stays. This writes the value that choosing the deadline kind already seeds.

`ExpressionInput` keeps sending `undefined` for empty text, because other editors rely on it. The alternative keeps the kind in local state, as `overrideMode` does. That adds a second source of truth, which disagrees with the draft after a reload.

**4. Removing a data source is a helper, a dialog and a branch.** `draft/data-source-removal.ts` holds three pure functions:

- `dataSourceRemovalReach(draft, id)` counts the fields that name the id at every depth. It also counts the column mapping entries on them. It answers `undefined` for an unknown id.
- `hasDataSourceReach` is true when the field count is above zero.
- `removeDataSourceAndReferences(draft, id)` is a `mutate` recipe. It deletes `dataSource` and `columnMapping` from each field that names the id. Then it splices the source. A column mapping needs a data source, so the two keys leave together.

`DataSourcesTab` keeps `pendingRemoval` in state. A press with no reach removes at once. A press with reach opens `RemoveDataSourceDialog`.

The dialog is its own file, because `RemoveFieldDialog` types its props on `FieldRemovalReach`. It copies that file's structure. It lists the key of the source, the field count and the mapping count. A zero count prints no row. One note says the studio has no undo.

Cancel and Escape clear `pendingRemoval`, and focus returns to Remove data source. Confirm clears the trigger ref and removes. The focus then follows decision 2.

**5. Chaining targets load from one list.** `resolveChainingTargets` gains a `listing` holder, `{current?: Promise<ProcessSummary[]>}`. The first unseen id starts `listProcesses` and stores the promise. Every later id waits on the same promise.

An id the list lacks becomes `"done"` with no body request. A listed id fetches its body once. A failed list read clears `listing.current`. A failed body read deletes the `fetchState` entry. Both leave the id unseen, so the next draft change retries.

`DraftProvider` holds the holder in a ref beside `chainingFetchState`. The alternative debounces the effect. That delays the Checks tab by the debounce and still sends one request per pause.

**6. Docs.** `docs/browser-checks.md` gets one checklist entry for the four findings. `docs/decisions.md` loses FIELDS-15 and the audit index entry of this change.

## Risks / Trade-offs

- Another tab publishes a process after the studio mounted → the site reads as not checked until the next mount. Publish still runs the server check.
- A failed list read retries on every draft change while the server is down → one request per change, no loop. A `ponytail:` comment names the missing backoff.
- Keying `StepPage` resets its local state on each step change → the state held there is per step already. It holds a pending kind switch, a child-load error and the Developer view.
- The animation-frame focus can race a slow render → the fallback is body focus, as before. The browser check proves the common path.
- `JSON.stringify` equality treats a re-ordered config as new → the text then re-prints once, which is harmless.

## Migration Plan

No stored data changes. A draft or version saved before the change opens unchanged. Rollback is a revert of the commits.

## Open Questions

None. The owner settled the one open question, E2-15, on 2026-10-12 (see Context).
