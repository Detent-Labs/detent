<!-- antislop: allow-file em-dash -->
## 1. Script scaffold

- [x] 1.1 Create `scripts/seed.ts` following `scripts/demo-expense-approval.ts`'s
      convention: plain `main()`, `initSchema()` first, relative
      `.js`-suffixed imports, no `import.meta.main` guard
- [x] 1.2 Create `registry`/`dataSourceReg` via `createDefaultRegistry()` and
      `createDefaultDataSourceRegistry()` (`src/engine/host.ts`), plus the
      dummy `notify.email`/`accounting.postInvoice` handlers
      `expense-approval.json` needs (mirror the demo script's
      `register()` calls)
- [x] 1.3 Read the three `examples/*.json` files with `readFileSync(new
      URL(...))`; extract `.definition` from `expense-approval.json`'s
      envelope, use the other two bodies as-is

## 2. Idempotent process publishing

- [x] 2.1 Write a `resolveProcessId(key, db)` helper for the two
      script-minted processes: call `listProcesses(db)`, return the
      matching process's `processId` on a `key` match, else mint a fresh
      `proc_${crypto.randomUUID()}`. This helper is NOT used for
      `credit_check` (see 2.2)
- [x] 2.2 Publish `credit_check` first, directly under the literal fixed
      `processId` `proc_credit_check` (`subprocess-loan-parent.json` pins
      this exact string). Skip `resolveProcessId` for this one call;
      `publishBody`'s own hash dedup on that fixed id is enough
- [x] 2.3 Publish `loan_application`, then `expense_approval`, each via
      `resolveProcessId` (2.1) plus `publishBody`
- [x] 2.4 Verify by hand: run the script twice against a freshly truncated
      database; confirm the second run's `publishBody` calls return the
      first run's existing versions (no new version rows)

## 3. Idempotent user provisioning

- [x] 3.1 Define the four demo accounts: one per reserved role
      (`system:publish`, `system:cancel-any`, `system:admin`,
      `system:developer`), email convention
      `demo-<role-suffix>@example.test`, a fixed local-dev-only password
- [x] 3.2 For each demo account, call `listUsers(db)` first. A matching
      email calls `setRoles`/`setPassword`; no match calls `createUser`.
      This avoids the `auth_users.email` unique-constraint violation a
      bare second `createUser` call would throw
- [x] 3.3 Verify by hand: run the script twice; confirm `auth_users`
      still holds exactly four demo rows after the second run

## 4. Wiring and output

- [x] 4.1 Add `"seed": "bun run scripts/seed.ts"` to the root
      `package.json`, alongside `"serve"`
- [x] 4.2 Print a short summary on completion: which processes published
      (or already existed) and which demo accounts exist, plus the
      local-dev-only warning design.md's Risks section calls for
- [x] 4.3 Add a header comment to `scripts/seed.ts` naming the three
      reserved `key`s (`expense_approval`, `loan_application`,
      `credit_check`) as seed data, per design.md's collision mitigation

## 5. Verification

- [x] 5.1 Run `bun run typecheck` and confirm it passes
- [x] 5.2 Run the full `bun test` suite with `DATABASE_URL` set and
      confirm it passes; check the skip count, not only the pass count
