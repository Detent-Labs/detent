## 1. The marker

- [x] 1.1 Invoke `/frontend-design:frontend-design` for the marker's visual
  direction; record what it decides in `design.md`
- [x] 1.2 Draw a second `<rect>` in the node group of
  `canvas/CanvasView.tsx`, when `step.type` is `"subprocess"`
- [x] 1.3 Place it at `x=4, y=4`, `width={NODE_WIDTH - 8}`,
  `height={NODE_HEIGHT - 8}`, `rx={0}`, after the outer rect
- [x] 1.4 Add `.canvas-node-subprocess` to `areas/studio/app.css`:
  `fill: none`, `stroke: var(--color-border)`, `stroke-width: 1`

## 2. The browser check

- [x] 2.1 Add a "Canvas subprocess marker" section to `docs/browser-checks.md`
- [x] 2.2 On a draft, confirm a subprocess step shows the rule and a task step
  shows none
- [x] 2.3 Switch a selected step's type both ways; confirm the marker follows
  with no reload
- [x] 2.4 Confirm a terminal subprocess step shows the marker and the outcome
  stamp, neither obscured
- [x] 2.5 Confirm the connect handle and the rename field draw over the rule,
  rather than under it
- [x] 2.6 Confirm the marker survives selection, the dark scheme, and a zoom
  away from 1

## 3. Verification

- [x] 3.1 `bun run typecheck`, then `bun run build`, in the devcontainer
- [x] 3.2 Full `bun test` with `DATABASE_URL` set; report pass, skip and fail
- [x] 3.3 Run the antislop linter over every Markdown file this change touches
- [x] 3.4 `git diff --check`, then `git ls-files --eol` for the `w/` column
