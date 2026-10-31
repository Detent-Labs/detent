# Proposal

## Why

The process surface carries eleven tabs. Six of them print engine structure
where an author looks for their work. Those are Paths, Field matrix, Data
sources, Contract, Changes and Access. The Paths tab prints CEL in a table.

The owner decided the cut on 2026-10-30 in `docs/studio-ui-concept.md`,
decision D2. The six tabs read Map, Steps, Fields, Forms, Checks and
Settings. This is change 9 of stage 64. It builds on change 2, which shipped
on 2026-10-31.

## What Changes

- The tab row reads Map, Steps, Fields, Forms, Checks and Settings. Map
  holds the canvas. The canvas keeps its name as the graph surface.
- The Paths tab goes. The step page's Ways out section already holds every
  path a step leaves, so a path has one home. A check about a path opens
  Steps on the owning step, with that way out highlighted.
- The Field matrix tab becomes the Fields tab's second view. A sub-row under
  the tab row reads Catalog and Where fields appear. The matrix keeps its
  toolbar, its count line and its legend.
- A Settings tab gathers what the `⋮` menu's first group and three tabs
  held. Its sub-row has four entries. They read Process, Where values come
  from, What it takes in and gives back, and Access. The Process view holds four settings. They are the base
  language, the add-a-language control, the cancellable setting and the two
  collaboration defaults. The key stands in a Developer view there.
- The assignment-groups link stands on the Settings tab's Access view.
- The `⋮` menu keeps one group, Views: the JSON surface, Versions and
  Player.
- The Changes tab goes. The Publish dialog gains a Changes row. It reads
  "N changes since version K" and opens the change list on request. The
  Versions screen compares the saved draft against its base as soon as it
  opens. The change list's rows lose their open-a-tab command, which the
  Versions screen never offered.
- Old addresses map onto the new places. The address `/edit/canvas` opens
  Map, and `/edit/paths` opens Steps. The address `/edit/matrix` opens the
  matrix view. Each of `/edit/dataSources`, `/edit/contract` and
  `/edit/access` opens its Settings view. The address `/edit/changes` opens
  the Versions screen. The retired `/edit/panels/:view` addresses follow the
  same map.
- The change list groups take the author's words. They read Ways out, Where
  values come from, and What it takes in and gives back. The glossary gains
  the contract row of the concept's vocabulary table.
- `src/schema/definition.ts` stays as it is. No API changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-process-tabs`: six tabs, the sub-row, the Settings tab, the
  one-group menu, the address map, and where a check lands.
- `studio-app`: the process-wide views move onto Fields and Settings. The
  Paths view and the Changes tab go. The change list keeps its rules, and
  the base language moves to Settings.
- `studio-publish`: the publish dialog states the changes since the base
  version and shows the change list on request.
- `process-version-inspection`: the Versions screen compares the saved
  draft against its base when it opens.
- `studio-guided-vocabulary`: the vocabulary table gains the contract row.
- `spa-accessibility`: the roving-tabindex clause names the six-tab row.

## Impact

- `packages/web/src/areas/studio/routing.ts`: the tab list, the view
  sub-state and the old-address map.
- `packages/web/src/areas/studio/draft/process-tabs.ts`: counts, the
  check target and the step that owns a path, timer or action.
- `packages/web/src/areas/studio/screens/EditScreen.tsx`: six bodies, the
  Fields views and the Settings tab.
- `packages/web/src/areas/studio/panels/`: `ProcessTabRow.tsx`,
  `ProcessHeaderBar.tsx` and `ChangeList.tsx` change. Five files are new:
  `SubRow.tsx`, `SettingsTab.tsx`, `ProcessSettingsPanel.tsx`,
  `FieldsTabViews.tsx` and `PublishChanges.tsx`. Three go: `PathsView.tsx`,
  `pathRows.ts` and `ChangesView.tsx`.
- `packages/web/src/areas/studio/screens/VersionsScreen.tsx`: the
  draft-against-base comparison on load.
- `packages/web/src/areas/studio/root.tsx` passes the route's view.
  `draft/changeSet.ts` reads the contract group's new key.
  `draft/held-while-hidden.tsx` loses its unused hook. A new
  `panels/publishChangesLogic.ts` holds the dialog row's sentence picker.
- `packages/web/src/i18n/catalogs/studio.ts`: tab, sub-row, settings and
  dialog strings. The Paths, Changes and menu-group strings go.
- Tests under `packages/web/test/` follow. The routing, process-tabs, tab
  row, process surface, change list, vocabulary and held-while-hidden tests
  change. New tests cover the sub-row, the Settings tab and the dialog's
  changes row. `studio-pathRows.test.ts` goes.
- `.claude/rules/ui-glossary.md`, `docs/authoring-guide.md`,
  `docs/browser-checks.md`, `docs/decisions.md`, `docs/decisions-archive.md`,
  `docs/current-state.md`, `openspec/config.yaml` and `ROADMAP.md` follow
  the cut.
- No schema, dependency or migration change.
