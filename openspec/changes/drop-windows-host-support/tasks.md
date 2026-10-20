# Tasks

## 1. Delete the Windows host support

- [x] 1.1 Delete `scripts/dev-up.ps1` and `scripts/preflight.ps1` with `git rm`. In `README.md`, drop the `pwsh scripts/dev-up.ps1` and Git Bash sentences and the `.ps1` profile sentence from the bring-up section. The section then names `bash scripts/dev-up.sh` and `bash scripts/preflight.sh core|serve` alone. Verify with `git grep -n -E '\.ps1|pwsh|Git Bash|Git for Windows' -- README.md scripts` printing nothing.
<!-- antislop: allow sentence-length - the quoted lead-in is the exact CLAUDE.md text to write -->
- [x] 1.2 Keep the `CLAUDE.md` convention bullet titled "**No `cd` prefix, no shell variable, and no whitespace-only argument**". Rewrite its lead-in to "Claude Code's permission analyzer reads every operand as a possible path, and each habit below sends a safe command to manual approval." Delete only its third sub-bullet, the `tr '\n' ' '` / Cygwin-symlink rule. Drop "and no whitespace-only argument" from the bullet's title (design D1). Drop the clause "and MSYS grep strips the CR before matching" from the whitespace-gate paragraph, leaving that sentence grammatical. Verify with `git grep -n -i -E 'windows|msys|cygwin' CLAUDE.md` printing nothing and `git grep -n -E 'simple_expansion|cd-compound' CLAUDE.md` still printing the two kept sub-rules.

## 2. Restate the `127.0.0.1` rule's cause

- [x] 2.1 The targets are the "Address" paragraph of `docs/browser-checks.md` and the CORS comment in `scripts/dev-pod.sh`. Replace the Windows cause there with the loopback-binding cause per design D2. Every published port binds the IPv4 loopback address alone. `localhost` can resolve to `::1` first, where nothing listens. Leave the measurement records that name "Chrome on Windows" unchanged. Verify that `sh scripts/dev-pod.sh spec 2>&1 >/dev/null` prints nothing. Verify that `git grep -n -i windows -- scripts/dev-pod.sh` prints nothing.
- [x] 2.2 Run the antislop linter on every Markdown file this change touched. Fix each finding or add a targeted directive with a reason. If the linter is absent, leave this task open and say so.

## 3. Verification

- [x] 3.1 Run `sh scripts/dev-exec.sh bun run typecheck`, `sh scripts/dev-exec.sh bun run lint` and `sh scripts/dev-exec.sh bun run build`. Record each exit status.
- [x] 3.2 With the dev server stopped, run the full `bun test` with `DATABASE_URL` set through `sh scripts/dev-exec.sh sh scripts/test-gated.sh bun test`. Record the summary lines and the gate's verdict, then restart the server with `bash scripts/dev-up.sh`.
- [x] 3.3 Run `sh scripts/dev-exec.sh bun run test:tz`. Record its summary.
- [x] 3.4 On the host, run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`, the same with `whitespace.sh`, then `sh scripts/gates/machine-paths.sh`. Record what each printed.

- [x] 3.5 Run `bash scripts/dev-up.sh` twice and `bash scripts/preflight.sh core` twice. Verify that both second runs pass. Verify that the pod's container ids (`podman ps --filter pod=workflow-engine --format '{{.ID}} {{.Names}}'`) stay the same across the second `dev-up.sh`. The ADDED requirement "The bring-up and the preflight stay idempotent" states the rule.

## Workflow follow-up

- Run `openspec-review-change` and resolve every finding before apply.
- Archive after `devcontainer-on-podman` and `rename-devcontainer-dir` (design Migration Plan).
- Follow-up change after `devcontainer-on-podman` archives: delete preflight check 6 and its Windows branch.
- No push until the user confirms the new machine is ready.
