<!-- antislop: allow-file synonym-rotation -->
<!-- Why: remove, discard and delete are three control labels the UI prints. -->
# Proposal

## Why

The studio asks before an irreversible act in two ways. Eight prompts call the browser's `confirm()`, and two of them hardcode English. Eight dialogs each carry their own copy of one `<dialog>`, and the copies have drifted.

Decision D7 of `docs/studio-ui-concept.md` chose one dialog form for every destructive action. Its keyboard hold has a known hole: Tab from Cancel lands on the page body before it wraps. The Remove field dialog also prints counts where the author needs names.

## What Changes

- One component, `StudioDialog`, renders every dialog in the studio. No other module writes `<dialog>` or calls `showModal()`.
- The eight `confirm()` prompts become dialogs. They cover leaving a draft, Arrange, restoring over newer changes and a process-list discard. They also cover both template prompts, a kind change that drops a setting, and checking Technical.
- A test scans the whole studio area for a `confirm(` call. The browser's own leave prompt stays for a tab close or a reload.
- The Tab key stays inside an open dialog, at both ends and after a click on its text.
- Every dialog returns the focus to the control that opened it. The start picker and the import preview did not.
- One form holds for every dialog:
  - The heading reads as a sentence in the author's own capitals, and a confirmation's heading is a question.
  - Cancel takes the secondary button, in ink. It holds the opening focus.
  - A count prints in mono, and each term shares a baseline with its value.
  - The dialog keeps a gutter at 420px and carries `aria-describedby`.
  - On a long dialog the Confirm and Cancel row stays in view.
- The Remove field dialog names what the removal reaches, in the author's words. The field's key leaves it.
- The discard dialog stops printing the draft revision. A process-list discard takes the same dialog. A refused discard reports inside it.
- The import preview moves the key, the process id and the hash into a closed Developer view.
- `DESIGN.md` gains the "Dialogs" entry that states this form.
- The `.btn` join helper moves into one shared module. Tools, Player, Versions and the migration plan take it, so their back controls regain the `.btn` look.

Inherited points this closes: ACCORDION-17, HEADER-7's second half, the keyboard trap, the three-dialog presentation gaps, FIELDCARD-25, FIELDS-21, FIELDS-22 and NAMES-6.

DRAFT-1 stays closed. Change 14 dropped it after two real discards, and nothing here reopens it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-app`: the one dialog form and its heading rule. Each converted prompt, the leave prompt, the discard dialog, and the removal dialog's names.
- `studio-publish`: the publish dialog takes the one form, and the backdrop route leaves its requirement.
- `studio-canvas`: Arrange confirms in the dialog form.
- `spa-accessibility`: a modal dialog holds the keyboard, returns the focus and states its name and description.
- `environment-promotion`: the preview holds machine values in a closed Developer view.

Section 8 of the concept names `studio-form-editor` too. The form editor raises no prompt and opens no dialog, and its spec says so, so no requirement of it changes.

## Impact

- New in `packages/web/src/areas/studio`: `panels/shared/StudioDialog.tsx`, `panels/shared/dialogFocus.ts`, `panels/shared/btn.ts`, `panels/confirmations.tsx`, `panels/DiscardDraftDialog.tsx`, `panels/removalNames.ts`.
- Gone: `panels/shared/confirmDialog.tsx`.
- Moved onto the new component: the eight dialogs, `root.tsx`, `EditScreen.tsx`, `ProcessesScreen.tsx`, `TemplatesScreen.tsx`, `FieldCatalogPanel.tsx`.
- Changed in support: `draft/field-removal.ts`, `draft/field-usage.ts`, `panels/readByRows.ts`, `panels/EntityTabs.tsx`, `panels/DraftToolbar.tsx`.
- Changed too: `panels/PublishChanges.tsx`, `panels/ChangeList.tsx`, `panels/FormTabStrip.tsx`, `screens/FormEditorScreen.tsx` and the four screens of design D10.
- `packages/web/src/i18n/catalogs/studio.ts`: the new sentences, and one `dialog.cancel` and one `dialog.noUndo`.
- `packages/web/test`, and `e2e/dialog.e2e.ts` for what only a real browser shows.
- `DESIGN.md`, `.claude/rules/design-language.md`, `.claude/rules/ui-glossary.md`, `docs/browser-checks.md`, `docs/decisions.md`, `docs/decisions-archive.md` and `ROADMAP.md`.
- No engine code and no HTTP route changes. `src/schema/definition.ts` stays as it is.
