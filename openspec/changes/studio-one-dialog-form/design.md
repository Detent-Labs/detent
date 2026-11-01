# Design

## Context

See `proposal.md` for the motivation. The specs under `specs/` state the behavior. This file states how the code reaches it.

The studio's dialogs today:

| Dialog | File | Form |
|---|---|---|
| Publish, Discard draft | `panels/ProcessHeaderBar.tsx` | own `<dialog>`, hook |
| Remove field | `panels/RemoveFieldDialog.tsx` | own `<dialog>`, hook |
| Remove data source | `panels/RemoveDataSourceDialog.tsx` | own `<dialog>`, hook |
| Remove this step | `panels/RemoveStepDialog.tsx` | own `<dialog>`, hook |
| Kind switch | `panels/KindSwitchDialog.tsx` | own `<dialog>`, hook |
| Start picker, import preview | `screens/ProcessesScreen.tsx` | own `<dialog>`, no hook, no focus return |

The eight `confirm()` calls sit in `root.tsx`, `screens/EditScreen.tsx` (two), `screens/ProcessesScreen.tsx`, `screens/TemplatesScreen.tsx` (two) and `panels/FieldCatalogPanel.tsx` (two).

The web package has no DOM harness. A test renders static markup or reads source. A real browser checks the rest, in `e2e/` and `docs/browser-checks.md`.

Admin's seven `window.confirm` calls stay. They belong to another area and another capability, and D7 names the studio.

## Goals / Non-Goals

**Goals:**

- One module owns `<dialog>`, `showModal()`, the keyboard hold and the focus return.
- A wrongly composed dialog cannot exist. Cancel always stands, always last, and always holds the focus unless the caller names a safer place.
- Every sentence stands in the catalog as one key.

**Non-Goals:**

- Admin's prompts, and the browser's own `beforeunload` prompt.
- Names in place of counts on Remove this step, Remove data source and the kind switch. FIELDCARD-25 names the field dialog alone.
- A backdrop dismissal. FIELDS-21 offered it as one of two routes. This change takes the other and drops the route from the requirement.
- `src/schema/definition.ts`, any route, or any test floor.

## Shape brief (`/impeccable shape all dialogs`)

The owner pre-approved every decision, so no confirmation round ran. Assumptions stand marked.

**Job and audience.** A process author stands one press from something the studio cannot undo. They arrive mid-task, usually with the keyboard or a quick press, and they want the facts of this one act. Mode: Operate.

**Outcome and proof.** The author reads what will go, in their own words, and decides. Success is a reflexive Enter that commits nothing, and a list of names that makes the decision without a trip back to the card.

**Selected direction.** Inside the established register. A dialog is a ruled record slip lifted over the page. It reads top to bottom: the question, the facts as term and value, the notes, the two controls. No new tone, no new motion, no icon. `DESIGN.md` stays the authority, and only its Dialogs entry grows.

**Scope.** Every dialog in the studio area, and the eight prompts. Production-ready. Everything behind the dialog stays untouched. Anti-goals: a filled destructive button, a side inspector, machine values outside a Developer view, a toast.

**States and ranges.** Facts run from none (leaving a draft) to a group's 28 names. A name runs to 200 characters. Busy, refused and blocked states exist. The studio runs from 420px up.

**Interaction and layout.** The heading takes the Headline style in the author's own capitals. Facts sit in two columns on one baseline, and stack below 30rem. The controls stand in a sticky footer under a hairline, confirm first and Cancel last. A long body scrolls under that footer, with Cancel in view from the start. Focus opens on Cancel, wraps at both ends, and returns to the opener.

**Constraints.** Native `<dialog>`, compiled styles, the literal `studio-dialog` class for `::backdrop`. English in the studio catalog, German-length tolerant. Assumption: 34rem still fits a names list, since the list wraps and scrolls.

From `web-design-guidelines`: a sticky footer must not cover the focused element, so the body keeps a scroll padding at the footer's height. A button names its act ("Leave without saving"). A long name wraps. `overscroll-behavior: contain` stays.

From `vercel-composition-patterns`: explicit parts over boolean props, children over render props, and `use()` for context under React 19.

## Decisions

### D1. One frame, explicit parts

```tsx
<StudioDialog
  heading={t("removeStep.heading").replace("{step}", () => label)}
  triggerRef={triggerRef}
  onCancel={onCancel}
  confirm={<DestructiveConfirm onClick={onConfirm}>{t("removeStep.confirm")}</DestructiveConfirm>}
>
  <DialogFacts>
    <DialogCount term={t("removeStep.incomingTerm")} count={2} />
  </DialogFacts>
  <DialogNote>{t("dialog.noUndo")}</DialogNote>
</StudioDialog>
```

`panels/shared/StudioDialog.tsx` exports these:

| Part | Renders |
|---|---|
| `StudioDialog` | The `<dialog>`: `h2`, the described body, the sticky footer with `confirm` and Cancel |
| `DestructiveConfirm`, `PrimaryConfirm` | `.btn .btn-secondary .btn-destructive` and `.btn .btn-primary`; disabled while busy |
| `DialogFacts` | The `dl`. It renders nothing when no child renders a row |
| `DialogFact` | One row, value in the written face |
| `DialogCount` | One row, value in mono tabular figures. It renders nothing at zero |
| `DialogNames` | One row, value a `ul` of names with no marker. It renders nothing for an empty list |
| `DialogNote` | One slate paragraph at 0.9rem |
| `DialogWarning` | The warning callout's form, for a blocked publish or a key collision |
| `DialogRefusal` | The `role="alert"` paragraph plus a closed Developer view for the server's text |
| `DialogDeveloperView` | A closed `details` holding one `DialogFacts` of mono values |

`StudioDialog` takes these props: `heading`, `triggerRef`, `onCancel`, `confirm?`, `busy?`, `initialFocusRef?`, `children`. Cancel is not a prop, so no caller can omit it, relabel it or put it first. `confirm` is a slot holding an explicit variant. A boolean `destructive` would hide the button's own class from the call site.

`busy` reaches the two confirm variants through a context read with `use()`. Cancel takes it directly. `initialFocusRef` serves the start picker alone, whose first choice is safe and whose Cancel would cost a keypress.

`DialogFacts` decides "no row renders" from its children: a falsy child, or a `DialogCount` at zero or a `DialogNames` with an empty list, renders no row. It filters with `Children.toArray` and a small predicate on those two component types.

Alternative: a single `ConfirmDialog` with `facts` and `notes` arrays. It reads shorter at a simple call site, but Publish and the import preview would need escape hatches on day one.

### D2. Layout, and the footer that stays

```text
dialog: width min(34rem, 100vw - 32px); max-height 85vh; overflow-y auto;
        padding max(16px, ring reach) on three sides, 0 on the block end;
        scroll-padding-block-end 5rem
  h2           Headline style, margin 0 0 12px, overflow-wrap anywhere
  div[body]    id for aria-describedby
  div[footer]  position sticky; bottom 0; surface ground; 1px hairline on top;
               12px block padding; flex wrap; gap 8px
```

The dialog stays the one scroll box, so arrow keys scroll it with Cancel focused. `showModal()` runs, then the hook focuses with `{ preventScroll: true }`, so the heading stays in view and Cancel stands in the footer.

The inner `h2` overrides the global `h2`'s uppercase, tracking and slate through a compiled style. Each dialog therefore prints the author's label as they typed it. That closes ACCORDION-17's first half.

A body's `DialogRefusal` scrolls into view when it appears, with `block: "nearest"`, so a refusal under a long list is seen.

Facts grid:

```text
dl: grid; columns minmax(0, max-content) minmax(0, 1fr); gap 4px 12px; align-items baseline
below 30rem: one column, with 8px above each term after the first
dt: Legend style    dd: body text, overflow-wrap anywhere
```

Alternative: a flex column whose body alone scrolls. The body would then need a `tabIndex` that follows its overflow, since a scroller with no focusable child takes no keyboard. The sticky footer avoids that.

### D3. The keyboard hold

`panels/shared/dialogFocus.ts` holds two functions:

```ts
/** Where Tab goes from `active`, or undefined when the browser's own step is right. */
export function wrapTarget<T>(focusables: readonly T[], active: T | null, shift: boolean): T | undefined;

/** The dialog's Tab stops: visible, enabled, and outside a closed `details` unless it is that one's `summary`. */
export function dialogFocusables(dialog: HTMLDialogElement): HTMLElement[];
```

`wrapTarget` answers the first stop on a forward Tab from the last one, and the last on a backward Tab from the first. An `active` outside the list answers first or last by direction. An empty list answers undefined.

The hook adds one `keydown` listener on `document` while the dialog is open. The listener lives on the document because a click on a dialog's text leaves the focus on `body`, where a listener on the dialog never hears Tab.

The diagnosis in `docs/decisions.md` guessed at the three focus mechanisms racing. The hold no longer depends on it: the browser's step past the last stop never runs, so nothing leaves the dialog.

Alternative: leave the wrap to the platform, as the spec says today. That is the defect.

### D4. The focus return

`useStudioDialog(triggerRef, initialFocusRef)` moves into `StudioDialog.tsx` and stays private. It keeps the three mechanisms the old hook's comment explains, widens `triggerRef` to `RefObject<HTMLElement | null>`, and its cleanup still focuses that ref. A caller still clears the ref when a confirm removes or remounts the opener, and then places the focus itself.

When `busy` falls back to false with the dialog still open and the focus outside it, the frame focuses Cancel. Both controls were disabled meanwhile, and a disabled control drops the focus.

A caller without a stable ref writes `document.activeElement` into its ref at the press. React's commit-time `autoFocus` has already moved the focus by the time a passive effect runs, so the hook cannot capture it itself. `activeControl()` in `dialogFocus.ts` does that read and narrows to `HTMLElement`.

| Dialog | Opener | After a confirm |
|---|---|---|
| Leave | whichever control held the focus; a popover's `hidePopover()` has already handed it to the account trigger | the route changes |
| Arrange | the Arrange button | stays on Arrange |
| Restore | Restore unsaved changes | the existing `focusTabButton`, ref cleared |
| Kind change | the kind select | stays on the select |
| Technical | the checkbox | stays on the checkbox |
| List discard | the row's Discard draft | the row's name link, else Import, ref cleared |
| Template delete | the row's Delete | the key input, ref cleared |
| Template replace | Create template | the key input, ref cleared |
| Start picker | + New process | the route changes |
| Import preview | Import | stays on Import |

`onCancel` on the native event calls `preventDefault()` and then the caller's `onCancel`, unless busy. The caller unmounts the dialog, so the platform never closes a dialog React still holds. A busy dialog ignores Escape, as its disabled Cancel already says.

### D5. The leave prompt goes asynchronous

`confirmLeave` answers synchronously today. It becomes `askLeave(proceed)` in `root.tsx`:

```ts
const [leaving, setLeaving] = useState<(() => void) | undefined>();
const leaveTrigger = useRef<HTMLElement | null>(null);
const askLeave = (proceed: () => void) => {
  if (!dirtyRef.current) return proceed();
  leaveTrigger.current = activeControl();
  setLeaving(() => proceed);
};
```

`guardedNavigate`, `guardedGo` and `guardedLogout` call it. No caller of the guards reads a result, and each press ends with the guarded call. `onDiscarded` clears the dirty state before it navigates, so a discard still raises nothing.

The route effect that clears `dirtyRef` also clears `leaving`, so a browser Back under an open dialog closes it. A `401` ends the session by unmounting the area, so it asks nothing.

### D6. The other seven prompts

Each is a small named component in `panels/confirmations.tsx`, so a static-markup test can read its words:

`LeaveDraftDialog`, `ArrangeDialog`, `RestoreOverChangesDialog`, `KindDropDialog`, `TechnicalClearDialog`, `DeleteTemplateDialog`, `ReplaceTemplateDialog`. `panels/DiscardDraftDialog.tsx` serves the header bar and the process list.

- `onArrange` keeps its order: the dialog runs before the layout library loads. Its body moves into `runArrange`, and a press with nothing hand-placed runs that at once.
- `restoreStash` splits the same way, into `askRestore` and `runRestore`.
- `changeKind` loses `confirmDrops`. `KindPicker` holds `pendingKind: { raw, dropped }` and runs the write on a confirm. The select stays controlled, so a decline leaves it on the old kind.
- `toggleTechnical` holds `pendingTechnical: count`. The checkbox stays controlled in the same way.
- `field-usage.ts`'s comment on `needsTechnicalToggleConfirm` is rewritten. The function stays.
- `TemplatesScreen.tsx`'s `create` splits into `askCreate` and `runCreate`. A decline keeps the key and the source in the form.

### D7. The sentences

Catalog keys are new unless a row says otherwise. `dialog.cancel` replaces `draftToolbar.dialogCancel`, `fieldCatalog.removeDialogCancel` and `dataSources.removeDialogCancel`. `dialog.noUndo` ("The studio has no undo.") replaces `removeStep.noUndo`, `kindSwitch.noUndo` and `dataSources.removeDialogNoteNoUndo`. Each prompt's old key leaves, and `i18n-catalog-parity` stays green.

| Dialog | Heading | Body | Confirm |
|---|---|---|---|
| Leave | Leave this draft? | Your unsaved changes go with it. The saved draft stays. | Leave without saving |
| Arrange | Arrange every step? | Every step moves to a new place, and each path loses the bends placed on it. + no undo | Arrange |
| Restore | Replace your current changes? | The restored copy takes their place. + no undo | Replace them |
| Kind, format | Change the kind of “{field}”? | The new kind cannot keep this field's format. + no undo | Change kind |
| Kind, control | same | The new kind cannot keep how this field asks for its value. + no undo | same |
| Kind, both | same | The new kind keeps neither this field's format nor how it asks for its value. + no undo | same |
| Technical | Mark “{field}” as technical? | Count "Required and read-only settings it clears". The process fills this field in by itself, so no step can require it or make it read-only. + no undo | Mark as technical |
| Template delete | Delete “{name}”? | Processes already created from it stay as they are. + no undo | Delete template |
| Template replace | Replace “{name}”? | A template keeps no earlier version, so the old one goes. Processes already created from it stay as they are. | Replace template |
| Discard (both) | Discard this draft? | Fact Process, fact Last saved where known. The published versions stay. Only the unpublished draft goes. | Discard draft |
| Publish | Publish this draft? | unchanged | Publish |
| Import | Import this published version? | Fact Process, fact Source version. The note stays. Developer view: Key, Process id, Source hash | Publish here |
| Start picker | Start a new process | the choices | none |

The start picker's heading is a statement on purpose: it offers a choice and confirms nothing.

The import's collision warning reads "Another process already uses this internal name. Importing leaves both, and a published process cannot be deleted." Its Developer view adds the other process's id. "internal name" follows `studio-checks-by-subject`'s word for a key.

### D8. Remove field names its reach

`FieldRemovalReach` keeps its counts, so `hasReach` and the walk's tests stand. It gains `sites`:

```ts
sites: {
  fieldsInside: DraftField[];
  steps: DraftStep[];
  writers: WriterSite[];                 // { step, position, path? }
  contract: ("input" | "output")[];
  columnMappings: DraftField[];          // the staying field carrying the mapping
  celReads: (string | number)[][];       // JSON path from the draft root
  pluginSettings: (string | number)[][]; // same
};
```

The walk in `fieldRemovalReach` tracks the JSON path as it goes. A kept expression pushes its path, and a kept setting pushes its path.

`panels/removalNames.ts` turns `sites` into words, with `removalNames(draft, reach, contentLocale)`. `EntityTabs.tsx` calls it once per press beside the reach. Each list drops duplicates, since two rules on one place read the same, and no count prints in this dialog.

| Term | Value |
|---|---|
| Fields inside it | each field's label |
| Asked on | each step's text |
| Written by | a writer's place, table below |
| Part of | "What this process takes in", "What this process gives back" |
| Filled in from | the staying field's label |
| Read by | the same place words as the field card's Read by section |
| Named in a setting on | a step's text, a data source's key, else "This process" |

| Writer position | Words |
|---|---|
| `onEntry` | What happens when {step} is entered |
| `onExit` | What happens when {step} is left |
| `onCancel` | What happens when {step} is cancelled |
| `onPath` | What happens on {step}'s way out {wayOut} |
| `onFire` | What happens when the time limit on {step} runs out |
| `outputMapping` | the existing `readBy.childOut` |

`readByRows.ts` exports `readByPlaces(draft, paths, contentLocale)`. Both it and `readByRows` read one `placeOf`. A place with a key that no longer resolves falls to the existing `readBy.other`.

Notes: "Removing it takes it off every form and clears what writes to it." always. "Every field inside the group leaves with it." for a group. "What reads it or names it in a setting stays as written. Check each one before you publish." where a read or a setting stays.

The owner's "counts only" variant of 2026-09-13 ends here. The inherited point FIELDCARD-25 and FIELDS-22 name this route, and the orchestrator added it to this change's brief.

The heading already names the field, so the facts lose the Field or Group row and the key. The same holds for Remove this step's Step row. Remove data source moves the name into the heading: "Remove “{source}”?". A dialog with no count left renders no `dl`.

### D9. REMOVED plus ADDED where a scenario reverses

Three requirements keep their names under MODIFIED: the leave prompt, the discard dialog and the publish dialog. Two base requirements state a look the deleted stylesheet fixed, and "counts" names a rule that goes:

- `studio-app`, "The removal dialog counts each kind of reach": REMOVED, and ADDED as "The removal dialog names each kind of reach".
- `studio-app`, "Discarding a draft's confirmation dialog renders from compiled styles": REMOVED. The frame's ADDED requirement carries it.
- `studio-publish`, the publish dialog's compiled-style requirement: REMOVED for the same reason. Its "traps focus" scenario moves into `spa-accessibility`.

At sync, each ADDED requirement moves to its removed predecessor's place.

### D10. The `.btn` join

`panels/shared/btn.ts` exports `btn(classes, ...style)` and `ghost(...style)`, moved from `FormEditorScreen.tsx`. `ChangeList.tsx`, `FormTabStrip.tsx` and `EditScreen.tsx`'s `ghostBack` drop their copies. `ToolsScreen.tsx`, `PlayerScreen.tsx` and `VersionsScreen.tsx` write `className="btn btn-ghost"` beside `stylex.props`, and the compiled class wins. They take `ghost(styles.studioBack)`. That closes NAMES-6.

`StudioDialog` uses `btn("studio-dialog", styles.dialog)` for the literal class.

### D11. Tests

| What | Where |
|---|---|
| No `confirm(` call anywhere in `src/areas/studio`; no `<dialog` and no `showModal(` outside `StudioDialog.tsx` | `studio-no-confirm.test.ts`, rewritten to walk the directory |
| `wrapTarget` at both ends, from outside the list, and with an empty list | `studio-dialogFocus.test.ts` |
| Frame markup: label, description, Cancel's `autofocus`, part order, count in mono, and no row at zero | `studio-studioDialog.test.tsx` |
| Each prompt's heading, body and confirm label | `studio-confirmations.test.tsx` |
| `sites` per kind, and the words per place | `studio-fieldRemoval.test.ts`, `studio-removalNames.test.ts` |
| Wrap in a real browser, the leave dialog, the focus return | `e2e/dialog.e2e.ts` |

The existing tests that read markup or source follow the new names.

## Risks / Trade-offs

- [`askLeave` could run `proceed` after the world moved] → the route effect clears `leaving`, and the modal blocks every other control.
- [A second Escape under a busy dialog] → Chromium's close watcher can skip `cancel` on a repeat press and close the dialog. It then stays mounted and closed until the request ends. Publish runs for under a second, so this stays a known edge, marked with a `ponytail:` comment in the frame.
- [Keyboard wrap misses a Tab stop] → `dialogFocusables` reads the DOM at each Tab, so an opened Developer view counts. A missed stop still wraps correctly, since `wrapTarget` acts at the ends alone.
- [A sticky footer covers the focused element] → `scroll-padding-block-end` at 5rem keeps a Tab stop clear. A footer that wraps at 420px stands taller, and the browser check measures it.
- [A names list grows long] → it scrolls, and the footer stays. The group case in the spec prints 28 names.
- [The owner chose counts on 2026-09-13] → the inherited points and the brief reverse it. The report states this.
- [Tests that quote removed catalog keys] → the typecheck and the suite name them, and `CatalogKey` is a closed union.

## Migration Plan

No data moves and no route changes. The change ships as one PR. Rollback reverts it.

## Open Questions

None.
