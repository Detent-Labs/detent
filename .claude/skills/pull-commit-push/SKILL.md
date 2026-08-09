---
name: pull-commit-push
description: Use when the user asks to commit and push changes to GitHub/main in a repo they also work on from other machines, or when a push is rejected as non-fast-forward, or when a merge/rebase produced conflict markers
---

# Pull, Commit, Push

## Overview

This project is worked on from multiple computers. Origin can carry commits the
local clone has never seen. Pushing without syncing first risks a rejected push
or a silent, unverified conflict resolution that ships broken code under a
plausible-looking merge commit. The core principle: **never push a merge you
haven't verified**, and **never resolve a conflict by guessing** — either the
resolution's correctness is verifiable (build/typecheck/tests), or it isn't and
the user decides.

## When to Use

- "Commit and push this to main / GitHub"
- A push was rejected (`! [rejected] ... non-fast-forward`)
- A pull/merge/rebase left `<<<<<<<` conflict markers
- Starting a work session on a repo also touched from another machine

Not for: repos with no remote, or a remote the user says is solely local scratch.

## The Sequence

Always in this order. Do not push before step 5 passes.

1. **`git status`** — see what's staged/unstaged/untracked before touching anything.
2. **`git fetch origin`** — learn what origin has *before* committing local work,
   so you know whether a sync step is even needed.
3. **Stage and commit deliberately.** Add files by name, not `git add -A`/`.`
   (existing repo-wide rule). Review `git status` after staging. If anything
   looks like it could be a secret or an accidental artifact, stop and ask.
4. **Sync with origin's `main`:**
   - `git log HEAD..origin/main --oneline` — if empty, you're already caught
     up; skip to step 6.
   - Otherwise `git merge origin/main` (not rebase — this avoids ever needing
     a force-push, and history here is shared across machines, not a private
     feature branch to be rewritten and force-pushed).
5. **If step 4 reports conflicts, resolve them per "Resolving a Conflict"
   below before continuing** — this is the step the baseline agent skipped:
   it merged both sides' text and moved on without checking whether the
   result was even valid.
6. **Verify before push.** Run the project's build/typecheck/test command
   (check `package.json`/`CLAUDE.md` for the right one — for this repo,
   `bun run typecheck` and `bun test` per the project's CLAUDE.md, inside the
   devcontainer). A merge or resolved conflict is *unverified* until this
   passes. Do this even when step 4 found nothing to merge, so a bad local
   commit doesn't ship unchecked either.
7. **`git push origin main`.** A second rejection means someone pushed again
   between your fetch and now — go back to step 4, don't force.
8. **Confirm the pushed commit's CI run is green**:
   `gh run list --workflow check.yml --branch main -L1`, or `gh run watch
   <run-id>` to wait on it. Step 6 only proves the merge passed on this
   machine's hook run. This step proves it on a clean checkout too. It's
   also the one confirmation every machine and person on the project can
   see, not just the one that pushed.

## Resolving a Conflict

A conflict marker means two sides changed the same place differently. There is
no default that is safe to apply blindly:

- **Read both sides' intent** (`git log -p` on each side's commit, not just the
  conflict hunk) before touching the file.
- **Keeping both sides' text is a guess, not a resolution**, unless you have
  confirmed both changes are independent and additive (e.g., two unrelated
  lines in a config list). If they touch the same statement, same function
  signature, same logic — concatenating them is as likely to produce broken
  or contradictory code as picking one side at random.
- **If the correct resolution isn't obvious from reading both diffs, stop and
  ask the user** (use AskUserQuestion if available) — show them both versions
  and what each side changed it for. This is exactly the kind of decision
  that's only the user's to make (per the project's action-care guidance): you
  cannot know which machine's edit is the one they meant to keep. Don't
  substitute your own guess for their answer just to keep the task moving.
- **Whatever you resolve to, step 6 (verify) must pass on it before it's
  committed as done.** A merge that "looks plausible" is not verified; a merge
  that fails to typecheck/build/test is not resolved, no matter how
  reasonable the diff looked.
- Never `git checkout --ours`/`--theirs` across a whole file as a shortcut
  without reading what each side actually changed there.
- Never `git push --force`/`-f` to make a rejected push go through, and never
  `git reset --hard` to discard the side that's inconvenient to merge.

## Quick Reference

| Situation | Action |
|---|---|
| `git fetch` shows no new commits on origin/main | Skip merge, go straight to verify → push |
| Push rejected non-fast-forward | `git fetch` + `git merge origin/main`, do not force |
| Merge reports conflicts | Read both sides' intent, resolve deliberately, verify, then commit the merge |
| Verification (build/test/typecheck) fails after merge | Not resolved yet — keep fixing before committing/pushing |
| Conflict resolution unclear from the diffs alone | Ask the user with both versions shown, don't guess |
| Second push rejection after you already merged | Repeat from `git fetch` — someone pushed again meanwhile |

## Common Mistakes

- Committing local work before fetching — you lose the chance to see a
  same-line conflict coming and plan around it.
- Treating "the merge completed with no marker left over" as proof it's
  correct — a merge tool resolving text cleanly says nothing about whether
  the *result* still compiles or passes tests.
- Force-pushing to make a rejection disappear — always ships to loop back to
  `git fetch` instead.
- Silently keeping both sides of a conflicting change to avoid picking one
  — that's not a resolution, it's deferring the bug to whoever hits it next.
