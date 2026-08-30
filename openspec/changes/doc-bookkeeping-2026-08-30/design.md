## Context

See `proposal.md` for motivation. Four facts fix the shape of this change.

`ROADMAP.md`'s `## Done` table runs stages 1-45. The `## Open stages`
section above the table holds 40, 43 and 44 open, for work not yet built.
The lowest number neither section already uses is 46.

Eight changes archived without a stage row: `instance-audit-log-chain`
(2026-08-27), `instance-query-core` (2026-08-27), `redactable-field-flag`
(2026-08-27), `instance-audit-log-view` (2026-08-28),
`instance-data-tables` (2026-08-29), `instance-query-data-source`
(2026-08-29), `instance-transition-action` (2026-08-29) and
`studio-play-draft-instance` (2026-08-30). Each archived directory's
`proposal.md` and `specs/` already state what it built and which
capability specs it touched. This change only transcribes that record
into `ROADMAP.md`. It does not re-derive it.

`docs/current-state.md` already describes most of those eight, inline in
its long opening bullet list: `instance-query-core`,
`instance-query-data-source`, `instance-transition-action`,
`instance-audit-log-chain`, `redactable-field-flag` and
`instance-audit-log-view`. The last three share one `## Instance audit
log (instance-audit-log-chain)` section at the file's end. Two stay
missing entirely: `instance-data-tables`/`reporting-data-tables` and
`draft-test-instances`.

`docs/decisions.md`'s "Aggregated data source" entry, under "Open,
deliberately", makes two claims the tree no longer supports. This
session verified both against the current tree; see `proposal.md`.
`InstanceQueryForm.tsx` exists. The `heldValues` fallback query in
`instance-query-source.ts` exists too.

## Goals / Non-Goals

**Goals:**
- Close the `ROADMAP.md` gap for exactly the eight named changes, no
  others.
- Add the two missing `docs/current-state.md` subsystem descriptions, in
  the file's own established voice and section style.
- Correct exactly the two named stale claims in `docs/decisions.md`.
  Leave the rest of that entry untouched, including the nearby "Shipped
  2026-08-28" date on the neighboring "Instance data tables" entry.

**Non-Goals:**
- No `docs/roadmap-history.md` stage write-ups. That file holds prose
  retrospectives authored when a stage shipped. Reconstructing eight of
  those after the fact would guess at reasoning nobody recorded at the
  time. `ROADMAP.md`'s own convention only requires a table row for a
  finished stage, not a history entry as a precondition.
- No new push-gate check for roadmap staleness. `CLAUDE.md` already
  records this as a defect class left ungated on purpose. No reliable
  mapping runs from an archived change name to a stage number. A
  detector would only guess. This change does not reopen that decision.
- No fix to the "Instance data tables" entry's own date typo, next to
  the two corrected bullets. It is real, but `tmp/offene-items.md` item
  21 did not name it. Scope stays to the four gaps that item lists.

## Decisions

**Stage numbers.** Numbering starts at 46, one stage per change, in
archive-date order. Each of the eight changes is its own capability with
its own `Why`. Folding them into fewer stages would misrepresent what
shipped as one effort. The archive shows eight separate proposals across
four days. Ascending by archive date matches every existing table row's
own ordering: stage number rises with build order.

**Row content.** Each stage row cites the change name(s) and capability
spec(s) `openspec status` or the archived directory already records. It
does not paraphrase them. The existing table's own convention is a
change-name list plus a spec-name list per row. This change extends that
convention. It invents no new column or format.

**`docs/current-state.md`'s two new sections go at the file's end**, as
`## <Title> (\`<change-name>\`)` headings. That matches every section
from the existing `## Process Studio, migration-plan field mapping`
heading onward, the file's later-added-subsystem convention. It does not
splice new text into the long undifferentiated bullet list the file's
earlier content uses. That earlier list predates the per-subsystem
heading convention. A new insertion there would fight a style the file
itself moved away from.

**The two `docs/decisions.md` corrections stay inside the same
"Aggregated data source" entry**, in its existing "Open, deliberately"
list, edited in place. The entry already writes a resolved item this
way: "Two participants picking the same device, resolved by
`instance-transition-action`."

That pattern names what was open. It names what closed it. It cites the
file. This change follows that same convention. It invents no new
section shape.

**`skip_specs: true`.** None of the three files edited here states a
requirement any `openspec/specs/` capability owns. Each restates, for a
human reader, behavior some other archived change's spec already commits
the engine to. `CLAUDE.md`'s own text on this defect class treats
detecting a stale `ROADMAP.md` as explicitly out of scope for a
mechanical gate. This change adds no spec requirement asserting these
three files "stay accurate." That would be an unenforceable, ungated
requirement, invented only to satisfy `openspec validate`, not a real
behavior contract.

## Risks / Trade-offs

- [A ninth undocumented archived change surfaces later, past this
  change's cutoff] -> Out of scope by construction. This change closes
  the gap for changes archived through 2026-08-30, matching
  `tmp/offene-items.md`'s own date. A later change follows the same
  convention this one sets: one stage row, added at archive time, never
  batched.
- [A stage number collides with a number already reserved in `## Open
  stages`] -> This session checked the file directly. Only 40, 43 and 44
  stay reserved, below the table's current top of 45. Numbers from 46
  onward stay unclaimed.

## Migration Plan

Doc-only edits to four already-tracked files. No deploy, no data
migration, no rollback beyond `git revert`.

## Open Questions

None. This session verified every claim this change corrects against
the current tree before writing this document.
