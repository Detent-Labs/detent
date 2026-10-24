# Proposal

## Why

WTFM writes generated end-user help articles to `docs/articles/`. The prose gate
reads a new file against a base count of zero. Any antislop finding in a new
article therefore blocks the push. WTFM generates these articles for end users.
They are not project prose. On 2026-10-24 the owner exempted them from the prose
ratchet.

## What Changes

- The `changed-markdown-prose` gate skips every Markdown file under
  `docs/articles/`. It reads no count for such a file and blocks no push over it.
- Markdown everywhere else keeps the ratchet unchanged.
- The `pushed-whitespace` gate keeps covering `docs/articles/`.
- `CLAUDE.md` names the exclusion in its gate table.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `push-gate-checks`: the requirement "Changed Markdown passes the prose
  linter" gains one excluded path, `docs/articles/`.

## Impact

- `scripts/gates/prose.sh`: the changed-file collection excludes the path.
- `test/gates.test.ts`: new cases with a fake linter.
- `CLAUDE.md`: the `changed-markdown-prose` row and the Verification bullet on
  the antislop linter.
- `docs/decisions.md`: entry 15 cites the diff call by line number.
- The pre-push hook and the CI workflow call the same script. Both pick up the
  exclusion with no edit of their own.
