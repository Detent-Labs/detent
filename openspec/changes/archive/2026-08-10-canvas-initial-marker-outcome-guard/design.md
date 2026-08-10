## Context

Both fixes are already implemented, typechecked, built, and verified in a
running browser session. See `proposal.md` for the motivation. This
document records the decisions behind the existing code. The delta specs
point back to it.

The canvas already renders two per-node markers that extend past the step
rectangle. An incoming arrow sits left of the initial step. A tilted stamp
sits above a terminal step (`CanvasView.tsx`, `.canvas-terminal-stamp`).
The Steps panel's identity section already renders a `contract.outcomes`
editor (`ContractPanel.tsx`) as a separate, unconstrained list.

## Goals / Non-Goals

**Goals:**
- Give the initial step a marker as visible as the terminal step's stamp.
  Add no new interaction pattern for the author to learn.
- Make it impossible to type an `outcome` the draft's own contract data
  already rejects.

**Non-Goals:**
- No change to `workflow.initialStep` or `contract.outcomes` themselves.
  Both are pre-existing draft fields. This change only adds and constrains
  UI around them.
- No change to the Zod validation in `src/schema/definition.ts`. The
  `terminal outcome '...' is not in contract.outcomes` check stays exactly
  as strict as before. The editor now just can't produce a value that
  trips it through this one field.

## Decisions

**Stamp construction, not a new component.** The initial-step marker
reuses the terminal stamp's construction. It uses an outlined circle plus
mono uppercase text, in a new `.canvas-initial-stamp` CSS class. This
avoids a new visual idiom. `design-language.md` caps stamp *tones* at five
and warns against a sixth. This stays outside that count. It is a second
bespoke canvas-scoped stamp, the same way `.canvas-terminal-stamp` already
is. It is not a new tone in the shared `.app-stamp` register system.

Both stamps read `--color-neutral-900` directly, a primitive ramp token,
not a semantic role. `design-language.md` reserves that construction for
the semantic layer. This duplicates an existing gap in
`.canvas-terminal-stamp` rather than introducing a new one. A token fix
for both stamps is future work, not blocking here.

**No tilt.** `design-language.md` reserves tilt for error contexts: the
error banner, the boundary fallback. A canvas node is not one, so the new
stamp sits flat. This alone makes it visually distinct from the terminal
stamp. That distinction matters for one edge case: a step can be both
initial and terminal, in a single-step process. There the two stamps sit
in opposite corners, one tilted and one flat, with no visual collision.

**Top-left corner.** The terminal stamp sits top-right. The new stamp
sits top-left. That keeps the two symmetric, and keeps them apart in the
single-step-process case above.

**A `<select>`, not a `<datalist>` or an inline warning.** A `<select>`
populated from `draft.contract.outcomes` makes the invalid state
unreachable through this field. That matches how the codebase already
handles other closed-set pickers: `PathsPanel`'s target-step select,
`ContractPanel`'s own field checkboxes. A `<datalist>` would only suggest
values while still taking arbitrary text. It would narrow the gap, not
close it. An inline warning shown after the fact would only relocate the
existing Zod message. The underlying gap would stay open.

**Free text stays without a declared outcome list.** Nothing validates
`outcome` on an uncontracted process. The check in
`src/schema/definition.ts` only runs `if (b.contract && s.terminal)`.
Constraining the field there would invent a restriction the schema itself
does not have. There is also no outcomes list to populate a `<select>`
from in that case.

**Orphaned values on existing drafts.** A draft saved before this change
could hold an outdated `outcome` value. That value might no longer be in
`contract.outcomes`, or the draft might predate any contract.

The `<select>` keeps that stored value intact. Native `<select>` behavior
does not force a match, so it renders with no option showing as selected.
Nothing clears or rewrites the value. The Checks panel still flags it
under the existing Zod error, until the author picks a valid option. No
migration or backfill runs against stored drafts.

## Risks / Trade-offs

- The `<select>` shows nothing but "no option selected" for an orphaned
  `outcome`. → Acceptable: the Checks panel already flags this case. A
  step in that state needs an author decision, not a default guess.
- A future capability might let an author add a new outcome value inline,
  while editing a step. It might not need the Contract panel. A plain
  `<select>` would need a different control for that. → Out of scope here.
  Today's authoring flow already treats the Contract panel as the one
  place outcomes get declared.

## Migration Plan

None. Both changes are additive UI behavior over existing draft fields. No
stored data changes shape. No rollback step beyond a normal revert applies.

## Open Questions

None.
