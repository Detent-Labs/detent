# Tasks

## 1. Move the shipped reasoning out of decisions.md

- [x] 1.1 Create `docs/decisions-archive.md` with the same `allow-file` line as `docs/decisions.md`, a heading and a one-paragraph opening (design D4). Verify: the file's first line matches line 1 of `docs/decisions.md`.
- [x] 1.2 Move lines 243 to 1065 of `docs/decisions.md` into it word for word. Verify: with the directive lines stripped, `diff` against `git show HEAD:docs/decisions.md | sed -n 243,1065p` prints nothing.
- [x] 1.3 Add a targeted directive with a reason above each of the 12 residual findings in the new file (design D4). Verify: the antislop linter reports no finding for `docs/decisions-archive.md`.
- [x] 1.4 Rewrite the opening paragraph of `docs/decisions.md`. It lists what the file holds and links `docs/decisions-archive.md`. It also states that a change which builds a decided entry moves that entry to the archive. Verify: the link resolves.
- [x] 1.5 Re-point `docs/roadmap-history.md:1777`, `:1829` and `:1882` to `docs/decisions-archive.md`. Verify: a grep of the three lines names the new file.

## 2. Replace current-state.md with the index

- [x] 2.1 Record the short SHA of the last commit that touched `docs/current-state.md` with `git log -1 --format=%h -- docs/current-state.md`. Verify: `git show <sha>:docs/current-state.md` prints 5095 lines.
- [x] 2.2 Write the new `docs/current-state.md` per design D2 and D3, one `##` heading per subsystem, about 300 lines. Its opening paragraph sends a reader who needs symbol detail to the knowledge graph, the code and `docs/openapi.yaml`. Verify: `wc -l` reports 350 lines or fewer.
- [x] 2.3 Check each path the index names. Verify: a loop over every backticked path in the file finds each one with `ls`.
- [x] 2.4 Check that the index names no exported symbol. Verify: list every backticked token that is not a path, a capability name, a role or a route. Each remaining token must match no `export` in `src/` or `packages/`.

## 3. Re-point and close the citations

- [x] 3.1 Rewrite the `docs/current-state.md` entry in the list of other documents in `CLAUDE.md` without the symbol-confirming advice. Add `docs/decisions-archive.md` beside `docs/decisions.md`. Verify: a grep of `CLAUDE.md` finds both files.
- [x] 3.2 Close the `docs/decisions.md` entry that cites `docs/current-state.md:482` and the current-state part of CQ-2 (design D5). Verify: both entries state what closed them.
- [x] 3.3 Re-point the three data-source and assignment citations in `docs/decisions.md` to their spec capabilities (design D6). Verify: `grep -n current-state docs/decisions.md` prints only the opening paragraph and the two entries task 3.2 closed.
- [x] 3.4 Re-point `docs/browser-checks.md:135` to `packages/web/src/areas/studio/canvas/CanvasView.tsx`. Verify: a grep of the file finds no `current-state` citation there.

## 4. Verification

- [x] 4.1 Run `bun run typecheck` in the devcontainer. Record its output.
- [x] 4.2 Run the full `bun test` with `DATABASE_URL` set in the devcontainer, and pipe the output through `sh scripts/gates/silent-green.sh`. Record the pass, skip and fail counts.
- [x] 4.3 On the host, run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`. Record its output.
- [x] 4.4 On the host, run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh`. Record its output.
- [x] 4.5 Run `openspec validate trim-docs-weight --strict`. Record its output.
