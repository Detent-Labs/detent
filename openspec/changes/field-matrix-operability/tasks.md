## 1. The badge's three states

- [x] 1.1 Add `bulkBadgeState` beside `bulkBadgeOn` in `fieldMatrixLogic.ts`
- [x] 1.2 Return `empty`, `mixed` or `full` from the eligible set
- [x] 1.3 Keep `bulkBadgeOn` as it is; the write path reads it
- [x] 1.4 Add a mixed style per flag: the flag's border and text, no fill
- [x] 1.5 Pick the style from the state, in code, per flag
- [x] 1.6 Test that mixed differs from empty and from full
- [x] 1.7 Test the state function against an empty, a mixed and a full set

## 2. The names and the counts

- [x] 2.1 Add the catalog key carrying both counts in one sentence
- [x] 2.2 Add the catalog key naming a column target
- [x] 2.3 Add the catalog key naming a row target
- [x] 2.4 Compute both counts from the eligible set the badge already builds
- [x] 2.5 Put the sentence in the badge's `title`
- [x] 2.6 Put the same sentence in the badge's `aria-label`
- [x] 2.7 Test that two badges for one flag carry different names
- [x] 2.8 Test that the name and the title carry the same two numbers

## 3. The keyboard

- [x] 3.1 Give every bulk badge `tabIndex={-1}`
- [x] 3.2 Extend the arrow handler from the first data row into the header row
- [x] 3.3 Move focus along the header row with the left and right arrows
- [x] 3.4 Return focus to the data rows with the down arrow
- [x] 3.5 Test that the grid is one tab stop with badges present
- [x] 3.6 Test that an arrow key reaches a header badge

## 4. The rest

- [x] 4.1 Add the empty state for a process declaring no field
- [x] 4.2 Add the empty state for a filter leaving no column
- [x] 4.3 Add both catalog sentences for those states
- [x] 4.4 Give the Hide-inert toggle a pressed style, picked in code
- [x] 4.5 Give a gated cell a reason in its `title`
- [x] 4.6 Give the same reason to a screen reader on that cell
- [x] 4.7 Add the catalog sentence for each of the two gating cases
- [x] 4.8 Raise the blank cell's dash to the contrast floor
- [x] 4.8b Give that dash a semantic role; it reads `neutral500` today
- [x] 4.9 Measure the badge and checkbox spacing against the 24 pixel floor
- [x] 4.10 Change the spacing only where the measurement falls short

## 5. Verification

- [ ] 5.1 Run `bun run typecheck` in the devcontainer
- [ ] 5.2 Run `bun run build` in the devcontainer
- [ ] 5.3 Run the full `bun test` with `DATABASE_URL` set
- [ ] 5.4 Pipe the log through `scripts/gates/silent-green.sh`
- [ ] 5.5 Walk the matrix in a browser at 1440x900
- [ ] 5.6 Confirm a mixed column reads differently from an empty one
- [ ] 5.7 Confirm the grid takes one tab stop, counted by hand
- [ ] 5.8 Confirm an arrow key reaches a header badge
- [ ] 5.9 Confirm a fieldless process states its empty result in words
- [ ] 5.10 Add the browser entry to `docs/browser-checks.md`
- [ ] 5.11 Run `/impeccable audit` on the matrix route
- [ ] 5.12 Run the prose gate over every changed Markdown file
- [ ] 5.13 Run the whitespace gate over the pushed range
