## Context

The sources sit in `tmp/audit-2026-10-10/`, and all of them are German. The
report `bericht.md` holds 38 KB. Nine area reports in `reports/` hold 21 to 32
KB each. `verify-ledger.md` holds 5 KB. `plan.md` groups the findings into
changes. The proposal states why the audit needs a home.

The model is `openspec/changes/archive/2026-08-18-code-review-record/`. It
holds a `README.md` and four reviews, and it has no change of its own. Three of
its files carry an `allow-file` directive. `CLAUDE.md` names that pattern as
the one to avoid.

The prose gate compares a Markdown file's antislop count at the range base with
the count at the tip. A new file has base 0, so every finding in it blocks the
push. The linter exits 0 when it reports warnings alone, and the gate then
counts 0. This change aims for no output at all.

`docs/decisions.md` carries an `allow-file` directive on line 1. It covers
`synonym-rotation`, `em-dash`, `passive-voice`, `sentence-length` and
`run-ons`. A new section there is exempt from those five rules. The other
twelve rules still count.

The `development-toolchain` capability states where an audit lands. It also
says the audit's own change names both homes in its `tasks.md`. The repository
`Detent-Labs/detent` is public.

## Goals / Non-Goals

**Goals:**

- The record keeps every finding, its evidence and its method, in English, at
  the audited commit.
- The index lets each later change find its own entries and close them.
- The prose gate passes with no `allow-file` directive in the record.

**Non-Goals:**

- Fixing any finding.
- Archiving `plan.md`, the briefs, the worker rules or the status files. They
  steer the fix run and are not audit evidence. The README keeps the owner
  rulings. The index keeps the map from finding to change.
- Re-checking a finding against the tree. The record states one point in time.
- Changing the `development-toolchain` capability.

## Decisions

### 1. The record gets its own archive directory

The record lives in `openspec/changes/archive/2026-10-10-audit-record/`. This
change creates it in place, the way the 2026-08-18 record arrived. The
directory name takes the audit date. This change archives later under its own
name.

The alternative was to keep the record inside this change and archive both
together. The archived name would then start with the archive date and hide the
audit date. That directory would also mix the audit with the proposal, design
and tasks.

The layout follows the source:

- `README.md`
- `AUDIT.md`, from `bericht.md`
- `verify-ledger.md`
- `reports/A.md`, `B.md`, `C.md`, `D.md`, `E1.md`, `E2.md`, `F.md`, `G.md`,
  `H.md`

The report cites `reports/A.md` and `verify-ledger.md` relative to its own
folder. The same layout keeps those citations true.

### 2. The ledger comes along

The report cites the ledger for repro output and for the reason behind each
downgrade. The ledger is small. Leaving it out would orphan those citations.

### 3. A translation keeps content and rewrites sentences

Every heading, finding id, severity, evidence tag, location anchor, quoted
output, code span and number stays. A translator changes sentence shape only.
It splits long sentences and never drops a clause, merges two findings or adds
a judgment.

Labels use one English word each, in every file:

| German | English |
|---|---|
| Bereich | Area |
| Funde, Fund | Findings, finding |
| Fall | Case |
| Mechanismus | Mechanism |
| Ort | Location |
| Schweregrad | Severity |
| Beleg | Evidence |
| Gegenbeweis gesucht | Counter-evidence sought |
| Bekannt, neu | Known, new |
| Vorschlag | Suggestion |
| Geprüft ohne Fund | Checked without a finding |
| Repro-Vorschläge | Repro proposals |
| Nicht geprüft | Not checked |
| kritisch, hoch, mittel, niedrig | critical, high, medium, low |
| rep (reproduziert), best (bestätigt), verm (Vermutung) | reproduced, confirmed, assumed |

Domain words follow `CLAUDE.md` and `.claude/rules/ui-glossary.md`: participant,
operator, process owner, step, path, draft, version, definition contract. A
product string or program output stays as the program printed it.

### 4. The prose gate (coordinator ruling 2026-10-11)

A translator writes clean English first. It runs the linter on the file and
repairs what the linter reports. A fix loop stops after five rounds.

A directive covers only a quote, a table or a finding id that forces a
finding. A fixed glossary term counts as a quote of the glossary.

A directive takes the two-line form the 2026-08-18 record uses. The first line
names the rule. The second line gives the reason. No file carries `allow-file`.
Each translation task reports its directive count.

The dispatch for each task carries the linter traps found in earlier work:

- A sentence that opens with a code span merges with the sentence before it.
- A period followed by a lowercase word does not end a sentence.
- A bold label and the sentence after it count as one sentence.
- A list item is one block, with a limit of six sentences.
- Splitting sentences can trip `paragraph-length`.
- `error` and `issue` count as one concept, as do `change` and `edit`.

### 5. The security cut (owner ruling 2026-10-11)

Nine findings concern security: C-1, C-2, C-3, C-8, D-1, D-3, D-8, G-5 and
G-12. The record keeps their case narrative, their mechanism, their locations
and the quoted check output. It drops the literal attack payloads.

For D-1 the record omits the request body and the concrete byte sequence. It
keeps the mechanism and the quoted status, size and content type. For C-1 the
record names the endpoints and omits the request sequence around them. The
index states each of the nine in one factual risk sentence with no trigger
recipe.

The final review found payload-like text in four more unfixed findings. The
coordinator extended the cut on 2026-10-11 to B-5, C-4 with D-2, C-7 and D-6.
The record keeps their narrative, mechanism, locations and quoted output. It
drops the literal values and the step-by-step sequences. The textbook pattern
in A-3 and the existence-oracle narrative in D-7 stay.

### 6. The index

The new section sits directly above `## Refused simplifications`, after the
last open section. Its heading is "Open from the 2026-10-10 audit (one OpenSpec
change each)".

An intro paragraph links the record and names where the full text sits: the
finding id in `AUDIT.md` and in `reports/<area>.md`. It says the line numbers
are those of `5f41cd8a`. It says each later change deletes its own entries in
the commit that archives it. The change `sweep-docs-drift-2026-10` re-points
the line citations of other entries.

An entry has this shape:

- **`change-name` (ids; severity)**: one sentence on what is wrong. Anchors:
  up to three file paths in code spans.

The anchors satisfy the `development-toolchain` rule that an entry names the
finding's anchor in the tree. A path survives later merges, so an entry needs
no line number.

The section holds 36 entries. They are the 35 planned changes in plan order,
then the existing change `postgres-login-rate-limit` for C-7. The severity is
the highest one among the change's findings. Every finding appears once, except
B-14. Its duplicate name belongs to `fix-handler-assignment-registry`, and its
dead exports belong to `remove-dead-exports`. The merged pairs C-4 with D-2 and
C-6 with F-6 share one entry each.

### 7. Apply method

Apply runs on `superpowers:subagent-driven-development`, one implementer per
task group. The translation groups write disjoint files. Each reviewer checks
its group with these mechanical tests:

- The finding ids of the source all appear in the translation.
- Every file name and line range in the source appears in the translation. The
  security cut is the only exception.
- The linter prints nothing. `grep -c "antislop: allow"` reports the directive
  count. `allow-file` appears nowhere.
- The file has no CR byte and no trailing space. It names no home-directory
  path.

The reviewer also reads three findings against the German and confirms every
clause.

The fidelity check is this script. Run it from the session scratchpad, never
from `tmp/` and never inside the repository:

```python
# usage: python fidelity.py SOURCE.md TRANSLATION.md
import re, sys
a, b = (open(p, encoding="utf-8").read() for p in sys.argv[1:3])
ids = lambda t: set(re.findall(r"\b[A-K][12]?-\d+\b", t))
anchors = lambda t: set(re.findall(
    r"[\w./-]+\.(?:tsx?|md|ya?ml|json|sh|toml|css)\b|:\d+(?:-\d+)?", t))
print("missing ids:", sorted(ids(a) - ids(b)))
print("missing anchors:", sorted(anchors(a) - anchors(b)))
```

## Risks / Trade-offs

- **A translation drops a clause.** → The set and anchor tests catch dropped
  ids and anchors. The clause-level read catches the rest. The German originals
  stay in `tmp/` until the merge.
- **The 20-word limit makes the text stiff.** → The coordinator ruled for clean
  English. The fix loop caps at five rounds, then a directive with a reason
  takes over.
- **The index raises the count of `docs/decisions.md`.** → Task 12.1 measures
  the count first. The section keeps entries short and avoids the patterns of
  the twelve rules the file does not silence. The count must end at its
  starting value.
- **The public repository exposes an unfixed security finding.** → The cut in
  decision 5 removes the payloads. Each fix change deletes its own index entry.
  Pushed text stays in the git history, so the owner ruled on the cut first.
- **Thirty-six later changes touch one section.** → Expect merge conflicts in
  the index. Resolve them mechanically and run the suite again.
- **Line numbers drift after later merges.** → The README calls them historical
  anchors of `5f41cd8a`. They are not live pointers.

## Migration Plan

The change adds files and one section. It has no deployment step.

Merge order matters in one place. This change merges before any other change of
the audit. Each later change then finds the index and strikes its own entries.
A later change that starts earlier waits for this merge before it archives.

To roll back, revert the merge. The record and the section leave together. No
data, schema or running service depends on either.

## Open Questions

None. The coordinator and the owner answered the prose gate, the originals, the
line numbers and the security cut on 2026-10-11.
