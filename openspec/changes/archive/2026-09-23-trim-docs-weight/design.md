# Design

## Context

See proposal.md for the motivation. The owner settled the scope on 2026-09-23
with three rulings:

1. The change covers `docs/current-state.md` and `docs/decisions.md` only.
2. The shipped reasoning in `docs/decisions.md` moves into an archive file,
   word for word.
3. A short index replaces `docs/current-state.md`, and the knowledge graph
   carries the symbol detail.

`docs/current-state.md` has two parts today. Lines 1 to 3610 are 94 top-level
bullets with no headings, one per feature as it landed. Lines 3611 to 5095
are 20 `##` sections, one per archived change. Each change also has an
archived `design.md` and a live spec, so the per-change prose repeats those.

In `docs/decisions.md`, the section "Decided and built" runs from line 243 to
line 1065. It holds seven entries. No spec, rule or source comment cites one
of them. Three lines in `docs/roadmap-history.md` do: line 1777 (instance data
tables), line 1829 ("The missing half") and line 1882 ("Long text").

The live references to `docs/current-state.md` are:

- `CLAUDE.md:305`, the entry in the list of other documents.
- `docs/decisions.md:4`, `:226`, `:1061`, `:1185`, `:1202`, `:1217`, `:1519`.
- `docs/browser-checks.md:135`, which cites the Panzoom exclusion.
- `.github/workflows/check.yml:4`, which cites the CI record.

Line 1061 of `docs/decisions.md` sits inside the moved section. It moves with
it and stays as a dated record.
- `ROADMAP.md:17`, `docs/roadmap-history.md:14` and
  `docs/authoring-guide.md:1138`. These say only that the file describes each
  subsystem, which stays true.

## Goals / Non-Goals

**Goals:**

- An index that no symbol rename can make wrong.
- A `docs/decisions.md` that holds only work still open, plus the refused
  simplifications.
- Every live citation still resolves after the change.

**Non-Goals:**

- Checking whether each removed bullet has a second home. Git history keeps
  the full file, and the index header names the commit.
- A gate that rejects a symbol name in the index. CLAUDE.md records why a grep
  detector failed here (76 false positives in 786 exports).
- A rewrite of any archived change. Those cite old line numbers on purpose.

## Decisions

**D1. The index keeps the path `docs/current-state.md`.** Five files and
CLAUDE.md link this path. A new name would need every link changed, for no
gain. Alternative: `docs/map.md`. Rejected for the link churn.

**D2. One `##` heading per subsystem, about 20 entries.** The entries follow
the layout block in CLAUDE.md and the four areas of `packages/web`. The
starting set is:

- Definition contract and field model
- CEL
- Publish validation
- Engine: store, outbox, transitions, timers
- Subprocess and process chaining
- Migration
- Runtime API Layer
- HTTP wrapper and security headers
- Authentication and authorization
- Action handlers
- Data sources and assignment strategies
- Data lists and templates
- Reporting engine
- Observability and worker errors
- The web shell
- The app area and `packages/form-ui`
- The admin area
- Process Studio
- The reporting area
- Tooling: devcontainer, CI, gates, deployment

Each entry has at most eight lines. It gives what the subsystem does in one or
two sentences, then the paths, then the capability names under
`openspec/specs/`. The Tooling entry names `.github/workflows/check.yml`, so
the comment in that file stays true. Role strings such as `system:admin` and route prefixes such
as `/admin` may appear. They are values, not symbols, and a code rename does
not change them.

**D3. The header names the last full version.** It gives one short SHA.
That commit last touched the old file. For the old text, the
reader runs `git show <sha>:docs/current-state.md` with that SHA.

**D4. The archive file copies its source's `allow-file` directive.**
`docs/decisions-archive.md` is a new path. The prose gate diffs with `-M` and
no `-C`, so it misses a partial move and reads a base count of 0. Every
finding in the moved text then counts as a rise.

The source's six-rule directive leaves 12 findings in the moved lines: 7
trailing-negation, 4 negation-habit and 1 paragraph-length. Each of those sites
gets a targeted directive on the line above it, with a sentence that gives the
reason. Directive lines are comments, so the prose stays word for word.

Alternative: rewrite the sites until they pass. Rejected because it
contradicts ruling 2. Alternative: widen the `allow-file` line to nine rules.
Rejected because CLAUDE.md prefers the targeted form.

**D5. Two open entries in `docs/decisions.md` close.** The entry at line 226
asks whether `docs/current-state.md` describes the tree as it stands. The
index answers yes. Finding CQ-2 at line 1516 names the hand-kept symbol list.
The index removes that list. Both entries then say what closed them, as the
`development-toolchain` rule for closed findings requires. The CQ-2 part about
the header of `src/auth/authorize.ts` stays open.

**D6. Generic citations point at the spec capability.** The citations at
`docs/decisions.md:1185`, `:1202` and `:1217` say "see
`docs/current-state.md`" for data sources and assignment strategies. They
change to `openspec/specs/data-source-resolution/` and
`openspec/specs/assignment-strategy-registry/`, which carry the rules.
`docs/browser-checks.md:135` cites the Panzoom exclusion. It changes to
`packages/web/src/areas/studio/canvas/CanvasView.tsx`, which sets the class.

## Risks / Trade-offs

- [A removed bullet held a fact that no other file records] → Git history
  keeps it. The index header names the commit.
- [The `docs/browser-checks.md` line conflicts with the smoke-suite
  worktree] → It is one line. The later merge resolves it by hand.
- [The new index trips a whole-file prose rule] → The file's count falls from
  thousands to tens, so the ratchet passes. Run the gate before the push.
- [A new `docs/` file breaks the audit-record rule] → The archive holds
  decision reasoning. An audit record is a different thing.

## Migration Plan

Documentation only, so no deploy step. Rollback is a revert of the commit.

## Open Questions

None.
