## Why

Every area screen caps its own centered column at a fixed width — 46rem for
a participant/shell screen, 60rem for an operator screen (admin, reporting,
studio) — and both read as too narrow for their content. Widening each by
roughly a third also clears a real defect: the Player screen's own spec
requires its form and record panes to sit side by side above a 64rem width,
but the current 60rem cap makes that state structurally unreachable today.

## What Changes

- Raise the operator screen cap (admin, reporting, studio areas) from 60rem
  to 80rem.
- Raise the participant screen cap (app area and the shell's own screens)
  from 46rem to 61rem.
- Replace the 30 hardcoded `"46rem"` / `"60rem"` literals that are a
  screen's own outer cap — one per file, across 30 screen files — with two
  shared tokens, so the next cap change is a one-place edit instead of a
  30-file sweep. A further 7 occurrences of the literal `"46rem"`, in
  `components.tsx`, `ColumnEditor.tsx`, `ShareEditor.tsx` and (2 of its 3)
  in `ReportBuilderScreen.tsx`, are a distinct, unrelated pattern — a
  left-aligned caption/note-text measure, not a screen's own cap (see
  design.md's Context) — and are left untouched.
- Fixes: the Player's own spec ("The Player's form pane reflows to one
  column under a width threshold") already specifies a reachable
  side-by-side state above a 64rem container width. Under the current
  60rem cap that state can never occur — the container can never exceed
  60rem, which is always below the 64rem threshold. Raising the Player's
  effective cap to 80rem makes the side-by-side state reachable for the
  first time.
- No change to the process surface's own `NARROW = "@media (max-width:
  64rem)"` viewport breakpoints (`EditScreen.tsx`, `StepsRail.tsx`,
  `StepPage.tsx`, `FieldCatalogPanel.tsx`, `EntityTabs.tsx`) or to
  `MigrationSpecEditor.tsx`'s own 64rem block cap — verified independent of
  the area caps this change touches: the process surface itself carries no
  cap, and those breakpoints read the actual viewport, not a capped
  container.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `end-user-app`: the app area's screen cap changes from 46rem to 61rem.
- `unified-shell`: every full-page state the shell itself renders (login,
  profile, the error boundary fallback, and the role-gate explanatory
  state — `App.tsx`'s own occurrence, not just a wrapper, renders that
  last one) shares the app area's cap; changes from 46rem to 61rem.
- `admin-app`: the admin area's screen cap changes from 60rem to 80rem.
- `reporting-app`: the reporting area's screen cap changes from 60rem to
  80rem.
- `studio-app`: the studio area's screen cap (Processes, Templates, Tools,
  Versions, the Player, and the rest of the bare studio screens) changes
  from 60rem to 80rem.

`studio-player` is deliberately NOT listed here: its own requirement text
("The Player's form pane reflows to one column under a width threshold")
already specifies the side-by-side state above a 64rem width, in terms of
"the form's own comfortable measure, not a fixed device width" — it never
named 60rem or any other cap. Raising the studio-area cap this change
makes via `studio-app` is what finally lets the Player satisfy its own,
unchanged requirement; no requirement text there needs editing, so it gets
no spec delta, only an implementation task and a browser-verified scenario
in tasks.md.

## Impact

- `packages/web/src`: 30 files across `shell/` (4), `areas/app/screens/`
  (5), `areas/admin/screens/` (10), `areas/reporting/` (4:
  `ReportsListScreen.tsx`, `ProcessPickerScreen.tsx`,
  `ReportBuilderScreen.tsx`, `root.tsx`) and `areas/studio/screens/` (7) —
  screen-level containers only; nested panels inherit their screen's cap.
  `components.tsx`, `ColumnEditor.tsx` and `ShareEditor.tsx` (reporting)
  are untouched — see What Changes.
- A new shared width-cap token pair, replacing the 37 hardcoded literals.
  Exact placement is a design.md decision.
- `DESIGN.md`'s Layout section (the two cap values), and
  `.claude/rules/design-language.md` / `tmp/Detent Design Language.dc.html`
  if either restates the numbers.
- No engine, schema, or API impact — a `packages/web` styling change only.
