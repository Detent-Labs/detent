## Context

See proposal.md - Why. All three findings live in
`packages/web/src/areas/studio`. This design verifies each one against the
live files, not the 2026-08-04 audit's paraphrase, before proposing a fix.

`draftToolbarState.ts` (`packages/web/src/areas/studio/screens/`) already
went through one change: the archived `2026-08-05-simplify-web-logic-modules`
collapsed a two-kind action union down to a single `Draft` argument. That
change kept `useReducer` over `useState`. Its own design.md never argued for
the reducer itself; it argued only against the two-kind union.

The file's current top comment explains a different thing. The save/reload
*sequence* needed a pure, directly-callable transition function to drive
from `packages/web/test/studio-draftToolbarState.test.ts`. This
repo's only "component test" style renders through `react-dom/server`'s
`renderToStaticMarkup`, which fires no event and re-renders on no state
change. Reading that test file confirms every case calls
`savedBodyReducer`/`initialSavedBody` as plain functions, never through
React's dispatch mechanism. The reducer-vs-state question stayed open. The
test's own shape survives either choice.

Four studio files are a whole module for a one- or two-line expression.
Each has exactly one importer, grep-confirmed with comment-only mentions
excluded: `processHeaderLogic.ts`, `stepInspectorLogic.ts`,
`assignmentWarningLogic.ts`,
`toolsScratchpadLogic.ts`. The audit describes three of the four as carrying
"their own test." All four carry one today.
`packages/web/test/studio-processHeaderLogic.test.ts` exists and holds six
cases: a drift the audit's 2026-08-04 date explains, and this design
corrects.

`CanvasView.tsx` (`packages/web/src/areas/studio/canvas/`) repeats
`if (!x) return; setX({ ...x, current: toSvgPoint(e) })` across four
`on*PointerMove` handlers: node drag, group drag, waypoint drag, and
connect-drag. The marquee's `onMarqueePointerMove` guards the same way but
merges a different value into a different field:
`{ ...marquee, currentClient: { x: e.clientX, y: e.clientY } }`, the raw
client point, not `toSvgPoint(e)`.

## Goals / Non-Goals

**Goals:**

- Delete the reducer that is `useState` in disguise. Delete the three
  one-caller modules that carry no independent complexity. Delete the
  duplication across the five drag-move handlers.
- Keep every behavior, every scenario, and every test assertion that
  guards a real regression class intact.
- Leave `processHeaderLogic.ts` as its own module, on purpose.

**Non-Goals:**

- No visual change, no new component, no new hook.
- No change to the hard-coded assignment-warning string's wording, and no
  move of that string into the i18n catalog. It is already a raw string
  today. That is a separate concern from this change.
- No change to any drag gesture's threshold, drop resolution, or selection
  behavior. `CanvasView.tsx`'s consolidation touches only the duplicated
  `on*PointerMove` bodies.
- No change to `migrationPlanLogic.ts` or any other studio "Logic" module
  outside the four named above.

## Decisions

### `draftToolbarState.ts`'s reducer becomes `useState`, and the mount-time clone moves with it

```ts
const [savedBody, setSavedBody] = useState<Draft>(() => structuredClone(draft));
```

in `EditScreen.tsx` replaces
`useReducer(savedBodyReducer, draft, initialSavedBody)`. `EditScreen.tsx`
passes `savedBody`'s setter into `useDraftToolbarActions`
(`packages/web/src/areas/studio/panels/DraftToolbar.tsx`) as the
`onSavedBodyChange` prop. That prop moves from the bare `dispatchSavedBody`
to `(body: Draft) => setSavedBody(structuredClone(body))`. The clone
`savedBodyReducer` used to perform survives the move this way.

The two call sites that invoke the prop stay in `DraftToolbar.tsx`. They
need no change: `useDraftToolbarActions`'s `doSave` success branch calls
`onSavedBodyChange(draft)`, and its `reload` conflict-recovery branch calls
`onSavedBodyChange(body)`. Each already passes the value to store. The
clone now happens inside the wrapper `EditScreen.tsx` supplies.

The clone-on-write stays load-bearing exactly as documented. The panels
mutate the draft object in place. Storing the same reference would make
`savedBody` follow every later write. That would turn the dirty gate
permanently off. The `studio-app` save-conflict requirement depends on
that gate staying correct.

Passing the bare `setSavedBody` as the prop, with no clone wrapper, would
reproduce that regression. The `isDirty` value would look untouched while
the clone step it depends on quietly vanished. It has its own callers, and
it does not depend on how `savedBody` gets stored.

`savedBodyReducer` and `initialSavedBody` delete from
`draftToolbarState.ts`. `studio-draftToolbarState.test.ts`'s calls to them
become direct `structuredClone(...)` calls, or a small `cloneSavedBody`
helper if the test reads better with a name. Every existing case keeps its
assertion unchanged, including the mutation-vs-clone regression case: the
underlying clone semantics do not change.

### Three one-caller modules inline; `processHeaderLogic.ts` does not

**`stepInspectorLogic.ts`** (`openSectionForSelection`, a one-line ternary)
and **`assignmentWarningLogic.ts`** (`assignmentWarning`, a two-term guard
around one static string) both inline at their single call site in
`StepsPanel.tsx`. Their test files delete:
`studio-stepInspectorLogic.test.ts` (2 cases) and
`studio-assignmentWarningLogic.test.ts` (4 cases). Every case restates the
branch it tests. A reader gets the same information from the inlined code.

**`toolsScratchpadLogic.ts`** holds `extractFields`, a defensive
`typeof`/`Array.isArray` read over unknown JSON. It inlines at its single
call site in `ToolsScreen.tsx`. Its test,
`studio-toolsScratchpadLogic.test.ts` (4 cases), deletes too.

Its sibling `migrationPlanLogic.ts` is a real multi-function module. This
change does not touch it. `extractFields` differs from it. It is a
stateless type-narrowing read with no reuse and no history of regression.

**`processHeaderLogic.ts` (`resolveBaseLocaleChange`) stays a separate
module.** This is a deliberate, partial rejection of the audit's finding 54.
It follows the same spirit as
`2026-08-05-simplify-web-logic-modules`'s own rejected finding for
`waitingLabel`. Three facts distinguish it from its three siblings.

**One.** It carries a real branch. `resolveAddLocaleAttempt(typed)` feeds a
ternary that decides whether to move the edited content locale. That is not
a single expression with no independent complexity.

**Two.** Its own test file's header comment names the reason the module
exists. The comment states it plainly. "This is the same documented
fallback `draftToolbarState.ts` takes." Both guard a *wiring* bug, not the
underlying gate function. `resolveAddLocaleAttempt` is already correct, and
it is also separately tested.

An author declares a new base locale, then keeps typing. Without this
module, every new entry would silently land under the stale content
locale. A test of the gate alone cannot see that.

**Three.** The audit's parenthetical "(three with their own test)"
undercounts today's state. `processHeaderLogic.ts` has six test cases of
its own. That drift is itself evidence. The audit's "one caller, so
inline" reasoning skipped weighing the branch or the test suite behind it.

Caller count alone settles nothing about extraction.
`draftToolbarState.ts` already establishes that principle. This change
states it as a requirement in `studio-app`'s "testable logic" clause (see
the spec delta). A future audit then does not re-flag this module on
caller count alone.

### `CanvasView.tsx`'s five drag-move handlers share one helper

Five handlers each do one thing: `onNodePointerMove`, `onGroupPointerMove`,
`onWaypointPointerMove`, `onMarqueePointerMove`, and `onHandlePointerMove`.
Each guards on its drag state being non-null. Four of them,
`onNodePointerMove`, `onGroupPointerMove`, `onWaypointPointerMove`, and
`onHandlePointerMove`, then merge a fresh `toSvgPoint(e)` into that state.
The marquee handler merges a different value into a different field
instead. It merges the raw `{ x: e.clientX, y: e.clientY }` point into
`currentClient`, not `current`. The marquee's own SVG-space read stays
where it already is, in `onMarqueePointerUp`'s `toSvgPoint(e)` call.

A small helper does the guard-and-merge once, for example
`trackPointer(drag, setDrag, patch)`. It takes the current drag state. It
takes that state's setter. It takes the partial patch to merge.

```ts
function trackPointer<T extends object>(
  drag: T | null,
  setDrag: (next: T) => void,
  patch: Partial<T>,
): void {
  if (!drag) return;
  setDrag({ ...drag, ...patch });
}
```

The helper's generic `T` matches whichever of the five drag-state shapes
the caller passes in. Its `Partial<T>` patch parameter covers the field
each caller merges, including the marquee's differently-named
`currentClient` field. Every caller supplies its own patch shape, so the
helper never assumes one field name.

Each caller computes that patch itself: `toSvgPoint(e)` for four gestures,
the raw client point for the marquee. The caller passes the result in. The
helper replaces all five bodies.

Every handler keeps its own name. Every handler keeps its own
`e.stopPropagation()` where it already has one. Every handler keeps its own
drag-state shape: `nodeDrag`, `groupDrag`, `waypointDrag`, `marquee`, and
`connectDrag` stay five distinct pieces of state with five distinct fields.
The `pointerdown` and `pointerup` handlers stay untouched. Every drag's
threshold and drop resolution stays untouched too.

The helper must stay a pure `setState` call with no other side effect. It
sits directly in the path of `studio-canvas`'s "Layout computation does not
re-run on pointer movement" requirement. Any added side effect there would
risk tripping it.

### Only `studio-app` gets a spec delta

None of the three findings changes observable behavior. Most of the touched
capabilities get no delta: `studio-canvas` for the `CanvasView.tsx` and
`stepInspectorLogic.ts` changes, and `studio-tools` for
`toolsScratchpadLogic.ts`. Every requirement's SHALL text and every scenario
in those specs stays word-for-word true before and after.

This mirrors `2026-08-05-simplify-web-logic-modules`. That change wrote
one delta. The delta covered its one behaviorally-visible change: the
login form's `required` attribute.

Three simplifications from that same change got no spec delta at all. Its
own reducer-collapse got none. The `nextRowId` counter removal got none.
Its catalog-fallback removal got none either.

`studio-app` is the one exception. Its delta changes spec text, not
application behavior.

<!-- antislop: allow passive-voice -->
The "Studio's testable logic is extracted from its components" requirement
gets a requirement-text rewrite. It also gains two new scenarios. This
change, and its predecessor, already act on that line in practice.
Extraction earns its keep on complexity, or on a documented regression
class. Caller count alone does not settle it.

This repo already treats its internal testability convention as a
requirement, the same way the existing requirement does. That makes this a
genuine requirement-text change, not one invented to satisfy validation.

## Risks / Trade-offs

- Deleting three test files loses their narrow coverage. Each deleted case
  restated the one- or two-line expression it tested. None of the three
  surviving expressions carries a branch a reader cannot already see at the
  call site.
- The `useState` conversion touches the one file the studio canvas screen
  depends on most. `EditScreen.tsx` wires `savedBody` into `DraftToolbar`.
  It also wires `savedBody` into `ProcessHeaderBar` and the publish-gate
  check. A browser check drives a save and a reload, not just the unit
  tests. A stale `savedBody` reference is exactly the bug class
  `draftToolbarState.ts` exists to prevent. Green unit tests alone already
  missed it once. The file's own comment documents that miss.
- Consolidating five drag handlers behind one helper risks a
  copy-paste-shaped regression. That happens if the helper's signature
  drifts from any one gesture's actual field name or actual value. The
  marquee's field is `currentClient`, not `current`, and the marquee merges
  the raw `{ x: e.clientX, y: e.clientY }` client point, not `toSvgPoint(e)`.
  The helper's signature must take the whole partial patch as a parameter,
  computed by each caller, rather than compute `toSvgPoint(e)` itself. It
  must not assume `current` or `toSvgPoint(e)` everywhere.

## Migration Plan

None. No stored data, no persisted definition, no HTTP contract, no schema
change. Every change stays inside the browser bundle. Rollback is
`git revert` of the change's commit(s).

## Open Questions

None. The Decisions section above resolves finding 54's per-file
disposition and the spec-delta scope, rather than deferring either.
