## Context

See `proposal.md` - Why. The standalone boolean checkbox and every other
field control share one wrapper. That wrapper is `FieldForm.tsx`'s
`fieldStack` style: `flexDirection: "column"`, with no `alignItems`
override. The default therefore applies: `stretch`.

For a bordered control (text, number, date, select), that stretch is
correct. It makes the control's visible box fill the row. The box stays
flush with the label above it.

The single checkbox has no visible box of its own. Its own reset,
`checkboxRadioReset`, strips the border and the background. The same
stretch still enlarges the checkbox's layout box, but that box stays
invisible. The browser paints the checkbox glyph at that invisible box's
horizontal center.

A live Chromium session confirmed this, via `playwright-cli`, against the
production styles. The checkbox's computed layout box measured 333px wide.
Its intrinsic size is 13px. The glyph sat centered inside the wider box.
Adding `align-self: flex-start` to the checkbox, in that same repro,
brought its box back to 13px. The checkbox then sat flush left.

## Goals / Non-Goals

**Goals:**
- Make the single standalone checkbox render at its intrinsic size, flush
  left under its label, at any row width. This is the `boolean` field's
  non-`radio` branch.

**Non-Goals:**
- Text, number, date, and select controls keep their current stretch
  behavior. That behavior is correct today. It is what `form-ui`'s
  column-count requirement relies on.
- The grouped radio-group and checkbox-group rendering keeps its current
  behavior too. That is `styles.option`, a flex row. Both already render
  flush left.
- No markup restructuring touches the label/control wrapper. No design
  token or `DESIGN.md` change lands either. This fix corrects one
  control's layout behavior. It follows the existing flush-left rule in
  `.claude/rules/design-language.md`. It introduces no new pattern.

## Decisions

- **Add `alignSelf: "flex-start"` to the checkbox's own StyleX style
  object.** Apply it only in the `boolean` + non-`radio` branch. That
  branch is `FieldForm.tsx`'s `<input type="checkbox">`. It currently
  takes `styles.control, styles.checkboxRadioReset`. The live repro
  verified this alone restores the checkbox. It returns to its intrinsic
  13px size, flush left. It does not need any other property.
  - Considered an explicit fixed `width`/`height` instead. Rejected:
    `alignSelf: "flex-start"` already gets the browser's own intrinsic
    control size for free. A fixed size would hardcode a magic number.
    That number would need to track the browser, the OS, and the zoom
    level.
  - Considered changing `fieldStack`'s `alignItems` for every control.
    Rejected: it would break the intentional full-width stretch every
    other control type relies on. See Non-Goals.
- **Scope the new style to the single-checkbox branch alone.** Leave the
  shared `checkboxRadioReset` object untouched. Grouped radio and
  checkbox-group option inputs also use `checkboxRadioReset`. Those
  already render correctly, inside a row-flex (`styles.option`). Folding
  the new rule into the shared reset would touch a path that works today.
  Touching it buys no benefit.

## Risks / Trade-offs

- [Risk] A future control could reuse `checkboxRadioReset` outside a
  flex-row context. It could hit the same stretch bug.
  → Mitigation: this spec now states the flush-left requirement
  explicitly, for the standalone checkbox. A future reviewer, or a test,
  gets something concrete to check a new usage against.
- [Risk] `packages/form-ui`'s test suite renders through
  `renderToStaticMarkup`, with no real browser layout. A regressed
  `alignSelf` value would not fail `bun test` on its own.
  - Mitigation: `bunfig.toml`'s `test/preload-stylex.ts` stubs
    `@stylexjs/stylex` for every test run. `stylex.create()` becomes
    `keyedStrings`, so each style value collapses to its own key name.
    `stylex.props()` then space-joins those names into `className`.
  - No CSS declaration ever reaches `bun test`'s rendered HTML. Only the
    style key's name does. Running `stylex.create`/`stylex.props` directly
    in the devcontainer confirmed this.
  - The regression test names the new style key explicitly. It asserts
    that key's name appears in the standalone checkbox's rendered `class`
    output. It asserts the name's absence from the grouped
    radio/checkbox-group inputs'. This matches `test/preload-stylex.ts`'s
    own documented convention for reading test output.
  - The CLAUDE.md-mandated real-browser check against the Player still
    confirms the fix itself. The unit test alone guards against the style
    getting dropped or misapplied later. It cannot see the actual rendered
    alignment.

## Migration Plan

This is a pure rendering fix. It does not need any schema, API,
stored-value, or published-version migration.

## Open Questions

The live-browser repro already confirmed the fix, the affected code path,
and its blast radius. Nothing here needs deferral.
