# Design

## Context

See `proposal.md` for the five findings. The step page mounts `SubprocessSpecEditor` in "Which process it calls". That editor has two mapping lists, both from `FieldExpressionMapEditor`. `ActionListEditor` shares that component. The "performed by" control on the masthead calls `updateStep(performedByPatch(option))`. The patch carries only `type` and `terminal`. `Object.assign` applies it, so an `undefined` value drops a key when the draft serializes.

Three facts shape the approach:

- The studio has `getVersionBody(processId, version, token)`. `useTargetProcessCatalog` shows how a panel reads a fetched body loosely, with a guard against stale results.
- `RemoveFieldDialog` and `useConfirmDialog` form the studio's confirmation pattern. The owner chose its "counts only" shape on 2026-09-13.
- `StepPage` returns early when it has no step. Every hook must sit above that return.

The owner ruled on 2026-10-12. A kind switch confirms, and only when it removes something. The child's contract comes from the `pinnedVersion` body, or from the newest version for `latest-at-spawn`. A slow or failed read leaves a note and keeps stored keys.

The visual shape, from `/impeccable shape`, draws no new box, color or motion. The dialog copies `RemoveFieldDialog`'s 2px divider box. Its confirm control is an outlined `btn-secondary btn-destructive`. Cancel holds the initial focus.

## Goals / Non-Goals

**Goals:**

- Every body the subprocess section and the kind switch produce passes the existing Zod and publish rules.
- A stored value never changes because of what the editor displays.

**Non-Goals:**

- Leave `definition.ts`, the engine and the Checks rail alone. The rail keeps skipping `inputMapping` keys (`studio-checks-rail`).
- Leave the masthead's missing path issues on a hidden section alone. After this change the UI cannot reach that state.
- Leave `ExpressionInput` alone. Its `undefined` on empty text feeds the timer editor, which a later change owns (E2-13).
- Skip resolving a `latest-at-spawn` binding by `contractRef` hash. The editor reads the newest version, as the owner ruled.
- Skip the task step with manual paths that becomes a subprocess step. The path editor already switches a path's trigger.

## Decisions

**1. A step with no spec shows the process select alone.** The first pick builds the whole spec through a pure `specForProcess(processId, processes, current)`. With no current spec it returns `{processId, versionBinding: "pinned", pinnedVersion: <newest>, inputMapping: {}, outputMapping: {}}`. With a current spec it returns `{...current, processId}`, and a pinned binding also resets `pinnedVersion` to the new process's newest version. The alternative shows "pinned" and writes it on the first change. That shows a state the draft does not hold, which is the bug.

**2. A hook reads the child's input fields, and the page passes them down.** `StepPage` calls `useChildInputFields(token, processId, version)` above its early return. It hands the result to the editor as `childInputs`. The editor stays pure.

A static-markup test then covers every state. The state is `{status: "idle" | "loading" | "ready" | "failed", fields}`. A pure `childInputRefs(body)` maps a loose body to `{id, key}` pairs in the order of `contract.inputFields`, through the existing `fieldsToRefs`. The hook keeps each result with the key it fetched for, as `catalogStateFor` does.

A switch of process then never shows the earlier child's fields.

The version is `pinnedVersion` for a pinned binding. For `latest-at-spawn` it is the `version` of the process's row in the `GET /processes` list, which `useFetchOnce` already holds. A step that is not a subprocess step, or has no process, passes `undefined` and the hook stays idle. The alternative reads every version through `listVersions` and matches `contractRef`. That costs N fetches and a contract hash in the web package, for a case the author sees anyway.

**3. `FieldExpressionMapEditor` gets a looser target type and four behaviors.** Its `fields` prop becomes `readonly {id?: string; key?: string; type?: string}[]`. Both `DraftField` and the child refs satisfy it. The editor then does four things:

- It drops targets of `type === "group"`.
- It disables, in each row's select, every target another row holds.
- It adds a stored key outside the targets as its own marked entry (`mapping.unlistedKey`), so the select shows the stored value.
- It keeps a row after the author clears its CEL text, as `{lang: "cel", src: ""}`.

It takes an `addDisabled` prop, so the subprocess editor disables "+ add" while the child's fields are unavailable. "+ add" picks the first target not yet used. The `outputMapping` editor passes the parent's fields. The `inputMapping` editor passes the child's.

**4. The kind switch starts from data.** `draft/performedBy.ts` gains `performedByRemovals(option)`, the keys a kind cannot carry. It also gains `performedByReach(step, option)`, the counts of what the step has under those keys. `performedByPatch` keeps its signature and result. A new `performedByEdit(step, option)` returns the full patch: the old pair plus `undefined` for every removed key. A table test covers the three functions.

`StepPage` keeps `pendingKind` in state and the pressed button in a ref. A press with an empty reach applies the edit at once. A press with a non-empty reach sets `pendingKind`, and `KindSwitchDialog` renders. Confirm applies the edit and clears `pendingKind`. Cancel and Escape clear it. The dialog uses `useConfirmDialog` with the pressed button as the trigger ref. The edit does not remount that button, so focus returns there on every route.

The dialog is a new file, because `RemoveFieldDialog` fits a field's reach alone. It copies that file's style block, as `RemoveFieldDialog` copied `ProcessHeaderBar`'s. The alternative is the native `window.confirm`. The studio never uses it, and the native box cannot lay out counts.

**5. Strings.** The dialog and the new notes join the studio catalog (`catalogs/studio.ts`), English only, one key per sentence. The heading reads "Switch to “{kind}”?". The fact terms are "Subprocess call", "Outgoing paths", "Time limits", "Exit actions", "Cancel actions", "Cancellable setting" and "Outcome". The note reads "The studio has no undo."

The confirm control reads "Switch and remove". The kind phrase comes from `stepKindPhrase`, so the dialog and the control use one word.

**6. Two one-line fixes.** The outcome text field writes `e.target.value || undefined`. `ContractPanel.addOutcome` trims once into a local. It uses that local for the empty check, the duplicate check and the push. A pure `appendOutcome(outcomes, text)` in `draft/` holds the rule, so a test covers it without a renderer.

## Risks / Trade-offs

- A slow or failed version read leaves "+ add" disabled → the note names the state. The JSON surface stays the escape hatch.
- A `latest-at-spawn` child may change its contract in its newest version. The editor then lists the new fields, while the engine resolves the older matching version. Publish still checks `inputMapping` against the engine's version.
- Each subprocess step the author selects costs one fetch. The hook reads one body per process and version.
- The lock reaches `ActionListEditor` → the same overwrite bug lives there. The shared editor is the one place to fix it.
- `performedByEdit` also drops `onCancel`, which the brief's list omits → the exit section holds `onExit` and `onCancel` together, and an end step shows neither. Keeping one would leave a hidden key, the finding's own subject.

## Migration Plan

No stored data changes. The change edits studio components and writes bodies that the existing rules already accept. A draft or version saved before it opens unchanged. Rollback is a revert of the commits.

## Open Questions

None. The owner settled the two open questions on 2026-10-12 (see Context).
