## 1. The field-kind table and its readers

- [x] 1.1 Add the named field-kind table beside `ALLOWED_BY_TYPE` in
  `src/schema/definition.ts`. Index into that table rather than
  restating it. Verify `bun run typecheck` prints no error
- [x] 1.2 Add a test synthesizing one body per kind entry. Run
  `compileProcessBody` over each one. `checkFieldFormatControl` is
  module-private, so reach it through the exported pass. Verify the
  named test passes in a full run
- [x] 1.3 Add a test asserting the publishable direction over the
  curated kind list. Every named kind passes the compile pass. The
  omitted triples keep the JSON view as their route. Verify the named
  test passes
- [x] 1.4 Point `baseTypeForPaletteKind` in
  `packages/web/src/areas/studio/draft/mintField.ts` at the engine
  table. Keep the five palette names and the drop behaviour. Verify
  `packages/web/test/studio-mintField.test.ts` still passes
- [x] 1.5 Decide the rail row's word in
  `packages/web/src/areas/studio/draft/field-type-labels.ts`. The row
  names the kind, from the engine table. The catalog lookup waits for
  the keys task 4.1 adds, since `CatalogKey` is a closed union, and task
  4.2 performs it. Verify
  `packages/web/test/studio-fieldTypeLabels.test.ts` covers the new
  source

## 2. The move helper

- [x] 2.1 Add the move helper to `fieldCatalogLogic.ts`. It moves one
  field into a group and out of it. Verify a unit test covers three
  moves: in, out, and between two groups
- [x] 2.2 Add a unit test over the moved field's keys. It asserts the
  `id`, the `key` and every other key survive. Verify no view entry and
  no column mapping changes
- [x] 2.3 Add a unit test over `examples/purchase-requisition.json`. A
  move keeps the body publishable. Verify the named test passes

## 3. The check-zone data path

- [x] 3.1 Add `loc: string` to `EditorIssue` in
  `packages/web/src/areas/studio/draft/issues.ts`. Every reader keeps
  working. Every writer stops compiling until 3.2 lands, so read the
  typecheck at the end of 3.2 rather than here
- [x] 3.2 Carry the `loc` through `validation.ts`. Today line 16 reads
  `item.loc`, resolves the entity, and drops it. The Zod loop at lines
  83 to 94 holds a path array, so join it. Cover the two direct
  constructions too: `checkViewFlags` and
  `checkUnwrittenTechnicalFields`. The `issue` helper in
  `packages/web/test/studio-edit-panel-rail.test.ts` writes the shape
  too, and the typecheck reads that file. Verify a unit test reads a
  `loc` off a produced `EditorIssue`
- [x] 3.3 Add a pure
  `packages/web/src/areas/studio/panels/fieldCheckZone.ts`. It maps a
  `loc` suffix to a zone id, and answers `undefined` for the
  top-of-half fallback. Verify a `bun:test` covers `.key`,
  `.options[2]`, `.validation` and an unmapped suffix

## 4. The catalog strings

- [x] 4.1 Add every new key to `packages/web/src/i18n/catalogs/studio.ts`.
  The keys cover the zone headings, the kind names, both empty states
  and the move announcement. Verify `bun run typecheck` prints no error
- [x] 4.2 Read every author-facing string through the studio catalog's
  `t`. That includes the kind names task 1.5 leaves in
  `field-type-labels.ts`, which no component grep reaches. The rebuilt
  components arrive in groups 6 and 7, so run the grep for a bare
  literal once they stand

## 5. The layout foundation

- [x] 5.1 Add the three-region layout to
  `packages/web/src/areas/studio/app.css`. Verify the rules name the
  order list, definition, effect below the breakpoint. Task 6.1 draws
  the two halves, so the browser shows that stack from there on
- [x] 5.2 Turn the list into a disclosure header at the narrow width.
  Verify the header carries `aria-expanded` per `spa-accessibility`
- [x] 5.3 Add the panels screen's own rule for
  `.studio-checks-rail-docked`. The existing rule keeps a 2px
  `border-top` and drops the other three, because `.canvas-inspector`
  draws the box. This screen draws no such box, so name the edges it
  has to draw itself. Task 7.4 mounts the docked summary, so read the
  result there

## 6. The Fields view rebuild

- [x] 6.1 Replace the three tabs in `FieldCatalogPanel.tsx` with the two
  halves. Verify the browser shows both halves and no tab set
- [x] 6.2 Lay the definition half's five zones out under their own
  headings, ruled apart. Verify each heading renders in the order the
  spec names
- [x] 6.3 Lay the effect half's four zones out. "Used in" leaves its
  disclosure, and "Column mapping" moves across. Verify the usage list
  shows with nothing opened
- [x] 6.4 Place each field check at its zone, through
  `fieldCheckZone.ts`. An unmapped `loc` stands at the definition
  half's top. Two comments in `FieldValidationEditor.tsx` go stale
  here, and both need correcting. One rests on the claim task 3.1
  ends, the other names the Rules tab. Verify a broken key draws its
  check inside "What this field asks"
- [x] 6.5 Leave the group child rows' own check list in place. It shows
  the child's own checks, and the zones show the selected field's.
  Verify a child's check still renders on its row
- [x] 6.6 Add the effect half's empty state and its route to a step
  view. Verify an unreferenced field draws it in the empty tone
- [x] 6.7 Add `fieldRequiredOverrides` and `applyRequiredOverride` to
  `packages/web/src/areas/studio/draft/field-usage.ts`, beside the
  `visible` twins. Verify `studio-fieldUsage.test.ts` covers the read,
  the write and the disagreement
- [x] 6.8 Wire the "Ask for this" control to those two helpers. It
  carries a disagreement notice and two disabled states. Verify the
  browser shows all three
- [x] 6.9 Replace the type, format and control pickers with one kind
  picker reading the engine's table. Import the table over the existing
  `./schema` entry. Keep the plugin envelope and the named drop. The
  format and control label records lose their only reader, so drop both
  and their assertions in
  `packages/web/test/studio-fieldTypeLabels.test.ts`. Verify `bun run
  build` succeeds
- [x] 6.10 Add the empty-catalog start state. Verify a draft carrying no
  field renders it instead of the two halves

## 7. The rail and the screen

- [x] 7.1 Add the pointer drag and the keyboard move to the rail's field
  sub-list in `PanelsScreen.tsx`. Both call the helper from task 2.1.
  Verify both gestures move a field in the browser
- [x] 7.2 Keep focus on the moved entry. Announce the move through a
  live region. Verify the announcement names the field and its new place
- [x] 7.3 Name the kind, not the base type, on the rail row. It reads
  the same word the picker reads. Verify the row and the picker agree on
  a `{type: "string", format: "date"}` field
- [x] 7.4 Replace the screen's standing `ChecksRail` column with the
  `collapsed` form, docked at the bottom edge. Verify the screen lays
  out two columns with the summary below them
- [x] 7.5 Correct the `collapsed` prop comment in `ChecksRail.tsx`. It
  scopes the docked form to the step inspector's bottom edge, and task
  7.4 adds the panels screen. That task swaps a prop rather than
  removing a mount, so the `canPublish` comment's count of four still
  holds. Verify a grep finds four mounts
- [x] 7.6 Give the freed column width to the open view. Verify the
  Fields view's two halves both fit at the narrow breakpoint

## 8. Feedback and label width

- [x] 8.1 Add the tint a definition change draws on its effect row.
  Verify it is the only motion the two halves carry
- [x] 8.2 Let no control take its width from an English label. Verify
  the German content locale draws no clipped label

## 9. Design and accessibility passes

- [x] 9.1 Run `/impeccable critique` against the rebuilt Fields view.
  Resolve every finding it reports
- [x] 9.2 Run `/impeccable audit` against the same route. Resolve every
  a11y, responsive and performance finding
- [x] 9.3 Add the move gesture, the narrow-width stack and the German
  pass to `docs/browser-checks.md`. Verify each entry names its route
  and its expected result

## 10. Verification

- [x] 10.1 Run `bun run typecheck`, then `bun run build`, then the full
  `bun test` with `DATABASE_URL` set. Report what each one printed
- [x] 10.2 Pipe the test run through `scripts/gates/silent-green.sh`.
  Verify it reports no unset `DATABASE_URL` and no skip count above the
  floor
- [x] 10.3 Run `sh scripts/gates/range.sh < /dev/null | sh
  scripts/gates/prose.sh`. Verify it reports no rise
- [x] 10.4 Run `sh scripts/gates/range.sh < /dev/null | sh
  scripts/gates/whitespace.sh`. Verify it reports no finding
- [x] 10.5 Drive the rebuilt screen in a real browser over
  `examples/purchase-requisition.json`. Cover the empty catalog, a
  nested group, a move in and out, and an unreferenced field. Report
  what each case showed
