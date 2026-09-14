## Why

Every area screen caps its own centered column at a fixed width. A
participant or shell screen caps at 46rem, an operator screen (admin,
reporting, studio) at 60rem. Both read as too narrow for their content.

Widening each by roughly a third also clears a real defect. The Player
screen's own spec requires its form and record panes to sit side by side
above 64rem. Under the current 60rem cap that state stays structurally
unreachable today.

## What Changes

- Raise the operator screen cap (admin, reporting, studio areas) from 60rem
  to 80rem.
- Raise the participant screen cap (app area and the shell's own screens)
  from 46rem to 61rem.
- Replace 30 hardcoded `"46rem"` / `"60rem"` literals with two shared
  tokens. Each one is a screen's own outer cap, one per file across 30
  screen files. The next cap change then touches one place instead of a
  30-file sweep. A further 7 occurrences of the literal `"46rem"` stay
  untouched, in `components.tsx`, `ColumnEditor.tsx`, `ShareEditor.tsx` and
  (2 of its 3) in `ReportBuilderScreen.tsx`. Those 7 are a left-aligned
  caption/note-text measure, a distinct pattern unrelated to a screen's own
  cap. See design.md's Context.
- Fixes: the Player's own spec already specifies a reachable side-by-side
  state above a 64rem container width. That spec reads "The Player's form
  pane reflows to one column under a width threshold". Under the current
  60rem cap that state can never occur. The container can never exceed
  60rem, which is always below the 64rem threshold. Raising the Player's
  effective cap to 80rem makes the side-by-side state reachable for the
  first time.
- No change to the process surface's own viewport breakpoints
  (`NARROW = "@media (max-width: 64rem)"`) in `EditScreen.tsx`,
  `StepsRail.tsx`, `StepPage.tsx`, `FieldCatalogPanel.tsx` and
  `EntityTabs.tsx`. No change either to `MigrationSpecEditor.tsx`'s own
  64rem block cap. This proposal verified both as independent of the area
  caps this change touches. The process surface itself has no cap, and those
  breakpoints read the actual viewport rather than a capped container.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `end-user-app`: the app area's screen cap changes from 46rem to 61rem.
- `unified-shell`: every full-page state the shell itself renders shares the
  app area's cap, which changes from 46rem to 61rem. Those states are login,
  profile, the error-boundary fallback and the role-gate explanatory state.
  The occurrence in `App.tsx` renders that last one, so it is more than a
  wrapper.
- `admin-app`: the admin area's screen cap changes from 60rem to 80rem.
- `reporting-app`: the reporting area's screen cap changes from 60rem to
  80rem.
- `studio-app`: the studio area's screen cap changes from 60rem to 80rem.
  That cap covers Processes, Templates, Tools, Versions, the Player and the
  rest of the bare studio screens.

This proposal deliberately leaves `studio-player` out of that list. Its own
requirement text already specifies the side-by-side state above a 64rem
width. That text reads "The Player's form pane reflows to one column under a
width threshold". Its phrasing, "the form's own comfortable measure, not a
fixed device width", never named 60rem or any other cap.

Raising the studio-area cap this change makes via `studio-app` is what
finally lets the Player satisfy its own, unchanged requirement. No
requirement text there needs a rewrite, so `studio-player` gets no spec
delta. It gets an implementation task and a browser-verified scenario in
tasks.md instead.

## Impact

- `packages/web/src`: 30 files across `shell/` (4), `areas/app/screens/`
  (5), `areas/admin/screens/` (10), `areas/reporting/` (4:
  `ReportsListScreen.tsx`, `ProcessPickerScreen.tsx`,
  `ReportBuilderScreen.tsx`, `root.tsx`) and `areas/studio/screens/` (7).
  These are screen-level containers only; nested panels inherit their
  screen's cap. This change leaves `components.tsx`, `ColumnEditor.tsx` and
  `ShareEditor.tsx` (reporting) alone, as What Changes says.
- A new shared width-cap token pair, replacing the 30 hardcoded literals.
  Exact placement is a design.md decision.
- `DESIGN.md`'s Layout section (the two cap values), and
  `.claude/rules/design-language.md` / `tmp/Detent Design Language.dc.html`
  if either restates the numbers.
- No engine, schema, or API impact: a `packages/web` styling change only.
