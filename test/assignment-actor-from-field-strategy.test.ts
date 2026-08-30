/**
 * `org.actor-from-field` (`src/engine/assignment-strategies.ts`): the person
 * the instance's own data names, resolved live at step entry. A `user_` value
 * passes through, a `group_` value expands through `getGroupMembers`, and
 * every other shape resolves to no candidates rather than raising.
 * DB-backed, skips when DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
import { createUser, setDisabled } from "../src/auth/users.js";
import { createGroup, setGroupMembers, groupNamesForIds } from "../src/auth/groups.js";
import {
  createDefaultAssignmentRegistry,
  actorFromFieldConfigSchema,
  ACTOR_FROM_FIELD_STRATEGY_TYPE,
} from "../src/engine/assignment-strategies.js";
import { resolveStepAssignment } from "../src/engine/registry.js";
import { publishBody, AssignmentRegistryValidationError } from "../src/engine/definitions.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { compileProcessBody } from "../src/schema/compile.js";
import type { Step, ProcessBody, ProcessId, Literal } from "../src/schema/definition.js";

const DB = !!process.env.DATABASE_URL;

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE auth_users, groups, definitions`;
});

const FIELD_ID = "field_approver";

const stepWith = (fieldId: string): Step =>
  ({
    id: "step_approve",
    key: "approve",
    label: { en: "Approve" },
    type: "task",
    assignment: { strategy: { type: ACTOR_FROM_FIELD_STRATEGY_TYPE, config: { fieldId } } },
  }) as unknown as Step;

const ctx = (data: Record<string, Literal> = {}) => ({ id: "inst_1", startedBy: undefined, data });

test.skipIf(!DB)("a user_ value resolves as the sole candidate", async () => {
  const a = await createUser("afa@example.com", "pw", []);

  const got = await resolveStepAssignment(
    stepWith(FIELD_ID),
    createDefaultAssignmentRegistry(),
    ctx({ [FIELD_ID]: a.userId }),
    sql,
  );
  expect(got.assignment!.candidates).toEqual([a.userId]);
  expect(got.unresolved).toBeUndefined();
});

test.skipIf(!DB)("a group_ value expands through the group's current members", async () => {
  const a = await createUser("afb@example.com", "pw", []);
  const b = await createUser("afc@example.com", "pw", []);
  const group = await createGroup("Approvers", { type: "global" });
  await setGroupMembers(group.groupId, [a.userId, b.userId]);

  const got = await resolveStepAssignment(
    stepWith(FIELD_ID),
    createDefaultAssignmentRegistry(),
    ctx({ [FIELD_ID]: group.groupId }),
    sql,
  );
  expect(got.assignment!.candidates.sort()).toEqual([a.userId, b.userId].sort());
});

test.skipIf(!DB)("the group_ expansion excludes a disabled member, as org.group-members does", async () => {
  const a = await createUser("afd@example.com", "pw", []);
  const b = await createUser("afe@example.com", "pw", []);
  await setDisabled(b.userId, true);
  const group = await createGroup("Approvers2", { type: "global" });
  await setGroupMembers(group.groupId, [a.userId, b.userId]);

  const got = await resolveStepAssignment(
    stepWith(FIELD_ID),
    createDefaultAssignmentRegistry(),
    ctx({ [FIELD_ID]: group.groupId }),
    sql,
  );
  expect(got.assignment!.candidates).toEqual([a.userId]);
});

test.skipIf(!DB)("an unwritten field resolves to no candidates, with nothing thrown", async () => {
  const got = await resolveStepAssignment(stepWith(FIELD_ID), createDefaultAssignmentRegistry(), ctx({}), sql);
  expect(got.assignment!.candidates).toEqual([]);
  expect(got.unresolved).toBe("no-candidates");
});

test.skipIf(!DB)("a non-string value resolves to no candidates", async () => {
  const got = await resolveStepAssignment(
    stepWith(FIELD_ID),
    createDefaultAssignmentRegistry(),
    ctx({ [FIELD_ID]: 42 }),
    sql,
  );
  expect(got.assignment!.candidates).toEqual([]);
  expect(got.unresolved).toBe("no-candidates");
});

// An id carries its prefix (D12). Returning the bare value here would seed the
// candidate list with a string no account can ever claim.
test.skipIf(!DB)("a string carrying neither prefix resolves to no candidates, not to itself", async () => {
  const got = await resolveStepAssignment(
    stepWith(FIELD_ID),
    createDefaultAssignmentRegistry(),
    ctx({ [FIELD_ID]: "roman" }),
    sql,
  );
  expect(got.assignment!.candidates).toEqual([]);
  expect(got.unresolved).toBe("no-candidates");
});

test("actorFromFieldConfigSchema accepts { fieldId } alone", () => {
  expect(actorFromFieldConfigSchema.safeParse({ fieldId: FIELD_ID }).success).toBe(true);
  expect(actorFromFieldConfigSchema.safeParse({ fieldId: FIELD_ID, fallback: "user_a" }).success).toBe(false);
  expect(actorFromFieldConfigSchema.safeParse({}).success).toBe(false);
});

// --- publish-time config rejection, through the full publishBody path -------

const bodyWithActorStep = (config: Record<string, unknown>): ProcessBody =>
  ({
    key: "wf",
    label: { en: "Wf" },
    baseLocale: "en",
    fields: [{ id: FIELD_ID, key: "approver", label: { en: "Approver" }, type: "string", format: "person" }],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a",
          key: "a",
          label: { en: "A" },
          type: "task",
          assignment: { strategy: { type: ACTOR_FROM_FIELD_STRATEGY_TYPE, config } },
          terminal: true,
        },
      ],
    },
  }) as unknown as ProcessBody;

test.skipIf(!DB)("a config carrying an extra key is refused at publish, naming that strategy's config", async () => {
  const body = bodyWithActorStep({ fieldId: FIELD_ID, fallback: "user_a" });
  await expect(
    publishBody("proc_afext" as ProcessId, body, createRegistry(), createDataSourceRegistry(), sql, createDefaultAssignmentRegistry()),
  ).rejects.toBeInstanceOf(AssignmentRegistryValidationError);
});

test.skipIf(!DB)("a config missing fieldId is refused at publish, naming that strategy's config", async () => {
  const body = bodyWithActorStep({});
  await expect(
    publishBody("proc_afmiss" as ProcessId, body, createRegistry(), createDataSourceRegistry(), sql, createDefaultAssignmentRegistry()),
  ).rejects.toBeInstanceOf(AssignmentRegistryValidationError);
});

test("a body with no publish-time issue compiles clean", () => {
  expect(() => compileProcessBody(bodyWithActorStep({ fieldId: FIELD_ID }))).not.toThrow();
});

// --- groupNamesForIds -------------------------------------------------------
// No auth-groups suite exists; the groups store is exercised from the suites
// that already seed it, and this file is one of them.

test.skipIf(!DB)("groupNamesForIds answers two ids with two names", async () => {
  const a = await createGroup("Finanzen", { type: "global" });
  const b = await createGroup("Einkauf", { type: "global" });
  const found = await groupNamesForIds([a.groupId, b.groupId]);
  expect(found.get(a.groupId)).toBe("Finanzen");
  expect(found.get(b.groupId)).toBe("Einkauf");
  expect(found.size).toBe(2);
});

test.skipIf(!DB)("groupNamesForIds leaves out an id the store no longer holds", async () => {
  const a = await createGroup("Finanzen2", { type: "global" });
  const found = await groupNamesForIds([a.groupId, "group_ghost"]);
  expect([...found.keys()]).toEqual([a.groupId]);
});

test.skipIf(!DB)("groupNamesForIds answers the empty set with nothing", async () => {
  expect((await groupNamesForIds([])).size).toBe(0);
});
