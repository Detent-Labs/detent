## 1. The group rules

- [x] 1.1 Invoke `/frontend-design:frontend-design` for the box's visual
  direction; record what it decides in `design.md`
- [x] 1.2 Add `canvas/groups.ts` with the group type and `groupBox(members)`:
  the members' bounding box plus a margin
- [x] 1.3 Add `hiddenStepIds(groups)`: every member of a collapsed group
- [x] 1.4 Add `anchorBoxFor(stepId, groups, positions)`: the collapsed group's
  box, or the step's own node
- [x] 1.5 Give `anchorSideToward` a size argument that defaults to the node's
- [x] 1.6 Give `routeThroughWaypoints` a size per end, defaulting the same
  way; it is the only function the canvas calls per path
- [x] 1.7 Cover all five in `packages/web/test/`: the box, the hidden ids,
  the anchor box, the sized anchor, the sized route

## 2. The layout blob

- [ ] 2.1 Read `layout.groups` in `EditScreen.tsx`; drop an entry that does
  not parse, and drop a member the draft no longer holds
- [ ] 2.2 Add the writers: group, ungroup, rename, collapse and expand
- [ ] 2.3 Pass the list and the writers into `CanvasView` and the summary

## 3. The canvas

- [ ] 3.1 Draw each group's box behind every node, carrying its name
- [ ] 3.2 Draw a collapsed group at the node size, with its name and count
- [ ] 3.3 Skip a hidden member's node, and skip a path between two of them
- [ ] 3.4 Anchor a path on the group box when its end sits in a collapsed one
- [ ] 3.5 Drag the box to move every member, each snapped to the lattice
- [ ] 3.6 Click the box to select exactly its members
- [ ] 3.7 Feed the marquee and the connect-drag the visible nodes, plus each
  collapsed group's own box
- [ ] 3.8 Add the box styles to `areas/studio/app.css`

## 4. The controls

- [ ] 4.1 Add a group control to the selection summary, refusing a set any
  group already holds
- [ ] 4.2 Show the group's name, collapse and ungroup controls when the
  selection matches its members
- [ ] 4.3 Add every new string to the studio i18n catalogs, EN and DE

## 5. The browser check

- [ ] 5.1 Add a "Canvas step groups" section to `docs/browser-checks.md`
- [ ] 5.2 Group three steps; confirm the box encloses them behind the nodes
- [ ] 5.3 Drag the box; confirm every member moves and lands on the lattice
- [ ] 5.4 Collapse; confirm the members go and a path from outside draws to
  the box
- [ ] 5.5 Expand; confirm every member returns to its own position
- [ ] 5.6 Save and reopen; confirm the group survives
- [ ] 5.7 Ungroup; confirm every step and path stays as it was
- [ ] 5.8 Marquee over a collapsed box; confirm it selects the members and no
  other hidden step
- [ ] 5.9 Bend a path into a group, then collapse; confirm the bend holds

## 6. Verification

- [ ] 6.1 `bun run typecheck`, then `bun run build`, in the devcontainer
- [ ] 6.2 Full `bun test` with `DATABASE_URL` set; report pass, skip and fail
- [ ] 6.3 Run the antislop linter over every Markdown file this change touches
- [ ] 6.4 `git diff --check`, then `git ls-files --eol` for the `w/` column
