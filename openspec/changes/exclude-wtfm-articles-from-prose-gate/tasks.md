# Tasks

## 1. Gate and tests

- [x] 1.1 In `test/gates.test.ts`, add a fake linter helper per design.md. Add a case: a rising count under `docs/articles/` passes, and the same rise in `notes.md` in that range blocks. Confirm the case fails on the unchanged script.
- [x] 1.2 Add a case where a file with findings moves out of `docs/articles/`. The gate must reject the push. Add a case where the whitespace gate rejects a trailing space in a new `docs/articles/` file.
- [x] 1.3 In `scripts/gates/prose.sh`, add the pathspec `':(exclude)docs/articles/'` to the diff call. Extend the header comment with the exclusion and its reason. Verify that the three new cases pass in the full suite run of group 3.
- [x] 1.4 In `docs/decisions.md` entry 15, re-point `scripts/gates/prose.sh:83` to the diff call's new line. Verify with `sed -n <n>p scripts/gates/prose.sh`.

## 2. Documentation

- [ ] 2.1 In `CLAUDE.md`, extend the `changed-markdown-prose` row of the gate table with the `docs/articles/` exclusion. Exempt the path in the Verification bullet on the antislop linter too. Verify with the prose gate of group 3.

## 3. Verification

- [ ] 3.1 Run `bun run typecheck`, then `bun run build`. Both exit 0.
- [ ] 3.2 Run the full `bun test` with `DATABASE_URL` set, through `scripts/test-gated.sh` in the devcontainer. It reports 0 fail and the gate accepts the run.
- [ ] 3.3 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` on the host. Run the same with `whitespace.sh`. Both exit 0.
- [ ] 3.4 Run `openspec validate exclude-wtfm-articles-from-prose-gate --strict`. It passes.

## Workflow follow-up

- Run `openspec-verify-change`, sync the delta into `openspec/specs/push-gate-checks/spec.md`, then archive.
- Carry the `VERSION` bump in a commit, push the branch and open the PR.
