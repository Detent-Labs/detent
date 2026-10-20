# Workflow / BPM Platform: Project Context

## What this is
<!-- antislop: allow sentence-length negation-habit - other files cite the operator and surface sentence word for word -->

A workflow/BPM platform written in TypeScript. It runs structured, form- and
approval-driven business processes with explicit states. The product is the
engine plus its browser UI (`packages/web`). Four areas serve the participant,
the operator, the developer and the process owner. Two of those words are domain
terms here and carry no synonym: an **operator** is the admin area's audience,
and an authoring **surface** is what the studio presents.

The engine stays headless and API-first behind that UI, with no UI dependency.
`packages/web` reaches it only over the HTTP wrapper and the exports map. That
property is load-bearing: an integration drives a process with no browser at
all. Do not let a UI concern leak into `src/`.

Direction: no-code and low-code process authoring (`ROADMAP.md` stage 27).
No-code is the target for what the builders cover: an author types no CEL and
no JSON. The builders cover the canvas, the form editor, plugin config, path
guards and view overrides, migration plans and templates. Low-code stays
underneath permanently: the JSON surface, the CEL input and hand-authored
bodies stay first-class.

Three sites keep a raw input on purpose. A timer deadline must infer to
`string`. An `Action.output` value reads `result` alone. The JSON surface is the
escape hatch for what no builder expresses. That direction relaxes no definition
contract rule. Every authoring surface produces the same JSON definition.

The paradigm is a state-based finite-state machine (NOT BPMN token flow):
Steps (states) connected by explicit Paths (transitions). Three roles share one
artifact, the serialized JSON process definition. The engine executes it, the
studio builds it on a canvas, and hand-authoring writes it directly as JSON
(rare). That definition is the definition contract between engine and studio;
`src/schema/definition.ts` expresses it as TypeScript types. The word
`contract` alone names the `ProcessContract` a subprocess declares. Write
`definition contract` whenever the whole JSON definition is meant.

### Stage: pre-1.0, with nothing deployed to preserve
No deployment runs this engine. No stored instance pins a version somebody else
depends on. No definition under `examples/` belongs to an outside party. A
proposal is never wrong merely because it conflicts with today's definition
contract, Zod schema or invariant set. Changing one costs an OpenSpec change and
a sweep of `examples/`, the tests and `docs/authoring-guide.md`. Where the right
shape needs a contract change, propose it.

Two things stay. At runtime a published version is immutable and an instance
pins `{processId, version, definitionHash}`, since the engine's correctness
rests on it. The mechanical gates below stay non-negotiable.

### Hard v1 boundaries (do not cross without a deliberate decision)
- Exactly one active step per instance (single FSM). No parallelism, no
  AND-split/join, no multi-instance steps.
- Subprocesses are synchronous call-and-return only. No fan-out.
- Async action execution (post-commit). `blocking` stays reserved and unbuilt.

## The definition contract in brief
Full detail in `.claude/rules/process-contract.md` and
`.claude/rules/authoring-invariants.md`. Those load automatically when you touch
`src/schema`, `src/engine`, `src/cel`, `src/validate.ts`, the studio area,
`examples/` or `openspec/`. Read them before proposing any change to the JSON
definition. The short form, true in every session:
- The opaque `id` anchors every stored reference and all persisted instance
  state. A `key` is a slug with two readers. CEL reads a field as
  `data.<key>`. A view entry's `group` names a group field's `key`, and its
  `tab` names a key in the same view's `tabs`. A `label` is display text.
- `definitionHash` is the JCS hash of `ProcessBody` only. Published versions are
  immutable; instances pin `{processId, version, definitionHash}`.
- All conditions are CEL, `{ lang: "cel", src }`. CEL is pure and total, has no
  `now()`, and a raising guard means "no match", never a throw.
- State commits first, side effects dispatch after via a transactional outbox
  (at-least-once + idempotency key = effectively-once).
- A step's paths are all-manual XOR all-automatic. Among 2+ automatic paths,
  `priority` is required and unique; at most one guardless default, at the
  highest priority.
- Plugins (actions, data sources, assignment strategies) sit behind
  `{ type, config }` and resolve through a registry at PUBLISH time.

## Change workflow (OpenSpec)
Every non-trivial change goes through an OpenSpec change in `openspec/`, never
straight into the tree. That covers a new capability, a definition contract or
schema change, and a tooling or infra switch. The cycle runs propose -> write
specs/tasks -> implement -> verify -> archive. The `openspec-*` skills drive it:
`openspec-new-change` or `openspec-propose`, `openspec-apply-change`,
`openspec-archive-change`. Keep `openspec/config.yaml`'s `context:` current.

**`.claude/commands/opsx/` stays deleted.** Keep the skills. `openspec update`
regenerates it with no opt-out flag; delete it after each run.

**A trivial fix touches one file, no spec and no test.** It skips the cycle.
Everything else is a change, whatever it looked like at first glance. Count the
files before you call something a one-liner.

**A UI change is never trivial.** Each screen touches its area, its i18n
catalog, often the shell or tokens. Its change writes its delta against the
capability spec of the area it touches: `end-user-app` for `areas/app/`,
`admin-app` for `areas/admin/`, `reporting-app` for `areas/reporting/`,
`unified-shell` for shell, login, routing and chrome, `form-ui` for the
renderer. Studio work goes to the specific capability (`studio-canvas`,
`studio-json-view`, `studio-form-editor`, `studio-publish` and the rest), and
`studio-app` keeps the frame, navigation and process list. `spa-accessibility`,
`ui-string-overrides` and `authored-content-localization` cut across all of
them. A screen that needs new data adds the API-side spec too, `instance-query`
or `admin-operations-api` for example.

**No phase inside the cycle is optional.** Do not propose skipping the spec or
the plan phase. That holds for `openspec-propose` and for the brainstorming
skill. Run `openspec-review-change` before `openspec-apply-change`, every time.
Resolve every finding it reports first. Apply starts at zero open findings.

### Apply runs on subagent-driven-development
`superpowers:subagent-driven-development` replaces `openspec-apply-change` step
6; an inline loop does not. The change's `tasks.md` is its plan file.
The skill runs one fresh implementer subagent per task and a task reviewer
after each. A fix loop caps at five rounds. A ledger sits under
`.superpowers/sdd/`, and one whole-branch review closes the run.

Every other phase stays OpenSpec's. The skill's final review replaces none of
the four checks below. Finish verify → sync → archive before the merge/PR menu
of `superpowers:finishing-a-development-branch`: archiving precedes a push.

Five project facts the dispatch must carry, because the skill cannot know them:
- **The brief is thin.** A `tasks.md` checkbox line is not a task brief. Hand
  each implementer the task text plus the change's `design.md` and its delta
  spec under `openspec/changes/<name>/specs/`. Exact values live in those
  files, never in the dispatch prose.
- **No single-file test rerun** (see Conventions). An implementer runs the full
  `bun test` with `DATABASE_URL` set, in the devcontainer, and reads its
  verdict off a named failing test.
- **A ruling stops at the definition contract.** The skill decides and ledgers
  ambiguities itself. That authority ends at `src/schema/definition.ts` and at
  any rule a delta spec states. Those need their own OpenSpec change.
- **The controller owns the branch.** Create the worktree or branch before Task
  1. No subagent calls `EnterWorktree`, since one call re-pins every sibling.
- **`tasks.md`'s headings don't match the skill's `task-brief` script.**
  OpenSpec's `## N. <group>` format isn't `### Task N`, so the script finds
  nothing. Cut per-group briefs by hand with `awk` on `## N.` instead.

## Verification (the gate before "done")
Call a change done only after all four checks pass. Report what each one
printed; running it proves nothing.
- `bun run typecheck`, then `bun run build`, then the **full** `bun test` with
  `DATABASE_URL` set (see Conventions). `bun run check` runs
  `lint`, typecheck, build and the suite, then `test:tz`, the reporting logic
  test under `TZ=Europe/Zurich`.
- In a `tasks.md` Verification task, keep `bun test` (and any other phrase
  `scripts/openspec-review-check.ts` string-matches) on one unwrapped line. A
  line wrap silently defeats the match and reports a false Critical.
- The antislop linter, on every Markdown file the change touched, and the
  trailing whitespace, blank-at-eof and CRLF check. Run each the way the push
  gate does, over the same range:
  `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`, and the
  same with `whitespace.sh`. The `< /dev/null` belongs on `range.sh`, which
  falls back to `origin/main..HEAD`. Both gates read their ranges on stdin; an
  empty stdin checks nothing, and `prose.sh` says so and exits 0. Run the gate
  rather than its probes by hand. Plain `git diff --check` misses CRLF, since
  `.gitattributes` sets `eol=lf`. The script reads `git ls-files --eol`.
- A real browser, for any UI change. Green tests do not see an error dialog
  rendered behind a modal, a stale result row, or an `/admin/*` route collision.
  All three shipped past a green suite here. `docs/browser-checks.md` holds what
  stays manual. `development-toolchain`'s split rule picks one of three homes: a
  `bun:test` assertion, an `e2e/` smoke flow, or a checklist entry there.

## Enforced mechanically. Do not re-litigate these.
`.githooks/pre-push` runs the gates below on every push. Each covers a bug class
that recurred here, and names the rule broken, the files and the repair command.
Do not argue these down. Do not weaken a pattern to make a push pass, or raise a
threshold to clear a red gate. Repair the file instead. Where a gate is wrong
about one line, silence it in place and say why, as the antislop directives do.

| Rule | Script | Rejects |
|---|---|---|
| `pushed-whitespace` | `gates/whitespace.sh` | a CR byte, a trailing space, a blank line at EOF, in the pushed range |
| `changed-markdown-prose` | `gates/prose.sh` | a rising antislop finding count in the Markdown the push changes |
| `no-machine-paths` | `gates/machine-paths.sh` | an absolute home-directory path in a tracked file |
| `frozen-lockfile` | `gates/lockfile.sh` | a manifest the committed `bun.lock` cannot satisfy |
| `no-silent-green` | `gates/silent-green.sh` | a suite run with no database, too many skips or todos, too few passes, or a summary it cannot read |

The first three need only git and a shell. They run and report on the host, even
with the container down. The last two run in the devcontainer. The `--no-verify`
flag bypasses the hook and disables every gate at once, never just the one in
the way.

The skip floor in `scripts/gates/skip-floor.txt` is a ratchet. Raise it only in
the commit that adds the skip, with a row naming what the increase covers. A
todo test counts as a skip. The pass floor in `scripts/gates/pass-floor.txt`
sets the least number of passing tests; a run below it fails the gate. A change
that deletes tests on purpose lowers it in the same commit.

`no-silent-green` also rejects a summary it cannot read: no `pass`
line or no `Ran N tests` line. Counts that do not match N, or count lines after
the last `Ran` line, fail too.

### Prose debt: what the ratchet permits
`changed-markdown-prose` is a ratchet too. It compares a file's antislop finding
count at the pushed range's base against the count at its tip. It blocks only a
rise. A file already carrying findings passes, as long as the push adds none.
The live specs under `openspec/specs/` carry thousands of old findings. A
whole-file gate would make a one-requirement sync pay that whole debt.

Clearing a touched file's debt stays the norm where it is cheap. That norm is
advisory; the ratchet is the mechanical floor. It blocks a file getting worse
and does not demand that it get better. An `allow-file` directive lowers the
count, so the gate permits one. Prefer the targeted form,
`<!-- antislop: allow <rule> -->` next to the line it excuses, with a sentence
saying why. A blanket directive silences rules nobody re-examines.

Four bug classes recur with no gate, on purpose. They are stale UI state after
a mutation, orphaned exports, stale roadmap status and off-by-one bounds. The
browser check covers the first. The reasoning lives in
`openspec/changes/archive/*gate-recurring-defects*/design.md`.

## Repository layout
```
container/        Dockerfile; scripts/dev-pod.sh generates the Pod spec
src/schema/       the definition contract (Zod) and its compile helpers
src/cel/          CEL checking and evaluation
src/engine/       executor: store, outbox, transitions, timers, subprocess, drafts, migration
src/runtime/      Runtime API Layer (api.ts barrel)
src/http/         REST/JSON wrapper over Bun.serve, one route file per surface
src/auth/         ActorResolver seam, local accounts, login, roles, CLI
src/handlers/     action handlers
packages/web/     the one browser package: shell, api, i18n, the four areas
packages/form-ui/ the shared step-form renderer; stays its own package
examples/ test/ e2e/  example definitions, bun:test suites, smoke flows
package.json      Bun workspace root and the engine's exports map
```
`docs/current-state.md` holds the per-subsystem detail.

## Where the rest lives
- `.claude/rules/`: `process-contract.md` (the definition contract in full),
  `authoring-invariants.md` (what validation enforces), `ui-glossary.md` (one
  word per UI part).
- `docs/current-state.md`: per-subsystem index of paths and owning specs. It
  names no exported symbol, so a rename elsewhere leaves every entry correct.
- `docs/decisions.md`: open questions, decided-but-unbuilt work, open review
  findings, refused simplifications. `docs/decisions-archive.md`: the reasoning
  once a decision ships, moved there word for word. The dated reviews sit in
  `openspec/changes/archive/2026-08-18-code-review-record/`.
- `docs/authoring-guide.md`: teaches the definition contract to process authors.
- `ROADMAP.md`: stage status (DONE / NOT STARTED), open stages in full, one
  table row per finished stage. The file `docs/roadmap-history.md` says what
  each finished stage was. Read it only for a stage the table sends you to.
- `README.md` (install, develop, deploy), `PRODUCT.md` (the four audiences).
- `THIRDPARTY.md`: the license notice. Regenerate it with
  `bun run scripts/thirdparty.ts --write` after any dependency change.
- `docs/openapi.yaml`: the public HTTP surface, excluded routes too.
- `docs/runbooks/`: deployment configuration; backup and restore, one dump per
  tenant database.
- `openspec/changes/archive/2026-08-30-field-model-type-format-control/field-model-redesign.md`:
  the field model design record. It states no requirement.
- `DESIGN.md` (the design tokens the detector reads), `docs/browser-checks.md`
  (manual browser checks).

For "what does X do" prefer the knowledge graph below over any of them. The
code is the source of truth; those files are the map.

## Codebase memory (knowledge graph)
Index the repo into codebase-memory-mcp with `index_repository` in `full` mode;
the indexer reads its exclusions from `.gitignore`. The index is per-machine
local state outside the repository. Nothing in the repo carries it, and no setup
step builds it. Check with `list_projects` before you trust a graph query. An
absent project means "index it now". It never means "the graph says no".

Resolve the `project` arg from that same `list_projects` call, matching on
root_path; the slug is machine-specific, never hardcode it. For "who calls X" /
"what does Y touch" questions across several files, prefer the graph over
Read/grep. Its main tools are `search_graph`, `trace_path`, `get_code_snippet`
and `query_graph`. The index goes stale as code changes, and `detect_changes`
shows impact since a ref. After a substantial change lands, re-run
`index_repository` in full mode, never incremental.

## Conventions
- TypeScript strict, ESM.
- **Every worktree shares `tmp/`, so keep scratch files out of it.** Two agents
  writing one file there read each other's result. Scratch goes in the session
  scratchpad. The `tmp/` directory holds only what the worktrees share. That is
  the deploy stack, the design-language reference, and the task brief a new
  worktree reads at `tmp/briefs/<change-name>.md`.
- A deliberate shortcut in `src/` or `packages/` carries a `ponytail:` comment
  naming the shortcut, its ceiling and the upgrade entry point. The roll-up is
  `git grep -n 'ponytail:' -- src packages`; no ledger file and no gate back
  it. `openspec/specs/push-gate-checks/spec.md` states the rule.
- **UI work in `packages/web` or `packages/form-ui` goes through the design
  skills first.** The `impeccable` skill owns visual direction. It enters the
  cycle at three points. In the proposal, `/impeccable shape <screen>` decides
  UX and layout before any code exists. Its result goes in `design.md`. During
  apply, the design detector hook runs after every file write under
  `packages/web/**`. At the browser check, run `/impeccable critique <route>`
  and `/impeccable audit <route>` on the changed screen.
  - `audit` covers the a11y, responsive and performance checks
    `docs/browser-checks.md` otherwise leaves to hand. It replaces no browser
    check that needs a human eye.
  - `init` and `document` do not repeat per change. Run `extract` when a
    pattern appears a second time, and `doctor` when `DESIGN.md` drifts.
  - The skill installs per machine. `.gitignore` excludes it and both settings
    files, and its detector hook lives in `.claude/settings.local.json`. A fresh
    machine or worktree has no detector until somebody runs
    `/impeccable hooks on` there.
  - For UI/UX work also pull in the installed Vercel skills
    (`web-design-guidelines`, `vercel-react-best-practices`,
    `vercel-composition-patterns`). Do not default to plain React/CSS choices.
    Prefer semantic HTML5 elements (`<nav>`, `<main>`, `<button>`,
    `<dialog>`, ...) over generic `<div>`/`<span>` soup.
  - The token and value authority is `DESIGN.md`. The prose rules live in
    `.claude/rules/design-language.md`, which loads for `packages/web/**`,
    `packages/form-ui/**` and `DESIGN.md`. The untracked design-language file
    under `tmp/` is a visual reference that may lag the other two.
- Bun is the runtime, package manager, and test runner. Use `bun` and never
  npm or pnpm. Typechecking stays with `tsc --noEmit` (`bun run typecheck`).
  `BUN_VERSION` in `container/Dockerfile` pins the version. All tooling (Bun,
  tsc, tests, dev server, lint) runs inside the dev container,
  never on the host. Claude Code may run on the host and reach the container
  through `sh scripts/dev-exec.sh <cmd>`. The `devcontainer-exec` skill covers
  the pod, the exec helper, dev server ports, and the mechanics of a suite run.
- **No `cd` prefix and no shell variable, in any Bash command.** The Bash tool
  already starts in the repository root. Claude Code's permission analyzer
  sends either habit to manual approval.
  - A `cd` chain holding any `$VAR` loses the working directory, reported as
    `Contains simple_expansion`. Drop the `cd`. Pass absolute paths outside the
    repository and relative ones inside it.
  - A variable draws the same refusal with no `cd` at all ("cd-compound").
    Run the command that produces a value, read it, and paste it literally
    into a second call.
- PostgreSQL is the datastore, reached via Bun's native `Bun.sql` (no driver
  dependency). `DATABASE_URL` is the connection convention, set by the Pod spec.
- **Run `bun test` with `DATABASE_URL` set, always.** The DB-backed suites are
  `test.skipIf(!DB)` and make up most of the suite. Without the variable they
  skip *silently* and report a green that proves almost nothing. Check the skip
  count as well as the pass count. Outside the devcontainer, point it at the
  major the Pod spec's `postgres:latest` resolves to, with its credentials.
  `scripts/test-gated.sh` runs the push gate's checks before the push. From the
  host, in one call:
  `rtk test sh scripts/dev-exec.sh sh scripts/test-gated.sh bun test`. Exit 1
  with `0 fail` means the gate rejected the run (see `devcontainer-exec`).
- **A full-suite run is the reliable signal; a single-file rerun is not.** The
  DB suites share one database. Each truncates in `beforeEach`, so back-to-back
  runs of one file contend and fail spuriously. A second `bun test` on that
  database rotates the probe role's password, so the running suite's privileges
  tests fail (28P01). Read a verdict off a *named* failing test, never a pass
  count alone.
- **The suite has its own database. The dev server keeps `DATABASE_URL`'s.**
  `bunfig.toml`'s `[test] preload` (`test/preload-db.ts`) appends `_test` to the
  database name for every `bun test` run, creates it on demand, and prints the
  name it chose. The split closes two measured hazards. First, a `bun test` run
  wipes demo state mid-demo: its `beforeEach` truncates `definitions`,
  `instances`, `outbox`, `auth_users` and more. Second, a running
  `bun run serve` corrupts test runs. Its outbox poller claims rows the suite
  is driving: 3 red runs of 20 with a dev server up, 0 of 20 with none. Do not
  point a server or a seed at the `_test` database. Do not drop the preload
  to "simplify" the setup.
- **Never mutate, stash, or run `git checkout` on the shared working tree to
  test something.** Mutation testing belongs on a copy. It reverts a line and
  confirms that a named test fails. The tree usually holds uncommitted work. A
  leftover mutation reads to the next reviewer as a real bug.
- **Never use `git stash`, not for mutation testing and not otherwise.** Agents
  share this tree. A stash hides uncommitted work from them. Commit to a branch.
- **Keep a local merge into `main` a fast-forward.** A post-commit hook
  rewrites `VERSION` on every commit. A stray uncommitted bump, or another
  session's staged file, blocks a three-way merge but never a fast-forward.
  Add no commit of your own to `main` first, and revert the local bump with
  `git checkout -- VERSION` rather than committing it.
- **A history rewrite states its branch list first.** Before `git filter-branch`
  or `git filter-repo`, print `git branch -a` and name the refs the rewrite will
  touch. Exclude every backup branch explicitly, or the rewrite takes the backup
  too and leaves no untouched copy.
- Comments state facts concisely and precisely, and omit process history.
- The definition contract is the foundation. Change the schema (definition.ts /
  the Zod source) deliberately, never as a side effect of another task. It gets
  its own OpenSpec change with the rule delta written down. It does not mean
  never.
- A new `ProcessBody` or `Step` field has hand-kept mirrors in the studio. No
  type check ties them to the schema, so a grep for schema consumers misses
  them. Extend them in the same change: `KNOWN_KEYS` in `load-guard.ts`,
  `PROPERTY_WORDS` and `OWNED_LISTS` in `changeSet.ts`, the section arrays in
  `sectionsFor.ts`, and every test that lists expected keys or sections. A
  `toContain` loop in such a test stays green when its list goes stale.
- An OpenSpec change that changes a rule `docs/authoring-guide.md` states must
  change the guide in the same commit.
- Every invariant that lands ships with a test that rejects a violating input.
