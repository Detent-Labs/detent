## Why

The 2026-08-04 ponytail audit's findings 53-55 flag three small pieces of
over-engineering inside `packages/web/src/areas/studio`. A `useReducer` in
`draftToolbarState.ts` ignores its incoming state: it is plain `useState` in
disguise. Four "Logic" modules wrap a one- or two-line expression behind a
whole file for exactly one caller each. Five drag-tracking handlers in
`CanvasView.tsx` repeat the same two lines.

Findings 52 and 56 from the same audit group stay out of scope here. Finding
52 already shipped in a separate change. The team resolved finding 56 as
not-applicable. None of the three remaining findings changes what the studio
does. Each is a same-behavior internal simplification.

This proposal verifies every finding line by line against the current
files, not the audit's paraphrase. The audit dates from 2026-08-04, and this
repo already touched `draftToolbarState.ts` once since, in
`2026-08-05-simplify-web-logic-modules`.

## What Changes

- `draftToolbarState.ts` loses `savedBodyReducer` and `initialSavedBody`.
  The prior change already collapsed both to a bare `structuredClone` call.
  `EditScreen.tsx` moves from `useReducer` to `useState` for `savedBody`. It
  keeps the clone-on-write the dirty gate depends on. `isDirty` keeps its
  current shape.
- Three of the four one-caller "Logic" modules inline into their sole
  caller. Their standalone test files delete with them:
  `stepInspectorLogic.ts` into `StepsPanel.tsx`, `assignmentWarningLogic.ts`
  into `StepsPanel.tsx`, `toolsScratchpadLogic.ts` into `ToolsScreen.tsx`.
- The fourth, `processHeaderLogic.ts`, **stays a separate module**. This is
  a deliberate, partial rejection of the audit's finding 54, not an
  oversight. See design.md's "Decisions" section for why. It carries a real
  branch and a six-case regression-guarding test suite, for the same
  reason `draftToolbarState.ts`'s own module exists.
- `CanvasView.tsx`'s five drag-move handlers (node, group, waypoint,
  marquee, connect-drag) each repeat the same guard-then-merge shape. Four
  of them merge a fresh `toSvgPoint(e)`. The marquee merges the raw client
  point into its own `currentClient` field instead. All five consolidate
  behind one small pointer-tracking helper. No drag gesture changes its
  behavior, its threshold, or its drop resolution.
- The `studio-app` requirement named
  <!-- antislop: allow passive-voice -->
  "Studio's testable logic is extracted from its components" gets a
  requirement-text rewrite. Its existing sentence splits into several and
  moves from passive to active voice. It gains a new paragraph too. That
  paragraph states the line this change, and its 2026-08-05 predecessor,
  already draw in practice.
- Extraction into a standalone pure module earns its keep on branching or
  state-machine complexity. It also earns its keep on a documented
  regression class. Caller count alone does not settle it. Neither does a
  component's own resistance to `renderToStaticMarkup`. The delta also
  rewords the existing scenario's WHEN/THEN wording. It adds two new
  scenarios too, distinguishing a one-caller expression that inlines from
  one that stays extracted.

No **BREAKING** changes. No HTTP contract, schema, or definition-contract
change. No visual change. `CLAUDE.md` still requires a real-browser check
for any UI change: green tests do not see stale UI state. This change
touches five live drag gestures plus the base-locale control's wiring.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-app`:
  <!-- antislop: allow passive-voice -->
  the "Studio's testable logic is extracted from its components"
  requirement gets a requirement-text rewrite. It also gains two new
  scenarios (see above). This is the only capability with an actual
  requirement-text change. Every other touched file is implementation-only,
  with identical behavior before and after. No other capability spec gets
  a delta.
- The prior change, `2026-08-05-simplify-web-logic-modules`, set this
  precedent. It wrote a delta only for its one behaviorally-visible
  change. It left its own reducer-collapse and `nextRowId`
  simplifications with no spec delta at all.

## Impact

- `packages/web/src/areas/studio/screens/draftToolbarState.ts`,
  `packages/web/src/areas/studio/screens/EditScreen.tsx`,
  `packages/web/test/studio-draftToolbarState.test.ts` (edited, not
  deleted: its `savedBodyReducer`/`initialSavedBody` calls become direct
  `structuredClone(...)` calls)
- `packages/web/src/areas/studio/panels/StepsPanel.tsx` (absorbs
  `stepInspectorLogic.ts` and `assignmentWarningLogic.ts`)
- `packages/web/test/studio-draftValidationLogic.test.ts` (edited: a
  comment repoints from the deleted `assignmentWarningLogic.ts` to the
  inlined logic in `StepsPanel.tsx`)
- `packages/web/src/areas/studio/screens/ToolsScreen.tsx` (absorbs
  `toolsScratchpadLogic.ts`)
- `packages/web/src/areas/studio/canvas/CanvasView.tsx`
- Deleted: `packages/web/src/areas/studio/panels/stepInspectorLogic.ts`,
  `packages/web/src/areas/studio/panels/assignmentWarningLogic.ts`,
  `packages/web/src/areas/studio/screens/toolsScratchpadLogic.ts`, and
  their three `packages/web/test/studio-*Logic.test.ts` files.
- `openspec/specs/studio-app/spec.md` (requirement-text rewrite, two new
  scenarios).
- `docs/browser-checks.md` (six new entries, one per task 5.1-5.6
  real-browser check. None qualifies for a `bun:test` assertion under
  `development-toolchain`'s "A browser check lands as an assertion or as a
  checklist entry" requirement).
- `docs/current-state.md` (two spots updated: the stale
  `toolsScratchpadLogic.ts` file reference, and the "reducer writes it"
  sentence about `savedBody`).
- No engine, HTTP, schema, or other-area change.
