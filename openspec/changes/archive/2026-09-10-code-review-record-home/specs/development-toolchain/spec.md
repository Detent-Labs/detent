## ADDED Requirements

### Requirement: An audit's findings, evidence and method each land in a named home

A code review, a security audit or a documentation audit produces two kinds of
output. Its open findings are live state. Its evidence, its method and its
confidence bounds are frozen history. An audit SHALL give each kind its own
home, and SHALL leave neither in a tracked file under `docs/`.

Every open finding SHALL land in `docs/decisions.md`. An entry names the
finding, its anchor in the tree, and its risk in one factual sentence. A
finding a later pass closes SHALL say so rather than persist as open. A
security finding SHALL describe no exploitation path.

The audit document itself SHALL land in an archived OpenSpec change, under
`openspec/changes/archive/`. That document keeps its date, the commit it read,
the method it used and the limits of that method. The archive is this
repository's only frozen home, so a dated claim there stays true. No push gate
rewrites archived prose. The prose gate reads a renamed file's base count at
the old path, so the move itself costs nothing.

A tracked, mutable file under `docs/` SHALL NOT hold an audit record. A
regenerable snapshot SHALL stay untracked instead, the way
`PONYTAIL-AUDIT.md` and `PONYTAIL-DEBT.md` do at `.gitignore:51-52`.

An audit's own change SHALL name both homes in its `tasks.md`. The review before
archive SHALL refuse the change while either home stays unwritten. That refusal
is a reviewer obligation. No script enforces it.

#### Scenario: A finished audit splits along its two homes

- **WHEN** an audit pass produces a dated review document with open findings
- **THEN** the change carrying it appends every open finding to
  `docs/decisions.md`
- **AND** the change moves the review document into its own archived OpenSpec
  entry
- **AND** no tracked file under `docs/` holds the review

#### Scenario: A finding the tree already closed reads as closed

- **WHEN** a carry-over re-checks a finding against the tree and finds it
  closed
- **THEN** the entry states that the tree closes it, and names what closed it
- **AND** the entry does not read as open work

#### Scenario: A regenerable snapshot stays untracked

- **WHEN** a tool regenerates its own report on demand
- **THEN** that report stays untracked
- **AND** the durable record lives at the site the tool reads

#### Scenario: An unhomed audit waits at the archive review

- **WHEN** an audit change reaches its archive review with its findings missing
  from `docs/decisions.md`
- **THEN** the reviewer refuses the archive until the findings land there
- **AND** the review names the section the findings belong in
