# Design

## Context

See proposal.md for the motivation. Measured on 2026-10-20 on branch
`drop-windows-host-support`: `CLAUDE.md` holds 508 lines, 4,679 words and
32,499 bytes. Its sections:

| Section | Lines | Kind |
|---|---|---|
| What this is | 4–41 | rules and domain terms |
| Stage, Hard v1 boundaries | 42–60 | rules |
| The definition contract in brief | 61–82 | rules |
| Change workflow (OpenSpec), Apply runs on SDD | 83–159 | rules mixed with anecdotes |
| Verification | 160–191 | rules |
| Enforced mechanically, Prose debt | 192–256 | rules, one self-reference, a history line |
| Repository layout | 257–310 | duplicates `docs/current-state.md` |
| Where the rest is documented | 311–348 | map |
| Codebase memory | 349–369 | tool guide |
| Conventions | 370–508 | rules mixed with test mechanics and measurements |

Statements that other files cite, all of which must survive:

| Cited by | Statement |
|---|---|
| `development-toolchain` "A browser check lands in one of three homes" | a real browser for any UI change; a running HTTP server corrupts test runs |
| `http-wrapper` (`BINARY_ROUTES`), `unified-shell` (router coverage) | the `/admin/*` route collision is one of three defects that passed a green suite |
| `push-gate-checks` "The suite cannot report a silent green" | the silent skip without `DATABASE_URL` |
| `push-gate-checks` "Pushed text carries no CR byte …" | `git diff --check` misses CRLF under `eol=lf` |
| `push-gate-checks` "Changed Markdown passes the prose linter" | the antislop check on every touched Markdown file; clearing cheap debt stays the norm |
| `definition-store`, `studio-plugin-config-form` (comments) | "authoring surface" is a reserved domain term |
| `scripts/gates/lockfile.sh`, `scripts/dev-up.sh` | tooling runs in the container, never on the host |
| `scripts/preflight.sh` | the codebase-memory index is per-machine state |
| `.claude/rules/process-contract.md` | "The definition contract in brief": `definitionHash`, CEL shape, commit-then-dispatch |
| `.claude/rules/ui-glossary.md` | operator and surface as reserved domain terms |
| `docs/browser-checks.md` (lines 3, 43) | the real-browser rule; the server poller that claims suite rows |
| `openspec/config.yaml` (line 122) | no single-file rerun of the DB suites |
| `src/engine/store.ts` (line 40) | the graceful skip without `DATABASE_URL` |

## Goals / Non-Goals

**Goals:**

- `CLAUDE.md` at most 380 lines, with every rule kept. A section-by-section
  estimate of D1 lands near 370. Where the number and a rule conflict, the
  rule wins, and the report records the real count.
- Every row of the citation table above still true.
- No code comment that points at `CLAUDE.md` for content it lacks.

**Non-Goals:**

- Changing any rule. This change moves and cuts words, not behavior.
- Moving anecdotes to another document. Each rule's origin lives in git
  history and in the archived change that introduced it. A second copy would
  drift.
- Editing `.claude/rules/*`. They load per path and already carry their own
  weight.

## Decisions

### D1. Section map

Each section maps to one action:

- **What this is.** Keep the domain terms (operator, surface, definition
  contract, `contract`), headless engine, the FSM paradigm, and the
  no-code/low-code split with its three raw-input sites. Tighten the prose.
- **Stage, v1 boundaries, definition contract.** Keep as they are.
- **Change workflow.**
  - Keep the rules: the trivial-fix test, UI changes never trivial with the
    capability map, no optional phase, the review before apply.
  - Keep the SDD facts and the `.claude/commands/opsx/` rule.
  - Drop the anecdotes: the "one-liner touched four files" sentence and the
    list of errors the review once found.
- **Verification.** Keep all five bullets. Keep the CRLF trap sentence and the
  three-defect sentence verbatim in substance, since specs cite both.
- **Enforced mechanically.**
  - Keep the table, the no-arguing rule, the `--no-verify` warning, the
    skip-floor and pass-floor rules, and the prose ratchet with its
    cheap-debt norm.
  - Drop the `bbf37d1` sentence. It describes the `allow-file` line, which D3
    removes.
  - Cut the four ungated defect classes to one sentence and its pointer.
- **Repository layout.** Replace it with a 10–12 line top-level map: the
  container directory, `src/` and its subdirectories in one line each,
  `packages/web` and `packages/form-ui`, `examples/`, `test/`, `e2e/`. Then a
  pointer: `docs/current-state.md` holds the per-subsystem detail.
- **Where the rest is documented.** Keep the list and shorten each entry to
  its purpose.
- **Codebase memory.** Keep the rules: index per machine, check
  `list_projects`, resolve the slug, prefer the graph for cross-file questions,
  re-index after big changes. Cut the tool catalogue to one line.
- **Conventions.**
  - Keep every rule.
  - Move the `rtk` paragraphs, the exit-1-with-`0 fail` meaning, the three
    traps and the 2026-09-30 measurement into
    `.claude/skills/devcontainer-exec/SKILL.md` (D2).
  - Keep one bold `DATABASE_URL` rule with the one-call host command.
  - Keep the server-corrupts-tests fact with its 3-of-20 against 0-of-20
    measurement, since a spec cites "CLAUDE.md records why".
  - Rewrite the `tmp/` rule machine-neutrally: shared across worktrees, no
    scratch; what it may hold.

### D2. Test mechanics live in the skill

The `devcontainer-exec` skill already owns how to run commands in the pod. It
gains a "Running the suite" section with the moved paragraphs, unchanged in
substance. `CLAUDE.md` keeps the rule and names the skill for the mechanics.

### D3. The `allow-file` line goes only with a linter run

Removing line 1 raises the file's antislop count by every finding it
silenced. The prose gate blocks a rising count. The gate skips on this
machine while the linter is absent, so the removal cannot be verified here.

The removal therefore sits in its own task. It runs the linter, fixes each
finding or places a targeted `<!-- antislop: allow <rule> -->` with a reason,
and stays open while the linter is missing. The rest of the change does not
wait for it.

### D4. Repoint stale citations

Each of these points at a document that holds the content, or loses the
pointer:

- `scripts/gates/whitespace.sh` says `CLAUDE.md` names `grep -lI $'\r'`.
  Remove that sentence, since `CLAUDE.md` names no such probe.
- `scripts/gates/silent-green.sh` says `CLAUDE.md` states the rule "twice, in
  bold". It now says `CLAUDE.md` makes it a bold rule.
- `test/compile-validation.test.ts`'s "CLAUDE.md's duration-bound precedent"
  points at `.claude/rules/authoring-invariants.md`, which states the
  `validateDurations` placement.
- `test/definitions.test.ts`'s "CLAUDE.md's documented-correct path" loses the
  pointer and keeps the sentence. No document states that path.
- `.githooks/post-commit`'s "never amend, see CLAUDE.md" loses the pointer
  and keeps the sentence.
- Four code comments point at `.claude/rules/process-contract.md` instead,
  which holds each section they name:
  - `packages/web/src/areas/studio/draft/issues.ts` ("Identity")
  - `packages/web/src/areas/studio/panels/SubprocessSpecEditor.tsx`
    ("Subprocesses")
  - `src/http/routes.ts` ("Hashing / versioning")
  - `src/runtime/record.ts` ("Runtime record")

The edits under `packages/web` change comments only and no UI, so they need
no design-skill pass.

## Risks / Trade-offs

- [A cut sentence turns out to carry a rule] → The citation table and a task
  that greps each cited statement guard the known readers. The diff review
  reads every removed line against "rule or history?".
- [`CLAUDE.md` merges with the stacked changes' edits] → This branch sits on
  top of all three. Archive it last.
- [The `allow-file` line stays until the linter returns] → The contradiction
  survives that long. D3 and the open task name it.

## Migration Plan

1. Implement and verify on the stacked branch.
2. Archive after `devcontainer-on-podman`, `rename-devcontainer-dir` and
   `drop-windows-host-support`, rebasing locally in that order.
3. Rollback: revert the commits.

## Open Questions

None.
