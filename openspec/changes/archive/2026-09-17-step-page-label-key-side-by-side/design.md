## Context

`packages/web/src/areas/studio/panels/StepPage.tsx` renders the step page
masthead. LABEL (lines 722-725) and KEY (lines 733-741) each render as a
`<label {...stylex.props(styles.fieldLabel)}>` block. Both stack as direct
children of the `masthead` div (`styles.masthead`, a column flex with
`space.s2` gap). LABEL's missing-translation warning (lines 726-731) is a
sibling `<p>`, outside the `<label>` on purpose. The code comment at line 726
gives the reason: a field's messages sit beside its label. They never nest
inside it. The design language states the same rule.

The file already collapses a two-column layout at a narrow viewport:
`const NARROW = "@media (max-width: 64rem)"` (line 32). `styles.columns`
(lines 203-208) uses it for the masthead's own section split:

```
gridTemplateColumns: { default: "minmax(0, 3fr) 1px minmax(0, 2fr)", [NARROW]: "minmax(0, 1fr)" }
```

`FieldCatalogPanel.tsx`'s `fieldCatalogHalves` style carries the same
grid-plus-collapse pattern, with no divider column:

```
gridTemplateColumns: { default: "minmax(0, 1fr) minmax(0, 1fr)", [NARROW]: "minmax(0, 1fr)" }, gap: space.s4
```

Design language forbids one area from reading another area's style object.
`StepPage.tsx` copies the pattern instead of importing it.

See `proposal.md` for the motivation: a stacked LABEL/KEY reads as two
disconnected rows in a masthead with width to spare.

## Goals / Non-Goals

**Goals:**
- LABEL and KEY render in one row on a wide viewport, LABEL the wider column.
- The row collapses to LABEL-over-KEY under the existing `NARROW` breakpoint.
  That matches this file's own collapse behavior elsewhere.
- LABEL's missing-translation warning stays legible and scoped to LABEL. It
  reads correctly once LABEL sits in a column narrower than the masthead.

**Non-Goals:**
- DESCRIPTION's layout, position, and markup stay as they are.
- This change does not add a new shared or cross-area style. `StepPage.tsx`
  copies the grid-plus-`NARROW` shape into its own `styles` object. It does
  not import `FieldCatalogPanel.tsx`'s style, and it does not move the
  pattern into `shell/`. A second file duplicating a three-line grid rule
  earns no shared abstraction.

## Decisions

**Two-column CSS grid, `minmax(0, 2fr) minmax(0, 1fr)`, collapsing under
`NARROW`.** The design language's "Fields" toolbar exception moves a label
beside its own control. That exception governs a different case, one
field's own label placement. The request here is two field blocks side by
side. Each keeps its own label-above-control shape internally, so that
exception stays out of scope.

A CSS grid wins over flexbox for one reason. This file already expresses its
one existing two-column split as a CSS grid with the same `NARROW` collapse
(`styles.columns`). A second grid keeps the file internally consistent.
`2fr`/`1fr` wins over an even `1fr`/`1fr` split because LABEL carries prose.
German prose can run up to 40% longer than English (`design-language.md`).
KEY carries a short machine slug. The shape pass confirmed this width split
as a design decision, ahead of this document.

**LABEL's column wraps the `<label>` and its warning `<p>` in a new
container. KEY's column stays its own `<label>`, unchanged.** The warning
needs somewhere to render once LABEL narrows to a column. The shape pass
resolved this. The warning scopes under LABEL's own column. It does not span
full-width beneath the whole row.

The warning names a LABEL-specific condition, so it only reads correctly
under LABEL. The warning stays a sibling of the `<label>` element. That
preserves the existing DOM relationship and its rationale (line 726's
comment). Only the wrapping container is new.

**New local styles, not a shared one.** A `labelKeyRow` grid container and a
`labelKeyColumn` wrapper join `StepPage.tsx`'s existing `stylex.create()`
object. `labelKeyColumn` is a flex column, `gap: space.s2`. That is the masthead's
own child spacing. `fieldLabel`'s label-to-control gap is a separate,
narrower 4px. It holds LABEL's `<label>` and its warning together. `fieldLabel` and
`fieldLabelText` stay unchanged. Both still apply to LABEL's and KEY's own
`<label>` elements.

## Risks / Trade-offs

[A wrapping `div` puts LABEL's markup one level deeper than KEY's bare
`<label>`] → No test and no CSS selector reads `StepPage.tsx`'s masthead
structure. No other component reads it either. The asymmetry stays visible
only in the rendered markup.

[The grid's `minmax(0, 2fr) minmax(0, 1fr)` split is a design judgment] →
The shape pass checked it against this file's own established two-column
precedent (`styles.columns`). It also checked it against the design-language
rule on German copy length. The implementation does not need further
validation of the ratio.

## Migration Plan

Not applicable. This is a client-only layout change to one component. It
changes no data migration and no API. No stored definition changes either.

## Open Questions

None. The shape pass resolved every layout decision the proposal's "Open
questions" section raised: width split, narrow-viewport collapse, and
warning placement. That resolution happened before this design document.
