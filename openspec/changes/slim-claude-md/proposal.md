# Proposal

## Why

`CLAUDE.md` loads in full into every session: 508 lines, about 32 KB, roughly
8,000 tokens. Much of that weight is not a rule.

- Anecdotes record how a rule arose: "a self-declared one-liner touched four
  files", the three errors the review once found, run counts and dated
  measurements.
- Two blocks duplicate other documents. The 55-line repository layout mirrors
  `docs/current-state.md`. The `rtk` mechanics of a test run (filter, exit
  code, three traps, a 2026-09-30 measurement) only matter while running tests.
- Some lines describe one machine, such as the contents of the untracked
  `tmp/`.
- The file contradicts itself. Line 1 silences six antislop rules file-wide,
  and line 246 names that line as the pattern to avoid.

Three code comments and one spec sentence also cite `CLAUDE.md` content that
it no longer holds:

- `scripts/gates/whitespace.sh` says `CLAUDE.md` names a `grep -lI` probe.
- `test/compile-validation.test.ts` and `test/definitions.test.ts` point at
  precedents that live elsewhere.
- `push-gate-checks` says `CLAUDE.md` states the `DATABASE_URL` rule "twice,
  in bold".

## What Changes

- `CLAUDE.md` keeps every rule and drops the history behind it. The target is
  at most 280 lines.
  - The repository layout shrinks to a top-level map and a pointer to
    `docs/current-state.md`.
  - The `rtk` and test-run mechanics move into the `devcontainer-exec` skill,
    which loads on demand.
  - Machine-specific lines become machine-neutral.
- Every `CLAUDE.md` statement a spec cites stays, in substance:
  - the real-browser rule and its `/admin/*` route collision;
  - the running server that corrupts test runs;
  - the silent skip without `DATABASE_URL`;
  - the CRLF trap of `git diff --check`;
  - the antislop check on every touched Markdown file;
  - the prose-debt norm;
  - the reserved term "authoring surface".
- The file-wide `allow-file` line gives way to targeted directives. That step
  needs the antislop linter, so it waits until the linter is installed.
- Three code comments that cite missing `CLAUDE.md` content point at the
  document that holds it.
- `push-gate-checks` stops counting how often `CLAUDE.md` repeats a rule.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `push-gate-checks`: "The suite cannot report a silent green" no longer
  claims `CLAUDE.md` states the `DATABASE_URL` rule twice in bold.

## Impact

- Docs: `CLAUDE.md`, `.claude/skills/devcontainer-exec/SKILL.md`.
- Comments: `scripts/gates/whitespace.sh`, `scripts/gates/silent-green.sh`,
  `test/compile-validation.test.ts`, `test/definitions.test.ts`.
- Ordering: stacks on `drop-windows-host-support`. Both that change and
  `rename-devcontainer-dir` edit `CLAUDE.md`, so this change archives after
  them.
