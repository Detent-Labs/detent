# Design

## Context

See `proposal.md` for the motivation. The facts below come from the tree at the
proposal's commit, and they set the approach.

- `bun run serve` runs `src/http/server.ts`. The function `startHttpServer`
  reads `PORT`, default 3000. It logs `HTTP server listening` with the bound
  port (`server.ts:900-903`). `PORT=0` therefore works today, and the log line
  reports the port the OS chose.
- The engine serves `packages/web/dist` by default (`src/http/static.ts:143-153`).
  A missing directory answers every navigation with a JSON 404.
- `POST /auth/login` exists only when `AUTH_JWT_SECRET` holds at least
  32 bytes (`server.ts:378`, `:415-419`, `:490-492`). The devcontainer does not
  set it. Login is rate-limited to 50 attempts per 15 minutes per address
  (`src/auth/login.ts:25-36`).
- `scripts/seed.ts` needs `SEED_ALLOW` and `DATABASE_URL`, calls `initSchema`,
  and publishes nine example processes. It seeds ten users with one `system:*`
  role each. It seeds no draft and no instance.
- No seeded user can complete a task. Expense Approval's first step `capture`
  wants the role `employee` (`examples/expense-approval.json:100-137`). Its
  next step `review` wants `finance-approver`.
- A cancel needs `system:cancel-any`, or a per-process grant
  (`src/runtime/api.ts:1566-1596`). A publish needs an authoring role plus
  `system:publish` (`src/http/studio-routes.ts:272-292`).
- A publish of an unchanged body returns the existing version
  (`src/engine/definitions.ts:605-611`). The publish flow needs a draft whose
  body differs.
- The `bun test` preload derives `_test` (`test/preload-db.ts:21-28`). It runs
  its work at import time, so another module cannot import it.
- `bun test` collects `*.spec.ts` and `*.test.ts` files from the whole tree.
- The app container is `mcr.microsoft.com/devcontainers/typescript-node:22`
  (Debian, Node 22, Bun 1.3.11). It has no browser and no browser
  libraries.
- The UI picks its locale from `localStorage`, then `navigator.language`
  (`packages/web/src/i18n/locale.ts:20-30`).

## Goals / Non-Goals

**Goals:**

- One command, `bun run e2e`, runs the whole suite from a clean database, on a
  laptop and in CI alike.
- The four flows the owner chose, each asserting what the user sees.

**Non-Goals:**

- Cross-browser runs. Chromium only.
- Visual comparison with screenshots. A visual judgment stays manual, by the
  split rule.
- A query cache for the web areas. `docs/decisions.md` entry 51 stays deferred.
- A change to the engine, the Runtime API Layer or the definition contract.

## Decisions

### D1. One Bun script owns the run, and Playwright owns only the browser

`scripts/e2e.ts` runs these steps in order:

1. Read `DATABASE_URL`. Exit non-zero and name the variable when it is unset.
2. Refuse to start when `packages/web/dist/index.html` is missing. Name
   `bun run build`.
3. Derive the `_e2e` URL. Connect to the `postgres` maintenance database, then
   run `DROP DATABASE IF EXISTS … WITH (FORCE)` and `CREATE DATABASE`. The
   `FORCE` option ends the connections of an engine a crashed run left alive.
   A plain drop refuses while such a connection stays open.
4. Run `scripts/seed.ts` against the `_e2e` URL, with `SEED_ALLOW=1`.
5. Add the suite's account and the changed draft (D3).
6. Start `bun run src/http/server.ts` as a child. Pass `PORT=0`, the `_e2e`
   URL, and a random 48-byte `AUTH_JWT_SECRET`. Read the child's output until
   the `HTTP server listening` line, and parse the port from it. After 30
   seconds with no such line, exit non-zero and name the last output line.
7. Run `bunx playwright test`, forward any extra arguments, and pass
   `E2E_BASE_URL=http://127.0.0.1:<port>`.
8. In a `finally`, end the engine and wait for it to exit. Exit with
   Playwright's exit code.

The alternative was Playwright's own `webServer` option. It needs the port in
advance, which the ephemeral-port rule in `development-toolchain` forbids.
Playwright's `globalSetup` runs under Node, and it cannot use `Bun.sql` or
import the engine's TypeScript the way the seed does. The Bun script can do
both.

The script copies the six-line name derivation from `test/preload-db.ts`
instead of importing it. That preload runs its work at import time. The copy
appends `_e2e` to every name, a name ending in `_test` included. The seed must
never write to the `_test` database.

### D2. Spec files end in `.e2e.ts`

`bun test` would collect `*.spec.ts`, run the Playwright specs under Bun, and
fail. `playwright.config.ts` sets `testMatch: "**/*.e2e.ts"` under
`testDir: "e2e"`. The files are `e2e/areas.e2e.ts`, `e2e/task.e2e.ts`,
`e2e/cancel.e2e.ts` and `e2e/publish.e2e.ts`.

`playwright.config.ts` also sets:

- `workers: 1` and `fullyParallel: false`. The flows share one database, and
  they count rows (D4).
- `retries: 0`, per the spec.
- `use.baseURL` from `E2E_BASE_URL`. The config throws when the variable is
  unset, so a bare `playwright test` cannot run against a stale server.
- `use.locale: "en-US"` and `use.trace: "retain-on-failure"`.
- One `chromium` project, plus a `setup` project that logs in once and saves
  `storageState` to `e2e/.auth/state.json`. The rate limit counts successful
  logins, and one login per run stays far under it.

### D3. The suite adds one account and one draft

The seed stays unchanged. After the seed, `scripts/e2e.ts` adds:

- The account `e2e-operator@example.test`, with a random password passed to
  Playwright as `E2E_PASSWORD`. Its roles are `system:admin`,
  `system:cancel-any`, `system:developer`, `system:author`, `system:publish`,
  `system:reports`, `system:create` and `employee`. The script calls
  `createUser` in `src/auth/users.ts`, the function `add-user` calls.
- A draft of Laptop Inventory (`proc_laptop_inventory`) whose body differs
  from version 1 in its process label only (`E2E draft`). The script calls
  `saveDraft` in `src/engine/drafts.ts` directly, the way the seed calls
  `publishBody` directly. No other flow reads Laptop Inventory. A draft of
  Expense Approval would rename the process the **task** and **cancel** flows
  start, and Playwright runs `task.e2e.ts` after `publish.e2e.ts`.

A separate account per role was the alternative. It costs a login per account
and tests the role gates, which `bun test` already covers. One account keeps
the flows on what the smoke suite exists for.

### D4. Each flow counts rows before and after, and reads the screen

The flows share one database, so an absolute row count depends on flow order. A
flow therefore reads a count from the screen before its mutation, and asserts
the delta after it. Every flow listens for `pageerror`, and fails on any
uncaught page exception.

- **areas**: log in through `/login` with the labels "Email" and "Password" and
  the button "Log in". Then open `/app`, `/admin`, `/studio` and `/reporting`.
  Assert each area's own navigation, and assert that "Something went wrong." is
  absent. This flow is the `setup` project, and it writes the storage state.
<!-- antislop: allow em-dash -->
- **task**: on `/app/start`, press "Expense Approval — Start". The UI moves to
  `/app/tasks/<id>`. Press "Claim", fill Amount and Reason, and press "Submit".
  On My tasks, assert one Expense Approval row fewer than on a visit made
  right after the start.
- **cancel**: start an Expense Approval as in **task**, then open
  `/admin/instances/<id>`. Read the cancelled-row count on `/admin` first.
  Press "Cancel instance", then "← Instances". Assert that the count of rows
  whose accessible name ends in `(cancelled)` rose by one. The flow reaches the
  list through the UI link, never through `page.goto` or a reload. That is the
  stale-UI path.
- **publish**: open the `laptop_inventory` draft from `/studio` with "Open".
  Press the header's "Publish", then the "Publish" button inside the dialog
  labelled "Publish this draft". Assert that the dialog closes and the header
  shows `Published v2`. Open Versions and assert a `v2` row.
- **publish refusal**: in the same file, route `POST **/drafts/*/publish` to a
  422 answer with `page.route`. Assert that an `alert` inside the open dialog
  shows the refusal. Assert that no `alert` outside the dialog is visible. This
  flow runs first in the file, so the real publish still finds the draft.

### D5. The CI job runs in the devcontainer, beside `check`

`.github/workflows/check.yml` gains a job `e2e`, with no `needs:`. Its steps:

1. Checkout, start the devcontainer stack, and run `bun install`. These are the
   same three steps the `check` job runs.
2. `docker compose exec -T app bunx playwright install --with-deps chromium`.
   A `docker compose exec` runs as `root` in this container, so the system
   libraries install without `sudo`.
3. `bun run build`, then `bun run e2e`, both through `docker compose exec`.
4. On failure, `actions/upload-artifact` uploads `test-results/`.

Running Playwright on the runner host was the alternative. It needs Bun and
Postgres on the host a second time, and `CLAUDE.md` keeps all tooling in the
devcontainer. A Dockerfile layer with the browser was the other alternative.
It ties the browser build to the image. It also grows every contributor's
image by about 400 MB, for a suite most runs never start. The install step costs a
minute per CI run.

Locally, a contributor runs the same install command once per container,
then `bun run e2e`.

### D6. Where the covered checks go

The flows cover, in full or in part, these `docs/browser-checks.md` entries.
Each item quotes the entry's heading.

<!-- antislop: allow sentence-length synonym-rotation -->
- "The publish path, in both roles" (line 2381): the dialog opens, the confirm
  closes it, and the header shows the stamp. The focus trap, Escape and the
  backdrop stay manual.
- "The Versions screen: A as before, a waiting line, and a fetch failure"
  (line 1486): the step that publishes v2 and reads both rows.
- "The four areas: outbox badge, duration bar, and two stamp mechanisms"
  (line 2644): the "zero console errors on any of the four screens" step.
- "The blocked Discard control and the cancel-any bypass" (line 5079): the
  step that cancels and reads `cancelled` in the admin list.

The implementer reads each entry and removes only the steps a flow asserts. An
entry with no step left leaves the file. "Before you start" gains one line
that points at `bun run e2e`.

## Risks / Trade-offs

- [The flows depend on UI strings] → The config pins the locale to `en-US`. A rename
  in a catalog fails a flow by name, which is the signal a smoke suite should
  give.
- [A flaky flow blocks every pull request] → No retries, so flakiness shows at
  once. Each flow waits on a visible locator, never on a fixed delay.
- [The server's log line format changes] → The script names the last output
  line when it gives up after 30 seconds. The format lives in one place,
  `server.ts:903`.
- [The browser download fails in CI] → The job fails before `bun run e2e`,
  with Playwright's own message. `check` still reports on its own.
- [The seed changes Expense Approval] → The flows name its label and its
  fields. A seed change that breaks them fails the suite, and the fix lands in
  the same change.

## Migration Plan

No data migration. Remove the job from `check.yml` to roll back. The
devDependency can stay.

## Open Questions

None. The owner decided the flows, the tooling, the CI trigger and the split
rule on 2026-09-23.
