## Context

See proposal.md, Why. Phase 0 (`stylex-phase-0-tooling`, archived) settled
three things. It settled the tooling. It settled the token module
(`packages/form-ui/src/tokens.stylex.ts`, already exported from this
package). It settled the test stub (`test/preload-stylex.ts`, a
`mock.module` that returns each style object's values replaced by its own
key name). This change applies that machinery to
`packages/form-ui/src/FieldForm.tsx` and
`packages/form-ui/src/PathButtons.tsx`, the only hand-styled files left in
the package.

`form-ui.css` today carries two patterns the pilot (`Chrome.tsx`, one
`@media` conditional and no attribute selectors) did not exercise:

- Attribute-selector variants: `[data-columns="2"]`, `[data-span="2"]`
  switch a grid between one and two tracks. `FieldForm.tsx` already computes
  `columns`/`span` as plain values before it renders the attribute.
- A container query, `@container form-ui-form (max-width: 34rem)`, that
  collapses the two-track variants back to one below that width.
- Descendant selectors, `.form-ui-field-group[data-columns="2"] > legend`
  and `.form-ui-field-options > legend`, reaching a child element from an
  ancestor's rule.

None of these carry over unchanged. StyleX has no descendant combinator. A
component style targets one element via one `stylex.props()` call, never a
DOM attribute a stylesheet reads.

## Goals / Non-Goals

**Goals:**

- Every `form-ui.css` rule becomes a typed StyleX style, reading the
  existing token module. `form-ui.css` and its package export go away.
- The container-query collapse and the two-column variant keep their exact
  computed values across the migration.
- `PathButtons` exposes a style prop. A caller can then extend its
  wrapper. Form-ui need not invent a variant it has no caller for yet.
- Both `field-form.test.tsx` and `path-buttons.test.tsx` pass under the
  stub with no compiled-class assertion. The other three test files in the
  package need no change, confirmed rather than assumed.

**Non-Goals:**

- The `.btn` family. `PathButtons`' buttons keep their literal
  `btn btn-primary` className; that migration is phase 2's.
- Any change to `FieldForm`'s public props, rendered field behavior, or
  the `columns`/`span` computation `effectiveSpan` already does.
- A `packages/web` change, beyond a browser probe. Neither `PlayerScreen.tsx`
  nor `TaskScreen.tsx` needs a code change: both call `PathButtons` with no
  extra style today. Both keep compiling and rendering unchanged, taking
  the new prop's default.

## Decisions

**D1. `data-columns`/`data-span` stay on the DOM; nothing reads them.**
`FieldForm.tsx` renders these attributes today. A stylesheet selects on
them. Deleting both would force a rewrite. Every test in the "fields
render across the view's column count, honoring span" block would need
one.

Those tests assert one fact: which grid mode a field rendered in. That
fact stays true regardless of the styling mechanism. It stays worth
asserting on. The attributes cost nothing to keep. They stay a plain,
literal, stub-proof test signal.

Style SELECTION moves to JavaScript instead. The same `columns`/`span`
values that already compute the attribute value now also pick which
StyleX style object applies, composed via `stylex.props()`. No
stylesheet, compiled or hand-written, reads a `data-*` attribute after
this change.

**D2. A discrete two-way layout switch is two named styles, chosen by a
ternary.** It is not a dynamic style function. StyleX 0.19 supports
per-property runtime values via a function-valued `stylex.create` entry.
That mechanism suits values with no fixed enumeration, such as a color
or an offset. It emits a CSS custom property, assigned inline. `columns`
and `span` each take exactly one of two known values instead.

`stylex.create` gets two plain entries for each choice (for example
`gridOneCol`/`gridTwoCol`). The component picks between them:
`columns === 2 ? styles.gridTwoCol : styles.gridOneCol`. `Chrome.tsx`
already uses this same shape, for its one existing conditional,
`flexWrap`'s `default`/`@media` pair. This decision extends that shape
by one level. Choose the object in JS. Let the object's own conditional
keys carry the `@container` collapse.

**D3. The `@container` collapse is a conditional value on the two-column
style's own `gridTemplateColumns`.** Its key is
`'@container form-ui-form (max-width: 34rem)'`. `Chrome.tsx`'s
`flexWrap: { default: ..., '@media (max-width: 30rem)': ... }` already
proves the `{ default, '@<rule>': ... }` shape compiles. The shipped
type, `StyleX$Conditional` in `@stylexjs/stylex`'s own types, accepts
any `` `@${string}` `` key. An `@container` key therefore typechecks the
same way an `@media` key does.

One open question remains: does the compiler emit a real `@container`
at-rule, or something else? Task 2.2 answers it. It builds this rule and
reads the emitted CSS. It runs that check right after writing the rule,
not at the end of the change. The one-column style needs no such entry.
It is `1fr` whether or not the container is narrow.

**D4. A descendant selector becomes a second `stylex.props()` call on
the child element itself.** Two selectors need this:
`.form-ui-field-group[data-columns="2"] > legend` and
`.form-ui-field-options > legend`. Each reaches a `<legend>` from an
ancestor rule. `FieldInput` already renders both `<legend>` elements
directly. Each one therefore takes its own style object, for example
`groupLegend` or `optionsLegend`, applied at the JSX site. The
two-column full-width rule composes the same way D2's grid switch does.

This is mechanical, not a design risk. Every remaining CSS descendant
selector in the file names an element. `FieldInput` or `FieldForm`
already renders that element explicitly.

**D5. `PathButtons` takes a `style?: stylex.StyleXStyles` prop.** It
composes after the component's own wrapper style. The wrapper's
`display: flex` and `gap` become a StyleX style, read from
`tokens.stylex`'s `space` group. Neither current caller
(`PlayerScreen.tsx`, `TaskScreen.tsx`) overrides that layout. The prop
is therefore optional. Both keep compiling with no call-site change.

A later phase's caller, one of studio's admin variants for example,
gets a composition point instead. Form-ui need not guess at a variant
it has no user for yet.

`stylex.props(styles.paths, style)` puts the caller's style after the
component's own. That is the standard StyleX override order.

The button element's `className="btn btn-primary"` stays a plain
string, unmigrated. `.btn` is phase 2's own delta. Form-ui could invent
a StyleX answer for a class it does not own. That would leave two
competing definitions of `.btn`, once phase 2 lands.

**D6. Test updates fall into two kinds, and only one touches behavior.**
Assertions on `data-columns`/`data-span` values need no change (D1).
Every assertion on a literal `form-ui-*` class name moves instead. Each
moves to the class the new `stylex.create` key produces under the stub.
That covers the required marker, the issue list, the wrapper `<div>`,
and the two-class fieldset string. Each moves to its own key name, per
phase 0's D5.

`issue-messages.test.ts`, `locale.test.ts` and `submit.test.ts` render
nothing. None references a class name. This design confirms they need
no change; it does not silently skip them. The design.md row this
change implements counts all five files in the package.

## Risks / Trade-offs

- [The `@container` at-rule compiles differently than `@media`, or not
  at all, at 0.19.0] → task 2.2 verifies this against the build output.
  It checks right after writing the rule, before any later task depends
  on the assumption. If it fails, a plain hand-written `@container`
  rule becomes the fallback.

  That fallback scopes to one literal, unhashed class, in a small
  residual stylesheet. `canvas-node`/`panzoom-exclude` stay literal the
  same way. `web-styling`'s own "Two class names stay literal"
  requirement already covers that pattern. Reopen this decision only if
  the fallback triggers.
- [Dropping `form-ui.css` while some other package still imports the
  `./form-ui.css` export] → task 1.1 greps every `package.json` and
  source file under `packages/` for that specifier. It runs this check
  before the file goes away.
- [A stale class-name substring passes by accident] → task 4.4 greps
  the whole `packages/form-ui/test/` directory. It searches for the
  literal prefix `form-ui-`, after the rewrite. Zero matches is the
  exit signal for that task. A green test run alone is not enough. A
  stale literal could coincidentally still appear in rendered text. A
  field labeled "form-ui-thing" is one example, with no class assertion
  involved.

## Migration Plan

Order: `FieldForm.tsx` first. It carries the one open compile question,
D3. Its check runs against the build the moment task 2.2 writes its
rule, not deferred.

`PathButtons.tsx` comes next. It is the simpler of the two, and its own
tests cover less ground. The test rewrites follow. Then comes
`form-ui.css`'s deletion, and the package export removal. Docs come
last. The token module needs no change: both files read it as it
stands today.

Rollback: revert this change's commits. It touches no engine file, no
other package, and no area stylesheet. `packages/web`'s two call sites
change only if D5's prop needs one. It should not.

## Open Questions

None. D3's only real unknown gets an answer from task 2.2. That answer
comes as soon as task 2.2 writes its rule. Nothing here waits past this
change.
