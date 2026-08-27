/**
 * `group-scope-validation`: the database-backed publish-time check that every
 * `allowedGroups` entry names a group in the store whose scope permits the
 * publishing process (`src/engine/definitions.ts::validateGroupScope`).
 * DB-backed, skips when DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
import { createGroup, setGroupScope } from "../src/auth/groups.js";
import { publishBody, GroupScopeValidationError } from "../src/engine/definitions.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import type { ProcessBody, ProcessId } from "../src/schema/definition.js";
import { clearInstanceAudit } from "./audit-cleanup.js";

const DB = !!process.env.DATABASE_URL;
const reg = createRegistry();
const dataSourceReg = createDataSourceRegistry();

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, definitions, groups`;
  if (DB) await clearInstanceAudit();
});

const bodyWithGroups = (allowedGroups: string[]): ProcessBody =>
  ({
    key: "wf",
    label: { en: "Wf" },
    baseLocale: "en",
    fields: [],
    allowedGroups,
    workflow: {
      initialStep: "step_done",
      steps: [{ id: "step_done", key: "done", label: { en: "Done" }, type: "task", terminal: true }],
    },
  }) as unknown as ProcessBody;

test.skipIf(!DB)("a globally scoped allowedGroups entry publishes for any process", async () => {
  const group = await createGroup("Finance", { type: "global" });
  const v = await publishBody("proc_gsv_global" as ProcessId, bodyWithGroups([group.groupId]), reg, dataSourceReg);
  expect(v.status).toBe("published");
});

test.skipIf(!DB)("a processes-scoped allowedGroups entry publishes for a listed process, and fails for an unlisted one", async () => {
  const pidListed = "proc_gsv_expense" as ProcessId;
  const pidUnlisted = "proc_gsv_travel" as ProcessId;
  const group = await createGroup("Finance2", { type: "processes", processIds: [pidListed] });

  const v = await publishBody(pidListed, bodyWithGroups([group.groupId]), reg, dataSourceReg);
  expect(v.status).toBe("published");

  let caught: unknown;
  try {
    await publishBody(pidUnlisted, bodyWithGroups([group.groupId]), reg, dataSourceReg);
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(GroupScopeValidationError);
  expect((caught as GroupScopeValidationError).issues.some((i) => i.groupId === group.groupId && i.reason === "scope-mismatch")).toBe(true);
});

test.skipIf(!DB)("an allowedGroups entry naming no group fails the publish, naming that group id", async () => {
  let caught: unknown;
  try {
    await publishBody("proc_gsv_ghost" as ProcessId, bodyWithGroups(["group_ghost"]), reg, dataSourceReg);
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(GroupScopeValidationError);
  expect((caught as GroupScopeValidationError).issues).toEqual([{ groupId: "group_ghost", reason: "not-found" }]);
});

test.skipIf(!DB)("an identical re-publish stays a no-op despite a scope change since the first publish", async () => {
  const pid = "proc_gsv_noop" as ProcessId;
  const group = await createGroup("Finance3", { type: "global" });
  const body = bodyWithGroups([group.groupId]);

  const first = await publishBody(pid, body, reg, dataSourceReg);
  await setGroupScope(group.groupId, { type: "processes", processIds: ["proc_someone_else"] });

  const second = await publishBody(pid, body, reg, dataSourceReg);
  expect(second.version).toBe(first.version);
  expect(second.definitionHash).toBe(first.definitionHash);
});
