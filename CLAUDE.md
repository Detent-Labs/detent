<!-- antislop: allow-file synonym-rotation em-dash passive-voice sentence-length run-ons phrasal-verbs -->
# Workflow / BPM Platform — Project Context

## What this is
A workflow/BPM platform written in TypeScript. It runs structured, form- and
approval-driven business processes with explicit states.

The product is the engine plus its browser UI (`packages/web`). Four areas serve
the participant, the operator, the developer and the process owner. Two of those
words are domain terms here and carry no synonym: an **operator** is the admin
area's audience, and an authoring **surface** is what the studio presents.

The engine itself stays headless and API-first behind that UI. It carries no UI
dependency. `packages/web` reaches it only over the HTTP wrapper and the
exports map. That property is load-bearing: an integration drives a process
with no browser at all. Do not let a UI concern leak into `src/`.

Direction: no-code and low-code process authoring (`ROADMAP.md` stage 27, DONE
a–f). The two words name two things. No-code is the target for what the
builders cover: an author types no CEL and no JSON. Low-code is what stays
underneath permanently: the JSON view, the CEL input and hand-authored bodies
stay first-class.

The builders cover the canvas, the form editor, plugin config, path guards and
view overrides, migration plans and templates. Three sites keep a raw input on
purpose: a timer deadline must infer to `string`, an `Action.output` value reads
`result` alone, and the JSON view is the escape hatch for what no builder
expresses. That direction relaxes none of the definition contract rules. Every
authoring surface produces the same JSON definition.

The paradigm is a state-based finite-state machine: Steps (states) connected by
explicit Paths (transitions). This is NOT BPMN token flow.

Three roles share one artifact, the serialized JSON process definition: the
engine executes it, the studio builds it on a canvas, and hand-authoring writes
it directly as JSON (rare). That definition is the definition contract between
engine and studio. `src/schema/definition.ts` is that definition contract,
expressed as TypeScript types. The word `contract` alone names something else
here, the `ProcessContract` a subprocess declares. Write `definition contract`
whenever the whole JSON definition is meant.

### Stage: pre-1.0, with nothing deployed to preserve
No deployment runs this engine. No stored instance pins a version somebody else
depends on, and no definition under `examples/` is a customer's. A proposal is
therefore never wrong merely because it conflicts with today's definition
contract, Zod schema or invariant set. Changing one of those costs an OpenSpec
change and a sweep of `examples/`, the tests and `docs/authoring-guide.md`.
Where the right shape needs a contract change, propose the contract change.

Two things this does not loosen. The runtime rules still hold at runtime: a
published version stays immutable and an instance still pins
`{processId, version, definitionHash}`, because the engine's own correctness
rests on it. And the mechanical gates below stay non-negotiable.

### Hard v1 boundaries (do not cross without a deliberate decision)
- Exactly one active step per instance (single FSM). No parallelism, no
  AND-split/join, no multi-instance steps.
- Subprocesses are synchronous call-and-return only. No fan-out.
- Action execution is async (post-commit). `blocking` is reserved but not built.

## The definition contract in brief
Full detail in `.claude/rules/process-contract.md` and
`.claude/rules/authoring-invariants.md`. Those load automatically when you touch
`src/schema`, `src/engine`, `src/cel`, the studio area, `examples/` or
`openspec/`. Read them before proposing any change to the JSON definition. The
short form, true in every session:
- The opaque `id` is the SOLE reference anchor. `key` is a slug that references
  nothing; `label` is display text.
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
This repo is spec-driven via OpenSpec (`openspec/`). Every non-trivial change —
new capability, definition contract or schema change, tooling or infra switch —
goes through an OpenSpec change, not a direct edit: propose -> generate
specs/tasks -> implement -> verify -> archive. Start one with the `openspec-*`
skills (`openspec-new-change`, or `openspec-propose` for a full proposal in
one step); `openspec-apply-change` implements tasks and
`openspec-archive-change` closes it. The project context OpenSpec shows the AI
when generating artifacts lives in `openspec/config.yaml` (`context:`) — keep
it current.

**`.claude/commands/opsx/` stays deleted.** The skills above are the set to
keep; the commands under that directory once mirrored eleven of them and
carried no instruction the skills lack. `openspec update` regenerates the
directory with no opt-out flag. If a run of it puts the eleven files back,
delete `.claude/commands/opsx/` again.

**A trivial fix touches one file, no spec and no test.** It skips the cycle.
Everything else is a change, whatever it looked like at first glance. Count the
files before you call something a one-liner. A self-declared "one-liner" here
touched four files and a spec.

**A UI change is never trivial.** A screen touches its area, the area's i18n
catalog, and often the shell or the tokens. It gets a change, and that change
writes its delta against the capability spec of the area it touches:
`end-user-app` for
`areas/app/`, `admin-app` for `areas/admin/`, `reporting-app` for
`areas/reporting/`, `unified-shell` for shell, login, routing and chrome,
`form-ui` for the renderer. Studio work goes to the specific capability —
`studio-canvas`, `studio-json-view`, `studio-form-editor`, `studio-publish` and
the rest — and `studio-app` keeps the frame, navigation and drafts list.
`spa-accessibility`, `ui-string-overrides` and `authored-content-localization`
cut across all of them. A screen that needs new data adds the API-side spec too,
`instance-query` or `admin-operations-api` for example.

**No phase inside the cycle is optional.** Do not propose skipping the spec or
the plan phase. That holds for `openspec-propose` and for the brainstorming
skill. Run the `openspec-review-change` skill before `openspec-apply-change`,
every time. Resolve
every finding it reports first. Apply starts at zero open findings. That review
keeps finding real errors: a missed second consumer of `GET /instances`, a
design resting on a false `InstanceView.assignment` premise, a migration
ordering derived from files nobody read.

## Verification (the gate before "done")
Call a change done only after all four checks pass. Report what each one
printed, not that you ran it.
- `bun run typecheck`, then `bun run build`, then the **full** `bun test` with
  `DATABASE_URL` set. Both rules under Conventions apply. A green without the
  variable is not evidence. A single-file rerun is not the signal.
- The antislop linter, on every Markdown file the change touched. Run the same
  check the push gate runs, over the same range: `sh scripts/gates/range.sh <
  /dev/null | sh scripts/gates/prose.sh`. The empty-range fallback to
  `origin/main..HEAD` lives in `scripts/gates/range.sh`, not in `prose.sh`
  itself — `prose.sh` reads its ranges on stdin, and an empty list checks
  nothing and exits 0.
- Trailing whitespace, blank-at-eof, and CRLF. Run the same check the push gate
  runs, over the same range: `sh scripts/gates/range.sh < /dev/null | sh
  scripts/gates/whitespace.sh`. The `< /dev/null` belongs on `range.sh`, which
  falls back to `origin/main..HEAD`. Handing `whitespace.sh` an empty stdin
  checks nothing; it now says so instead of exiting 0 in silence. Measured
  2026-09-01, while it still passed in silence: that form went green twice while
  the pre-push hook rejected the same tree for a blank line at EOF. Run the gate
  rather than reconstructing its two probes by hand: `git diff --check` alone
  misses CRLF here, since
  `.gitattributes` sets `* text=auto eol=lf` and git normalizes a CRLF
  worktree file on `git add`, and `grep -lI $'\r'` finds nothing in Git Bash,
  since MSYS grep opens a file in text mode and strips the CR before matching.
  The gate script already covers both traps with `git ls-files --eol`.
- A real browser, for any UI change. Green tests do not see an error dialog
  rendered behind a modal, a stale result row, or an `/admin/*` route
  collision. All three shipped past a green suite here. `docs/browser-checks.md`
  holds what stays manual; `development-toolchain`'s split rule decides
  whether a new check lands there or ships as a `bun:test` assertion instead.

## Enforced mechanically. Do not re-litigate these.

`.githooks/pre-push` runs the gates below on every push. Each one covers a defect
class this repository produced two or more times. Each names the rule it broke,
the files that broke it, and the command that repairs them.

Do not argue these down, weaken a pattern to make a push pass, or raise a
threshold to clear a red gate. Repair the file instead. Where a gate is wrong
about a specific line, silence it in place and say why, the way the antislop
directives already work.

| Rule | Script | Rejects |
|---|---|---|
| `ponytail-ledger-fresh` | `gates/ponytail-ledger.sh` | a `ponytail:` marker the ledgers do not list |
| `pushed-whitespace` | `gates/whitespace.sh` | a CR byte, a trailing space, a blank line at EOF, in the pushed range |
| `changed-markdown-prose` | `gates/prose.sh` | a rising antislop finding count in the Markdown the push changes |
| `no-machine-paths` | `gates/machine-paths.sh` | an absolute home-directory path in a tracked file |
| `frozen-lockfile` | `gates/lockfile.sh` | a manifest the committed `bun.lock` cannot satisfy |
| `no-silent-green` | `gates/silent-green.sh` | a suite run with no database, or one skipping past the floor |

The first four need only git and a shell, so they run on the host and report
even when the container is down. The last two run in the devcontainer.

Two properties are worth knowing before a push. `--no-verify` bypasses the hook,
and so disables every gate at once, never just the one in the way. The skip floor
in `scripts/gates/skip-floor.txt` is a ratchet: raise it only in the commit that
adds the skip, with a row naming what the increase covers.

### Prose debt: what the ratchet permits

`changed-markdown-prose` is a ratchet too. It compares a file's antislop finding
count at the pushed range's base against the count at its tip. It blocks only a
rise. A file already carrying findings passes, as long as the push adds none.

Measurement sets that rule. Measured on 2026-08-04, the live specs under
`openspec/specs/` held about 3166 findings across 52 of the 80 files that
existed then; the directory carries 89 today. `instance-migration` alone held
287, `timers` 220, `transition-execution` 167. A whole-file gate makes each of
those unpushable until somebody clears its debt in full.

That happened on 2026-08-04. A change synced one requirement into
`development-toolchain/spec.md` and paid a 28-finding prose rewrite. Every one
of those findings predated it.

Clearing a touched file's debt stays the norm where it is cheap. That norm is
advisory. The ratchet is the mechanical floor. The gate blocks a file getting
worse. It does not demand that a file get better.

An `allow-file` directive lowers the count, so the gate permits one. Prefer the
targeted form, `<!-- antislop: allow <rule> -->` next to the line it excuses,
with a sentence saying why. A blanket directive at the top of a file silences
rules nobody re-examines afterwards.

`bbf37d1` put a six-rule `allow-file` line at the top of this file. `CLAUDE.md`
reports 0 findings with it and 45 without. That is the pattern to avoid, not the
one to copy.

Four defect classes recur here and have no gate, on purpose. Stale UI state after
a mutation needs a browser, which is why the browser check above stays. Orphaned
exports after a refactor need real TypeScript reference analysis, since a grep
detector flags 76 of 786 exports. Stale roadmap status has no reliable mapping
from a change name to a stage line. Off-by-one bounds has one instance and no
general detector. `openspec/changes/archive/*gate-recurring-defects*/design.md`
carries the reasoning.

## Repository layout
```
.devcontainer/             Dockerfile + docker-compose.yml + devcontainer.json (Node 22 + Bun, Postgres 16)
package.json               Bun workspace root (workspaces: packages/*); engine package's exports map
                            (./schema, ./schema/canonical-json, ./schema/strip-compiled, ./cel/check,
                             ./schema/compile, ./engine/registry, ./engine/registry-check)
tsconfig.json              strict; NodeNext ESM; covers src + test
src/schema/definition.ts   Zod schemas = the definition contract; TS types via z.infer; invariants included
src/engine/                executor: instance store, outbox, transitions, timers, subprocess, drafts,
                            definitions, migration, admin queries
src/runtime/api.ts         Runtime API Layer: createProcessInstance / getInstanceView / submitAndTransition
                            / claimStep / releaseClaim / cancelInstance / listInstances / getInstanceRecord
src/http/                  REST/JSON wrapper over Bun.serve; one route file per surface (routes.ts,
                            admin-routes.ts, studio-routes.ts, reporting-routes.ts, account-routes.ts,
                            ui-strings-routes.ts) beside server.ts, static.ts, health.ts, metrics.ts, errors.ts
src/auth/                  ActorResolver seam (dev-header + JWT), local accounts, login, roles, CLI
src/handlers/              action handlers; http.request, notification.email and process.start ship
examples/                  serialized example definitions
test/                      bun:test suites; tests run inside the container
packages/web/              the ONE browser package (React + Vite). One build, one login, one session,
                            one address; the engine serves it from WEB_ROOT. Talks to the engine only
                            over the HTTP wrapper and the exports map.
  src/shell/                prefix routing, session, LoginScreen, ErrorBoundary, Chrome, tokens.css
  src/api/                  API_BASE, AppClientError, parseErrorBody, request, login, errorText
  src/i18n/                 locale selection and persistence; chrome/area catalogs stay per area
  src/areas/app/            participant: My-tasks / Task / Start-a-process (Login is the shell's)
  src/areas/admin/          operator: instances, merged record, outbox, timers, users, migrations,
                            data lists, UI strings
  src/areas/studio/         developer: drafts, canvas, inspector panels, the routed panels screen
                            (field catalog, data sources, contract, field matrix), form editor,
                            JSON surface, publish, versions+diff, migration-plan authoring,
                            Templates, Tools, Player
  src/areas/reporting/      process owner: cycle time, bottlenecks, SLA
packages/form-ui/          shared step-form renderer (source-only, no build step); consumed by both
                            the studio area's Player and the app area, so what an author previews is
                            what a participant gets. Stays its own package.
```

## Where the rest is documented
- `.claude/rules/process-contract.md` — the load-bearing definition contract
  rules, in full.
- `.claude/rules/authoring-invariants.md` — what the validation layer enforces.
- `.claude/rules/ui-glossary.md` — the one word for each part of the UI, and the
  domain term each rendering word maps to.
- `docs/current-state.md` — per-subsystem descriptive counterpart to this
  file. It names exported symbols by hand, in prose, so a rename elsewhere
  leaves a passage silently wrong. Before editing a passage that names a
  specific symbol, confirm it still exists: `search_graph` for the symbol,
  or `detect_changes` scoped to the file, rather than trusting the prose.
  This is a manual habit, not a gate — a grep-based staleness detector was
  tried here and rejected for a 76-of-786 false-positive rate (see the
  "Four defect classes" passage below), and the graph query above stays
  advisory for the same reason.
- `docs/decisions.md` — open questions, and what is decided but not yet built.
- `docs/authoring-guide.md` — teaches the definition contract to process authors.
- `ROADMAP.md` — stage-by-stage status (DONE / NOT STARTED). Open stages in
  full; one table row per finished stage.
- `docs/roadmap-history.md` — what each finished stage was, under the same
  number. Read it only for a stage the table sends you to.

For "what does X do" prefer the knowledge graph below over any of them — the
code is the source of truth, those files are the map.

## Codebase memory (knowledge graph)
Index the repo into codebase-memory-mcp with `index_repository` in `full` mode.
That covers the engine, the Runtime API Layer, the HTTP/auth layers and both
frontend packages. The indexer reads its exclusions from `.gitignore`, so it
skips `node_modules` and `packages/web/dist` without configuration.

The index is per-machine local state, not repository state. Nothing in the repo
carries it, and no setup step builds it. Check with `list_projects` before you
trust a graph query. Treat an absent project as "index it now", not as "the
graph says no". Resolve the `project` arg from that same `list_projects` call,
matching on root_path; the slug is machine-specific, never hardcode it.

Entry points: `search_graph` (find symbols), `get_code_snippet` (read a body),
`trace_path` (callers/callees, `mode=calls|data_flow|cross_service` — useful
across the engine↔runtime↔web boundary), `query_graph` (Cypher),
`get_architecture`, `search_code` (graph-augmented text search). Prefer the
graph over Read/grep for "who calls X" / "what does Y touch" questions that span
more than a file or two. The index goes stale as code changes: `detect_changes`
shows impact since a ref; re-run `index_repository` (full, not incremental)
after a substantial change lands.

## Conventions
- TypeScript strict, ESM.
- **UI work in `packages/web` or `packages/form-ui` goes through the design skills
  first.** Before implementing or reshaping any screen or component, invoke
  `/frontend-design:frontend-design` for visual direction; for UI/UX work
  also pull in the installed Vercel skills (`web-design-guidelines`,
  `vercel-react-best-practices`, `vercel-composition-patterns`) — do not
  default to plain React/CSS choices. Prefer semantic HTML5 elements
  (`<nav>`, `<main>`, `<button>`, `<dialog>`, ...) over generic
  `<div>`/`<span>` soup. `.claude/rules/design-language.md` carries Detent's
  own visual language (color roles, type, spacing, component states, class
  naming) — it loads automatically for `packages/web/**` and
  `packages/form-ui/**`; the full reference with swatches and specimens is
  `tmp/Detent Design Language.dc.html`.
- Bun is the runtime, package manager, and test runner. Use `bun`, not npm/pnpm:
  `bun install`, `bun test`. Typechecking stays with `tsc --noEmit` (`bun run
  typecheck`) — Bun does not typecheck. `BUN_VERSION` in
  `.devcontainer/Dockerfile` pins the version. All tooling (Bun, tsc, tests, dev
  server, lint, and Claude Code itself) runs inside the dev container, never on
  the host: host runs caused a Bun version drift past the Dockerfile pin, and a
  stray host-side Vite process answering `localhost:5173` beside the
  container's.
  - Running commands inside the devcontainer without the `devcontainer` CLI
    (docker compose invocation, Windows Git Bash path fix, exposing a dev
    server port): see the `devcontainer-exec` skill.
- **No `cd` prefix, no shell variable, and no whitespace-only argument, in any
  Bash command.** The Bash tool already starts in the repository root. On this
  Windows host the permission analyzer reads every operand as a possible path,
  and three habits of ours stop it before it reaches the auto-approval
  classifier.
  - `cd "C:/.../detent" && ... "$HOME/AI/AntiSlop/antislop.py" ... "$f"` loses
    the working directory. One `$VAR` anywhere in a `cd` chain makes the final
    directory unknowable, reported as `Contains simple_expansion`. The analyzer
    then cannot resolve the relative paths that follow, so it asks for manual
    approval. Drop the `cd`. Pass an absolute path for anything outside the
    repository, and a relative one for anything inside it.
  - `R=$(gh run list ... -q '.[0].databaseId'); gh run watch $R ...` carries no
    `cd` at all and draws the same `Contains simple_expansion` refusal. The
    reason code names the `$R` token. The sentence printed under it still reads
    "this cd-compound". That wording is fixed text attached to the reason code.
    It does not describe the command. Do not treat a missing `cd` as permission
    to use a variable. Never round-trip a value through a shell variable inside
    one Bash call. Run the command that produces the value. Read the value.
    Paste it literally into a second call. One CI run id is worth one extra
    call.
  - `tr '\n' ' '` passes a lone space as an argument. The analyzer resolves it
    against the working directory, gets a last path component that ends in a
    space, and denies it as a Cygwin-emulated symlink. `paste -sd' '` breaks
    the same way. Join lines with `xargs echo`, or leave them unjoined.
  None of these commands was unsafe, and no message named the operand at fault.
- PostgreSQL is the datastore. The engine reaches it via Bun's native `Bun.sql`
  (no client dependency); `DATABASE_URL` is the connection convention, set by the
  devcontainer compose.
- **Run `bun test` with `DATABASE_URL` set, always.** The DB-backed suites are
  `test.skipIf(!DB)` and make up most of the suite. Without the variable
  they skip *silently* and report a green that proves almost nothing. Check the
  skip count, not just the pass count. Outside the devcontainer, point it at a
  Postgres 16 with the compose credentials. Don't just remember to check by
  eye: `scripts/gates/silent-green.sh` already reads exactly this, from any
  captured test output, not only a pushed `bun run check` log. Pipe a run
  through it to get the same DATABASE_URL-unset and skip-floor checks the push
  gate runs, before pushing instead of at push time:
  `bun test 2>&1 | tee /tmp/t.log; sh scripts/gates/silent-green.sh /tmp/t.log`.
- **A full-suite run is the reliable signal; a single-file rerun is not.** The DB
  suites share one database and truncate in `beforeEach`, so back-to-back runs of
  one file contend and fail spuriously. Read a verdict off a *named* test
  failure, never off a pass count alone.
- **The suite has its own database. The dev server keeps `DATABASE_URL`'s.**
  `bunfig.toml`'s `[test] preload` (`test/preload-db.ts`) appends `_test` to the
  database name for every `bun test` run, creates it on demand, and prints the
  name it chose. The split closes two measured hazards: a `bun test` run wipes
  demo state mid-demo (its `beforeEach` truncates `definitions`, `instances`,
  `outbox`, `auth_users` and more), and a running `bun run serve` corrupts test
  runs (its outbox poller claims rows the suite is driving — 3 red runs of 20
  with a dev server up, 0 of 20 with none). Do not point a server or a seed at
  the `_test` database. Do not remove the preload to "simplify" the setup.
- **Never mutate, stash, or check out the shared working tree to test something.**
  Mutation testing (revert a line, confirm a named test fails) is the right
  technique and must happen on a copy: the tree usually holds uncommitted work,
  and a leftover mutation reads to the next reviewer as a real defect.
- **Never use `git stash`, not for mutation testing and not otherwise.** The
  agents share this tree. A stash nobody else expects hides work that was never
  committed. Commit to a branch instead.
- **A history rewrite states its branch list first.** Before `git filter-branch`
  or `git filter-repo`, print `git branch -a` and name the refs the rewrite will
  touch. Exclude every backup branch explicitly, or the rewrite takes the backup
  too and leaves no untouched copy.
- Comments state facts, not process history. Concise and technically precise.
- The definition contract is the foundation. Change the schema (definition.ts /
  the Zod source) deliberately, never as a casual side effect of another task.
  Deliberately means its own OpenSpec change with the rule delta written down.
  It does not mean never. See the stage note above.
- An OpenSpec change that changes a rule `docs/authoring-guide.md` states must
  change the guide in the same commit.
- Every invariant that lands ships with a test that rejects a violating input.
