## Context

See proposal.md, Why. Phase 0 (`stylex-phase-0-tooling`, archived) settled
the tooling, the token module (`packages/form-ui/src/tokens.stylex.ts`,
already exported from this package) and the test stub
(`test/preload-stylex.ts`, a `mock.module` that returns each style object's
values replaced by its own key name). This change applies that machinery to
`packages/form-ui/src/FieldForm.tsx` and `packages/form-ui/src/PathButtons.tsx`,
the only hand-styled files left in the package.

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

None of these can carry over unchanged: StyleX has no descendant
combinator, and a component style targets one element via one
`stylex.props()` call, not a DOM attribute a stylesheet reads.

## Goals / Non-Goals

**Goals:**

- Every `form-ui.css` rule becomes a typed StyleX style, reading the
  existing token module. `form-ui.css` and its package export are deleted.
- The container-query collapse and the two-column variant keep their exact
  computed values across the migration.
- `PathButtons` exposes a style prop, so a caller can extend its wrapper
  without form-ui inventing a variant it has no caller for yet.
- Both `field-form.test.tsx` and `path-buttons.test.tsx` pass under the
  stub with no compiled-class assertion, and the other three test files in
  the package are confirmed unaffected.

**Non-Goals:**

- The `.btn` family. `PathButtons`' buttons keep their literal
  `btn btn-primary` className; that migration is phase 2's.
- Any change to `FieldForm`'s public props, rendered field behavior, or
  the `columns`/`span` computation `effectiveSpan` already does.
- A `packages/web` change, beyond a browser probe. Neither `PlayerScreen.tsx`
  nor `TaskScreen.tsx` needs a code change: both call `PathButtons` with no
  extra style today, and both should keep compiling and rendering unchanged
  by taking the new prop's default.

## Decisions

**D1. `data-columns`/`data-span` stay on the DOM; nothing reads them.**
`FieldForm.tsx` renders these attributes today so a stylesheet can select
on them. Deleting them along with the CSS that read them would force a
rewrite of every test in the "fields render across the view's column
count, honoring span" block, for a fact — which grid mode a field
rendered in — that stays true and worth asserting on regardless of the
styling mechanism. The attributes cost nothing to keep and stay a plain,
literal, stub-proof test signal. Style SELECTION moves to JavaScript: the
same `columns`/`span` values that already compute the attribute value now
also pick which StyleX style object applies, composed via `stylex.props()`.
No stylesheet, compiled or hand-written, reads a `data-*` attribute after
this change.

**D2. A discrete two-way layout switch is two named styles chosen by a
ternary, not a dynamic style function.** StyleX 0.19 supports per-property
runtime values via a function-valued `stylex.create` entry, but that
mechanism exists for values with no fixed enumeration (a color, an
offset), emitted as a CSS custom property assigned inline. `columns` and
`span` each take exactly one of two known values. `stylex.create` gets two
plain entries (for example `gridOneCol`/`gridTwoCol`), and the component
picks between them with `columns === 2 ? styles.gridTwoCol : styles.gridOneCol`.
This is the same shape `Chrome.tsx` already uses for its one existing
conditional (`flexWrap`'s `default`/`@media` pair), extended by one level:
choose the object in JS, let the object's own conditional keys carry the
`@container` collapse.

**D3. The `@container` collapse is a conditional value on the
two-column style's own `gridTemplateColumns`, keyed
`'@container form-ui-form (max-width: 34rem)'`.** `Chrome.tsx`'s
`flexWrap: { default: ..., '@media (max-width: 30rem)': ... }` already
proves the `{ default, '@<rule>': ... }` shape compiles. The shipped type
(`StyleX$Conditional` in `@stylexjs/stylex`'s own types) accepts any
`` `@${string}` `` key, so an `@container` key typechecks the same way an
`@media` key does; task 2.2 builds this rule and reads the emitted CSS to
confirm the compiler treats it as a real at-rule wrapper rather than an
inert string, immediately after writing it, rather than deferring that
check to the end of the change. The one-column style needs no such entry:
it is `1fr`
whether or not the container is narrow.

**D4. A descendant selector becomes a second `stylex.props()` call on the
child element itself.** `.form-ui-field-group[data-columns="2"] > legend`
and `.form-ui-field-options > legend` each reach a `<legend>` from an
ancestor rule. `FieldInput` already renders both `<legend>` elements
directly, so each takes its own style object (for example
`groupLegend`, `optionsLegend`) applied at the JSX site, with the
two-column full-width rule composed the same way as D2's grid switch.
This is mechanical, not a design risk: every remaining CSS descendant
selector in the file names an element `FieldInput` or `FieldForm` already
renders explicitly.

**D5. `PathButtons` takes a `style?: stylex.StyleXStyles` prop, composed
after the component's own wrapper style.** The wrapper's `display: flex`
and `gap` become a StyleX style read from `tokens.stylex`'s `space` group.
Neither current caller (`PlayerScreen.tsx`, `TaskScreen.tsx`) overrides
that layout, so the prop is optional and both keep compiling with no call
site change; a later phase's caller (studio's admin variants, for example)
gets a composition point instead of a form-ui-side guess at a variant it
has no user for yet. `stylex.props(styles.paths, style)` puts the caller's
style after the component's own, the standard StyleX override order. The
button element's `className="btn btn-primary"` stays a plain string,
unmigrated: `.btn` is phase 2's own delta, and form-ui inventing a StyleX
answer for a class it does not own would leave two competing definitions
of `.btn` once phase 2 lands.

**D6. Test updates fall into two kinds, and only one touches behavior.**
Assertions on `data-columns`/`data-span` values need no change (D1). Every
assertion on a literal `form-ui-*` class name — the required marker, the
issue list, the wrapper `<div>`, the two-class fieldset string — moves to
the class the new `stylex.create` key produces under the stub (its own key
name, per phase 0's D5). `issue-messages.test.ts`, `locale.test.ts` and
`submit.test.ts` render nothing and reference no class name; they are read
and confirmed as needing no change, not silently skipped, since the
design.md row this change implements counts all five files in the package.

## Risks / Trade-offs

- [The `@container` at-rule compiles differently than `@media`, or not at
  all, at 0.19.0] → task 2.2 verifies this against the build output
  immediately after writing the rule, before any later task depends on the
  assumption. If it fails, the
  fallback is a plain hand-written `@container` rule scoped to one
  literal, unhashed class, kept in a small residual stylesheet the same
  way `canvas-node`/`panzoom-exclude` stay literal per `web-styling`'s own
  "Two class names stay literal" requirement — reopened here only if D3's
  premise is wrong.
- [Dropping `form-ui.css` while some other package still imports the
  `./form-ui.css` export] → task 1.1 greps every `package.json` and source
  file under `packages/` for that specifier before the file is deleted.
- [A test asserts on a class-name substring this change does not visit,
  and passes by accident against a stale string] → task 4.4 greps the
  whole `packages/form-ui/test/` directory for the literal prefix
  `form-ui-` after the rewrite; zero matches is the exit signal for that
  task, not a green test run alone, since a stale literal could
  coincidentally still appear in rendered text (a field labeled
  "form-ui-thing", for instance) without asserting on a class.

## Migration Plan

Order: `FieldForm.tsx` first, since it carries the one open compile
question (D3, verified against the build the moment its rule is written,
not deferred), then `PathButtons.tsx` (the simpler of the two, and its own
tests are a smaller surface), then the test rewrites, then `form-ui.css`'s
deletion and the package export removal, then docs. The token module needs
no change; both files read it as written.

Rollback: revert this change's commits. It touches no engine file, no
other package, and no area stylesheet; `packages/web`'s two call sites
change only if D5's prop needs one, which it should not.

## Open Questions

None. D3's only real unknown is answered by task 2.2 as soon as its rule
is written, not deferred past this change.
