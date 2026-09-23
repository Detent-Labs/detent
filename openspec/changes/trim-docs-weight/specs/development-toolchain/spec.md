## ADDED Requirements

### Requirement: The per-subsystem map names files, never exported symbols

`docs/current-state.md` SHALL describe each subsystem in a short entry. An
entry says what the subsystem does, which directories and files hold it, and
which spec capabilities own its rules.

The map SHALL NOT name an exported function, type, class or constant. A rename
of such a symbol then leaves the map correct. A reader who needs symbol detail
goes to the knowledge graph, the code or `docs/openapi.yaml`. The map SHALL
say so in its opening paragraph.

#### Scenario: A symbol rename leaves the map correct

- **WHEN** a change renames an exported symbol and moves no file
- **THEN** every line of `docs/current-state.md` stays correct

#### Scenario: A reader looks for symbol detail

- **WHEN** a reader opens `docs/current-state.md` for a function's behavior
- **THEN** the opening paragraph sends the reader to the knowledge graph, the
  code or `docs/openapi.yaml`

### Requirement: Reasoning for a shipped decision lives in the decisions archive

`docs/decisions.md` SHALL hold open questions, decisions not yet built, open
review findings and refused simplifications. The reasoning behind a decision
that has shipped SHALL live in `docs/decisions-archive.md`.
`docs/decisions.md` SHALL link that file.

A change that builds a decided entry of `docs/decisions.md` SHALL move that
entry into `docs/decisions-archive.md`. The move keeps the entry's text
word for word.

#### Scenario: A decision ships

- **WHEN** a change builds an entry that `docs/decisions.md` lists as decided
  and not yet built
- **THEN** the same change moves the entry into `docs/decisions-archive.md`
- **AND** `docs/decisions.md` no longer lists it

#### Scenario: A reader looks for the reasoning behind a shipped feature

- **WHEN** a reader opens `docs/decisions.md` for a shipped decision
- **THEN** a link in that file leads to `docs/decisions-archive.md`
