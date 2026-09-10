## Context

See `proposal.md` for motivation. Seven measured facts fix the shape of this
change. This session checked each one at the source, in the tree at `4b5d20f3`.

**One.** `docs/field-model-redesign.md` holds 319 lines, 25 numbered decisions
(D1-D25, no gaps) and 5 scope exclusions (S1-S5). A brainstorming session
produced it on 2026-08-30, for a programme of four changes.

**Two.** Three of those four changes shipped. Change 1 is
`field-model-type-format-control` (ROADMAP stage 54), change 2 is
`field-model-person-format` (stage 55), change 3 is `field-model-view-note`
(stage 56), which shipped the note and left four view shapes open. Change 4,
the item list, has no directory and no design.

**Three.** The engine already builds 19 of the 25 decisions. A living spec or a
live document states each of those 19, and none of them needs this file. D1, D2,
D4, D5, D6 and D25
sit in `definition-contract`. D8, D11, D12, D14, D19 and D22 sit there too. D9
and D24 sit in `cel-expressions`. D15 and D23 sit in `data-source-resolution`,
D13 in `actor-from-field-assignment`, D16 in `form-ui`, and D17 in
`docs/authoring-guide.md`. D18 is motivation that change 1 consumed.

**Four.** Six items exist only here. This session searched for each across
`docs/`, `openspec/`, `.claude/rules/`, `CLAUDE.md`, `ROADMAP.md` and `src/`. The
`richtext` escaping argument (D7 at `:74-77`, D20 at `:159-162`), the `image`
and `signature` deferral (D20 at `:164-166`), the `slider` and `stars` deferral
(D21 at `:178-180`), the `items` key for a typed list (D3 at `:60-61`), S3 at
`:255-256` and S4 at `:258-260`. Repo-wide, S3 and S4 draw one other hit each,
`field-model-person-format/proposal.md:85`, which names the two labels and no
content.

**Five.** The label namespace does not dissolve. Nine archived Markdown files
carry about 105 citations of D and S labels. The count is `\b[DS][0-9]+\b`
over the nine artifacts of the three field-model changes. A sentence such as
`field-model-person-format/design.md:34` means nothing without the referent.
That one reads "Non-Goals (D20, S1-S5, D8)". The labels are not globally unique
either: `stylex-phase-0-tooling/design.md:175` declares its own D9.

**Six.** Two sections of the record are stale. "What is wrong today" (`:11-33`)
narrates the pre-change state in the present tense, and both of its line
references are dead. "What change 1 touches" (`:276-309`) sized a change that
shipped, so every line number in it has moved.

**Seven.** The prose gate reads a renamed file's base count at the old path.
`scripts/gates/prose.sh:23` states the rule, and the `-M` flag on its `git diff`
call implements it. A `git mv` therefore costs zero findings, whatever the file
carries. That is what makes this move affordable.

## Goals / Non-Goals

**Goals:**
- Leave nothing under `docs/` that is load-bearing for this record.
- Keep every D and S label resolvable from the archives that cite it.
- Give the six live items a home that already exists and that a reader already
  visits.
- Leave every archived sentence exactly as its change wrote it.

**Non-Goals:**
- No rewrite of the record's prose, before or after the move. The file travels
  byte for byte.
- No repair of the two stale sections. An archive is a snapshot, and a snapshot
  may carry what was true on its date.
- No new requirement anywhere in `openspec/specs/`.
- No change to `docs/doc-audit-2026-09-09.md` or its plan file. Both are
  outside git, so neither one counts as repository state.

## Decisions

**Destination.** The file goes to
`openspec/changes/archive/2026-08-30-field-model-type-format-control/`. Change 1
is where all 25 decisions were either implemented or deferred, and it draws
three of the ten archived citations. Changes 2 and 3 then cite a file under a
sibling change's directory. Those three changes already cross-reference each
other, so this does not add a new kind of link.

The alternative was a new `docs/archive/` directory. That answers the owner's
objection with a rename. A dated design record would still sit under `docs/`,
one directory deeper.

**The mutation precedent, resolved.** This record is not frozen. Commit
`7aaa1049` wrote into it, driven by tasks 6.3a and 6.3d of a shipped change
(`archive/2026-09-01-field-model-view-note/tasks.md:127` and `:129`). Those
tasks produced two passages. Lines `:248-249` say that change 3 shipped the
first of the five view shapes, the note. Line `:270` is the ordering table's
row 3, which now names the note as shipped and the other four as open.

Both passages travel with the file, unedited. The record describes a programme
of four changes. Its own ordering table covers all four. A status note about
change 3 is therefore native to the document.

Lifting the two passages out would break the owner's condition that the file
move unchanged. It would also buy nothing. Stage 56 of
`docs/roadmap-history.md` carries the same fact, and
`docs/decisions.md:111-121` carries the four open shapes.

What the move does change is the record's status. After it, the file is frozen
like every other archived artifact. A future write-back of this kind goes to
`docs/decisions.md` under `## Open questions`, which is the register S1 and S2
already use and which this change extends by six entries.

**Where the six items land.** They append at the end of `## Open questions` in
`docs/decisions.md`, beside S1 (`:55-63`) and S2 (`:111-121`). Each new bullet
states its case without the reader opening the record, the way S1 states the
expense-claim case today. Each also carries its label for provenance.

Two of the six need a fact checked at write time. The `image` and `signature`
argument rests on `file` being opaque, and `JS_TYPE` still maps `file` to
`"any"` at `src/schema/definition.ts:407`. The `items` key is a different shape
from S1: S1 is a repeating sub-table of rows and columns, while `items` types
the members of a flat list.

**Path citations get corrected, prose does not.** All ten archived citations
name the old path inside a sentence. A path is a code span, so replacing it
leaves the surrounding words untouched. Change 1's own three sites take the bare
filename, since the file will sit beside them. The five sites in changes 2 and 3
take the full archive path.

This is the one place where the owner's condition on archived prose needs a
reading. A corrected path is a pointer repair, not a rewrite: the sentence keeps
every word it had. Leaving ten dead paths behind would be the larger harm. The
citation layer is the whole reason the record survives.

**Why this change writes no requirement.** No spec requirement records the six
deferrals, and the change sets `skip_specs: true`. A deferral names roadmap
position rather than behavior. No test can exercise one. A
requirement reading "the contract SHALL NOT carry `richtext`" becomes wrong on
the day somebody builds it. It also invites the next reader to treat a deferral
as a prohibition. The repository does carry negative requirements, but for
invariants.

**Ordering.** This is change 3 of 3, and it lands last.
`retire-ponytail-ledger-gate` lands first, `code-review-record-home` second.
All three write into `docs/decisions.md`, so every task here anchors on the
`## Open questions` heading and on `grep`, never on a line number.

What this change assumes about `docs/decisions.md` when it runs, per the
first sibling's Migration Plan. The file carries five top-level headings. The
first four are the ones `main` holds today, in the same order. The fifth,
`## Refused simplifications`, is new, sits last and runs to the end of the
file. The first sibling added one bullet inside the third section and rewrote
SEC-5 in place. The second appended ARCH-1 at the tail of
`## Open questions` and nine entries inside the code-review section. Every
line number from `:10` down has therefore moved.

This change writes inside `## Open questions` alone, after ARCH-1, and
replaces two code spans it finds by content. It appends nothing at the end of
the file, since that would land inside the refusal record. The `tasks.md`
header checks the five-heading state before task 1.1, and task 1.7 checks it
again after the six bullets land.

## Risks / Trade-offs

- [The archive gains an artifact OpenSpec does not define, beside `proposal`,
  `design`, `tasks` and `specs`] -> Accepted. `openspec validate` reads the
  named artifacts and ignores other files. The archive is a directory of record,
  and this file is a record of the same work.
- [A reader takes the record's stale sections for current fact] -> An archive
  path signals a dated document. Those two sections describe a pre-change state
  and a shipped change's sizing list. A reader in `docs/` got no such signal,
  which argues for the move.
- [A code-span correction shifts an antislop count nearby] -> Each corrected
  file gets its own ratchet. Tasks 3.0 and 4.1 measure every touched file's
  base count at `HEAD` first, and tasks 3.5 and 4.5 fail on any rise. The
  count follows `prose.sh`'s `lint_at`: 0 on exit 0, else the printed lines.
  `docs/current-state.md` sits at 619 and exits 1, so "exits 0" is not the
  test there; "at or below 619" is.
- [A live pointer survives and the path rots] -> Task 5 greps the whole tree for
  the old path. It requires zero tracked hits outside the record's new home.

## Migration Plan

One `git mv`, about 40 new lines in `docs/decisions.md`, and 17 one-line path
corrections. No deploy, no data migration, no rollback beyond `git revert`.

Nothing outside Markdown changes, so no browser check applies. The typecheck,
the build and the full suite still run once, as the final Verification group
in `tasks.md`. That is how `2026-08-30-doc-bookkeeping` ran them for a
docs-only change. They prove that no code file moved. The controller runs
them after the three record-home changes land.

## Open Questions

None. The mutation precedent was the only open item, and the Decisions section
above settles it.

## Rejected suggestions

- S5 of the 2026-09-10 review, the heading-count conflict between the two
  siblings, belongs to the controller. This change assumes the five-heading
  state the first sibling's Migration Plan describes. Ordering states that
  assumption, and the `tasks.md` header checks it. No task here changes
  under either sibling order.
