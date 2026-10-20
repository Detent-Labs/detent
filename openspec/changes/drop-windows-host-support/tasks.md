# Tasks

## 1. Remove the Windows host support

- [ ] 1.1 Delete `scripts/dev-up.ps1` and `scripts/preflight.ps1` with `git rm`. In `README.md`, drop the `pwsh scripts/dev-up.ps1` and Git Bash sentences and the `.ps1` profile sentence from the bring-up section, so the section names `bash scripts/dev-up.sh` and `bash scripts/preflight.sh core|serve` alone. Verify with `git grep -n -E '\.ps1|pwsh|Git Bash|Git for Windows' -- README.md scripts` printing nothing.
- [ ] 1.2 In `CLAUDE.md`, delete the convention bullet that opens "**No `cd` prefix, no shell variable, and no whitespace-only argument**" with its three sub-bullets (design D1), and drop the clause "and MSYS grep strips the CR before matching" from the whitespace-gate paragraph, leaving that sentence grammatical. Verify with `git grep -n -i -E 'windows|msys|cygwin|simple_expansion|cd-compound' CLAUDE.md` printing nothing.

## 2. Restate the `127.0.0.1` rule's cause

- [ ] 2.1 In `docs/browser-checks.md`'s "Address" paragraph and in the CORS comment in `scripts/dev-pod.sh`, replace the Windows cause with the loopback-binding cause per design D2 (every published port binds the IPv4 loopback address alone; `localhost` can resolve to `::1` first, where nothing listens). Leave the measurement records that name "Chrome on Windows" unchanged. Verify that `sh scripts/dev-pod.sh spec 2>&1 >/dev/null` prints nothing, and that `git grep -n -i windows -- scripts/dev-pod.sh` prints nothing.
- [ ] 2.2 Run the antislop linter on every Markdown file this change touched, if it is installed. Fix each finding or add a targeted directive with a reason. If it is absent, leave this task open and say so.

## 3. Verification

- [ ] 3.1 Run `sh scripts/dev-exec.sh bun run typecheck`, `sh scripts/dev-exec.sh bun run lint` and `sh scripts/dev-exec.sh bun run build`. Record each exit status.
- [ ] 3.2 With the dev server stopped, run the full `bun test` with `DATABASE_URL` set through `sh scripts/dev-exec.sh sh scripts/test-gated.sh bun test`. Record the summary lines and the gate's verdict, then restart the server with `bash scripts/dev-up.sh`.
- [ ] 3.3 Run `sh scripts/dev-exec.sh bun run test:tz`. Record its summary.
- [ ] 3.4 On the host, run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`, the same with `whitespace.sh`, then `sh scripts/gates/machine-paths.sh`. Record what each printed.

## Workflow follow-up

- Run `openspec-review-change` and resolve every finding before apply.
- Archive after `devcontainer-on-podman` and `rename-devcontainer-dir` (design Migration Plan).
- Follow-up change after `devcontainer-on-podman` archives: remove preflight check 6 and its Windows branch.
- No push until the user says the new machine is set up.
