# Design

## Context

See proposal.md for the motivation. `scripts/gates/prose.sh` collects the
changed Markdown with one call per range:
`git diff --name-status -M --diff-filter=d <range> -- '*.md'`. Each line it
prints becomes a (range, base path, tip path) triple. The pre-push hook and the
CI workflow both run the script unchanged.

WTFM reads its output folder from `export_dir` in
`.rtfm/supportpages/local.json`. That file sits under `.rtfm/`, which
`.gitignore` excludes, so each machine sets the folder on its own.

## Goals / Non-Goals

**Goals:**

- One fixed path, `docs/articles/`, leaves the prose ratchet.
- The rename behavior stays correct on both sides of the excluded path.

**Non-Goals:**

- A configurable exclusion list. One path has one reader.
- Any change to the whitespace gate or the machine-path gate.

## Decisions

### Exclude the path with a git pathspec

The diff call gains the pathspec `':(exclude)docs/articles/'` next to `'*.md'`.
Git filters paths before rename detection. A file moved out of the excluded path
therefore reads as an addition. Its base count is zero, as the spec requires. A
file moved into it reads as a deletion, and `--diff-filter=d` drops it.

The alternative was a `case` filter in the loop over triples. It would need its
own rule for a rename across the boundary. The pathspec already handles that
case. The test pins the git behavior, so a future git that changed it
would turn the suite red.

### Hard-code the path in the script

The spec names `docs/articles/`, and the script states it once. An environment
variable would let any push widen the exclusion with no commit. A list file in
`scripts/gates/` would serve one entry.

### Test with a fake linter

The test passes `ANTISLOP` pointing at a short Python script in the temporary
repository. The script prints one line per input line that holds the word `SLOP`
and exits 1 when it printed any, 0 otherwise. That is the exit-code contract the
gate's `lint_at` reads. The real linter does not sit in the devcontainer, and a
fake linter makes the count exact. The gate calls the script with `python3`,
which the devcontainer image carries.

## Risks / Trade-offs

- [Risk] A machine keeps WTFM's default `export_dir`, `output/articles`. →
  Nothing excludes that path, so the gate checks those articles. The failure
  is a blocked push, never a silent pass.
- [Risk] A hand-written page placed under `docs/articles/` escapes the ratchet.
  → The path is WTFM's output by convention. `CLAUDE.md`'s gate table names the
  exclusion, so a reader knows what the folder means.
- [Risk] `python3` comes from the base image, not from `container/Dockerfile`.
  → A base image without it fails the new cases loudly.

## Migration Plan

None. The change lands with its test. No stored state reads the gate.

## Open Questions

None.
