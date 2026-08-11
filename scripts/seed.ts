/**
 * Roadmap #19: idempotent seed script. Publishes the repo's example process
 * definitions and provisions one demo user per reserved role, so a fresh
 * devcontainer database has something to look at instead of nothing.
 *
 * Reserved for seed data — do not reuse for an unrelated process: the keys
 * `expense_approval`, `loan_application`, `credit_check`, and the literal
 * processId `proc_credit_check` (pinned by `examples/subprocess-loan-parent.json`'s
 * subprocess reference, so `credit_check` always publishes under that exact id,
 * never a script-minted one).
 *
 * Demo account passwords are fixed and known. This is for local development
 * only — never point this script at a shared or production database.
 *
 * Run inside the devcontainer (DATABASE_URL must be set), with the explicit
 * opt-in that confirms the target is a local database:
 *   SEED_ALLOW=1 bun run seed
 */
import { readFileSync } from "node:fs";
import { sql, initSchema } from "../src/engine/store.js";
import { publishBody, listProcesses, listVersions } from "../src/engine/definitions.js";
import { createDefaultRegistry, createDefaultDataSourceRegistry } from "../src/engine/host.js";
import { createUser, listUsers, setRoles, setPassword } from "../src/auth/users.js";
import {
  PUBLISH_ROLE,
  CANCEL_ANY_ROLE,
  ADMIN_ROLE,
  DEVELOPER_ROLE,
  REPORTS_ROLE,
  DATALISTS_ROLE,
  TEMPLATES_ROLE,
  AUTHOR_ROLE,
} from "../src/auth/authorize.js";
import type { ProcessId, ProcessBody } from "../src/schema/definition.js";

const DEMO_PASSWORD = "seed-demo-password";

// One per reserved role in src/auth/authorize.ts. A change that adds a
// reserved role adds its demo user here in the same change, so every
// role-gated surface is reachable from a seeded database without
// provisioning an account by hand.
export const DEMO_USERS: { role: string; emailSuffix: string }[] = [
  { role: PUBLISH_ROLE, emailSuffix: "publish" },
  { role: CANCEL_ANY_ROLE, emailSuffix: "cancel-any" },
  { role: ADMIN_ROLE, emailSuffix: "admin" },
  { role: DEVELOPER_ROLE, emailSuffix: "developer" },
  { role: REPORTS_ROLE, emailSuffix: "reports" },
  { role: DATALISTS_ROLE, emailSuffix: "datalists" },
  { role: TEMPLATES_ROLE, emailSuffix: "templates" },
  { role: AUTHOR_ROLE, emailSuffix: "author" },
];

const EXAMPLES: { path: string; fixedProcessId?: ProcessId }[] = [
  // credit_check first: the parent's subprocess reference pins this literal id.
  { path: "../examples/subprocess-credit-check-child.json", fixedProcessId: "proc_credit_check" as ProcessId },
  { path: "../examples/subprocess-loan-parent.json" },
  { path: "../examples/expense-approval.json" },
];

function readExampleBody(path: string): ProcessBody {
  const raw = JSON.parse(readFileSync(new URL(path, import.meta.url), "utf-8"));
  return (raw.definition ?? raw) as ProcessBody;
}

async function resolveProcessId(key: string): Promise<ProcessId> {
  const existing = await listProcesses(sql);
  const match = existing.find((p) => p.key === key);
  return match ? match.processId : (`proc_${crypto.randomUUID()}` as ProcessId);
}

async function seedProcess(
  registry: ReturnType<typeof createDefaultRegistry>,
  dataSourceReg: ReturnType<typeof createDefaultDataSourceRegistry>,
  example: { path: string; fixedProcessId?: ProcessId },
): Promise<void> {
  const body = readExampleBody(example.path);
  const processId = example.fixedProcessId ?? (await resolveProcessId(body.key));
  const versionsBefore = await listVersions(processId, sql);
  const published = await publishBody(processId, body, registry, dataSourceReg, sql);
  const isNew = versionsBefore.length === 0 || !versionsBefore.some((v) => v.definitionHash === published.definitionHash);
  console.log(`- ${body.key} (${processId}): ${isNew ? "published" : "already up to date"} at v${published.version}`);
}

async function seedUser(demo: { role: string; emailSuffix: string }): Promise<void> {
  const email = `demo-${demo.emailSuffix}@example.test`;
  const { items: users } = await listUsers({}, sql);
  const existing = users.find((u) => u.email === email);
  if (existing) {
    await setRoles(email, [demo.role], sql);
    await setPassword(email, DEMO_PASSWORD, sql);
    console.log(`- ${email}: updated (role ${demo.role})`);
  } else {
    await createUser(email, DEMO_PASSWORD, [demo.role], undefined, sql);
    console.log(`- ${email}: created (role ${demo.role})`);
  }
}

async function main() {
  // Roadmap #19 accepted "the script never runs on its own" as the mitigation
  // because no production deployment path existed. Stage 14 shipped one, so
  // this opt-in replaces it: fixed-password accounts, one of them
  // `system:admin`, are otherwise a mistyped terminal away from a real
  // database. Not NODE_ENV — nothing else in the repo reads it.
  if (!process.env.SEED_ALLOW) {
    throw new Error(
      "Refusing to seed: set SEED_ALLOW=1 to confirm this database is a local development one. " +
        "This script creates demo accounts with a fixed, published password.",
    );
  }
  await initSchema();

  const registry = createDefaultRegistry();
  const dataSourceReg = createDefaultDataSourceRegistry();

  console.log("Processes:");
  for (const example of EXAMPLES) {
    await seedProcess(registry, dataSourceReg, example);
  }

  console.log("\nDemo users (local development only, fixed password):");
  for (const demo of DEMO_USERS) {
    await seedUser(demo);
  }

  console.log("\nDone.");
}

// Guarded so importing this module (test/seed-demo-users.test.ts reads
// DEMO_USERS) does not run the seed as a side effect. Same idiom as
// src/auth/cli.ts and src/http/server.ts.
if (import.meta.main) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
