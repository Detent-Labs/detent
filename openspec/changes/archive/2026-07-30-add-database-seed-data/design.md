<!-- antislop: allow-file em-dash -->
## Context

A fresh devcontainer database has no process, no user, and no instance.
`CLAUDE.md` documents today's workaround. A developer recreates demo state
by hand. `bun test`'s `beforeEach` truncates the tables it shares with the
running dev server. That truncation forces the manual step.

`scripts/demo-expense-approval.ts` already shows one pattern for a
standalone script. A plain `main()`. `initSchema()` runs first. Imports
stay relative and `.js`-suffixed. No bundler runs at all. This design
reuses that pattern for a permanent, idempotent `scripts/seed.ts`.

Three example bodies exist under `examples/`. Two shapes differ.
`expense-approval.json` is a full `ProcessVersion` envelope; the definition
sits under `.definition`. `subprocess-loan-parent.json` and
`subprocess-credit-check-child.json` are raw `ProcessBody` values. The
parent hardcodes `subprocess.processId: "proc_credit_check"`. It also pins
`version: 1`. The child must publish under that exact `processId`, and
before the parent, for cross-process validation to resolve.

## Goals / Non-Goals

**Goals:**
- One idempotent `bun run seed` entry point.
- Publish all three example bodies, in the order the parent's pinned
  subprocess reference needs.
- Provision one demo user per reserved role: `system:publish`,
  `system:cancel-any`, `system:admin`, `system:developer`.
- Safe to run against an empty database and against an already-seeded one,
  with no duplicate rows either way.

**Non-Goals:**
- No sample instances. An empty inbox is a fine starting point. A running
  instance would pin a `transitionSeq` a developer might not expect.
- No automatic invocation from `postCreateCommand` or any other hook. A
  developer runs `bun run seed` by choice, the same way they run
  `bun run serve`.
- No new schema, no new HTTP route, no new CLI subcommand. Everything the
  script needs already exists in `src/auth/users.ts` and
  `src/engine/definitions.ts`.

## Decisions

**Reuse `createDefaultRegistry()`/`createDefaultDataSourceRegistry()`,
not a hand-rolled registry.** `scripts/demo-expense-approval.ts` registers
dummy `notify.email`/`accounting.postInvoice` handlers. It needs them
because `expense-approval.json` references action types the default
registry does not carry. The seed script needs the same two dummy handlers
for that one body. The subprocess pair references no custom action type.
It publishes clean against the default registry.

Alternative considered: one shared dummy-registry helper for both
scripts. Rejected for now. The duplication is four lines, not worth a new
shared module for two call sites.

**Idempotency keys off `key`, not `processId`, except for the one process
a literal `processId` already pins.** `publishBody` scopes its hash dedup
to a fixed `processId`. An unchanged body under the same `processId` is a
no-op. A fresh `processId` on every run instead inserts a new row with
identical content. `loan_application` and `expense_approval` mint their
own `processId`. The script calls `listProcesses(db)` first for each. It
matches an existing process by `definition.key` and reuses that
`processId` if found. Only a `key` absent from the database mints a new
`processId`.

`credit_check` skips this lookup entirely. `subprocess-loan-parent.json`
hardcodes `subprocess.processId: "proc_credit_check"` as a literal
string, so the script always publishes `credit_check` under that exact
`processId`. It never derives or reuses one by `key`. Idempotency here
falls out of `publishBody`'s own hash dedup on that fixed id, with no
lookup step needed.

Alternative considered: a dedicated `seed_runs` marker table. Rejected.
`listProcesses` already exposes the same answer. A marker table would
also drift from the data on a manual delete.

**User provisioning looks up by email first.** `createUser` has no
unique-email guard at the function layer. `auth_users.email` does carry
a database-level `UNIQUE NOT NULL` constraint
(`src/engine/store.ts::initSchema`). Calling `createUser` twice with the
same email therefore throws a constraint violation. It does not insert a
duplicate row.

The seed script checks `listUsers(db)` first, to avoid that error on a
second run. A matching email calls `setRoles`/`setPassword` instead of
`createUser`. Demo emails follow one fixed convention:
`demo-<role-suffix>@example.test` (e.g. `demo-admin@example.test`). A
re-run recognizes its own prior output by that email.

**Child publishes before parent, in a fixed literal order.** The script
does not infer publish order from the bodies' cross-references. It
publishes `credit_check` first, by name, then `loan_application`, then
`expense_approval`. A topological sort over subprocess references would
be more general. Three fixed bodies do not justify that sort step. A
fourth example that needs one is a signal to revisit this, not a reason
to build it now.

## Risks / Trade-offs

- [The example bodies drift out of sync with `definition.ts`] →
  Mitigation: the script surfaces the thrown error and exits non-zero. A
  broken example already fails `scripts/demo-expense-approval.ts` today.
  This is an existing error mode, not a new one.
- [An unrelated process already shares a demo `key` or the literal
  `proc_credit_check` id] → Mitigation: both matches are exact-string.
  A collision would silently reuse and
  overwrite an unrelated process's version history. The script's own
  header comment names the fixed `key`s (`expense_approval`,
  `loan_application`, `credit_check`) and the fixed `processId`
  (`proc_credit_check`) as reserved for seed data.
- [Demo account passwords stay fixed and known] → Mitigation: this
  mirrors the existing `CLAUDE.md`-documented manual demo-account
  convention. The script's own output states plainly that these accounts
  serve local development only, never a shared or production database.

## Migration Plan

No data migration. Deployment is additive: one new file
(`scripts/seed.ts`), one new `package.json` script entry (`"seed"`). A
contributor opts in by running `bun run seed`. No rollback step exists.
Nothing existing changes, so deleting the two additions removes the
feature entirely.

## Open Questions

- Resolved: the seed script does NOT check `NODE_ENV` or any other
  environment signal before running. No code in this repo reads
  `NODE_ENV` today. No production deployment path exists yet either
  (`ROADMAP.md` #14, deployment and operations readiness, is NOT
  STARTED). A guard against a variable nobody sets would be speculative.

- The Non-Goals section's existing mitigation is enough: the script
  never runs on its own. It runs only when a developer chooses to run
  `bun run seed`. Its own console output also states plainly that the
  demo accounts are for local development only. Revisit this once a real
  production deployment path exists and sets some concrete signal to
  gate on.
