# Proposal

## Why

On 2026-09-23 the top-level Markdown held about 22.5k lines, against 21.7k
lines of engine code in `src/`. `docs/current-state.md` alone holds 5095
lines. It names exported symbols by hand. Every rename leaves a passage
wrong, and no gate catches it. The file `docs/decisions.md` holds 2490 lines.
About 820 of them record decisions that already shipped.

## What Changes

- Replace `docs/current-state.md` with a short per-subsystem index of about
  300 lines. Each entry says what the subsystem does, which directories and
  files hold it, and which spec capabilities own its rules. The index names no
  exported symbol. For symbol detail it points at the knowledge graph, the
  code and `docs/openapi.yaml`. Its header names the commit that holds the
  last full version.
- Move the section "Decided and built (kept for the reasoning)" out of
  `docs/decisions.md`, word for word, into a new `docs/decisions-archive.md`.
  `docs/decisions.md` links the new file. It keeps the open questions, the
  decided-but-not-built entries, the open review findings and the refused
  simplifications.
- Close two open entries in `docs/decisions.md` that this change settles. The
  first asks whether `docs/current-state.md` describes the tree as it stands.
  The second is finding CQ-2, which names the hand-kept symbol lists.
- Re-point each live reference that cites a removed or moved passage. The
  references are in `CLAUDE.md`, `docs/decisions.md`,
  `docs/roadmap-history.md` and `docs/browser-checks.md`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `development-toolchain`: adds two documentation rules. The per-subsystem
  map names files and capabilities, never exported symbols. Reasoning for a
  shipped decision leaves `docs/decisions.md` for
  `docs/decisions-archive.md`.

## Impact

- Documentation only. No code, schema, route or test changes.
- `docs/browser-checks.md` changes by one line. The
  `add-playwright-smoke-suite` worktree edits the same file, so a merge
  conflict is possible there.
- Out of scope: `docs/browser-checks.md` beyond that one line,
  `docs/roadmap-history.md` beyond its two re-pointed references, and
  `docs/authoring-guide.md`.
