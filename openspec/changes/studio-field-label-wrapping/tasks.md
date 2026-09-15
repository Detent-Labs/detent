## 1. Field card style

- [x] 1.1 Add a second `stylex.create()` block in `FormEditorScreen.tsx`
  mirroring `FormsTab.tsx`'s `openControl` (mono face, 11px, `textMuted`
  turning to `text` on hover/active, transparent background turning to
  `surfaceMuted` on hover and a 14% ink color-mix on active, `minHeight:
  24`, `space.s2` block padding) and apply it in place of
  `className="btn btn-secondary"` at both of `formCardMoves`' consumers.
  One consumer is the field card's Move up, Move down and plain Remove
  (lines 1215-1223). The other is the group legend's own Move up and
  Move down (lines 1137-1142). Leave the group's `Remove ({count})`
  (line 1143) as `className="btn btn-secondary btn-destructive"`,
  unchanged. Both `FormsTab.tsx`'s `openControl` and `FormTabStrip.tsx`'s
  `control` apply their stylex block together with the literal
  `btn btn-ghost` base classes (never standalone) - match that, rather
  than reconstructing `.btn`'s padding/font-weight/layout properties by
  hand in the new block. Verify: `bun run typecheck` passes. The five
  migrated buttons no longer carry `btn-secondary`, and the group's
  Remove still does. The five DO carry the shared `btn btn-ghost` base,
  matching the other two authoring-command sites.
- [x] 1.2 Add a small `renderFieldKey(key: string): ReactNode[]` helper.
  It splits the key on `_`. It rejoins the pieces with a literal `_`
  immediately followed by a `<wbr />` element. Use it for
  `formCardKey`'s content where `isField` is true. Leave
  `formCardNotePreview` rendering the plain string, unchanged. Verify:
  covered by the unit test in task 2.1.
- [x] 1.3 Change `formCardKey`'s style from `overflowWrap: "anywhere"` to
  `overflowWrap: "break-word"`. Verify: `bun run typecheck` passes;
  visually confirmed in task 4.3.

## 2. Tests

- [x] 2.1 Add a unit test for `renderFieldKey` covering three cases. For
  one underscore, `full_name` gets a `<wbr>` right after `full_`. For no
  underscore, the text returns with no `<wbr>` at all. For adjacent
  underscores, `a__b` round-trips to the same visible text. Verify:
  passes under the full suite (task 4.2).
- [x] 2.2 Confirm `studio-formEditor-groupCanvas.test.tsx`'s existing
  `isButtonDisabled` assertions still pass unmodified - they check only the
  `disabled` attribute via string search on the button tag, not a class,
  so they have no dependency on this change. Add a new assertion in the
  same file. It checks two things: the field card's Move up/Move
  down/Remove, and the group's own Move up/Move down. Neither renders
  `btn-secondary` any longer. The group's `Remove ({count})` still does.
  Verify: run the full suite
  (task 4.2) rather than a standalone rerun of this one file.
- [x] 2.3 Add a DOM-level test asserting a placed field's key renders a
  `<wbr>` node immediately after each `_` in its text (e.g. for a field
  keyed `email_address`). Verify: passes under the full suite (task 4.2).

## 3. Fix: a second starving flex sibling

- [x] 3.1 ~~Change `formCardKey`'s `flex: 1` to `flex: "auto"`~~ -
  implemented (commit `57255530`) and then live-tested: made no
  measurable difference (key width identical, 14.59px, before and after).
  Disproven diagnosis, kept as history in `design.md`'s addendum; superseded
  by 3.2 below. Left in place (harmless, and correct in its own right) since
  reverting it and re-adding it would be pure churn.
- [x] 3.2 (found by the browser check, see `design.md`'s addendum) Add
  `flexWrap: "wrap"` to `formCardBody` in `FormEditorScreen.tsx`.

  `formCardMarks` and `formMachineMark` (the type label) are each, in
  effect, a single unbreakable word with no `minWidth: 0`. Their CSS
  automatic minimum size therefore equals their own full natural width.
  They never yield space under a shrink deficit, no matter what the
  key's own flex-basis is. This is why 3.1 had no effect.

  Wrapping the row, instead of shrinking it, lets marks/type drop to a
  second line inside the card. That happens when the first line does
  not fit. It leaves the key its own full-width line. A card with room
  for all three keeps them on one line exactly as today.

  It was spike-tested live (DOM-only, no rebuild) before writing the
  source change. See `design.md`'s addendum for what that confirmed.
  It also explains one surprising side-observation, a stretched
  single-card height.

  Verify: `bun run typecheck` passes. A live browser check (task 4.3)
  confirms this. It uses the same 1440px width and draft that showed
  the one-character-per-line regression. It shows `full_name`,
  `email_address`, `person_category` and `role_area` rendering their
  key on one unwrapped line. That line breaks only at `_`, if the card
  is narrower than the key's own natural width. It also shows
  "required 1/2 string" / "1/2 string" wrapping to its own second line
  when needed.

## 4. Verification

- [ ] 4.1 Run `bun run typecheck` and confirm zero errors.
- [ ] 4.2 Run the full `bun test` suite with `DATABASE_URL` set. This is
  never a single-file rerun, per `CLAUDE.md`. Confirm no new failures,
  and check the skip count as well as the pass count.
- [ ] 4.3 Run a real browser check on the form editor. Use a step whose
  view carries a group with fields like `full_name` and `email_address`.
  Pick a card width narrow enough to have forced a mid-character wrap
  before this change.

  Confirm four things, per `docs/browser-checks.md`'s convention for a
  UI change: the key now breaks only at `_`. The field card's
  move/remove row renders as small mono ghost controls. The group's own
  Move up/Move down match it. The group's own `Remove ({count})` still
  reads as the outlined destructive control.
- [ ] 4.4 Run the antislop prose gate and the whitespace gate over the
  pushed range. Use `sh scripts/gates/range.sh < /dev/null | sh
  scripts/gates/prose.sh`, and the same piped into
  `scripts/gates/whitespace.sh`. Confirm both pass.
