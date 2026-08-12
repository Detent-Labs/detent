## 1. The control plane

- [x] 1.1 Add `src/tenancy/store.ts` with the control-plane schema: `tenants`
  holding `id`, `key` (unique), `name`, `database_url`.
- [x] 1.2 Add `TENANT_CONTROL_PLANE_URL` reading, per call rather than at
  module load, the convention `readSmtpEnv` follows.
- [x] 1.3 Add `listTenants` and `tenantByKey` over that table.
- [x] 1.4 Add `src/tenancy/connections.ts`: a key-to-handle map opening a pool
  lazily per tenant.
- [x] 1.5 Test the map: a key reaches its own database and no other.

## 2. Provisioning

- [x] 2.1 Add `src/tenancy/cli.ts`, mirroring `src/auth/cli.ts`'s shape.
- [x] 2.2 Provision in order: create the database, run `initSchema`, insert the
  control-plane row last.
- [x] 2.3 Test that a fault before the row lands leaves nothing resolvable.
- [x] 2.4 Confirm `initSchema` never creates `tenants` in a tenant database.

## 3. Thread the database through the route table

- [ ] 3.1 Add a fourth `db` parameter to `Route.handler` in
  `src/http/server.ts`, documented beside the `clientAddress` note.
- [ ] 3.1a Confirm `createServer`'s own signature does not change, so the
  fifteen test files calling it stay untouched.
- [ ] 3.2 Change every handler closure to declare `db` rather than capture it.
- [ ] 3.3 Supply the resolved handle at the dispatch site.
- [ ] 3.4 Confirm the suite stays green with SaaS mode off after this task.

## 4. Unbind the plugins

- [ ] 4.1 Add `db` to `HandlerContext` and pass it from `deliver`.
- [ ] 4.2 Add `db` to `AssignmentContext` and pass it from
  `resolveStepAssignment`.
- [ ] 4.3 Change `notification.email` to read `ctx.db`, and drop the factory's
  `db` parameter.
- [ ] 4.4 Change `org.manager-of-starter` to read `ctx.db`, and drop its
  factory's `db` parameter.
- [ ] 4.4a Add `db` to `DataSourceContext` and pass it from the resolution
  call site.
- [ ] 4.4b Change the `db.list` data source to read `ctx.db`. It reads the
  `data_lists` tables, so a bound handle leaks one tenant's options.
- [ ] 4.5 Drop the `db` parameter from `createDefaultRegistry`,
  `createDefaultAssignmentRegistry` and `createDefaultDataSourceRegistry`.
- [ ] 4.5a Change every call site of those three. They are
  `src/http/server.ts`, `scripts/seed.ts`, `scripts/demo-expense-approval.ts`
  and the tests that create a registry.
- [ ] 4.6 Change every context construction site the required handle breaks:
  `src/engine/subprocess.ts`, `test/handlers-http.test.ts`,
  `test/handlers-notification-email.test.ts` and the assignment suites.
- [ ] 4.7 Change `registry.ts`'s comment and
  `.claude/rules/process-contract.md`'s assignment-context line. Both state
  that no connection handle travels there.
- [ ] 4.8 Test that one registry serves two tenants, each reading its own
  accounts and its own lists.

## 5. Tenant resolution

- [ ] 5.1 Mint a `tenant` claim in `src/auth/login.ts`, naming the tenant whose
  database authenticated the account.
- [ ] 5.2 Read the claim in `src/auth/jwt.ts`, leaving `LOCAL_ISSUER` alone.
- [ ] 5.3 Resolve the login's own tenant from the request host.
- [ ] 5.4 Keep an unknown host indistinguishable from a wrong password, in both
  answer and cost.
- [ ] 5.5 Change `isActiveAccount` to take `db` per call.
- [ ] 5.6 Answer 401 for an unknown tenant key, and 503 for a listed tenant
  whose database refuses.

## 6. The worker seam

- [ ] 6.1 Add a `TenantSource` type and take it in `startEngine`.
- [ ] 6.2 Default it to one entry holding the process database.
- [ ] 6.3 Walk the list per poll tick in all four workers.
- [ ] 6.4 Skip an unreachable tenant with one warning, and continue the tick.
- [ ] 6.5 Move `createDefinitionStore` inside the per-tenant step.
- [ ] 6.6 Test that one tick serves three tenants, and that one refusing
  tenant does not stop the other two.

## 7. The SaaS bootstrap

- [ ] 7.1 Wire the control-plane tenant source when a deployment sets the variable.
- [ ] 7.2 Read the variable once at bootstrap and fail startup with a message
  naming the control plane when it is unreachable. Task 1.2's per-call read
  stays, for the tenant lookups.
- [ ] 7.3 Test the isolation case end to end: two tenants each holding an
  instance, and neither listing the other's.

## 8. Documentation

- [ ] 8.1 Add the SaaS-mode section to `docs/runbooks/deployment.md`, naming
  the variable and the provisioning command.
- [ ] 8.1a Add `TENANT_CONTROL_PLANE_URL` to that runbook's variable list, and
  to no other file. `deployment-runbook` requires the runbook list every
  variable. It also requires the runbook be its one home.
- [ ] 8.2 Add the `tenant` claim to `docs/openapi.yaml`'s security description.
- [ ] 8.3 Change stage 24 in `ROADMAP.md` to DONE, naming this change, its
  specs and the replacement design doc.
- [ ] 8.4 Add the tenancy modules to `docs/current-state.md`.
- [ ] 8.5 Add the two-tenant walk to `docs/browser-checks.md`.

## 9. Verification

- [ ] 9.1 Run `bun run typecheck`, then `bun run build`.
- [ ] 9.2 Run the full `bun test` with `DATABASE_URL` set and the control-plane
  variable UNSET. Report pass, skip and fail counts.
- [ ] 9.3 Run the antislop linter over every Markdown file this change touches.
- [ ] 9.4 Run `git diff --check` and `git ls-files --eol`.
- [ ] 9.5 Browser check: log in against two tenants and confirm neither sees
  the other's cases.
