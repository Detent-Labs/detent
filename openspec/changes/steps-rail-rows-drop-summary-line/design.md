## Context

See proposal.md for why the line goes. This section covers only what shapes
the approach.

The component `StepsRail.tsx` renders one rail row per step. Under the label
sits a span holding `railRowSummary(step, processes, contentLocale)`. That
function lives in `panels/stepRailRow.ts`. It reads five catalog keys, four
helpers and the process list.

The rail is the line's one consumer. Each helper keeps another consumer after
the change:

- The step page still reads `assignmentWord`, `performedByFor` and
  `configuredFieldCount`.
- The subprocess picker in `SubprocessSpecEditor.tsx` still reads
  `processLabel`.
- The step page still reads the process list. The screen `EditScreen.tsx`
  fetches it once and hands it to the rail and the step page alike.

The web package's `tsconfig.json` sets `noUnusedLocals` and covers `test`. An
import or fixture the change strands fails typecheck, in a test file as much
as in source.

## Shape brief

The `/impeccable shape` pass ran on 2026-09-11. The owner confirmed its one
open decision that day.

- Job: an author scans the steps rail to pick a step. The row names the step,
  and the step page explains it.
- Outcome: each row reads as number, label and two move controls. A step with
  an open issue adds its badge.
- Scope: the line goes for all three step kinds. The owner chose that over
  keeping it for calls and ends.
- Untouched: the rail's width, row padding, the hairline, hover, the
  current-row marker, the badge and the move controls.
- Range: a long label still wraps onto a second line inside its row.
- Anti-goal: nothing takes the line's place. No kind stamp, no icon and no
  tooltip.

## Goals / Non-Goals

**Goals:**

- Remove the summary line from every rail row.
- Remove the code, catalog keys and tests that exist only for that line.

**Non-Goals:**

- Changing the rail's width or a row's spacing.
- Adding another way to tell step kinds apart in the rail.
- Changing the step page.

## Decisions

### Swap the requirement through REMOVED and ADDED

The delta removes "The steps rail numbers every step in reachability order".
It adds "The steps rail lists each step by number and label" in its place.

A MODIFIED block would have to keep both old scenario names. OpenSpec's
validator matches scenarios by exact name, and no marker drops one. Those
names are "A row summarizes its step" and "An end step names its outcome".
Kept over new bodies, each name would state the opposite of its scenario.

Alternative considered: RENAMED plus MODIFIED. The validator follows a rename
back to the old block, so the same check applies.

The added requirement spells out reachability order itself. The old one
pointed at the steps register, which no longer stands.

Two comments cite the old name: the `StepsRail` docblock and the header of
`studio-stepsRail.test.tsx`. Both change to the new name. The third citation
sits in the `railRowSummary` docblock and goes with that function.

### Remove the function rather than hide the line

The change removes `railRowSummary` and its span. Hiding the span with a style
would keep five keys, the helpers' imports and a prop alive. The file
`stepRailRow.ts` keeps `railRowIssues`, its other export.

Alternative considered: keep the function for a later consumer. No such
consumer exists, so the removal stands.

### Fold the identity wrapper into the label

The `identity` style stacks the label over the summary in a flex column. With
one child left, the wrapper adds a box and nothing else. The label's own span
takes over `flex: 1 1 auto` and `minWidth: 0`. The badge then still sits at
the row's trailing edge.

Alternative considered: keep the wrapper. It would carry a gap and a column
direction for a single child.

### Drop the process list from the rail's props

The rail stops taking `processes`, and `StepsRail.tsx` drops its
`ProcessSummary` import. The screen `EditScreen.tsx` keeps its one fetch,
since the step page reads the list. The comment above that fetch names the
rail today. It changes to name the step page alone.

The render test `studio-stepsRail.test.tsx` stops passing `processes`, and its
`PROCESSES` fixture goes. That edit lands with the prop's removal, not before.
Until then `railRowSummary` still runs and would call `find` on `undefined`.

### Remove the five catalog keys

Five keys leave `catalogs/studio.ts`: `stepsRail.fieldCount`,
`stepsRail.calls`, `stepsRail.callsNothing`, `stepsRail.ends` and
`stepsRail.endsNoOutcome`. The studio catalog carries English only, so no
second locale changes. A grep over `packages/web` for each key finds nothing
afterwards.

### Test each row's text

The render test swaps its three summary cases for three row checks, one per
step kind. Each check takes one `<li>` from the rendered rail and strips every
tag. Row one then reads `1Intake`, row two `2Credit check`, and row three
`3Done`. A move control's name sits in an attribute, so the strip removes it.

Today each row also holds its summary text, so each check fails against
today's code. A summary line added back under new wording fails it too. The
check reads the whole row's text.

The file's header comment drops "the summary lines" and cites the new
requirement name.

The unit test `studio-stepRailRow.test.ts` drops its `railRowSummary` block.
The `PROCESSES` fixture goes with it, and so do the `railRowSummary` and
`ProcessSummary` imports. Its header comment keeps only what the issue badge
reads. The clause on what a row prints under its label goes, and so does the
sentence on summary shapes.

The row checks test the delta's scenarios. They do not replace the browser
check. A summary line has never come back here, so the split rule in
`development-toolchain` sends that check to `docs/browser-checks.md`. Task
2.2 writes the entry.

### Correct the prose that names the line

Each stale comment or passage goes with the decision that owns its code:

- The `StepsRail` docblock changes here, and so does the `processLabel`
  docblock in `draft/guided-labels.ts`.
- The docblock in `draft/registerOrder.ts` changes here too. It cites the
  retired steps register requirement today, and changes to cite the added one.
- The passage on `panels/stepRailRow.ts` in `docs/current-state.md` changes
  here as well. Its sentence on `draft/roleStamp.ts` moves to the Forms tab
  paragraph, since `panels/formCardRows.ts` is that module's one reader.
- The doc comment on the `processes` prop and the fetch comment in
  `EditScreen.tsx` go with the process list.
- The comment on the `summary` style goes with the style.
- The `railRowSummary` docblock goes with its function. The unit test's header
  goes with that function's test block.
- The render test's header and its summary describe block go with the row
  checks.

## Risks / Trade-offs

- [The rail stops telling a call or an end from a task] → The step page's
  kicker names the kind. The owner accepted this on 2026-09-11.
- [An override on a removed key reaches no screen] → No deployment runs this
  engine, so no such override exists.
- [Archive appends the added requirement after the live spec's last one] →
  Only the reading order changes. No MODIFIED block can drop the old scenarios.

## Migration Plan

No stored data, API or definition changes. A revert of the change's commits
rolls it back.

## Open Questions

None.
