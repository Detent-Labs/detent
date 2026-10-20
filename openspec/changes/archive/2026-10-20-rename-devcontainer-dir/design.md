# Design

## Context

See proposal.md for the motivation. After `devcontainer-on-podman`, the
directory holds one tracked file, `Dockerfile`. It holds three gitignored
files: `pod.yaml`, `.auth-secret` and `server.log`. Two scripts read the path:

- `scripts/dev-pod.sh` uses it as the image build context and to locate
  `pod.yaml`.
- `scripts/dev-up.sh` keeps the secret and the server log there.

Measured on 2026-10-20: the tree has no other directory called `container`,
so a bare `container` entry in `.dockerignore` matches the root alone.

## Goals / Non-Goals

**Goals:**

- One directory name, `container/`, in every tracked file outside the archive.
- A login secret that survives the move on this machine.

**Non-Goals:**

- Renaming the concept. `devcontainer-preflight`, `devcontainer-exec` and the
  prose word "devcontainer" name the dev container. They do not name the directory.
- Touching archived changes. They record the path as it was.
- A migration helper for other machines. This repository has one development
  machine today. The README's migration subsection covers anyone else.

## Decisions

### D1. `container/`, visible at the root

The user chose `container/` on 2026-10-20. It sits beside `docker/`, which
holds the production images. The two names separate dev from production at a
glance.

The rejected alternatives were `.container/`, which stays hidden like the old
name, and `dev/`, which says less about what the directory holds.

### D2. `git mv` for the tracked file, a plain move for the gitignored ones

`git mv .devcontainer/Dockerfile container/Dockerfile` keeps the file's
history visible through `git log --follow`. The three gitignored files move
with `mv` on this machine.

Moving `.auth-secret` keeps existing logins valid. Without it, `dev-up.sh`
would make a new key. `pod.yaml` does not need a move. The next `up` finds
no spec at the new path, writes one, and replays the pod. `server.log` moves
only for continuity.

### D3. Spec deltas assume `devcontainer-on-podman` has synced

The base specs still carry the Compose-era text until `devcontainer-on-podman`
archives. That archive waits on its CI run.

This change's deltas target the text that the other change's deltas leave
behind. The `devcontainer-preflight` block is that change's MODIFIED version,
with the path replaced. This change therefore archives strictly after
`devcontainer-on-podman`.

### D4. `.dockerignore` gains a test entry

The `production-docker-images` requirement already lists the root-only
exclusions, but `test/dockerignore.test.ts`'s `REQUIRED_ENTRIES` checks none
of them. This change adds `container` to that list. A rename that misses
`.dockerignore` would otherwise pass silently, and the dev image's recipe
would enter every production build context.

The pre-fix fixture at `test/dockerignore.test.ts:103` stays as it is. It
quotes the committed pre-fix pattern list verbatim.

## Risks / Trade-offs

- [This change archives before `devcontainer-on-podman`] → The deltas would
  then target Compose-era text. Tasks carry the ordering, and archive runs
  only after the other change is in `openspec/changes/archive/`.
- [`devcontainer-on-podman` edits its deltas again before archive] → Refresh
  this change's `devcontainer-preflight` block from the edited version
  before archiving.
- [A local tool still reads `.devcontainer/`] → Nothing outside the
  repository does on this machine. The orphaned directory holds only
  gitignored files, and a task removes it.
- [An unmigrated clone shows `.devcontainer/.auth-secret` and
  `server.log` as untracked. `git add -A` then commits the secret] →
  `.gitignore` keeps one `.devcontainer/` line, commented as the retired
  directory.

## Migration Plan

1. Implement and verify on the stacked branch.
2. Run verify, sync and archive for `devcontainer-on-podman` on its own
   branch. Its artifacts name `.devcontainer/`, so a verify on this branch
   would report the renamed paths as mismatches.
3. Rebase `rename-devcontainer-dir` onto the archived
   `devcontainer-on-podman` (local, unpushed), then verify and archive this
   change.
4. Merge both branches into `main` as fast-forwards, in that order.
5. Rollback: revert this change's commits. Move `container/.auth-secret` back
   if logins should survive the revert.

## Open Questions

None.
