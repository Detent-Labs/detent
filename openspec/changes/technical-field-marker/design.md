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
catalog-level fact, the shape `columnMapping` and `attributes` already
take.

**Publish rejects both directions, not just contradictions.**

A view entry naming a technical field may declare neither `required` nor
`readonly` at all, literal or CEL. One alternative permitted a redundant
`readonly: true`, rejecting only an actual contradiction. This change
rejects that alternative. Two spellings of one intent would hash
differently. The rule would also need three clauses instead of one.

This matches the contract's existing XOR style. `options`/`dataSource`
and `duration`/`deadline` both reject the pair. Neither resolves one key
over the other.

**Studio ships the marker plus the inverse checks-rail finding, not
inference.**

The inverse finding is a technical field nothing structurally writes,
with no `default`. It reuses the existing `writtenFieldCounts`. No
second notion of "written" enters the codebase.

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

This departs from the codebase's only existing precedent for the same
situation, in `FormEditorScreen.tsx`. It already renders those controls
unconditionally for a group field too. The engine always ignores that
field's `required`/`readonly` as well. Yet the strip only ever
disables them, via `gatedKeys`'s mutual-exclusion gate.

A technical field's case is stronger. Publish now hard-rejects
`required`/`readonly` on its view entry. Leaving a settable-but-doomed
control invites the exact rejected-publish surprise this change exists
to prevent.

The field matrix keeps the disable-only convention instead.
`gatedKeys` already backs its per-cell checkbox (`FieldMatrixGrid.tsx`)
and its bulk-badge eligibility (`cellEligible`/`eligibleTargetEntries`,
`fieldMatrixLogic.ts`) alike. Widening `gatedKeys` with a
technical-field signal covers both, without a second exclusion
mechanism.

**The inverse finding lives beside `checkViewFlags`, under the `view`
source.**

It anchors on the field itself (`entityType: "field"`), not on a step.
`technical` is a catalog-level declaration. The existing two view-flag
findings both anchor on a step instead. It stays non-blocking, per the
house rule that checks-rail findings never gate publish. The
publish-blocking half of this pair is the compile-pass rejection, not a
rail finding.

## Risks / Trade-offs

- [Marking an existing field technical can make an already-publishable
  draft fail to publish, until its stale `required`/`readonly` entries
  clear.] The studio's Field tab and field matrix stop offering those
  controls once the author checks the box. The checks rail reports the
  unwritten case too. The author sees the error before attempting to
  publish, not as a bare compile error.
- [The `default`-exemption clause in the inverse finding is the one easy
  detail to omit.] It ships with a named test covering that clause
  specifically, per the change's task list.
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
- The field matrix's technical-row marker: its exact visual form.

Both use `/frontend-design:frontend-design` at implementation time. This
does not change the specs, the approach, or the task breakdown. The
strip's removal is already decided, above. The specs state the
behavioral requirement alone: the controls are not offered, and the row
carries a marker. Neither states the pixel-level treatment.
