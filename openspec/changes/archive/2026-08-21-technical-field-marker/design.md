## Context

See `proposal.md` - Why.

`writtenFieldCounts`
(`packages/web/src/areas/studio/draft/view-flags.ts`) already tells the
studio which fields have a structural writer. `resolveFields`
(`src/runtime/api.ts`) already forces `required: false` and `readonly:
false` for a `type: "group"` field. It does so on every step, whatever
the view entry declares.

This change adds a second forced case beside that one, for a field an
author declares `technical`. It also adds the publish-time and
studio-time checks. Those checks keep the two authoring paths, form
editor and field matrix, from ever writing a `required`/`readonly` key.
That key is one the engine would then ignore anyway.

## Goals / Non-Goals

**Goals:**
- Let an author declare a field technical. Every layer, engine, publish,
  form editor, field matrix, checks rail, must agree on what that means.
- Close both directions of a technical field's misuse: wired as editable
  (publish-blocking), and declared but never written (a checks-rail
  warning).

**Non-Goals:**
- Inferring "technical" from usage. Deferred; see proposal.md.
- Step-order/reachability-aware validation. A separate, costlier
  analysis; out of scope per ROADMAP stage 44.
- Any change to `packages/form-ui`. A technical field resolves as an
  ordinary read-only field to the participant-facing renderer. It needs
  no change there.

## Decisions

**`technical?: boolean` on `FieldDef`, not an enum or an `editable`
key.** The alternatives considered were `writer?: "system"` (an enum with
one member) and `editable?: false`. The enum's extensibility is illusory.
Every consumer, `resolveFields`, publish, the studio, only ever tests
presence. A member beyond `"system"` would change nothing about the
editability rule.

`editable` names the rule's consequence, not its cause. It also collides
with the view's own per-step `readonly`. The user weighed this tradeoff
directly. `technical` matches the roadmap's own word. It reads as a
catalog-level fact, the shape `columnMapping` and `validation` already
take on `FieldDef`.

**Publish rejects both directions, not just contradictions.**

A view entry naming a technical field may declare neither `required` nor
`readonly` at all, literal or CEL. One alternative permitted a redundant
`readonly: true`, rejecting only an actual contradiction. This change
rejects that alternative. Two spellings of one intent would hash
differently. The rule would also need three clauses instead of one.

This matches the contract's existing XOR style. `options`/`dataSource`
and `duration`/`deadline` both reject the pair. Neither resolves one key
over the other.

This is not the same tension as `technical: false` hashing distinctly
from an absent key (definition-contract/spec.md). That is one key's own
true/false/absent tri-state, the ordinary pattern `required: false`
already establishes throughout this schema. The rejected case here is
two different keys asserting overlapping intent on one entry. That is
the shape the `options`/`dataSource` and `duration`/`deadline` XORs
already refuse to let stand as two spellings.

**Studio ships the marker plus the inverse checks-rail finding, not
inference.**

The inverse finding is a technical field nothing structurally writes. It
reuses the existing `writtenFieldCounts`. No second notion of "written"
enters the codebase.

It reads that map's count, never `writtenFieldIds`. The two do not mean
the same thing. The map bumps a structural source by `Infinity`, and a
live, editable view entry by one. The derived
`writtenFieldIds` collapses both to presence. The two existing findings
need that collapse. This one must not have it.

A technical field's view entry can carry no `readonly` key after this
change. So `entry.readonly !== true` always holds. Every step that places
the field visibly bumps it by one. Presence would therefore read every
placed technical field as written, and the finding would never fire.

The count separates them. `Infinity + 1` is still `Infinity`. A
non-finite count means a structural writer. A finite one means view
entries alone.

This change defers inference: "this field looks technical, mark it?"
`EditorIssue` has no id or dismissal mechanism today. A suggestion the
author disagrees with would return on every draft. It would also become
a second authority for one fact, beside the declared marker.

Runtime enforcement already requires the declared key regardless.
Inference can only ever be a convenience layered on top later. Deferring
it now costs nothing.

**The engine forces resolution, mirroring the group-field precedent.**
`resolveFields` already forces `required: false, readonly: false` for a
`type: "group"` field, whatever the view entry declares. This change
adds one more forced case, at the same two lines: `technical: true`
forces `required: false, readonly: true`. Every downstream consumer,
`editableFieldIds`, `validateSubmissionData`, `getInstanceView`, needs no
further change. Each already keys off the resolved flags, not the raw
view entry.

**The form editor's strip removes the Required/Read-only controls
entirely, rather than disabling them.**

The strip already omits a control by field type. `span` renders behind
`!isGroupRow(selectedRow)` (`FormEditorScreen.tsx`), since a group draws
at the form's full width. This follows that precedent.

Publish now hard-rejects `required`/`readonly` on a technical field's
view entry. Leaving a settable-but-doomed control invites the exact
rejected-publish surprise this change exists to prevent.

The field matrix keeps the disable-only convention instead.
`gatedKeys` already backs its per-cell checkbox (`FieldMatrixGrid.tsx`)
and its bulk-badge eligibility (`cellEligible`/`eligibleTargetEntries`,
`fieldMatrixLogic.ts`) alike. Widening `gatedKeys` with a
technical-field signal covers both, without a second exclusion
mechanism.

**A bulk badge hides on an empty eligible set, not on the technical
flag.**

Widening `gatedKeys` empties `eligibleTargetEntries` for the two keys,
which makes the toggle a no-op. The button itself stays.
The `BulkBadges` component (`FieldMatrixGrid.tsx`) renders whenever the
row or column holds a live cell. It then maps all three of `FLAG_KEYS`
unconditionally. A badge that answers no click is worse than no badge.

So `BulkBadges` skips a key whose eligible set is empty. It computes that
set from the same `eligibleTargetEntries` the toggle already calls. The
test is not "is this row technical".

That form widens a rule the base spec already states. A column or row
with no live cell carries no bulk toggle badge. The new rule adds no
technical-field special case beside it. It also hides a badge on a
row the studio gates on every cell, for whatever reason. A technical row
keeps a non-empty eligible set for `visible`, so that badge stays.

**Checking Technical clears the field's `required`/`readonly` view
keys.**

Marking an existing field technical would otherwise strand every stale
key. The form editor's strip omits the two controls. The matrix cell
disables them. The row loses its badges. Only the JSON view still reaches
the key, and meanwhile the compile pass blocks the publish.

That contradicts the escape the `required`/`readonly` gate already
guarantees. An entry carrying both flags disables neither control, "so
the developer keeps a path to uncheck either one"
(`studio-form-editor`).

The Technical checkbox honours the same principle. It deletes the keys
itself, in the one `mutate` that writes `technical: true`. The draft
publishes from the moment the developer checks the box. No escape hatch
has to exist.

Unchecking writes nothing back. The pass deletes an authored
`required: true` or `readonly: true`, not only a key that restates a
default. The draft keeps no record of what stood there. The studio
cannot restore a value it never kept. The confirmation the checkbox
raises before the pass runs is where the author reads that cost.

**The Technical checkbox reaches a group's child too.** The compile rule
and the rail's finding both walk the flattened catalog. A nested field
can therefore carry the key. The catalog's recursive `SubFieldRow`
already carries `columnMapping` for such a child. Leaving Technical off that row
would make `technical` the one catalog-level fact a nested field states
through the JSON view alone.

**The inverse finding lives beside `checkViewFlags`, under the `view`
source.**

A sibling function reaches the rail only through `runValidation`
(`draft/validation.ts`), whose one `issues.push(...checkViewFlags(body))`
line is the whole wiring. A sibling needs its own push beside it, ahead
of the `compileProcessBody` try-block, the placement `checkViewFlags`
already has.

It anchors on the field itself (`entityType: "field"`), not on a step.
`technical` is a catalog-level declaration. The existing two view-flag
findings both anchor on a step instead. It stays non-blocking, per the
house rule that checks-rail findings never gate publish. The
publish-blocking half of this pair is the compile-pass rejection, not a
rail finding.

## Risks / Trade-offs

- [Marking an existing field technical would strand every stale
  `required`/`readonly` key it carries. Checking the box removes every
  builder control that could clear one.] The Technical checkbox clears
  those keys itself, in the same `mutate`, per the decision above. The
  remaining risk is a clearing pass that misses an entry, so it walks
  every step's `view.fields[]`. The pass runs in the field catalog, a
  panel that holds no notion of the matrix's drawn columns. Nothing
  narrows its input, and nothing may.
- [Checking Technical is irreversible for the draft. It deletes authored
  `required: true` and `readonly: true` keys, and unchecking restores
  neither.] Mitigated by the confirmation the developer can decline,
  which the `studio-app` spec now requires. It names the count of keys
  the pass will delete, before the pass runs. Declining it leaves the
  draft untouched.
  Accepted beyond that: a general per-field undo is a separate change.
- [A hand-authored body reaching publish with the stale keys still gets
  a bare compile error.] The studio's own `runValidation` calls
  `compileProcessBody`. The checks rail reports the same error under its
  `structural` source, before the author presses Publish. Only a body
  authored outside the studio sees the raw error.
- [The inverse finding reports a technical field carrying a `default`.
  That reads as a false positive.] It is not one today. The engine parses
  `FieldDef.default` (`definition.ts:283`) and type-checks it
  (`cel/check.ts:193`), and does nothing else with it. No engine or
  runtime code applies it to `instance.data`. `resolveFields` reads a
  field's value from `instance.data[field.id]` alone, and an instance
  starts with `data: {}`.

  So a technical field whose only writer is a `default` never holds a
  value. That is the case this finding exists to report, and exempting it
  would hide the error. A later change that makes `default` a real writer
  adds the exemption then, one paragraph in this spec.
- [`technical: true` on a body already declaring a conflicting
  `required`/`readonly` view entry is a new way for a hand-authored
  publish to fail.] This is the intended behavior, per the definition
  contract's XOR style above. No existing stored body can hit it. None
  declares the key today.
- [The inverse finding's `view` source inflates a count. That count is
  the field matrix's own rail badge, `issueCountForSource` in
  `panel-rail.ts`, which sums by source alone. The finding is
  field-anchored, not tied to any matrix cell. So the count can rise
  with nothing to find in the grid.] Accepted trade-off. The field
  catalog's own rail badge, `issueCountForEntityType`, surfaces the
  finding correctly instead.

  `panel-rail.ts` itself already treats `issueCountForSource` as an
  approximation. Its two existing `checkViewFlags` findings share one
  entityType with every other per-step finding, for the same reason.

## Migration Plan

No data migration. `technical` is a new optional key. Every stored
body's `definitionHash` stays unmoved, since no existing body declares
it. The new compile-pass checks apply only to a body an author publishes
after this change ships. They apply only when that body declares
`technical: true` somewhere. No published version changes behavior.
Published bodies stay immutable, and this change adds no read-path
refinement.

## Open Questions

- The form editor's per-step strip: how the empty space reads once it
  omits Required/Read-only, for a technical field.
- The field matrix's technical-row-header marker: its exact visual
  form.

Both use `/frontend-design:frontend-design` at implementation time. This
does not change the specs, the approach, or the task breakdown. The
strip's removal is already decided, above. The specs state the
behavioral requirement alone: the controls are not offered, and the row
carries a marker. Neither states the pixel-level treatment.
