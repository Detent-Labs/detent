# Area G: Tests, examples, infrastructure

State: HEAD `5f41cd8a`, read only (`git grep`/`log`/`show`, Read). No `bun`, no Docker.

## Findings

### G-1: The CI lockfile gate checks a lockfile that `bun install` rewrote first

- Case:
  - Dependabot PR #19 (`64ed11a5`, 2026-08-24) sets `packages/web/package.json` to `"lucide-react": "1.33.0"`. It leaves `bun.lock` at `lucide-react@1.31.0` (`git show 64ed11a5:bun.lock`, line 186).
  - The CI job `check` runs `bun install` first, without the frozen flag. That call resolves again and rewrites `bun.lock` in the bind-mounted `/workspace`. Only then does `sh scripts/gates/lockfile.sh` run with `bun install --frozen-lockfile`. That check reads the freshly written file and passes.
  - The PR lands on `main`. The next commit `b206fc7d` has an unrelated subject and adds the lock correction `1.31.0 → 1.33.0`.
  - The same pattern repeats. PR #63 (`fb102fb2`, only `packages/web/package.json`) lands on `main`. Afterwards the commit `8f58825b` repairs it: `Regenerate bun.lock for the zod 4.5.4 and lucide-react 1.40.0 bumps (#64, #63)`.
  - Both times, `check.yml` had the same order (`git show 64ed11a5:.github/workflows/check.yml`, lines 80-95).
- Mechanism: The order `install → audit → check → frozen-lockfile` makes the gate ineffective in CI. The step `bun audit` thus also checks the newly resolved lockfile instead of the committed one. The pre-push hook catches the case only when it runs. A push with `--no-verify`, a merge through the GitHub web interface, or a bot PR bypasses it. Also, the script `lockfile.sh` reads the worktree instead of the pushed commit (`lockfile.sh:33-34`). A `bun.lock` that someone regenerated locally but never committed passes there as well.
- Location: `.github/workflows/check.yml:82-85` (`bun install`), `:93-96` (`audit`), `:110-111` (`frozen-lockfile`); `scripts/gates/lockfile.sh:33-36`. Spec `openspec/specs/push-gate-checks/spec.md:118-136` ("made this the first CI step"). Spec `openspec/specs/development-toolchain/spec.md:383-386` ("CI catches a push that bypassed the hook"), `:1214` ("run `bun audit` against the committed lockfile").
- Severity: medium
- Evidence: confirmed (read the step order in `check.yml`; `git show --stat` proves two incidents: `64ed11a5` without `bun.lock`, `b206fc7d` with the correction; `fb102fb2`/`8f58825b`). This audit did not read whether CI was green on PR #19 and #63 (Repro R-1).
- Counter-evidence sought: `bunfig.toml` (only `[test]`, no `install.frozenLockfile`). Compose does not pass `CI` into the container (`.devcontainer/docker-compose.yml:28-66`). The production images build with `--frozen-lockfile` (`docker/engine.Dockerfile:16`, `docker/frontend.Dockerfile:12`). There the drift fails loudly, but only after the merge.
- Known: new (DEP-2, `docs/decisions.md:835`, concerns only the presence of the audit step)
- Suggestion: In `check` (and `e2e`), call `bun install --frozen-lockfile` instead of `bun install`. The first install then becomes the gate itself, and `bun audit` reads the committed file.

### G-2: `whitespace.sh` and `prose.sh` report "nothing to check" when `git diff` fails on the range

- Case:
  - A force push overwrites a remote branch whose old state the local clone never fetched. The same happens after `git filter-repo`, which removes the old objects. Git hands the hook `<remote sha>`. The script `range.sh` prints `<remote sha>..<local sha>` without a check (`range.sh:47-48`).
  - The script `whitespace.sh` calls `git diff --check "$range" 2>/dev/null || true`. That call fails with "bad revision". The output is empty, and the error disappears. The gate prints `the push changes no text file, nothing to check.` and exits 0. The script `prose.sh` behaves the same way.
  - In CI the case occurs on every force push. The value `github.event.before` is unreachable after the overwrite. The step `actions/checkout` with `fetch-depth: 0` does not fetch it.
- Mechanism: The `|| true` swallows both "finding found" (exit 1 from `--check`) and "command failed" (exit 128). The `2>/dev/null` hides the reason.
- Location: `scripts/gates/whitespace.sh:35`, `:44`, `:57-60`; `scripts/gates/prose.sh:74-81`, `:86-89`; `scripts/gates/range.sh:47-48`; `.github/workflows/check.yml:37`, `:44`
- Severity: medium
- Evidence: confirmed (code read); Repro R-2 can verify the behavior.
- Counter-evidence sought: The `set -e` in `pre-push:31` does not take effect, because the gates themselves return 0. The script `range.sh` does not check whether the objects exist. The script `machine-paths.sh` scans the tree (not affected).
- Known: new
- Suggestion: In `range.sh`, check each range bound with `git cat-file -e <sha>^{commit}`. Abort with exit 1 when a bound is missing. Alternatively, evaluate the exit code of `git diff --name-only` separately in both gates (`128 → abort`).

### G-3: The index guard in `migration.test.ts` checks an empty barrel after the split of `api.ts`

- Case:
  - The test "the fully rewritten instance readers name the generated columns, never the jsonb expressions" searches for `body->>'processId'` and similar. It searches in `REWRITTEN_MODULES = ["runtime/api.ts", ...]`.
  - Since `split-runtime-api` (`b464ab38`, `fa9f1e96`, 2026-09-23/24), the file `src/runtime/api.ts` is a 117-line barrel with no SQL. The instance readers now sit in `src/runtime/queries.ts` (7× `FROM instances`, for example `:438`, `:560`, `:633`), `instances.ts`, `internal.ts` and `reports.ts`.
  - If someone writes `WHERE body->>'status' = ...` there, the test stays green. Its own comment calls this test the only guard. The comment reads: "every behavioural test still passes, and only a query plan shows the loss".
- Location: `test/migration.test.ts:1540-1541`, `:1547-1556`; `src/runtime/api.ts:1-12`
- Severity: medium
- Evidence: confirmed. The command `git log -S REWRITTEN_MODULES` dates the test to 2026-09-01. The split came later. Today `git grep "body->>'(processId|version|status|currentStepId|startedBy)'"` finds no violation in `src/runtime/`.
- Counter-evidence sought: no second test over `src/runtime/*.ts` (`git grep body->> -- test`); nothing derives the module list.
- Known: new (consequence of ARCH-1, `docs/decisions.md:786`)
- Suggestion: Replace the list with all files under `src/runtime/` plus the two engine modules. Read the directory instead of maintaining a list.

### G-4: The hash guard for `examples/` covers 3 of 9 examples; nobody checks six stored `definitionHash` values

- Case:
  - A Zod upgrade emits one more key for `columnMapping`, `dataSources` or `allowedGroups`. Dependabot proposes such upgrades weekly, most recently `b1ceb48d` with `4.6.2 → 4.6.5`. The hash of `it-onboarding.json` (2337 lines) moves.
  - The test `test/view-layout-hash.test.ts` knows only `expense-approval`, `subprocess-credit-check-child` and `subprocess-loan-parent` (`:51-55`). The suite compares the wrapper hash only for `expense-approval.json` (`test/validate.test.ts:16-18`, `:911-918`).
  - The wrappers of `access-request`, `employee-onboarding`, `it-offboarding`, `it-onboarding`, `laptop-inventory` and `purchase-requisition` each carry a `definitionHash` (line 4). No test reads it. The comment in `validate.test.ts:914-916` reports that one such wrapper hash was already wrong once, unnoticed.
- Location: `test/view-layout-hash.test.ts:51-55`, `:64-65`; `test/validate.test.ts:911-918`; `examples/*.json:4`; spec `openspec/specs/development-toolchain/spec.md:634-635`, `:664-669`
- Severity: medium
- Evidence: confirmed (lists read; `git grep '"definitionHash"' -- examples` shows 7 wrappers). Whether one of the six hashes is already stale today: assumed, Repro R-3.
- Counter-evidence sought: `test/compile-validation.test.ts:1053-1062`, `test/registry-check.test.ts:179` and `test/validate.test.ts:267-286` iterate over all examples. These three check no hash. The file `test/definitions.test.ts` computes hashes only for inline bodies.
- Known: new
- Suggestion: A test over `readdirSync("examples")` that checks `definitionHash(compileProcessBody(raw.definition)) === raw.definitionHash` for each wrapper. That makes every wrapper hash the stored value the spec requires.

### G-5: Credentials for `http.request` sit in plaintext in the immutable definition and in every outbox row

- Case:
  - An author connects a partner API that requires a bearer token in a request header. The only means is `config.headers` (`z.record(z.string(), z.string())`). On publish, the token lands in the `ProcessBody` of the version. Nothing ever deletes that version ("Nothing deletes a published version", `.claude/rules/process-contract.md`, section Hashing).
  - The token also sits in the draft and in the JSON surface. Every transition copies the whole action, `config` included, into `outbox.action` (`src/engine/transition.ts:421-422`).
  - Rotation means publishing a new version. The old version and all old outbox rows keep the token.
- Location: `src/handlers/http.ts:43-48`, `:104-106`; `src/engine/transition.ts:421-422`; `src/engine/admin-queries.ts:17`
- Severity: medium
- Evidence: confirmed (schema and insert read). SMTP credentials, by contrast, come from the environment instead of the definition (`src/handlers/notification-email.ts:75`, `:93`). No example carries headers or tokens (`git grep -i -E 'password|token|authorization|api[_-]?key|secret' -- examples`: empty).
- Counter-evidence sought: The admin outbox list deliberately projects only `action->>'type'`, "never its `config`, which may hold credentials" (`admin-queries.ts:17`, `:98`). So this one read site recognizes the risk. The file `http.ts` has no env indirection, and `openspec/specs/http-action-handler/spec.md` has no rule. The archive `docs/decisions-archive.md:171-173` says "no key store or secret-management convention".
- Known: new (partly acknowledged in `admin-queries.ts:17`)
- Suggestion: A secret reference in the header value, for example `{ "env": "PARTNER_API_TOKEN" }`, which delivery resolves from the environment. This alters a handler's config schema in every body, so it needs an OpenSpec change.

### G-6: Dependabot runs as the `npm` ecosystem and never updates `bun.lock`

- Case: Since 2026-08-24, no Dependabot commit touches `bun.lock` (`64ed11a5`, `2d26c92e`, `46029470`, `c232a9ff`, `56790eb7`, `2a3d4d01`, `d679d0cb`, `6e543a6d`, `5950d71a`, `1c2bc44e`, `e5ed12df`, `59a9ebcf`, `f77e9d94`, `3eeac520`, `05d6711c`: each `grep -c bun.lock` = 0). Every such PR creates lock drift. With G-1 the drift stays green in CI, and `b1ceb48d` had to bundle eight PRs by hand.
- Location: `.github/dependabot.yml:3`, `:7`, `:11`
- Severity: low
- Evidence: confirmed (commit statistics read). That the `bun` ecosystem maintains the lockfile: assumed (GitHub documentation not read).
- Known: new
- Suggestion: Check `package-ecosystem: "bun"` for the three directories and switch to it.

### G-7: `silent-green.sh` misses `test.todo`, a changed output format and shrinking test counts

- Case: Someone turns a red test into `test.todo("...", fn)`. Bun does not run it and counts it under "todo" instead of "skip". The gate reads only `^ *N skip$` (`:57`) and lets the run pass. If Bun alters the line (for example to "skipped"), the gate always reads 0 skips. A run with markedly fewer tests also passes unnoticed. The gate has no lower bound for the pass count or the file count.
- Location: `scripts/gates/silent-green.sh:55-58`, `:66`
- Severity: low
- Evidence: confirmed (code); Bun output for `todo`: assumed, Repro R-4. Today the tree has no `test.todo` (`git grep` over `test/`, `packages/*/test`, `e2e`).
- Known: new
- Suggestion: Add `todo` lines to the skip sum. Also check that exactly two summaries with `N pass` appear (`bun test` and `test:tz`). Reject the run otherwise.

### G-8: `machine-paths.sh` misses Git Bash, macOS and JSON-escaped home paths

- Case: A plan document quotes a home path in the form Git Bash prints on this host. The pattern requires `[A-Za-z]:` before `Users`, or `/home/<user>/`. Four forms do not match: the Git Bash form, the macOS form, the lower-case drive form and the JSON-escaped form. The Git Bash form has the drive as the first path segment. The JSON-escaped form has doubled backslashes. The spec requires "on any platform".
- Location: `scripts/gates/machine-paths.sh:28`; `openspec/specs/push-gate-checks/spec.md:356-357`
- Severity: low
- Evidence: confirmed (pattern read). The tree has no current hit (`MSYS_NO_PATHCONV=1 git grep -nIE` over the four forms: empty; positive control `/home/node` = 6 hits). Repro R-5.
- Known: new
- Suggestion: Extend the pattern with `/[a-zA-Z]/[Uu]sers/[^/]+`, `(^|[^A-Za-z])/Users/[^/]+` and `[\\]{1,2}[Uu]sers[\\]{1,2}`. Ignore case.

### G-9: The round-trip test for `stripCompiledContent` names 6 of 9 examples

- Case: The file `test/strip-compiled.test.ts` maintains `EXAMPLES` by hand. Someone last updated it on 2026-08-29 (`603478a2`). The list lacks `access-request.json` (2026-08-31), `it-onboarding.json` and `it-offboarding.json` (2026-09-08), the largest bodies. The header comment calls the round trip "over `examples/`" the guard that keeps compile and strip in step.
- Location: `test/strip-compiled.test.ts:1-5`, `:13-20`
- Severity: low
- Evidence: confirmed (list and `git log --diff-filter=A` read). Whether the three bodies fail today: assumed, Repro R-6. The tests `packages/web/test/studio-strip-compiled.test.ts` and `studio-promotionRoundTrip.test.ts` do not name the three either.
- Known: new
- Suggestion: Use `readdirSync("examples")` instead of a list, as `compile-validation.test.ts:1053` does.

### G-10: Three tests assert only what the response is not, or nothing at all

- Case:
  - (a) "an ordinary-size request reaches the route handler" checks only `expect(res.status).not.toBe(413)`. A 404 (route missing), 401 or 500 passes as well. The comment claims "fails on its own terms (a malformed process body)", but the test does not check that.
  - (b) "freezing is per key" contains no `expect`. It checks only that re-registering (2→4) does not throw. It does not check that (1→4) is frozen.
  - (c) "the document declares at least the customer-facing paths" checks `/auth/login` and `length > 10`. The spec lists 28 required routes.
- Location: `test/http-body-size.test.ts:28-40`; `test/migration.test.ts:239-246`; `test/openapi-exclusions.test.ts:19-22`; spec `openspec/specs/http-api-documentation/spec.md:19-37`
- Severity: low
- Evidence: confirmed (read). The old TEST-3 has a fix now: `test/http.test.ts:2385-2395` pins the exact value.
- Known: new (pattern of TEST-3, `openspec/changes/archive/2026-08-18-code-review-record/CODE_REVIEW-2026-07-29.md:404`)
- Suggestion: (a) Pin the expected status together with `error.type`. (b) In one flow, check that a new registration cannot replace (1→4) but can replace (2→4). (c) Iterate over the spec list.

### G-11: The workflow sets no `permissions` and puts the token into the bind-mounted `.git`

- Case:
  - The file `check.yml` has no `permissions:` block. By default, `actions/checkout@v7` stores the `GITHUB_TOKEN` in `.git/config`. Compose mounts the repository root, `.git` included, at `/workspace` (`docker-compose.yml:17-18`).
  - Any code that runs inside `bun run check` can read the token: Vite plugins, Babel through `@stylexjs/unplugin`, tests. On `push` events, the token's write access depends on a repository setting that this audit cannot see. The workflow pins the actions by tag only (`@v7`) instead of by SHA.
- Location: `.github/workflows/check.yml:20-27`, `:66-68`, `:126`, `:160`
- Severity: low
- Evidence: confirmed (`grep` finds no `permissions`/`persist-credentials`); effective token rights: assumed (repository setting).
- Known: new (related to DEP-1, `docs/decisions.md:775`)
- Suggestion: Set `permissions: contents: read` at workflow level. Set `persist-credentials: false` on every `checkout`.

### G-12: The test preload creates a login role with a fixed password cluster-wide and never removes it

- Case: A developer points `DATABASE_URL` for `bun test` at a shared Postgres, as `CLAUDE.md` describes for runs outside the container. The file `test/preload-db.ts` creates a probe login role with a fixed test password ("Outlives the suite by design", `:51-52`). The role stays in the cluster. In Postgres, `PUBLIC` has `CONNECT` on every database by default.
- Location: `test/preload-db.ts:47-67`; `test/instance-audit-privileges.test.ts:18-21`
- Severity: low
- Evidence: confirmed (read); the precondition is unusual (a shared cluster with password login over the network).
- Known: new (related to SEC-10, `docs/decisions.md:742`, which names only the Compose defaults)
- Suggestion: Pass a random password per run (`ALTER ROLE ... PASSWORD`) to `instance-audit-privileges.test.ts`. Alternatively, use `NOLOGIN` and `SET ROLE` from the test connection.

### G-13: `dev-webhook-sink.ts` names a healthcheck that Compose lacks

- Case: The header says "`GET /healthz` is the compose healthcheck's own path". The `app` healthcheck is `bun --version`, and Compose states explicitly that it does not check the sink.
- Location: `scripts/dev-webhook-sink.ts:6-7`; `.devcontainer/docker-compose.yml:70-79`
- Severity: low
- Evidence: confirmed
- Known: new
- Suggestion: Delete the sentence.

## Checked without a finding

- Gates on empty input: `whitespace.sh:57-60` and `prose.sh:86-89` deliberately print "nothing to check" and exit 0. For manual runs, the script `range.sh:54-60` uses `origin/main..HEAD` as its default. A pure branch deletion stays empty (`:25-27`). The gap exists only for a failed `git diff`, see G-2.
- Missing tool: Documentation and spec both cover the linter skip (`prose.sh:31-38`, `:91-96`; `development-toolchain/spec.md:442-444`). If Python is missing, the call returns rc≠0/1 and `prose.sh` aborts with exit 1 (`:131-139`, `:152-153`).
- Missing container: `preflight.sh core` aborts at check 1/2 (`preflight.sh:32-44`), and `pre-push:31` has `set -e`. The script `lockfile.sh` rejects on a failed `exec` (`:33-45`).
- Pipes without pipefail: `pre-push:63-70` and `check.yml:98-108` capture without `tee`. The script `machine-paths.sh:31-36` puts `|| true` only after the last `grep`.
- `grep -c` on empty input: `prose.sh:133` runs only at rc=1. On empty output `grep -c` exits 1, and `lint_at` aborts (fail-closed).
- `pre-push`: The last command is the silent-green gate (`:79`), so its exit code decides the hook's exit code. The command `bun run check` has its own exit path (`:74-77`).
- `test-gated.sh`: Takes over rc without `set -e` (`:13-14`) and sets rc=1 on rejection (`:16`). An empty command yields no DB line, and the gate rejects it.
- `silent-green.sh`: `DATABASE_URL` empty → rejection (`:37-44`); no DB line → rejection (`:46-53`); skips > floor → rejection (`:66-75`); floor not an integer → rejection (`:60-64`). Gaps: see G-7.
- Skip floor history (`git log -p --follow scripts/gates/skip-floor.txt`): one single commit, `1634128e` (2026-08-04), value 1, with a reason line (`skip-floor.txt:12-16`). No increase since.
- Today's skip sources:
  - `skipIf(!DB)` 1652×.
  - `skipIf(!ZURICH)` 1× (floor line; `packages/web/test/reporting-reportingLogic.test.ts:84`).
  - `skipIf(!SMTP_HOST)` 1× (`test/handlers-notification-email.test.ts:503`; Compose sets `SMTP_HOST`, `docker-compose.yml:48-52`).
  - `skipIf(!DB || !PROBE)` 5× (`test/instance-audit-privileges.test.ts:68`ff., role from `preload-db.ts:47-67`).
  - No `test.skip`, `test.todo`, `describe.skip` or `xit`. Every condition has a stated reason.
- `toContain` loops over fixed lists in `test/`: checked `dockerignore.test.ts:117`, `field-kinds.test.ts:83` (iterates `KIND_NAMES` from the source), `openapi-exclusions.test.ts:80-91` (list matches spec `:36-38`). Stale lists: G-3, G-4, G-9.
- TEST-2 (concurrency): fixed. Real parallelism through `Promise.allSettled` sits in these tests:
  - `test/assignment.engine.test.ts:227-239`.
  - `test/assignment.runtime-api.test.ts:121-136` (also checks exactly one `assignment.claimed` event), `:160`.
  - `test/runtime-api.test.ts:1982-1999` (submit race, exactly one `history_entries` entry).
  - `test/timer.test.ts:278`, `test/outbox.test.ts:334`.
- TEST-3: fixed (`test/http.test.ts:2385-2395`). Remnants of the pattern: G-10.
- TEST-1: still open. The test `test/auth-server.test.ts:236-247` checks four hand-picked routes. No test iterates the route table. Known: `docs/decisions.md:769`.
- Tests without assertion: heuristic scan of all `test/*.test.ts`. The hits in `instance-visibility-view.test.ts` check through the helpers `opens`/`refuses` (`:104-109`). The only real empty case is `migration.test.ts:239` (G-10).
- Secrets in code, Compose, devcontainer, workflows and examples: only dev defaults.
  - Compose `POSTGRES_PASSWORD` and `ALLOW_INSECURE_DEV_AUTH` (SEC-10, `docs/decisions.md:742`); `dev-up.sh:21-22`; `seed.ts:43`, guarded by `SEED_ALLOW` (`:163-166`).
  - The workflow uses no secrets (`check.yml:6-9`). Examples have no credentials. SMTP credentials come from the environment. Definition headers: G-5.
- Unneeded dependencies: none. Import scan per workspace: the code imports every runtime dependency. Nothing imports `zod` in `packages/web` directly, but the spec requires it (`development-toolchain/spec.md:655-660`). No undeclared imports (except `virtual:stylex:runtime`, a plugin module).
- `THIRDPARTY.md` against `bun.lock`: all 18 direct dependencies with identical versions (`THIRDPARTY.md:54-73` against the `packages` entries in `bun.lock`). React appears twice, as described (`:75-78`). The decisions file already records the line `postgres:16`, which has no tracked source (`docs/decisions.md:239-245`).
- Exact pins:
  - Contract-critical pins are exact (`@marcbachmann/cel-js` 8.0.0, `zod` 4.6.5, `typescript` 7.0.2, `oxlint` 1.85.0; `package.json:39-47`, `packages/web/package.json:15-28`).
  - Given as a range: `jose`, `react`, `react-dom`, `@dagrejs/dagre`, `@panzoom/panzoom`, `vite`, `@playwright/test`.
  - The spec requires exact pins only where they are contract-critical (`development-toolchain/spec.md:604-635`), and production installs frozen. CI, however, does not resolve frozen (G-1).
- Devcontainer/Compose:
  - Ports only through the generated file, bound to 127.0.0.1 (`dev-up.sh:45-55`). The service `db` publishes no port (`docker-compose.yml:81-106`). The image `postgres:latest` is a deliberate choice (`:82-88`) and known (`docs/decisions.md:239`).
  - The devcontainer pins Bun to 1.3.11 (`.devcontainer/Dockerfile:9`), equal to the prod images (`docker/engine.Dockerfile:7`).
  - Side observations without a finding: `@types/bun` 1.3.14 is newer than the runtime 1.3.11. The base `typescript-node:22` moves with minor versions. The Bun install through `curl | bash` has no checksum (`Dockerfile:10`).
- CI: The full suite runs with `DATABASE_URL` from Compose (`docker-compose.yml:29`). The silent-green gate reads the unfiltered output (`check.yml:100-114`). The file `check.yml` documents the prose skip in CI (`:53-58`). The decisions file already lists DEP-1 (`docs/decisions.md:775`).
- Dead scripts: none. Every script has a reference: `backfill-instance-principals.ts` in `docs/runbooks/deployment.md:107`, `dev-webhook-sink.ts` in `docker-compose.yml:27`. The rest sit in `package.json:21-36`, `.githooks/pre-push`, `check.yml` and `dev-up.sh`.
- Duplicated logic: `e2e.ts:15-20` copies the URL derivation from `preload-db.ts` and states the reason. The scripts `dev-up.ps1`/`preflight.ps1` delegate to `.sh` (no duplication). This audit did not propose refused simplifications no. 5 (shorten the gate scripts) and no. 15 (shared file collector) again.

## Repro proposals

- R-1 (G-1): `gh pr view 19 --json statusCheckRollup,files` and `gh pr view 63 --json statusCheckRollup,files`. Expected: `check` job green, `files` without `bun.lock`.
- R-2 (G-2), on the host in the repo, read only: `printf 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef..HEAD\n' | sh scripts/gates/whitespace.sh; echo rc=$?`. Expected: `gate 'pushed-whitespace': the push changes no text file, nothing to check.` and `rc=0`. The same with `sh scripts/gates/prose.sh`. Positive control: `git diff --check deadbeefdeadbeefdeadbeefdeadbeefdeadbeef..HEAD; echo rc=$?` yields `fatal: bad revision` and `rc=128`.
- R-3 (G-4), in the container, script in `/tmp/h.ts` (outside the repo):
  `import {readdirSync,readFileSync} from "node:fs"; import {compileProcessBody} from "/workspace/src/schema/compile.ts"; import {definitionHash} from "/workspace/src/schema/hash.ts"; for (const f of readdirSync("/workspace/examples").filter(n=>n.endsWith(".json"))) { const r=JSON.parse(readFileSync("/workspace/examples/"+f,"utf8")); if(!r.definitionHash) continue; const h=definitionHash(compileProcessBody(r.definition)); console.log(f, h===r.definitionHash?"OK":"STALE "+h); }`
  then `bun /tmp/h.ts`. Expected: `expense-approval.json OK`. Every `STALE` line proves a wrapper that is wrong today.
- R-4 (G-7), in the container, outside `/workspace`: `mkdir -p /tmp/sg && printf 'import {test} from "bun:test";\ntest("a",()=>{});\ntest.todo("b",()=>{throw new Error("x")});\n' > /tmp/sg/a.test.ts && cd /tmp/sg && bun test > out.txt 2>&1; printf '[test] database: x_test\n' >> out.txt; grep -E 'skip|todo' out.txt; sh /workspace/scripts/gates/silent-green.sh out.txt; echo rc=$?`. Expected: a `1 todo` line, no `skip` line, `rc=0`.
- R-5 (G-8): `printf '/%s/%s/alice/x\n/%s/alice/x\n%s:/%s/alice/x\nC:%s%s%salice\n' c Users Users c users '\\' Users '\\' | grep -E '[A-Za-z]:[\/]Users[\/][A-Za-z0-9_]+|/home/[a-z][a-z0-9_-]*/'; echo rc=$?`. Expected: no output, `rc=1`.
- R-6 (G-9), in the container, `/tmp/s.ts`: print the expression `JSON.stringify(stripCompiledContent(compileProcessBody(b))) === JSON.stringify(authoredProcessBody.parse(b))` for `access-request.json`, `it-onboarding.json` and `it-offboarding.json`. The imports come from `/workspace/src/schema/{definition,compile,strip-compiled}.ts`, with `b = raw.definition ?? raw`. Expected per the test's intent: `true` per file. A `false` means that the round trip is broken today, with no guard.
- R-7 (open question, see Not checked): in the container `cd /workspace/packages/form-ui && bun -e 'console.log(require("react/package.json").version, require("react-dom/package.json").version)'` and the same in `/workspace/packages/web`.

## Not checked

- React version of the form-ui tests: `packages/form-ui/package.json:16-17` declares the peers `react`/`react-dom` `^18`, while `packages/web` uses `^19`. The file `bun.lock` resolves 18.3.1 at the root and under `web/form-ui/`, and 19.2.8 under `web/`. Without execution, this audit cannot settle whether `packages/form-ui/test/*.test.tsx` renders with React 18 while the product ships 19 (R-7). The test `packages/web/test/studio-formPreview.test.tsx` renders form-ui green with 19, which argues against a mix-up. Hence no finding.
- Tests under `packages/web/test` and `packages/form-ui/test` (mirror lists `KNOWN_KEYS`, `PROPERTY_WORDS`, `sectionsFor`): outside area G, read only for cross-references.
- `.githooks/post-commit` during `git rebase` (whether the VERSION bump blocks a rebase sequence): this audit did not execute the Git behavior.
- `e2e/`: read only for skip patterns (none found). This audit read `scripts/e2e.ts` and found nothing.
- Who may read `GET /processes/:id/versions/:version`, and so who sees a token from G-5: area HTTP/Auth.
- `bun audit`: per the assignment, the coordinator runs it.
