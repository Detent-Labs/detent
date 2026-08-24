/**
 * `org.group-members` (`src/engine/assignment-strategies.ts`): live group
 * resolution at step entry, a disabled-member exclusion, a missing-group
 * empty resolution, and the config-schema publish-time rejection.
 * DB-backed, skips when DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
import { createUser, setDisabled } from "../src/auth/users.js";
import { createGroup, setGroupMembers } from "../src/auth/groups.js";
import {
  createDefaultAssignmentRegistry,
  groupMembersConfigSchema,
  GROUP_MEMBERS_STRATEGY_TYPE,
} from "../src/engine/assignment-strategies.js";
import { resolveStepAssignment } from "../src/engine/registry.js";
import { publishBody, AssignmentRegistryValidationError } from "../src/engine/definitions.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { compileProcessBody } from "../src/schema/compile.js";
import type { Step, ProcessBody, ProcessId } from "../src/schema/definition.js";

const DB = !!process.env.DATABASE_URL;

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE auth_users, groups, definitions`;
});

const stepWith = (groupId: string): Step =>
  ({
    id: "step_approve",
    key: "approve",
    label: { en: "Approve" },
    type: "task",
    assignment: { strategy: { type: GROUP_MEMBERS_STRATEGY_TYPE, config: { groupId } } },
  }) as unknown as Step;

const ctx = () => ({ id: "inst_1", startedBy: undefined, data: {} });

test.skipIf(!DB)("the strategy resolves the group's current members, both active", async () => {
  const a = await createUser("ga@example.com", "pw", []);
  const b = await createUser("gb@example.com", "pw", []);
  const group = await createGroup("Finance", { type: "global" });
  await setGroupMembers(group.groupId, [a.userId, b.userId]);

  const got = await resolveStepAssignment(stepWith(group.groupId), createDefaultAssignmentRegistry(), ctx(), sql);
  expect(got.assignment!.candidates.sort()).toEqual([a.userId, b.userId].sort());
  expect(got.unresolved).toBeUndefined();
});

test.skipIf(!DB)("the resolved list excludes a disabled member", async () => {
  const a = await createUser("gc@example.com", "pw", []);
  const b = await createUser("gd@example.com", "pw", []);
  await setDisabled(b.userId, true);
  const group = await createGroup("Finance2", { type: "global" });
  await setGroupMembers(group.groupId, [a.userId, b.userId]);

  const got = await resolveStepAssignment(stepWith(group.groupId), createDefaultAssignmentRegistry(), ctx(), sql);
  expect(got.assignment!.candidates).toEqual([a.userId]);
});

test.skipIf(!DB)("a groupId naming no group resolves to no candidates, with nothing thrown", async () => {
  const got = await resolveStepAssignment(stepWith("group_ghost"), createDefaultAssignmentRegistry(), ctx(), sql);
  expect(got.assignment!.candidates).toEqual([]);
  expect(got.unresolved).toBe("no-candidates");
});

test.skipIf(!DB)("a membership change made after the first entry reaches the next entry, with no republish", async () => {
  const a = await createUser("ge@example.com", "pw", []);
  const b = await createUser("gf@example.com", "pw", []);
  const group = await createGroup("Finance3", { type: "global" });
  await setGroupMembers(group.groupId, [a.userId]);

  const first = await resolveStepAssignment(stepWith(group.groupId), createDefaultAssignmentRegistry(), ctx(), sql);
  expect(first.assignment!.candidates).toEqual([a.userId]);

  await setGroupMembers(group.groupId, [b.userId]);

  const second = await resolveStepAssignment(stepWith(group.groupId), createDefaultAssignmentRegistry(), ctx(), sql);
  expect(second.assignment!.candidates).toEqual([b.userId]);
});

test("groupMembersConfigSchema accepts { groupId } alone", () => {
  expect(groupMembersConfigSchema.safeParse({ groupId: "group_x" }).success).toBe(true);
  expect(groupMembersConfigSchema.safeParse({ groupId: "group_x", fallback: "user_a" }).success).toBe(false);
  expect(groupMembersConfigSchema.safeParse({}).success).toBe(false);
});

// --- publish-time config rejection, through the full publishBody path -------

const bodyWithGroupStep = (config: Record<string, unknown>): ProcessBody =>
  ({
    key: "wf",
    label: { en: "Wf" },
    baseLocale: "en",
    fields: [],
    allowedGroups: ["group_finance"],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a",
          key: "a",
          label: { en: "A" },
          type: "task",
          assignment: { strategy: { type: GROUP_MEMBERS_STRATEGY_TYPE, config } },
          terminal: true,
        },
      ],
    },
  }) as unknown as ProcessBody;

test.skipIf(!DB)("a config carrying an extra key is refused at publish, naming that strategy's config", async () => {
  const registry = createRegistry();
  const dataSourceReg = createDataSourceRegistry();
  const assignmentReg = createDefaultAssignmentRegistry();
  const body = bodyWithGroupStep({ groupId: "group_finance", fallback: "user_a" });
  await expect(
    publishBody("proc_gext" as ProcessId, body, registry, dataSourceReg, sql, assignmentReg),
  ).rejects.toBeInstanceOf(AssignmentRegistryValidationError);
});

test.skipIf(!DB)("a config missing groupId is refused at publish, naming that strategy's config", async () => {
  const registry = createRegistry();
  const dataSourceReg = createDataSourceRegistry();
  const assignmentReg = createDefaultAssignmentRegistry();
  const body = bodyWithGroupStep({});
  await expect(
    publishBody("proc_gmiss" as ProcessId, body, registry, dataSourceReg, sql, assignmentReg),
  ).rejects.toBeInstanceOf(AssignmentRegistryValidationError);
});

test.skipIf(!DB)("a body with no publish-time issue compiles clean", () => {
  expect(() => compileProcessBody(bodyWithGroupStep({ groupId: "group_finance" }))).not.toThrow();
});
