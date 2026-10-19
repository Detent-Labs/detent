# Proposal

## Why

The 2026-10-10 audit found that docs, specs and code comments state facts
the code no longer holds. One of them misleads an author. The guide says a
group membership change reaches a step an instance already waits at. The
engine freezes the candidate list at step entry instead (H-4).

The rest are low-severity drift (H-5 to H-12, A-7, A-9, B-10, B-13, D-9,
G-13). Earlier changes in the audit plan handed over five more. This change runs last in
the plan, because each earlier merge moved the line citations in
`docs/decisions.md`.

## What Changes

- `docs/authoring-guide.md`: correct the group-members freeze (H-4). Correct
  who may cancel a non-cancellable step (H-5), and where the three draft
  commands sit (H-6). Add the day-length sentence for timers (B-13).
- `ROADMAP.md`: Stage 40 says draft scope is not built, and three counts
  are stale (H-7). Stage 63 moves to the Done table, per the owner's ruling
  of 2026-10-19. Its prose moves to `docs/roadmap-history.md`.
- `README.md` (H-8) and `CLAUDE.md` (H-9): fix the counts and layout.
  `CLAUDE.md` also gains a pointer to the 2026-10-10
  audit record, per the owner's ruling.
- `docs/runbooks/deployment.md`: one stale anchor, and the SaaS upgrade
  section names a command that does not exist (handed over from #30).
- `docs/decisions.md`: re-point every line citation and remove the
  resolved A-9 entry. Correct H-7's two sentences. Add one open entry for
  B-10's unmeasured lock effect. Remove the audit index's last entry with
  its section.
- Code comments only, no behavior: `src/http/metrics.ts`,
  `src/auth/authorize.ts`, `src/schema/canonical-json.ts`,
  `src/schema/definition.ts`, `src/cel/check.ts`, `src/engine/registry.ts`,
  `src/engine/transition.ts`, `src/auth/cli.ts`, `src/http/routes.ts`,
  `scripts/dev-webhook-sink.ts` and `scripts/e2e.ts`.
- Spec deltas make the contradicting lines agree with the code. They cover
  H-10, the D-9 spec half, and the `persistence` callers paragraph.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `authorization`: the `Permission` scenario lists five values. The
  `/admin/*` statements except the data-list routes. The developer-role
  requirement names the Developer list. Data-list reads name
  `system:author`.
- `process-access-roles`: a list entry is a non-empty actor id or group
  id (owner ruling, 2026-10-19).
- `persistence`: the server builds the schema at start outside SaaS mode,
  and the stale "exactly two callers" paragraph goes.

## Impact

Markdown under `docs/`, `ROADMAP.md`, `README.md`, `CLAUDE.md`, three live
specs, and comments in eleven source and script files. One test in
`test/http-process-access.test.ts` pins an unprefixed entry. No code path,
API, schema or dependency changes.
