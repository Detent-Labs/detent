## Context

Two studio entry points write a step's `required`/`readonly` view flags.
One is the field matrix grid's live cell. The other is the form editor's
override strip. Both call the same writer, `setFlag` (`draft/view-flags.ts`). Both already
disable `required` and `readonly` together when `visible` resolves to
literal `false`, through `gatedKeys(entry)`. Neither disables `required`
against `readonly`, or `readonly` against `required`.

`checkViewFlags`, in the same file, already names the failure mode this
change closes. Take a field that is `required` and `readonly` together,
where no other source in the draft writes it. Every submission from that
step fails. That check stays a Checks-rail finding today, and it never
blocks a checkbox.

`writtenFieldIds` (also `draft/view-flags.ts`) is the one function that
already answers "does anything else write this field." `FieldMatrixGrid`
already calls it once per render. It threads the result through as
`written`. `FormEditorScreen` does not call it at all. The screen
destructures only `mutate` and `contentLocale` off `useDraft()`, not
`draft`.

See `proposal.md` for the motivating case and the full list of what
changes.

## Goals / Non-Goals

**Goals:**
- Stop the checkbox controls in both entry points from creating a new
  `required`+`readonly` conflict on a field nothing else writes.
- Keep every legitimate combination reachable. A field something else
  writes stays free to carry both flags, at both entry points.
- Keep one function, `gatedKeys`. Both entry points read it. So does the
  bulk-toggle logic. It stays the single source for "what's disabled on
  this entry right now."

**Non-Goals:**
<!-- antislop: allow synonym-rotation -->
- Retroactively clearing an existing conflict. Two examples: a body
  published before this change, reopened as a draft; or a state the JSON
  surface wrote directly. Both keep their checkboxes editable, not frozen.
- Changing `checkViewFlags` or the flagged-cell marker. They keep
  reporting the same two findings, in the same non-blocking way.
- Any schema or engine change. This is a studio-only, client-side
  constraint on top of an unchanged definition contract.
- A design-skill pass. This change adds no component, class, or visual
  state. It reuses the disabled-checkbox look the `visible: false` gate
  already draws, on two more conditions.

## Decisions

### The gate only ever blocks turning a flag on, never blocks turning one off

`gatedKeys` returns the flags a checkbox must not enable right now. For the
new rule that means: gate `readonly` only while `required === true` and
`readonly !== true`. Gate `required` only while `readonly === true` and
`required !== true`.

The alternative gates each flag whenever the other one already reads
`true`. That disables both checkboxes at once for an entry that already
carries both flags. It traps the exact state the check exists to catch.

An author who opens a draft with the pre-existing conflict would find
neither control clickable. The field matrix and the form editor could
then render a Checks-rail finding they cannot resolve from either place.
Gating only the one-directional path leaves both controls live whenever
both flags are already `true`. Unchecking either one always stays
reachable.

### `gatedKeys` takes `written` as a second, required argument

`gatedKeys(entry: DraftViewField, written: Set<string>): FlagKey[]`. The
written check needs `entry.ref` compared against the draft-wide set
`writtenFieldIds` already computes, so the function needs that set. Making
it required, not optional, means every call site states its provenance.
The compiler can then catch a mismatch. An entry with no `ref`, a
defensive case, counts as unwritten. That is the same conservative default
the `visible: false` gate already applies, regardless of what writes an
entry.

Alternative considered: keep `gatedKeys(entry)` and add a second function
for the new rule, called separately by each checkbox. Rejected. The two
callers, the field matrix grid and the form editor strip, already disable
a checkbox from one `gatedKeys(entry).includes(key)` call each. A second
function would need the same `written` threading anyway. The two rules
would drift the moment one caller updates only one of the two calls.

### `cellEligible` reads the same `gatedKeys`, so bulk badges inherit the rule for free

`fieldMatrixLogic.ts`'s `cellEligible(entry, key)` already reads
`gatedKeys(entry)` to decide whether a bulk badge may touch a cell. Thread
`written` through `cellEligible`, `eligibleTargetEntries`, `bulkBadgeOn`
and `applyBulkToggle`, all in the same file. A row or column's
`required`/`readonly` badge then cannot flip a cell past the new gate
either. It uses the identical rule instead of a parallel one.

## Risks / Trade-offs

- **A cell that already carries both flags renders two enabled, checked
  boxes.** That is deliberate; see the decision above. The live gate alone
  draws no visual line between two states. One: a conflict, fixable here.
  Two: fine, both flags are true and something writes this field. The
  flagged-cell marker
  (`isCellFlagged`, unchanged by this change) already carries that
  distinction. This change does not duplicate it into the checkbox
  rendering.
- **The form editor gains a new call it did not have before.** It calls
  `writtenFieldIds`, memoized on `draft`. That function walks every step,
  every action list and the field catalog, once per call.

  `FieldMatrixGrid` already pays this same cost per render, and nobody
  has reported a failure from it there. The form editor renders at most
  one step's controls at a time. The added cost is one more walk, on an
  already-open draft.

## Migration Plan

No data migration. This is a client-only behavior change gated behind a
normal deploy of `packages/web`. No pinned instance, published version, or
stored draft changes shape.

## Open Questions

None.
