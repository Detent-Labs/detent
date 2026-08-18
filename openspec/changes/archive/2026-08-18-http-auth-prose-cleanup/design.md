## Context

See proposal.md for motivation. `src/http` and `src/auth` carry comments
from several prior OpenSpec changes: `http-route-table`,
`dedup-server-helpers`, `http-route-handling-consolidation` and others.
Many of those comments narrate what the code used to look like. Some name
the change that replaced it, instead of stating what the code does now.

## Goals / Non-Goals

**Goals:**
- Every remaining comment in the five target files states a present fact.
  Each names an invariant, a non-obvious constraint, or the reason a check
  exists.
- No change to behavior, exports, or test outcomes.

**Non-Goals:**
- Rewriting comments outside `src/http` and `src/auth`. That is out of
  finding 44's scope.
- Touching finding 43's data-access files: `src/engine/*.ts` and
  `src/auth/users.ts`'s default-`db` pattern. That residual belongs to a
  different finding. The change that closed finding 43 excluded it on
  purpose.

## Decisions

- **Keep vs. cut per comment**: a comment survives if it states a fact true
  of the code today. An invariant, a why-this-shape rationale, and a
  warning about a subtle bug class all count. A comment gets cut or
  rewritten if its content is purely historical. Phrases like "before X",
  "until Y landed", or "Z used to do this" mark that case. Some sentences
  mix a live fact with historical framing. There, the rewrite keeps the
  live fact and drops the change name.
- **File-by-file pass, not a blanket strip**: each file gets read in full
  and edited by hand. A pattern match (grep-deleting every line naming a
  change) cannot separate a mixed sentence's live fact from its historical
  framing.
- **No test changes**: no behavior changes, so the existing test suite is
  the verification signal. A green full-gate run stands in for new
  coverage.

## Risks / Trade-offs

- [A cut comment turns out to encode a fact nobody else recorded] -> read
  each comment fully before cutting. When a comment names both a live
  constraint and a change name, keep the constraint and drop only the name.
- [A large diff makes review harder] -> the diff touches comments only, no
  logic. `git diff --stat` plus a read-through covers it.

## Migration Plan

No runtime migration applies here. The change lands as one commit-set
through the normal apply -> verify -> archive cycle. A normal revert covers
rollback, since nothing but comments change.

## Open Questions

None.
