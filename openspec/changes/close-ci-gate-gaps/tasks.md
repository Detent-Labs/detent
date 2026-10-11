# Tasks

## 1. A range git cannot read stops the gates (G-2)

- [x] 1.1 Add `bad_range` to `scripts/gates/_lib.sh` per design D3. Verify that `sh -n scripts/gates/_lib.sh` exits 0.
- [x] 1.2 Make `range.sh` fall back per design D2. Verify with a host repro: an unreachable remote sha prints the range since `origin/main`, and stderr names the sha.
- [x] 1.3 Make `whitespace.sh` read the status of both `git diff` calls per design D3. Verify with a host repro: a range from a made-up sha exits 1 and prints git's message.
- [x] 1.4 Make `prose.sh` write its diff to a temp file and loop over the file per design D3. Verify with the same host repro: exit 1, and git's message appears.
- [x] 1.5 Add the temp-repository helper of design D9 to `test/gates.test.ts`. Add one case per scenario of the two ADDED requirements in the `push-gate-checks` delta. Add a case where the fallback range lies inside main and the gate says it has nothing to check. Add a positive control: a trailing space in a valid range still rejects.
- [x] 1.6 Prove each new case fails on the old scripts. Copy the old scripts with `git show origin/main:<path>` into a scratch directory. Add the new test file. Copy the directory into the container at `/tmp/mut` with `docker compose cp`. Run `bun test /tmp/mut/test/gates.test.ts` there. Record which cases fail.

## 2. The silent-green gate reads the whole summary (G-7)

- [x] 2.1 Rewrite the summary reading in `silent-green.sh` per design D5. Add `todo` lines to the skip count. Reject a run with no `pass` line, no `Ran` line, or counts that miss the total. Use POSIX `awk` only, since mawk and gawk both run it. The runner cases in `test/gates.test.ts` stay red until task 2.5.
- [x] 2.2 Create `scripts/gates/pass-floor.txt` in the format of `skip-floor.txt`, with the value from design D5. Add the pass-floor check to the gate, with one `read_floor` function for both floor files. State in the floor file how to lower it.
- [x] 2.3 Name the todo rule in the header of `skip-floor.txt`. Verify that the file still ends with the integer 1.
- [x] 2.4 Make `test-gated.sh` keep a failing command's exit code per design D10. Say in its header that a subset run fails the pass floor and belongs to `bun test <path>`.
- [x] 2.5 Give the three runner cases in `test/gates.test.ts` a fake run with a full summary. The counts must add up and sit above the pass floor. Add a case where a fake command exits 3 and prints no summary. Verify that the runner exits 3 and that the cases still pass.
- [x] 2.6 Add one case per new scenario of the silent-green requirement. Cover a todo test at the floor and a missing `pass` line. Cover a missing `Ran` line and a renamed skip line. Cover a count below the pass floor and a green run.
- [x] 2.7 Prove the new cases fail on the old script, with the recipe of task 1.6. Copy `pass-floor.txt` into the scratch directory too. Record which cases fail.

## 3. The home-path gate matches four more spellings (G-8)

- [x] 3.1 Replace the pattern in `machine-paths.sh` with the four expressions of design D6. Keep the container-user denylist. Verify that `sh scripts/gates/machine-paths.sh` exits 0 on the tree.
- [x] 3.2 Add one case per spelling to `test/gates.test.ts`. Assemble each fixture from parts at run time. Add a case for the container path and a case for the audit record's regex text. Add a positive control.
- [x] 3.3 Prove the new cases fail on the old script, with the recipe of task 1.6. Record which cases fail.

## 4. The workflow and Dependabot (G-1, G-11, G-6)

- [x] 4.1 Change `.github/workflows/check.yml` per design D1 and D7. The `check` job gets `frozen-lockfile` as its first install. It loses the later step of that name. The `e2e` job installs with `--frozen-lockfile`. Add the permissions block, `persist-credentials: false` on all three checkouts, and a sha pin with a release comment on all four `uses` lines.
- [x] 4.2 Reword the comments in `check.yml` that describe the old install order. Verify with `git grep -n "bun install" .github/workflows/check.yml` that no plain install remains.
- [x] 4.3 Change the three `npm` entries in `.github/dependabot.yml` to `bun` per design D4. Keep the `github-actions` entry.
- [x] 4.4 Add the workflow and Dependabot cases to `test/gates.test.ts` per design D7 and D4. Parse with `Bun.YAML.parse`. Read the raw `uses` lines for the sha and release comment. Check the step order in the `check` job. Feed each rule a rejecting fixture, and check that the real files pass.
- [x] 4.5 Prove the new cases fail on the old files, with the recipe of task 1.6. Copy the old workflow and Dependabot file under `.github/` in the scratch directory. Record which cases fail.
- [x] 4.6 Show the G-1 mechanism on a scratch copy of the manifests and `bun.lock` inside the container. Change one version in `packages/web/package.json`. Verify that a plain `bun install` rewrites `bun.lock` and exits 0. Verify that `bun install --frozen-lockfile` on a fresh copy exits non-zero.

## 5. The probe role's password (G-12)

- [ ] 5.1 Change `test/preload-db.ts` per design D8. Create the role without a password, set a random one with `ALTER ROLE`, and export it as `DETENT_AUDIT_PROBE_PASSWORD`. Reword the comment that says the role outlives the suite: the role stays, its password does not.
- [ ] 5.2 Make `test/instance-audit-privileges.test.ts` read the variable. The suite skips when the variable is unset. Fix the header comment.
- [ ] 5.3 Add the refusal case of the `development-toolchain` delta: a connection as the probe role with the password `probe` fails. Verify that the case passes in the full suite and is not skipped.

## 6. Prose that names the gates

- [ ] 6.1 Reword the `no-silent-green` row and the floor paragraph in `CLAUDE.md`. Name the todo rule, the unreadable summary and the pass floor. Reword the runner paragraph to say that the runner wants the full suite.
- [ ] 6.2 Reword the hosted-CI sentence in `docs/current-state.md` to say that the install is frozen. Check `ROADMAP.md` and `README.md` for a sentence that the new CI order made false.
- [ ] 6.3 Delete the `close-ci-gate-gaps` entry from the audit index in `docs/decisions.md`. Verify that `git grep -n close-ci-gate-gaps docs/decisions.md` prints nothing.
- [ ] 6.4 Run the antislop linter on every Markdown file this change touched. Fix each finding or add a targeted directive with a reason.

## 7. Verification

- [ ] 7.1 Run `bun run typecheck` in the devcontainer. Record the exit status.
- [ ] 7.2 Run `bun run lint` and `bun run build` in the devcontainer. Record both exit statuses.
- [ ] 7.3 Run the full `bun test` with `DATABASE_URL` set, through `scripts/test-gated.sh`, with `OPENSPEC_TELEMETRY=0`. Record the summary lines and the gate's verdict.
- [ ] 7.4 Run `bun run test:tz` in the devcontainer. Record its summary.
- [ ] 7.5 On the host, run the prose, whitespace, machine-path and lockfile gates with the range piped in. Record what each printed.
- [ ] 7.6 After the push, read the CI log of the `check` job. Confirm that `frozen-lockfile` ran before `bun audit` and passed. Confirm that the host gates printed the fallback note only if a force-push happened.
