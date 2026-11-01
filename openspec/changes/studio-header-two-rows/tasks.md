# Tasks

<!-- antislop: allow-file synonym-rotation -->
<!-- Why: discard, remove, surface, render, cancel and stop each name a control or a gesture here. -->

## 1. The words and the state logic

- [ ] 1.1 Add the catalog keys of design D2 to D9 to `i18n/catalogs/studio.ts`, with one key per sentence.
- [ ] 1.3 Rewrite `app.draftIncomplete` to the sentence of D9.
- [ ] 1.4 Add `headerStateLine` to `screens/draftToolbarState.ts`, per D3.
- [ ] 1.5 Add `editingLocaleNote` beside it, per D7: the language name, or nothing, also for a malformed base locale (`resolveAddLocaleAttempt`).
- [ ] 1.6 Test both in `studio-draftToolbarState.test.ts`: dirty, saved, saved at a time, each with and without a version.
- [ ] 1.7 Test the note: base locale, another locale, absent base, part-typed base, an unnamed code, JSON surface open.
- [ ] 1.8 Run typecheck, then the full suite with `DATABASE_URL` set, both in the foreground. Name any failing test.

## 2. The header bar

- [ ] 2.1 Delete the screen nav from `EditScreen.tsx` and its two styles. Pass `onBack` to the bar, through the guarded `navigate`.
- [ ] 2.2 Render the back control first in the bar, per D10 and the `studio-canvas` delta.
- [ ] 2.3 Add `DraftStateLine` per D3 and D4, with the `role="status"` span, the mono version and no control inside it.
- [ ] 2.4 Delete the key, the revision badge, the timestamp, the published stamp and `ContentLocaleBadge` from the bar.
- [ ] 2.5 Stand Save beside the state only while dirty, with `aria-disabled` while saving and the focus rule of D2.
- [ ] 2.6 Add Test ahead of Publish per D5. Remove Save and Discard draft from the trailing cluster.
- [ ] 2.7 Add the menu's Draft group per D6. Point the discard dialog's `triggerRef` at the menu trigger.
- [ ] 2.8 Raise the panel's `zIndex` to 4 per D6.
- [ ] 2.9 Move the findings list out of the row, per D4. Keep its alert-free shape.
- [ ] 2.10 Hold `justPublished` in `EditScreen.tsx` per D4, and pass it down.
- [ ] 2.11 Render the Versions offer while `justPublished` stands, per D4.
- [ ] 2.12 Render the "Editing" note per D7, with `onOpenSettings` from `EditScreen.tsx`.
- [ ] 2.13 Add `onOpenSettings` in `EditScreen.tsx`. Inside the form editor call `leaveFormEditorFor("settings")`.
- [ ] 2.13a Otherwise call `goToTab("settings", "process")`, then `focusTabButton("settings")` if Settings is open, else `setPendingTabFocus("settings")`. `openTabFromRow` keeps the view, so skip it.
- [ ] 2.14 Move the structural banner below the bar, per D9.
- [ ] 2.15 Add the `leading` group and size the name input, per D10.
- [ ] 2.16 Rewrite the bar's doc comments and the comments in `root.tsx`, `FormEditorScreen.tsx` and `DraftToolbar.tsx` to match.
- [ ] 2.16a Drop `headerBar.revision`, `headerBar.lastSaved` and `headerBar.published`.
- [ ] 2.17 Fix `studio-processHeaderBar-publishGate.test.tsx`: Save absent when clean, present when dirty, `aria-disabled` while saving, and Test present.
- [ ] 2.18 There, assert the clean bar prints no key, no `rev.`, no hash and no locale select.
- [ ] 2.19 There, assert the just-published line and the Versions offer, and their absence when `justPublished` is false.
- [ ] 2.19a There, assert `role="status"` on the state, the back control's name, and Save present while dirty with `actions.error` set.
- [ ] 2.19b Fix `studio-processHeaderBar-findingFallback.test.tsx` for the new props, and assert the finding stands after `</header>`.
- [ ] 2.20 Fix `studio-processSurface.test.ts`: the menu holds `actions.discard` and no `actions.save` or `actions.publish`.
- [ ] 2.21 Assert in `studio-processSurface.test.ts` that `EditScreen.tsx` keeps no screen nav and renders the banner after the bar.
- [ ] 2.22 Fix `e2e/publish.e2e.ts`: assert `page.getByText(/v2 published/)`, and press the Versions offer in place of the "More actions" press. An open menu gives two "Versions" buttons.
- [ ] 2.23 Run typecheck, then the full suite with `DATABASE_URL` set, both in the foreground. Name any failing test.

## 3. Settings and the Publish dialog

- [ ] 3.1 Rename `ContentLocaleBadge` to `ContentLocaleSelect`, take it to the field rule per D7, and drop `contentLocale.legend`.
- [ ] 3.2 Stand it on `ProcessSettingsPanel.tsx` under the label of D7, between the base language and the add control. Correct the panel's doc comment.
- [ ] 3.3 Give `ProcessSettingsPanel` and `SettingsTab` the `revision` and `lastPublish` props, from `EditScreen.tsx`.
- [ ] 3.4 Print the revision, the version and the whole hash in the Developer view, per D8.
- [ ] 3.5 Test the panel: the select's label and options, the revision and the hash inside `<details>` only.
- [ ] 3.6 In `PublishConfirmDialog`, move the process id and the revision into a closed Developer view with the key, per D8.
- [ ] 3.7 Add the Languages fact per D8, read through one shared option-label function the select also uses.
- [ ] 3.8 Fix the dialog tests. Assert the machine values stand inside `<details>`, and the Languages fact for one and two languages.
- [ ] 3.9 Run typecheck, then the full suite with `DATABASE_URL` set, both in the foreground. Name any failing test.

## 4. The docs

- [ ] 4.1 In `.claude/rules/ui-glossary.md`, retire *screen nav*, rewrite the header bar row and paragraphs, and extend the Settings and Developer view rows.
- [ ] 4.2 Update `docs/authoring-guide.md` where it names the bar, Save, Discard draft, the Player and the two process checkboxes.
- [ ] 4.3 Update the `docs/browser-checks.md` entries that name these controls, and add an entry "The header bar's two rows".
- [ ] 4.4 Update `DESIGN.md` if a value it states moved, and FIELDS-8's quote of the old banner in `docs/decisions.md`.
- [ ] 4.5 File HEADER-1, the findings list's raw references, in `docs/decisions.md`. Task 5.6 settles CHANGES-5 and DRAFT-1 there.
- [ ] 4.6 Run the antislop linter on each touched Markdown file.

## 5. Verification

- [ ] 5.1 Run `bun run typecheck` and `bun run build`, and report the last lines of each.
- [ ] 5.2 Run the full suite: `rtk test sh scripts/dev-exec.sh sh scripts/test-gated.sh bun test`. Report its summary line.
- [ ] 5.2a Run the smoke flows: `sh scripts/dev-exec.sh bun run e2e`, with Chromium installed in a fresh pod first. Report the summary.
- [ ] 5.3 On the host, run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` and the same with `whitespace.sh`.
- [ ] 5.4 On the production build, read the bar in each state of the design brief at 1440 and 1024 wide.
- [ ] 5.4a At 1280 wide with a 40-character name and a blocker, type one character and compare Publish's rect before and after.
- [ ] 5.5 Check by keyboard: Save's focus rule, a refused save, a 409, the discard dialog's focus return and the bar's Tab order.
- [ ] 5.5a On a dirty draft press the back control, then Test, and cancel each prompt: the draft stays open, unchanged.
- [ ] 5.6 Sweep the open menu with `elementFromPoint` over the matrix at 1280 and the Map tab at 400 wide. Run a real discard.
- [ ] 5.6a Archive CHANGES-5 on that sweep. Record the discard under DRAFT-1. If it does nothing, stop and report it, since change 13 owns the cause.
- [ ] 5.7 Run a real publish: the version line, the Versions offer, its retirement after an edit and a save.
- [ ] 5.8 Check the "Editing" note on Steps, on Settings' Access view, in the form editor and over the JSON surface. Read the groups link's address.
- [ ] 5.9 Run `/impeccable critique` and `/impeccable audit`, and `impeccable detect --json` in place of the overlay.

## Workflow follow-up

- Run `openspec-verify-change`, then `openspec-sync-specs`, then archive.
- At sync, move each ADDED block to its removed predecessor's place. Then grep the old names and run `openspec validate <cap> --type spec --strict`.
- Rewrite the stage 64 status line in `ROADMAP.md`.
