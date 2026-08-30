## Context

See `proposal.md` for motivation. Four facts fix the shape of this change.

`ROADMAP.md`'s `## Done` table runs stages 1-45, with 40, 43 and 44 held
open in the `## Open stages` section above the table for work not yet
built. 46 is the lowest number neither the open section nor the table
already uses.

Eight changes archived without a stage row: `instance-audit-log-chain`
(2026-08-27), `instance-query-core` (2026-08-27), `redactable-field-flag`
(2026-08-27), `instance-audit-log-view` (2026-08-28), `instance-data-tables`
(2026-08-29), `instance-query-data-source` (2026-08-29),
`instance-transition-action` (2026-08-29) and `studio-play-draft-instance`
(2026-08-30). Each archived directory's `proposal.md` and `specs/` already
state what it built and which capability specs it touched; this change only
transcribes that record into `ROADMAP.md`, it does not re-derive it.

`docs/current-state.md` describes most of those eight already, inline in
its long opening bullet list: `instance-query-core`,
`instance-query-data-source`, `instance-transition-action`,
`instance-audit-log-chain`, `redactable-field-flag` and
`instance-audit-log-view` (the last three share one `## Instance audit log
(instance-audit-log-chain)` section at the file's end). Two are missing
entirely: `instance-data-tables`/`reporting-data-tables` and
`draft-test-instances`.

`docs/decisions.md`'s "Aggregated data source" entry, under "Open,
deliberately", makes two claims the tree no longer supports. Both are
verified against the current tree in this session (see `proposal.md`):
`InstanceQueryForm.tsx` exists, and the `heldValues` fallback query in
`instance-query-source.ts` exists.

## Goals / Non-Goals

**Goals:**
- Close the `ROADMAP.md` gap for exactly the eight named changes, no others.
- Add the two missing `docs/current-state.md` subsystem descriptions, in the
  file's own established voice and section style.
- Correct exactly the two named stale claims in `docs/decisions.md`, leaving
  the rest of that entry, including the nearby "Shipped 2026-08-28" date on
  the neighboring "Instance data tables" entry, untouched.

**Non-Goals:**
- No `docs/roadmap-history.md` stage write-ups. That file holds prose
  retrospectives authored when a stage shipped; reconstructing eight of
  those after the fact would guess at reasoning nobody recorded at the
  time, and `ROADMAP.md`'s own convention only requires a table row for a
  finished stage, not a history entry as a precondition. `ROADMAP.md`
  states the table row is what closes a stage; the history file is where
  its story lives, not a required companion. It does not exist for the
  first time under this change's scope.
- No new push-gate check for roadmap staleness. `CLAUDE.md` already records
  this as a defect class deliberately left ungated: no reliable mapping runs
  from an archived change name to a stage number, so a detector would guess.
  This change does not reopen that decision.
- No fix to the "Instance data tables" entry's own date typo next to the
  two corrected bullets. It is real but outside what `tmp/offene-items.md`
  item 21 named; scope stays to the four gaps that item lists.

## Decisions

**Stage numbering starts at 46, one stage per change, in archive-date
order.** Each of the eight changes is its own capability with its own
`Why`; folding them into fewer stages would misrepresent what shipped as
one effort when the archive shows eight separate proposals across four
days. Ascending by archive date matches every existing table row's
implicit ordering (stage number rises with build order).

**Each stage row cites the change name(s) and capability spec(s) `openspec
status`/the archived directory already record**, not a paraphrase. The
existing table's own convention is a change-name list plus a spec-name
list per row; this change extends that convention rather than inventing a
new column or format.

**`docs/current-state.md`'s two new sections go at the file's end**, as
`## <Title> (\`<change-name>\`)` headings, matching every section from the
existing `## Process Studio, migration-plan field mapping` heading onward
(the file's later-added-subsystem convention), rather than being spliced
into the long undifferentiated bullet list the file's earlier content uses.
That earlier list predates this per-subsystem heading convention; a new
insertion there would need to match a style the file itself moved away
from.

**The two `docs/decisions.md` corrections stay inside the same "Aggregated
data source" entry**, moved out of "Open, deliberately" and written the way
the entry already writes a resolved item ("The missing half — closed",
"Two participants picking the same device — resolved by..."): name what was
open, name what closed it, cite the file. This matches the entry's existing
convention for a shipped follow-up rather than introducing a new section
shape.

**`skip_specs: true`.** None of the three files edited here states a
requirement any `openspec/specs/` capability owns; each restates, for a
human reader, behavior some other archived change's spec already commits
the engine to. `CLAUDE.md`'s own text on this defect class treats
"detecting when `ROADMAP.md` goes stale" as explicitly out of scope for a
mechanical gate, so this change adds no spec requirement asserting these
three files "stay accurate" — that would be an unenforceable, ungated
requirement invented to satisfy `openspec validate` rather than a real
behavior contract.

## Risks / Trade-offs

- [A ninth undocumented archived change surfaces later, past this change's
  cutoff] -> Out of scope by construction: this change closes the gap for
  changes archived through 2026-08-30, the date `tmp/offene-items.md` was
  written against. A later change follows the same convention this one
  establishes (one stage row, added when the change is archived, not
  batched).
- [A stage number collides with a number already reserved in `## Open
  stages`] -> Checked directly against the file in this session: 40, 43 and
  44 are the only reserved numbers below the table's current top of 45; 46
  onward is unclaimed.

## Migration Plan

Doc-only edits to four already-tracked files. No deploy, no data migration,
no rollback beyond `git revert`.

## Open Questions

None. Every claim this change corrects was verified against the current
tree in this session before this document was written.
