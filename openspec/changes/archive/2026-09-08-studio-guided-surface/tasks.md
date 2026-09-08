## 1. Vocabulary layer

- [x] 1.1 Add `assignmentStrategyLabel` beside `fieldKindLabel`. A unit test
  proves an override reaches the name.
- [x] 1.2 Add catalog keys for the four shipped strategies. `bun run typecheck`
  proves the key union is exhaustive.
- [x] 1.3 Fall an unnamed strategy back to its registry type, in mono. A unit
  test covers one.
- [x] 1.4 Reword the performed-by control to the three plain phrases. The
  catalog then holds no "performed by".
- [x] 1.5 Reword the terminal badge and the strategy label. A grep finds
  neither old word.
- [x] 1.6 Add a duration control reading a number and a unit. A unit test
  round-trips `PT72H` as three days.
- [x] 1.7 Keep an unrepresentable duration in mono, unchanged on save. A unit
  test covers `P1DT4H30M`.
- [x] 1.8 Replace the raw id input with a process picker. The picker prints
  labels, never ids.
- [x] 1.9 Reword the subprocess binding pair. The catalog carries both plain
  strings.
- [x] 1.10 Add a catalog string for the absent assignment, which names no
  strategy. A unit test covers a step carrying none.
- [x] 1.11 Bound the time-limit number against the publish check's own window.
  A unit test covers a number that window cannot hold.

## 2. Process surface and tab row

- [x] 2.1 Add the `edit/:tab` route beside today's sub-states. A unit test
  covers ten names and the fallback.
- [x] 2.2 Map the six old panel view names onto their tabs. A unit test covers
  each old name.
- [x] 2.3 Build the tab row as a `tablist` of buttons. Each tab is its own tab
  stop.
- [x] 2.4 Compute each tab's count from the draft. A unit test covers a count
  rising after an author adds a step.
- [x] 2.5 Collapse the two screens into one surface component. No body unmounts
  on a tab switch.
- [x] 2.6 Move the canvas into the Canvas tab. Delete the ribbon and its bar.
  No canvas gesture test regresses.
- [x] 2.7 Move the six views onto their tabs. Delete the index rail. The bulk
  toggles and the legend still work.
- [x] 2.8 Add the overflow menu holding JSON, Versions and Player. The JSON
  entry names its own state.
- [x] 2.9 Delete the Structure and JSON pair from the header bar. The header
  bar carries neither control.
- [x] 2.10 Move Checks, Save and Publish into the area nav. The shell itself
  carries no studio control.
- [x] 2.11 Give the Checks control its state dot. A unit test covers blocker,
  advisory and clear.
- [x] 2.12 Open the owning tab from a Checks row. A unit test covers a step, a
  field and a path.
- [x] 2.13 Author every new component's styles as typed objects. The runtime
  injects none.
- [x] 2.14 Add the open issue count and the blocking-issue line to the publish
  dialog. A unit test covers a clean draft and one carrying a blocker.
<!-- antislop: allow synonym-rotation -->
<!-- "Discard draft" is the control's own name in the header bar menu. -->
- [x] 2.15 Leave the header bar menu holding the process group alone. It
  carries no Save, no Discard and no Publish. The menu keeps the process key,
  the base locale, the add-locale control and the admin groups link.

## 3. Steps tab: the rail and the step page

- [x] 3.1 Build the steps rail on the reachability order. A unit test proves
  the two orders agree.
- [x] 3.2 Give each row its number, summary and badge. A unit test covers three
  step kinds.
- [x] 3.3 Add the rail's reorder controls and its three add controls. The end
  rows refuse the out-of-range control.
- [x] 3.4 Build the step page masthead. Renaming the step reaches its rail row.
- [x] 3.5 Reparent the section bodies into two columns. Every section body
  keeps its own tests.
- [x] 3.6 Pick the section set from the step's kind. A unit test covers three
  step kinds.
- [x] 3.7 Route each issue to one section, by its heading. A unit test proves
  no issue lands twice.
- [x] 3.8 Add the previous and next controls, naming their steps. Each refuses
  the press at its end.
- [x] 3.9 Add the read-only Developer view disclosure. It stands closed on
  open.
- [x] 3.10 Fall the two columns back to one under 64rem. The breakpoint matches
  the bench's own.
- [x] 3.11 Open the Steps tab from Enter on a focused node. A pointer press
  selects alone.
- [x] 3.12 Delete the bench and the configuration pane wrapper. No import of
  them survives.

## 4. Forms tab and the participant preview

- [x] 4.1 Build the Forms tab as a reflowing card grid. A step without a view
  draws no card.
- [x] 4.2 Give each card its kicker, label, count and badge. An empty form
  takes the advisory color.
- [x] 4.3 Draw the miniature from the view order. The miniature takes no
  focus.
- [x] 4.4 Open the form editor from a card, and return on leaving. A unit test
  covers both directions.
- [x] 4.5 Mount the `packages/form-ui` renderer as the preview pane, inert. No
  second renderer exists.
- [x] 4.6 Follow the view's column count in the preview. A unit test covers one
  column and two.
- [x] 4.7 Print one control per manual path under the preview. An
  automatic-only step prints one submit control.

## 5. Documentation

- [x] 5.1 Replace the two screen entries in `.claude/rules/ui-glossary.md`. The
  antislop linter passes on it.
- [x] 5.2 Reword every old screen name in `docs/authoring-guide.md`. The guide
  names the JSON property `terminal`, and the concept an end step. The antislop
  linter passes on it.
- [x] 5.3 Rewrite the studio passages in `docs/current-state.md`. Rewrite the
  stale `EditScreen` comment in `packages/web/src/shell/App.tsx` as well. Every
  symbol they name still exists.
- [x] 5.4 Add the stage row to `ROADMAP.md`. The row names this change and its
  capabilities.
- [x] 5.5 Rename the `dock` namespace in `packages/web/src/i18n/catalogs/studio.ts`.
  Eleven keys reach `PathsView` and `ChangesView`. Six name nothing and go. No
  `dock.` prefix survives.

## 6. Verification

- [x] 6.1 Run `bun run typecheck`, then `bun run build`. Report what each one
  printed.
- [x] 6.2 Run the full `bun test` with `DATABASE_URL` set. Report the pass
  count and the skip count.
- [x] 6.3 Pipe that run through `scripts/gates/silent-green.sh`. The skip count
  sits at or under the floor.
- [x] 6.4 Run the prose gate and the whitespace gate over the pushed range.
  Both report the touched files.
- [x] 6.5 Walk the ten tabs in a real browser. No stale row, no dialog behind a
  modal, no route collision.
- [x] 6.6 Run `/impeccable critique` and `/impeccable audit` on both new tabs.
  Neither reports a blocking finding.
- [x] 6.7 Drive the tab row, the rail and the step page by keyboard. Every
  control is reachable and named.
