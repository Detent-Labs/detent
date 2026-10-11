# Coordinator: cross-check (HEAD 5f41cd8a)

## Checks (devcontainer `workflow-engine-app-1`, bun 1.3.11)

- The `typecheck` run exits 0: `form-ui typecheck: Exited with code 0` /
  `web typecheck: Exited with code 0`
- The `lint` run exits 0: `Found 0 warnings and 0 errors.` (584 files, 96
  rules)
- The `build` run exits 0: `✓ built in 45.80s`. Warning:
  `dist/assets/root-vhG1_LB5.js 524.01 kB (gzip 148.70 kB) > 500 kB`
- The `test-gated` run exits 0:
  `4999 pass / 1 skip / 0 fail / Ran 5000 tests across 259 files. [82.09s]`,
  DB `workflow_engine_test`. Skip:
  `reporting-reportingLogic.test.ts:84 skipIf(!ZURICH)`. Floor 1.
- The `test:tz` run exits 0:
  `20 pass / 0 fail / Ran 20 tests across 1 file.`
- The `bun audit` run exits 0: `No vulnerabilities found`
- Headless: a `git grep` finds no UI imports in `src/`. It finds no deep
  imports from `packages/` past the exports map.

## Verdicts

- E1-1 confirmed and reproduced
  (`checkDraftShape({collaboration}) -> unrecognized`). Severity: medium
  (visible error, no data loss, workaround). Agent: high.
- E1-2 confirmed (`root.tsx:153-154`, `:169` call `go` unguarded;
  `ProcessHeaderBar.tsx:1005`; `guardedNavigate` in `root.tsx:85-88`; no
  `beforeunload`). Severity: high. The `studio-app` spec SHALL is broken, and
  unsaved work gets lost.
- E1-3 confirmed: `saveDraft` catches only `draft-conflict`, and
  `useFail -> logout -> clearSession/go(LOGIN)` follows. Severity: medium (it
  needs an expired 8h token).
- C-1 confirmed: the fast path at `instances.ts:441-471` reads through
  `loadInstanceForRead` without a visibility check. At `:399-405`, a starter
  on a non-running instance yields `true`. Further anchors:
  `transition.ts:693-700` (`return instance`), `routes.ts:559-565`
  (`body: updated`). In `authorize.ts`, `PERMISSION_ROLE` maps read to
  `ADMIN_ROLE` and cancel to `CANCEL_ANY_ROLE`. Severity: high.
- A-1 reproduced: a `process.start` `inputMapping` with `timestamp()` plus 3
  nested `all()` yields `A-1 structure issues: 0` and
  `A-1 cel issues: 0 []`. Severity medium.
- A-3 reproduced: `checkAgainstFields('data.s.matches("(")') -> {"ok":true}`;
  `evalGuard -> false`. ReDoS `^(a+)+$`: `n=20` 4 ms, `n=24` 74 ms, `n=26`
  287 ms (exponential). Severity medium.
- A-4 reproduced: `checkAgainstFields("data.s") -> {"ok":true}`;
  `evalGuard -> false`. Severity medium.
- D-1 reproduced: a `SELECT` with an e-mail value that holds an invalid byte
  raises a `PostgresError`. The message reads
  `invalid byte sequence for encoding "UTF8"`, and the login handler lets it
  escape the error mapper. The container leaves `NODE_ENV` undefined, since
  `engine.Dockerfile` sets none. With no `error` handler, `Bun.serve` answers
  500 `text/html` at 67 KB, with the message embedded as base64 (found after
  decoding). With `development:false` it answers 500 `text/plain` at 21
  bytes, with no leak. Severity medium.
- B-1 confirmed. In `transition.ts:827-848`, `resolveAutomatic` makes no
  exception for a subprocess step. In `selectAutomaticPath` (`:764-770`), a
  guardless path yields `true`. The file `definition.ts:947-950` requires only
  "all-automatic". The spec `subprocess-execution:174-176` says
  "MUST ... guard on child.outcome", and nothing enforces it. Severity high.
- B-2 confirmed. The return in `subprocess.ts:208-210` checks only
  `currentStepId === child.parent.stepId`. Only `sweepCancelledChildren`
  (`transition.ts:612-630`) cancels children, on a cancel. The spawn checks
  only the status (`:82-83`). Severity high.
- B-3 confirmed. The files `process-start.ts:28,48` and
  `instance-transition.ts:26,129` import `createDefaultAssignmentRegistry`
  from `registry.ts:193`, which knows only static. In `registry.ts:265-266`,
  an unknown type leads to `no-candidates`. The function in
  `assignment-strategies.ts:127` would have all four. Severity high.
- H-4: the guide promises that a group change reaches waiting steps. The code
  freezes `candidates` at entry. I adopted the agent's evidence. Severity
  medium.
- F-1 confirmed. In `useRefresh.ts:12-15`, `focus` triggers `refresh`. In
  `DataListScreen.tsx:218-244`, `load` sets label, description, columns and
  rows. The screen `UiStringsScreen.tsx:118-133` calls `setDrafts({})`. Severity
  high: an operator loses unsaved input on every window switch.
- G-1 backed: `gh pr view 19` lists the files
  `["packages/web/package.json"]`. Its checks read `host-gates SUCCESS` and
  `check SUCCESS`. No PR 63 exists under that number. Severity medium.
- G-2 reproduced: `deadbeef..HEAD | whitespace.sh -> "nothing to check" rc=0`;
  `prose.sh -> "nothing to check" rc=0`; `git diff --check rc=128`. Severity
  medium.
- G-4 reproduced: `it-offboarding.json` and `it-onboarding.json` report
  `hash: STALE`, and the other 5 wrappers pass. The script `seed.ts:119` uses
  the computed hash instead of the wrapper's hash. Severity low (agent:
  medium).
- G-9 repro: all 9 examples round-trip `true`. So it is a coverage gap only.
  Severity low.
- E2-1 confirmed. In `PathsPanel.tsx:288`, `updatePath` sets only the
  trigger. At `:306` the guard editor appears only for an automatic path. The
  file `fields.ts:292-296` filters manual paths by guard, and
  `transition.ts:543` raises `GuardRefused`. Severity medium: the Paths tab
  and the JSON both contain the guard, and the body stays valid. Agent: high.
- E2-2 confirmed and reproduced. The form sets `value: e.target.value`
  (`InstanceQueryForm.tsx:253`). The query in `queries.ts:319-326` matches
  jsonb by exact type. SQL: `{"field_n":5} @> "5" -> false`,
  `@> 5 -> true`. Severity high.
- E2-10 reproduced: `fromCel("data.prioritaet > 3", int) -> "raw"`;
  `fromCel("data.amount > -5.0") -> "raw"`;
  `"data.amount > 5.0" -> "cmp"`;
  `celLiteral(1e21,"double") -> "1e+21.0"`. Severity medium.
