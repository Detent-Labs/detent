## Why

An operator opens an instance to cancel it. The Cancel instance button reads
like any secondary button: ink text inside a divider-grey border. Yet
`DESIGN.md` states that a destructive action stays outlined in the accent.
That outline renders on no screen at all.

Line 144 of `tokens.css` gives `.btn-destructive` the accent `color` and
`border-color`. Line 162 gives `.btn-secondary` the ink `color` and the
divider `border-color`. Both selectors weigh one class, so the later rule
wins. Eight call sites pair the two classes, as the rule's own comment asks.

A browser measured it on 2026-09-11, on the form editor's group Remove
control. It computed `--color-text` and `--color-divider`, the same values as
a plain secondary button beside it.

## What Changes

- The `.btn-destructive` block moves below the `.btn-secondary` rules in
  `tokens.css`. Its accent `color` and `border-color` then win the cascade.
  On hover and while pressed, the secondary's ink wash stays. Text and border
  switch to `--color-accent-on-muted` there, because the plain accent measures
  under 4.5:1 on that wash.
- Two call sites carry `btn-destructive` without `btn-secondary`: the draft
  confirmation dialog (`ProcessHeaderBar.tsx:571`) and the canvas bar's remove
  control (`CanvasBar.tsx:394`). Each gains `btn-secondary`. Today, by reading,
  each keeps the browser's own button background and gets no hover wash.
- A `bun:test` assertion holds four facts. Three sit in `tokens.css`: the rule
  order, the hover and press rule's order and token, and the disabled rule's.
  The fourth is the pairing at every call site in `packages/web/src`.
- `docs/browser-checks.md` gains one walk across the ten destructive controls.
  It checks the accent outline at rest, on hover, while pressed, while
  disabled and under the focus ring.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `web-styling`: gains a requirement that a destructive control renders
  outlined in the accent, beside the secondary class, in every area.

## Impact

- `packages/web/src/shell/tokens.css`: one block moves. A hover and press rule
  and a disabled rule land beside it.
- `packages/web/src/areas/studio/panels/ProcessHeaderBar.tsx` and
  `packages/web/src/areas/studio/canvas/CanvasBar.tsx`: one class each.
- `packages/web/src/areas/studio/panels/FormsTab.tsx`: a comment-only change.
- One new test file under `packages/web/test/`.
- `docs/browser-checks.md`: one new walk.
- No engine, definition contract or catalog change. `DESIGN.md` and
  `.claude/rules/design-language.md` already state the rule, and neither
  changes.
