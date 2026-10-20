# Design

## Context

See proposal.md for the motivation. Measured on 2026-10-20, with
`git grep -i` over the tree outside `openspec/changes/archive` and the two
history documents. The Windows references fall into three kinds:

1. **Host support.** `scripts/dev-up.ps1` and `scripts/preflight.ps1`. The
   README sentences that point at them and at Git Bash. The CLAUDE.md
   convention for the Windows permission analyzer. The MSYS clause in
   CLAUDE.md's whitespace explanation.
2. **A Windows rationale for a rule that still holds.** The `127.0.0.1`
   address appears in `docs/browser-checks.md`, the CORS comment in
   `scripts/dev-pod.sh` and two `development-toolchain` requirements.
3. **Content guards and records.**
   - the Windows path spellings of `no-machine-paths`
   - the CR check of the whitespace gate and `.gitattributes`
   - portability notes in `prose.sh` and `silent-green.sh`
   - measurement records ("Chrome on Windows" in `docs/browser-checks.md`
     and `CanvasBar.tsx`)
   - the generated `openspec-onboard` skill
   - preflight check 6

   The word "windows" also matches the login rate-limit windows, which are a
   false positive.

## Goals / Non-Goals

**Goals:**

- Kind 1 is gone.
- Kind 2 keeps its rule and states a cause true on this host.

**Non-Goals:**

- Kind 3. Each item guards content or records a past measurement, and none
  supports a Windows host.
- Check 6. The user ruled on 2026-10-20 that it gets its own change after
  `devcontainer-on-podman` archives. Its Windows branch stays until then.
- Any UI file. `CanvasBar.tsx`'s comment is a measurement record, and a UI
  change would pull in the design-skill process for no behavior change.

## Decisions

### D1. Keep the analyzer convention, drop its Windows parts

The CLAUDE.md bullet has the title "No `cd` prefix, no shell variable, and
no whitespace-only argument". It opens with "On this Windows host the
permission analyzer reads every operand as a possible path". Each of its three
sub-rules names an analyzer message. They are:

- `Contains simple_expansion`
- the "cd-compound" refusal
- a Cygwin symlink denial

Only the third is Windows-specific: Cygwin exists only there. The first two
come from Claude Code's own check on compound shell commands, which runs on
every platform. This session ran in bypass-permissions mode, where that check
does not run. Its prompt-free use of `cd` chains and variables therefore
proves nothing either way.

The bullet stays with a platform-neutral lead-in and its first two
sub-rules. The Cygwin sub-rule goes, and with it "and no whitespace-only
argument" in the bullet's title, which only that sub-rule explained.

### D2. The `127.0.0.1` rule's new cause is the loopback binding

`scripts/dev-pod.sh` publishes every host port with `hostIP: 127.0.0.1`, and
the `worktree-isolation` delta of `devcontainer-on-podman` requires it. A name
that resolves to `::1` first reaches no listener. The rule therefore holds on
any host. Only its reason changes.

### D3. The idempotency rule survives the removed requirement

"Both bring-up scripts carry the same preflight contract" also carried
"Both SHALL stay idempotent". That rule is independent of PowerShell, and
`devcontainer-on-podman` D5 builds on it. A new requirement, "The bring-up
and the preflight stay idempotent", keeps it with its original scenario.

## Risks / Trade-offs

- [A future Windows contributor has no entry point] → Accepted. The proposal
  marks it **BREAKING**, and the deleted scripts stay in git history.
- [This change archives before `devcontainer-on-podman`] → The
  manual-checklist delta targets that change's text. Tasks carry the order:
  archive after `devcontainer-on-podman` and `rename-devcontainer-dir`.

## Migration Plan

1. Implement and verify on the stacked branch.
2. Archive `devcontainer-on-podman`, then `rename-devcontainer-dir`, each on
   its own branch, rebasing the next one onto it locally.
3. Rebase this branch, verify and archive it, and merge all three into
   `main` as fast-forwards.
4. Rollback: revert the commits. The scripts return from history.

## Open Questions

None.
