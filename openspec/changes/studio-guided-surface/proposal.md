## Why

The studio splits one authoring job across two screens. The edit screen
carries the canvas ribbon over a bench. The panels screen carries the six
process-wide views behind its own index rail. An author adds a field, puts it
on a form and routes on it. That walk crosses the boundary three times.

The controls also speak the definition contract at the author. A step is
"performed by" something, a path carries a "guard", a step is "terminal". Those
words are correct in the JSON and wrong on a screen aimed at somebody who
writes no JSON. Stage 27 names no-code authoring as the target. This
vocabulary is what still blocks it.

The Claude Design project "Studio editor redesign" holds seven explored
directions. "Studio B Guided v4" is the one to build. It replaces both screens
with one tabbed process surface. It words every authoring control in plain
language.

## What Changes

- **BREAKING** One process surface replaces the edit screen and the panels
  screen. A tab row carries ten tabs in authoring order, each with its own
  count. Those are Canvas, Steps, Fields, Data sources, Paths, Forms, Field
  matrix, Contract, Changes and Checks. One sub-state carries the open tab:
  `/studio/processes/:id/edit/:tab`. It takes the place of
  `edit/panels/:view`, and the index rail goes with it.
- The chosen direction shows eight tabs and names no home for two of today's
  six process-wide views. Data sources and Contract join the tab row on the
  same footing as Fields and Paths. Nothing the studio edits today loses its
  place.
- A new Steps tab holds the guided path through a process. A numbered steps
  rail stands left of one wide step page. The page carries previous and next
  controls in reachability order.
- The step page replaces the configuration pane's collapsible section register
  with a flat two-column register. Path to, Assignment, Which process it calls
  and How the case ends stand left. On entry, On exit, Time limit and Step form
  fields stand right. Every section prints its own open issues beside its
  heading.
- A new Forms tab lists one card per task step. Each card holds a miniature of
  that step's form and opens the form editor.
- The form editor gains a live participant preview beside its canvas. The
  preview mounts the same `packages/form-ui` renderer the Player mounts.
- A plain-language label layer words every authoring control. "Performed by"
  becomes "Assignment", a terminal step becomes "An end", a guard becomes
  "Taken only when". The definition contract does not move.
- Every step page carries a Developer view disclosure holding that step's
  JSON. The contract's own words stay reachable there.
- Versions, Player and the JSON surface move from the screen nav into an
  overflow menu on the tab row. The Structure and JSON pair beside the header
  bar goes with them. Checks, Save, Discard draft and Publish move into the
  studio's area nav. Checks reads there as a state dot with a count.
- The header bar's own menu keeps what stays process-wide. That is the process
  key, the base locale, the add-locale control and the link to the admin area's
  assignment groups. Save, Discard draft and Publish leave that menu.

Out of scope: the definition contract, the canvas's own gestures and the
condition builder's semantics. Also out of scope: migration planning, the
Tools screen, the Templates screen and the Player.

## Capabilities

### New Capabilities

- `studio-guided-vocabulary`: the plain-language label layer. It gives one word
  per authoring concept. It maps each word to its definition-contract term. The
  contract's word stays reachable in a Developer view.
- `studio-process-tabs`: the one tabbed process surface. Its tab set, its
  counts, its overflow menu, its routing and its keyboard model.
- `studio-step-page`: the guided step page and its steps rail. The two-column
  section register, the per-section issue line, and the walk through the
  process.
- `studio-forms-overview`: the Forms tab. One card per task step, its
  miniature, and the route into the form editor.

### Modified Capabilities

- `studio-app`: the tabbed surface replaces the panels screen and its index
  rail. The routing requirements, the six-views requirements and the
  field-matrix toolbar requirements move onto tabs.
- `studio-canvas`: the structure surface no longer lays out a ribbon over a
  bench. The canvas becomes one tab. The steps rail and the step page replace
  the steps register and the configuration pane.
- `studio-checks-rail`: the rail docks on the tab row instead of the ribbon
  bar, and opens as the Checks tab.
- `studio-json-view`: the JSON surface opens from the tab row's overflow menu,
  not from a surface toggle beside the header bar.
- `studio-form-editor`: the editor gains the participant preview. It opens from
  the Forms tab as well as from a step.
- `studio-publish`: the confirmation dialog names the version, the open issue
  count and the unsaved state.

The condition builder already words its operators plainly, already carries the
"Only when" heading, and already carries a CEL disclosure. It needs no
requirement delta. The tab row conforms to `spa-accessibility`'s standing tab
pattern, so that capability needs no delta either.

## Impact

- `packages/web/src/areas/studio/`: every file under `screens/`, `panels/` and
  `canvas/`, plus `routing.ts` and `root.tsx`. The
  `screens/EditScreen.tsx` and `screens/PanelsScreen.tsx` pair collapses into
  one surface component.
- `packages/web/src/i18n/catalogs/studio.ts`: the label layer rewords every
  authoring string. The new tabs and sections add keys.
- `packages/web/src/shell/`: the shell's own chrome stays as it is. The studio
  passes its Checks, Save and Publish controls through the existing `nav` prop.
- `.claude/rules/ui-glossary.md`: four terms replace the edit screen and panels
  screen entries. Those are the process surface, the tab row, the steps rail
  and the step page.
- `docs/authoring-guide.md`: every passage naming a screen or a control by its
  old word.
- `packages/form-ui`: consumed only.
- The engine, the HTTP wrapper and the definition contract: untouched.
