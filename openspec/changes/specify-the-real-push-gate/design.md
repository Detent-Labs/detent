<!-- antislop: allow-file passive-voice -->
<!-- A gate is described by what it does to a push, not by who invokes it. -->

## Context

See proposal.md, section Why. Two facts shape this change.

The hook exists and works. `.githooks/pre-push` checks that the `app` service
is up. It then runs `docker compose exec -T -w /workspace app bun run check`.
A container that is down gets a message with the start command, plus a note
about `--no-verify`.

The requirement it should match is written for something else. The text at
`openspec/specs/development-toolchain/spec.md:136` describes a GitHub Actions
workflow. That text names a frozen-lockfile install, a pull-request trigger
and a pinned runner Bun version.

## Goals / Non-Goals

**Goals:**

- One requirement a reader can check against `.githooks/pre-push` line by
  line.
- Keep the two properties the old text made load-bearing. The typecheck stays
  its own step. The run has `DATABASE_URL` set.

**Non-Goals:**

- No change to `.githooks/pre-push`. The hook is not the problem.
- No new hosted CI. The owner ruled that out in `07b9a05`. The new text
  records the rule instead of leaving it to memory.
- No try at reproducing the frozen-lockfile check. Nothing in the repo
  performs it today. Inventing a requirement for it would repeat the mistake
  this change fixes.

## Decisions

**Change the requirement, do not remove it**. Removing leaves the repository
with a gate and no requirement. That is the half of today's problem which is
easier to overlook. The push gate is worth stating: it is the only thing
standing between a broken tree and `origin/main`.

**Say where the checks run, not just what runs**. Placement carries the
guarantee. On the host, `DATABASE_URL` is usually unset and the Bun version
drifts from `BUN_VERSION`. `CLAUDE.md` documents both problems, and both have
happened. A requirement naming the commands but not the container would
permit the weaker run.

**Write down the no-hosted-CI rule**. Otherwise the next person to notice
that pushes are gated only locally re-adds a workflow. The reasoning in
`07b9a05` would then have to be rediscovered from the git log.

## Risks / Trade-offs

[The hook is per-clone and a fresh clone has it off] → The one-time step is
`git config core.hooksPath .githooks`, and the requirement names it. That gap
in coverage is real. Stating it beats a requirement that implies a gate
nobody enabled.

[A pushed `--no-verify` bypasses the gate entirely] → True, and deliberate.
The hook's own message offers it. The rule against bypassing lives in the
working agreement, not in a mechanism.

## Migration Plan

None. The hook already behaves as the requirement will describe.
