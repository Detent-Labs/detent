## Context

See `proposal.md` for the motivation and the measured counts.

Three facts shape the approach. The renderer's rule already stands in
`form-ui`'s spec: a group field houses the entries carrying its key. The
studio's form editor already obeys it. `FormEditorScreen.tsx` derives its
group select from the view's own rows, filtered to group fields. It therefore
offers no free text. It offers no key whose container the view leaves out
either. It already enforces what this check adds. The three broken bodies are hand-written, and
hand-writing is the only route that reaches this shape.

One fact constrains the placement. The live deployment carries all three
bodies as published versions. Instances pin those versions.

## Goals / Non-Goals

**Goals:**

- Reject the shape at publish, with an error naming the step and the group.
- Leave every published version readable.
- Make the three examples render the forms their authors drew.

**Non-Goals:**

- No renderer change. `form-ui` already behaves as its spec states.
- No widening of `ViewField.group` to accept a free heading string. The
  studio cannot build one, and `ViewNote` already covers static text.
- No new hash test over the examples. See Open Questions.

## Decisions

### Decision 1: the compile pass carries the check

`definition.ts` also deserializes stored bodies. A refinement there rejects
the three published bodies on read. Every instance pinned to one of them then
parks. `compile.ts` runs on the write path alone. An old body stays readable,
and a new one cannot carry the shape.

This follows the criterion `definition-contract` already states. It also
matches `checkIdResolution` and `checkTechnicalFields`, the two closest
siblings.

**Alternative rejected:** a Zod refinement on `viewField`. It reads cleaner
and costs three parked processes.

### Decision 2: the check tests both halves

A `group` must name a group field's key, and the same view must carry that
group field. One half alone leaves the error in place. A key resolving
against a catalog group the view leaves out still renders nothing. That is
what `purchase-requisition.json` would do after a key-only repair.

**Alternative rejected:** check key resolution only. It passes a body that
still draws a blank form, so it fails the one thing this change is for.

### Decision 3: `purchase-requisition.json` gains nine childless group fields

Its catalog holds one group field and its views name ten groups. The nine
missing ones join the catalog, each carrying a key and a label and no child
field.

Childless is the only shape that works here. Eight of its fields sit under
different headings in different steps, and `quantity` sits under five. One
catalog tree cannot hold a field in five places. The view carries the
membership per step, which is what makes the view presentation.

The renderer never reads a group field's own `fields`. It draws the entries
whose `group` names the container's key, from the flat view list. A childless
group field therefore renders exactly like a populated one.

`definition.ts` declares `fields` optional on a group, and no invariant asks a
group for children. No stored value moves and no CEL reference changes,
because `dataSchema` builds from `leafFields` and a group has no value.

**Alternative rejected:** move the fields into the containers. It is
impossible: eight fields would each need to sit in several containers at once.

**Alternative rejected:** drop the nine unbacked `group` keys. It is the
smaller change. It also flattens a 15-entry step into one wall of controls,
which is worse than what the author drew.

### Decision 4: each group field's view entry sits where its members start

The renderer draws the root entries in declaration order, and a group draws
its members in declaration order. Putting a group field's entry at the
position of its first member therefore keeps the sequence the author wrote.

### Decision 5: the recorded hashes get regenerated

Each example carries a `definitionHash` in its wrapper. Editing a body moves
that hash. The three files take the value `definitionHash(compileProcessBody(
body))` returns after the change.

## Risks / Trade-offs

**A body outside `examples/` carries the shape.** Checked: `templates.ts`
has no view group, and no test body builds one. Nothing else publishes.

**The three examples republish as a new version.** The seed is idempotent and
publishes v2 on the next run. Instances on v1 keep their pinned body, so a
case mid-flight renders as it does today, blank included.

**A guard hides a group field.** `resolveFields` then drops the container,
and the renderer drops its members with it. That is the wanted reading: an
author hiding a group hides what it holds. Rendering the members at the root
instead would render fields the author hid.

**A reviewer reads Decision 3 as a catalog redesign.** It moves fields into
containers and renames nothing. Every field keeps its id, its key and its
type.

## Migration Plan

No schema migration and no data migration. The change touches the write path
and three files.

Deploy order does not matter. The check and the corrected examples ship in
one commit. No build publishes a corrected body against an engine lacking the
check. None publishes an old body against an engine carrying it.

Rollback is a revert. A reverted engine accepts the corrected bodies, since
they satisfy the rule the revert removes.

The live deployment needs one `update.sh` run. The seed publishes v2 of each
corrected process. An instance keeps the version it pinned. An operator
wanting the mid-flight IT Offboarding case to render starts it again on v2.

## Open Questions

**Does a heading deserve its own shape?** Nine childless group fields exist to
carry a label. Three of nine hand-written examples reached for a free heading
string, and `purchase-requisition.json` needs a per-step one. A heading entry
beside `ViewNote` would say this outright. Answering it later changes nothing
here, because a childless group field renders correctly today.

**Should a test pin every published example's recorded hash?** Today one test
pins `expense-approval.json` alone. Its own comment records that a wrong hash
once shipped unnoticed. Widening it covers a real gap and belongs to no
requirement in this change. Answering it later changes nothing here.
