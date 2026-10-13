# Design

## Context

See `proposal.md` for the motivation.

<!-- antislop: allow synonym-rotation -->
<!-- "surface" names the process surface, a noun, and no verb of display. -->
The process surface mounts all eleven tab
bodies and hides the inactive ones with `hidden`. The glossary and `studio-app`'s
tab-mount requirement keep it so. The draft store runs `structuredClone` on
every `mutate` (`draft/store.tsx`). No subtree of the draft keeps its identity
between two keystrokes. Memoizing on a subtree cannot skip work. A body that
does not run at all can.

The change does not add a visual design. The only visible addition is the loading line
from decision 3, so the `/impeccable shape` step has nothing to decide. The
browser check still runs `critique` and `audit`.

Baseline: HEAD `e4431f1e`, production build, unthrottled headless Chromium. The
example is IT Offboarding with 51 fields and 12 steps. The probe types 20
characters into a Fields-tab label. The synchronous commit runs from the `input`
event to the end of React's commit.

| Round | Sync commit median | Max | To painted frame, median |
|---|---|---|---|
| 1 | 19.5 ms | 25.4 ms | 39.7 ms |
| 2 | 17.0 ms | 27.2 ms | 35.1 ms |
| 3 | 17.1 ms | 19.2 ms | 35.2 ms |

Per derivation, median of 30 runs under `bun` on the same example:

| Derivation | IT Offboarding | IT Onboarding (53 x 20) |
|---|---|---|
| bulk badges, all headers (`FieldMatrixGrid`) | 9.8 to 13.8 ms | 20.6 ms |
| matrix cells | 0.9 to 1.0 ms | 1.7 ms |
| `describeChanges` | 1.5 to 1.7 ms | 2.0 ms |
| `writtenFieldCounts` | 0.05 to 0.08 ms | 0.14 ms |

The bulk badges call `eligibleTargetEntries` up to nine times per row and
column. Each call reaches `cellEntry` and `gatedKeys`. Their `written` accessor
walks every step and every view entry with no cache.

Canvas drag, same build: a drag on the 12-step canvas gives a frame p50 of
10.5 ms and p95 of 11.1 ms. Both are vsync-bound, and no long task appears. A
synthetic canvas of 30 steps and 50 guarded paths costs 0.25 ms for
`buildOperands` and 0.33 ms for `guardEdgeLabel`. That is 0.6 ms per
`pointermove`. No file under `examples/` holds more than 4 guarded paths.

Chunk `root-*.js`: 548.04 kB (156.05 kB gzip). By sourcemap: cel-js 85 kB,
`@dagrejs/dagre` 47 kB, workflow-engine/zod 44 kB, `@panzoom/panzoom` 10 kB, and
studio code 356 kB. Inside the studio code: `FormEditorScreen` 17 kB, Player
6 kB, Versions 6 kB, MigrationPlan 5 kB, Templates 4 kB and Tools 4 kB.

## Goals / Non-Goals

**Goals:**

- Keep the synchronous commit per keystroke on IT Offboarding's Fields tab at
  4 ms or less, measured as above. Visible tabs do not regress (owner ruling
  2026-10-12).
- Bring the studio chunk well under 500 kB.

**Non-Goals:**

- Unmounting a hidden tab. The glossary keeps all eleven bodies mounted.
- Restoring structural sharing in the draft store.
- Guard-label memoization on the canvas, FIELDS-14, and any split finer than
  the three seams below.

## Decisions

### 1. A hidden body draws its last visible input

One hook, `useHeldWhileHidden(value, visible)`, returns `value` while `visible`
is true. Otherwise it returns the last value it saw while visible. It lives under
`draft/` beside the store. The rule sits in a pure function, `holdWhileHidden(held, value, visible)`, that the hook wraps. The unit test calls the function, since `renderToStaticMarkup` cannot observe a second render.

`FieldMatrixPanel` and `FieldMatrixGrid` read the draft through `useDraft()`.
`EditScreen` wraps the panel in a small `HeldDraft` component. `HeldDraft` reads
the live `DraftContext` value and passes it through the hook. It then provides
the held value to its subtree. The panel and the grid become `memo` components
with props that never change. While hidden, the provider value keeps its
identity, so neither re-renders. The commit that flips `visible` hands over the
live value, and both re-render once.

`ChangesView` keeps its `useMemo` over `describeChanges`, since the tab badge
reads `onCount`. It passes `{ rows, heading, onOpenRow }` through the hook
before `ChangeList`, and `ChangeList` becomes a `memo` component. The hook
freezes `onOpenRow` too. `EditScreen` builds that closure on every render, and
a fresh one would defeat the memo. Nobody can press a hidden row, so the stale
closure never runs. `VersionsScreen` mounts `ChangeList` as well. It works
unchanged, since `memo` costs nothing for a caller whose props change.

`visible` is `!jsonOpen && openTab === "<tab>"`, the expression `FieldsTab`
already receives.

The first browser run found that `FieldMatrixGrid` still ran while hidden. React 19
propagates a context change lazily. The panel bails out. React then walks up to
the changed outer `DraftProvider`. It marks the first `DraftContext` reader
below the panel, without comparing values. The held provider does not stop it.

So the panel reads the draft and passes `draft`, `mutate` and `contentLocale`
to the grid as props. The grid reads no context.

Alternatives. `useDeferredValue(draft)` keeps the work and only moves it off the
keystroke. The CPU cost stays, and a catch-up render follows every keystroke.
Memoizing on draft subtrees fails because `structuredClone` breaks identity.
Unmounting a hidden tab breaks the half-typed state rule.

### 2. The written accessor caches per (fieldId, step)

`writtenFieldCounts` returns an accessor closed over one draft. The accessor
gets a `Map` keyed by field id and step index. A second call for the same pair
returns the stored number. A new draft builds a new accessor and a new cache, so
nothing goes stale. This also speeds up the visible matrix tab. It is the only
step in this change that touches a visible path.

### 3. Three lazy seams

- `canvas/arrange.ts` imports `@dagrejs/dagre` inside `arrangeSteps` with
  `await import(...)`. The function becomes async. `hasHandPlacedStep` stays
  synchronous, since the confirm dialog needs it first. `onArrange` in
  `EditScreen` awaits the call. A failed load goes through the screen's existing
  failure path and leaves the layout untouched.
- `FormEditorScreen` loads through `React.lazy` in `EditScreen`. `PlayerScreen`
  does the same in `root.tsx`. Each sits inside a `Suspense` boundary local to
  its site, with one new studio catalog key for the loading line. The studio catalog has
  no generic loading text today, only per-screen keys such as
  `changesView.loading`. The line follows the waiting-state rule in
  `design-language.md`: one line, no skeleton, no spinner. The nearest other
  boundary belongs to the shell. It would replace the whole area, draft included, while the chunk
  loads.

Dagre alone brings the chunk to about 501 kB. Dagre, the form editor and the
player together take about 70 kB off. The "Measured after" section records the
real result.

Alternatives. Splitting `cel-js` or `zod` saves more, but both load on every
screen. Splitting Versions, Templates, Tools and the migration plan saves about
19 kB for four more `Suspense` sites. The owner ruled "nothing finer".

### 4. Validation keeps its input identity

The chaining effect in `DraftProvider` ran `syncLoadedTargets` on every draft
change. Each run returned a fresh object. The validation `useMemo` then ran a
second time per keystroke, for about 2.9 ms. Now `syncLoadedTargets` returns the
previous object when the ids and bodies did not change. Validation results stay
the same.

### 5. E1-6 closes as measured

A guard-label `useMemo` has to lift `edgeGuardLabel` out of the edge pass's
render loop. The loop computes the label beside the route and the label
placement. That is a restructure of the loop, longer than a few lines.
The measured gain is 0.6 ms per move, on a canvas larger than any example.

The finding closes with the numbers above. The `studio-canvas` spec already
requires a profile before further memoization. No spec text changes for it.

## Risks / Trade-offs

- [A held body shows a stale draft after `visible` flips] → The hook reads
  `visible` during render, and the flip is that render. A test asserts that the
  revealing commit prints the live draft.
- [A held provider starves a hidden effect] → The matrix and the change list
  run no such effect. A test selects a matrix cell
  and switches away. It changes the draft and switches back.
- [The first Arrange press pays one chunk fetch] → The confirmation, if any,
  runs before the fetch. The cost lands on a rare, deliberate command.
- [A failed chunk fetch strands the form editor route] → The local `Suspense`
  covers the wait. A rejected import reaches the area's `ErrorBoundary`, as any
  lazy area does today.
- [The 4 ms budget misses after the freeze] → The remaining commit is the Fields
  tab itself plus `describeChanges` and validation. Measure first. If it misses,
  report the number and escalate before widening scope.

## Migration Plan

None. The change touches the browser bundle only. It does not add stored state or touch an API or the definition contract. Rollback is a revert of the merge.

## Open Questions

None. The owner rulings of 2026-10-12 settle the budget and the chunk split.

## Measured after

Production build, same machine and method as the baseline. IT Offboarding, 20
characters typed into a Fields-tab label, two runs of three rounds each.

| Round | Sync commit median, before | Sync commit median, after | Paint median, after |
|---|---|---|---|
| 1 | 19.5 ms | 8.95 and 9.30 ms | 20.0 ms |
| 2 | 17.0 ms | 7.30 and 7.70 ms | 20.0 ms |
| 3 | 17.1 ms | 6.60 and 6.95 ms | 20.0 ms |

The sync commit fell by about 55 percent. The painted frame fell from 35 to
40 ms to 20 ms. The 4 ms budget is **not met**.

A CPU profile of the final build splits the remaining sync time. Validation takes 3.4 ms. The `describeChanges`
call takes 1.3 ms. The Fields tab and the other mounted bodies take 2 to 3 ms.

Validation runs synchronously in `DraftProvider`, so the budget cannot hold
without deferring it. A deferral changes what the check results, the Checks badge
and the publish gate read. It needs its own change.

A hidden matrix and a hidden Changes panel record 0 DOM mutations and 0 renders
per keystroke. The Fields panel records 270 to 545 mutations as the control. A
selected matrix cell survives a round trip. The first frame after the switch
draws the live draft.

Canvas drag, 60-step mouse drag on the 12-step canvas: frame p50 10.5 to
10.6 ms, p95 11.1 to 11.5 ms, 0 long tasks. This matches the baseline.

Chunks from `bun run build`, with no Vite size warning:

| Chunk | Size | gzip |
|---|---|---|
| studio root | 225.82 kB | 63.57 kB |
| `EntityTabs`, shared by the root and the form editor | 246.14 kB | 68.88 kB |
| `dagre.esm` | 46.53 kB | 15.82 kB |
| `FormEditorScreen` | 23.83 kB | 7.06 kB |
| `PlayerScreen` | 6.26 kB | 2.50 kB |

The old single studio chunk weighed 548.04 kB. The largest chunk is now 246 kB.
An author loads the root and `EntityTabs` on the first studio visit, 472 kB
together. The other three load on demand.
