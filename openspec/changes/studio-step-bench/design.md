## Context

See `proposal.md` for why. This section states only what shapes the how.

The structure surface today is one grid in `screens/EditScreen.tsx`:
`12rem minmax(0, 1fr) 22rem`. The first column is `canvas/EditRail.tsx`,
holding the palette and four process links. The second is
`canvas/CanvasView.tsx`. The third swaps between `panels/StepsPanel.tsx`,
the group summary, and `panels/ChecksRail.tsx`. Below all three sits
`dock/EditorDock.tsx` with three tabs. `EditorArea` owns the selection, the
dock's open flag and its active tab.

`StepsPanel.tsx` renders three zones. Its behavior zone is a tab row driven
by a `BehaviorTab` union, a `defaultTabFor` helper and two reset effects.
The tab bodies are `PluginEnvelopeEditor`, `PathsPanel`, `TimersPanel`,
three `ActionListEditor`s and `SubprocessSpecEditor`. Those bodies are
sound and stay.

`screens/PanelsScreen.tsx` already lays out an index rail, an open view and
a docked checks summary. It switches views with `hidden`, keeps all four
mounted, and takes an `onShowStep` prop. `PANEL_VIEWS` in `routing.ts`
lists the four view names.

The shape round on 2026-09-04 ran three hands under seed `42c43c65` and
locked "The Bench with Canvas". The brief that round produced is the source
of the decisions below. A mockup drawn with the real `expense_approval`
definition sits at
`https://claude.ai/code/artifact/8a69ea83-733b-4790-b670-207024819da9`.

Four constraints bind every decision. DESIGN.md's visual language stays
fixed. Every component compiles its styles beside its module. Every string
comes from the studio catalog. Nothing in `src/` changes.

## Goals / Non-Goals

**Goals:**

- One editing surface for a step, with every fact visible before a click.
- One navigation idiom for process-wide views, on the panels screen.
- The configuration pane teaches the step's runtime order by its reading
  order.

**Non-Goals:**

- No change to what any panel body validates, mutates or persists.
- No change to the form editor, the JSON surface, the Player or publish.
- No answer to whether a participant should ever read `step.description`.

## Decisions

### Replacement, not a fifth screen

The bench replaces the structure surface's grid. The owner rejected two
alternatives on the mockup. A fifth screen beside Structure and JSON would
leave the tab-driven inspector in place. It would also put step editing on
two surfaces with two selection models.

An inspector anchored to the node would float over the graph. A floating panel needs a resting shadow.
DESIGN.md forbids one, so that alternative costs a design-language change.

### A section register, not a tab row

Tabs exist to fit content in 352px. At the pane's new width they only hide
which sections are empty. Every section head shows always, with its
resolved value or count in the mono face. That is the register row applied
to a step's configuration. It is what turns a debug panel into the record.

`BehaviorTab`, `defaultTabFor` and both reset effects in `StepsPanel.tsx`
go. The open set replaces them. It lives in `EditorArea` state, keyed by
step id, for the same reason the dock's flag lived there. The draft's
`layout` blob is per-draft, and one author's open set must not reach
another.

### Sections in runtime order

Entry, Assignment, Form, Paths, Timers, Exit. The order is the step's own
life, and it is also a dependency order. A timer names a path, a guard
reads a field, and an assignment can name a person field. Each section
references only what sits above it.

The three action lists split across Entry and Exit. Today's Actions tab
groups them by type. That grouping is implementation convenience.
`onEntry` fires on arrival and `onExit` on departure, and the author's
model is *when*, not *what kind*. `onCancel` joins Exit, since both are
departures.

### The masthead holds identity, and holds the description

`key` and `label` leave the form. They are the step's identity, not its
configuration. The label edits inline, the way the canvas already renames a
node (`canvas/inlineRename.ts`). Performed-by sits under the stamp because
it governs which sections list beneath it.

The description sits in the masthead too. A grep settled that.
`packages/form-ui` never reads `step.description`, and neither does the app
area. No participant reads it, so it is the author's own note.

The role stamp uses the existing tones. `Initial` takes open, `Task` and
`Subprocess` take settled, `End` takes dormant. No sixth tone.

### The checks summary in the ribbon bar

The collapsed checks rail moves to the ribbon bar. The owner rejected a
third column because it spends the width this change exists to buy. The
summary expands its grouped list in place, below the bar, pushing the bench
down. A disclosure, not a popover, so it casts no shadow.

`ChecksRail.tsx` keeps its collapsed presentation. Only its host changes.
The panels screen keeps its own docked summary untouched.

### The dock dissolves into the panels screen

With the canvas as a ribbon there is no strip below to host the dock.
`PANEL_VIEWS` gains `changes` and `paths`. `ChangesTab` and `PathsTab`
move out of `EditorDock.tsx` into two panels-screen views, and
`dock/pathRows.ts` moves beside them with its test. `EditorDock.tsx` goes.

The Changes view refetches its base when `baseVersion` moves. That was the
dock's rule, and it holds. On the panels screen the refetch runs once per
mount, the same as the dock's once per open.

### The process links move to the register's foot

<!-- Why: "edit rail" is the glossary's name for the column; a change is this proposal. -->
<!-- antislop: allow synonym-rotation -->
The edit rail goes, so its four links need a home. The steps register's
foot takes them, under a Process heading, now six with Changes and Paths.
The left column then reads as navigation whole: steps above, process-wide
views below. The ribbon bar was the alternative, and the mockup already
showed it collecting jobs.

### The palette moves into the expanded ribbon

`CanvasView` mounts whole in both ribbon states. It has no selection-only
mode, and this change builds none: a second code path through the canvas
would cost more than the band saves. The two states differ in height and in
whether the palette lists.

The palette needs a drop target with room, so it lists only when the ribbon
expands. An empty draft still needs one always-reachable add control. The
steps register carries it, and it calls the same draft mutation the palette
calls.

### Reachability orders the register

Rows follow reachability from the initial step, terminal steps last,
unreachable steps between. Terminal steps hold the draft's own order among
themselves.

The module `canvas/traversal.ts` walks the graph along paths for roving
keyboard focus. It stands as precedent for a graph walk in a pure module,
not as the implementation. Its `nextFocus` and `entryFocus` order visible
steps and groups for focus, not steps for a list. The register's order
derives
from its own pure module, with a `bun:test`, per the studio's
testable-logic requirement.

### One selection, two readers

The register and the ribbon read one selection from `EditorArea`. Neither
holds its own. That is what keeps a node click and a row click equivalent.
It is also why the several-steps group summary still shows in the pane.

### The dock's surviving decisions

`docs/decisions.md` records three decisions that outlive the dock's build
log and govern "later dock work". This change deletes the dock, so each one
needs an answer.

The Player stays rejected. Its reason was height, and a step form still
needs more than a band gives. `screens/PlayerScreen.tsx` keeps its route.

The two deferred tabs stay deferred, at the same cost. A
translation-coverage grid and a CEL scratchpad were each "a single entry in
a list once the dock exists". The panels screen's index rail is that list
now. Neither becomes cheaper or dearer.

The persist-nothing rule moves to the ribbon unchanged, and this design
already restates it. Open state lives in `EditorArea`, and `saveState.layout`
claims no key, because that blob is per-draft.

### Renamed requirements keep stale bodies

Three `studio-canvas` requirements rename from "identity zone" to
"masthead". OpenSpec's RENAMED changes the heading alone. Their bodies still
say "identity zone" after archive. The prose ratchet permits that debt, and
a task in the sync step sweeps the three bodies by hand.

## Risks / Trade-offs

- [A ribbon demotes the studio's signature surface] → the browser check
  verifies the bet with the owner. The band still shows
  the whole graph at fit scale, and expanding costs one click.
- [A short band cramps a drag gesture] → the control is one click away. The
  band still connects and selects, because `CanvasView` mounts whole in both
  states. No interaction needs a second code path.
- [Three action-list editors in one scrolling pane] → the masthead stays
  fixed, so identity and the issue count never scroll away. Sections
  collapse, and only content-bearing ones open by default.
- [Two places to select a step] → one state in `EditorArea`; see the
  decision above.
- [German section heads at 11px tracked uppercase] → heads wrap to two lines
  where needed. No head takes a fixed width.
- [Tests drive the behavior tabs and the dock] → they rewrite against
  section heads and the panels views. `test/` is swept for `role="tab"`,
  `dock`, and `BehaviorTab` before apply.
- [Live-spec prose debt] → every delta file starts at base 0, so the push
  gate checks every sentence in them. The three renamed bodies carry over
  as-is.

## Migration Plan

No data migration. The draft's `layout` blob gains no key, so a draft saved
under the bench opens under the old grid unchanged. Deploy is a build.
Rollback reverts the commit.

The glossary changes in the same commit as the code.

- *identity zone* becomes *masthead*.
- *behavior zone* becomes *section register*.
- *diagnostics drawer*, *dock* and *dock tab* go.
- *ribbon*, *steps register* and *configuration pane* join.

`docs/current-state.md` and `docs/browser-checks.md` follow.

## Open Questions

- Should a participant ever read `step.description`? An author writes the
  field and a translator localizes it, and no screen prints it. Deferrable:
  the answer changes no spec or task here.
