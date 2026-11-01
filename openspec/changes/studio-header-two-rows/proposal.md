# Proposal

## Why

Five rows stand above a draft's tab body. The shared header comes first, then
the screen nav with one back control, then an optional banner. The header bar
follows, then the tab row.

The header bar alone prints up to eleven items. Seven are facts: the name, the
key, the revision, the save state, a time, the hash and the locale badge. Three
commands and the menu follow. Most of them are machine values. Principle 2 of stage 64
says an author meets those only in a Developer view.

The owner rated m1, "Five chrome rows", "bothers me", and m2, "Nothing after
publish", "indifferent". Decision D8 (option 8a) settled the fix on 2026-10-30.
It asks for two header rows and a banner only for a real blocker. The machine
values move to Settings and the Publish dialog.

This is change 14 of stage 64 (`docs/studio-ui-concept.md`, section 8). It builds
on change 9, which shipped on 2026-10-31.

## What Changes

- The screen nav goes. Its back control joins the header bar as "← Processes".
- The header bar holds back, name, state, Test, Publish and the `⋮` menu.
- The state reads "Unsaved changes" or "Saved at 10:32", then "v2 published"
  where a published version exists.
- Save stands beside the state only while the draft holds unsaved work. Change
  15 removes it with autosave.
- The Test control opens the Player. The menu keeps its Player entry, per D2.
- Discard draft moves into the `⋮` menu, and the dialog returns the focus to
  the menu trigger.
- After a publish the state prints the new version and offers Versions, until
  the draft next changes.
- The content-locale switcher moves to the Settings tab's Process view. A note in
  the header bar names the language only while an author works outside the base
  language. That note opens Settings.
- The key and the revision leave the bar for Settings' Developer view. There
  the last published hash stands after a publish.
- The Publish dialog prints the key, the process id and the revision in a closed
  Developer view. It names the draft's languages when it holds more than one.
- The structural banner stands below the bar and reads as a sentence with no
  engine word. The failure and conflict banners keep their shape.
- The open menu's panel sits above the field matrix's sticky headers, since a
  destructive command now stands in it. That closes CHANGES-5.

No file under `src/` changes, and neither does the definition contract.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-process-tabs`: the menu's contents, the bar's controls and Save's place.
  It also takes the structural banner, Settings' Process view and the Access view's
  groups link, whose rules move here from `studio-canvas`.
- `studio-publish`: the dialog's facts and the state after a publish.
- `studio-app`: the discard dialog's trigger, the content-locale switcher's home,
  the leave guard's list of controls, and what a successful publish confirms.
- `studio-canvas`: the header bar requirement this capability still owns, and two
  compiled-style requirements.
- `studio-json-view`: the content-locale switcher no longer stands over the JSON
  surface.

## Impact

- Code: `panels/ProcessHeaderBar.tsx`, `screens/EditScreen.tsx`,
  `screens/draftToolbarState.ts`, `panels/ProcessSettingsPanel.tsx`,
  `panels/SettingsTab.tsx`, `panels/shared/ContentLocaleSwitcher.tsx` and the
  studio catalog. Comments change in `root.tsx`, `FormEditorScreen.tsx` and
  `DraftToolbar.tsx`.
- Tests: the header bar, finding fallback, process surface and Settings suites,
  plus `e2e/publish.e2e.ts`.
- Docs: `.claude/rules/ui-glossary.md`, `docs/authoring-guide.md`,
  `docs/browser-checks.md`, `docs/decisions.md`, `DESIGN.md`, `ROADMAP.md`.
- API: none.
