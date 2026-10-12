/**
 * Every paginated listing rejects a cursor whose *value* has the wrong kind
 * with a RequestShapeError (a 400 over HTTP), instead of letting the SQL cast
 * raise an untyped error that answers 500. Shape-level cases (non-base64,
 * wrong arity) are covered next to each listing; the kind checks themselves
 * in pagination.test.ts. DB-backed — skips when DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
import { publishBody } from "../src/engine/definitions.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { listOutbox, listPendingTimers, listInstanceAudit } from "../src/engine/admin-queries.js";
import { createProcessInstance, listInstances, getInstanceRecord, listComments, listAttachments } from "../src/runtime/api.js";
import { listUsers } from "../src/auth/users.js";
import { listGroups } from "../src/auth/groups.js";
import { ADMIN_ROLE } from "../src/auth/authorize.js";
import { RequestShapeError } from "../src/errors.js";
import { encodeCursor } from "../src/pagination.js";
import type { ProcessBody, ProcessId, Instance } from "../src/schema/definition.js";
import type { Actor } from "../src/cel/eval.js";
import { clearInstanceAudit } from "./audit-cleanup.js";

const DB = !!process.env.DATABASE_URL;
const starter: Actor = { id: "user_starter", roles: [] };
const operator: Actor = { id: "user_operator", roles: [ADMIN_ROLE] };
const reg = createRegistry();
const dataSourceReg = createDataSourceRegistry();
const PID = "proc_cursor_values" as ProcessId;

async function rejectsShape(p: Promise<unknown>): Promise<void> {
  let err: unknown;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(RequestShapeError);
}

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, history_entries, instance_events, instance_comments, definitions`;
  if (DB) await clearInstanceAudit();
});

const body = (): ProcessBody =>
  ({
    key: "cursor_values",
    label: { en: "Cursor values" },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [
        { id: "step_a", key: "a", label: { en: "A" }, type: "task", paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_b", trigger: "manual" }] },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

const cursor = (...parts: string[]) => encodeCursor(parts);
const NOT_AN_INSTANT = "gestern";
const NO_SUCH_DAY = "2026-02-30 10:00:00+00";
const NUL = "a\u0000b";

test.skipIf(!DB)("listInstances rejects a cursor whose timestamp position is not an instant", async () => {
  await rejectsShape(listInstances({}, { cursor: cursor(NOT_AN_INSTANT, "inst_x") }, sql));
  await rejectsShape(listInstances({}, { cursor: cursor(NO_SUCH_DAY, "inst_x") }, sql));
});

test.skipIf(!DB)("listInstances rejects a cursor whose text position holds a NUL character", async () => {
  await rejectsShape(listInstances({}, { cursor: cursor("2026-10-11T10:00:00Z", NUL) }, sql));
});

test.skipIf(!DB)("getInstanceRecord rejects a sequence past int32, a non-integer sequence and a NUL character", async () => {
  await publishBody(PID, body(), reg, dataSourceReg);
  const inst = await createProcessInstance(PID, starter, dataSourceReg);
  const id = inst.instanceId;
  await rejectsShape(getInstanceRecord(id, operator, { cursor: cursor("2147483648", "2026-10-11T10:00:00Z", "hist_x") }, sql));
  await rejectsShape(getInstanceRecord(id, operator, { cursor: cursor("gestern", "2026-10-11T10:00:00Z", "hist_x") }, sql));
  await rejectsShape(getInstanceRecord(id, operator, { cursor: cursor("1", "2026-10-11T10:00:00Z", NUL) }, sql));
});

test.skipIf(!DB)("listComments rejects a cursor whose timestamp position is not an instant", async () => {
  await publishBody(PID, body(), reg, dataSourceReg);
  const inst = await createProcessInstance(PID, starter, dataSourceReg);
  await rejectsShape(listComments(inst.instanceId, starter, { cursor: cursor(NOT_AN_INSTANT, "cmt_x") }, sql));
  await rejectsShape(listComments(inst.instanceId, starter, { cursor: cursor(NO_SUCH_DAY, "cmt_x") }, sql));
});

test.skipIf(!DB)("listAttachments rejects a cursor whose timestamp position is not an instant", async () => {
  await publishBody(PID, body(), reg, dataSourceReg);
  const inst = await createProcessInstance(PID, starter, dataSourceReg);
  await rejectsShape(listAttachments(inst.instanceId, starter, { cursor: cursor(NOT_AN_INSTANT, "att_x") }, sql));
  await rejectsShape(listAttachments(inst.instanceId, starter, { cursor: cursor("2026-10-11T10:00:00Z", NUL) }, sql));
});

test.skipIf(!DB)("listOutbox rejects a cursor whose timestamp position is not an instant", async () => {
  await rejectsShape(listOutbox({}, { cursor: cursor(NOT_AN_INSTANT, "key_x") }, sql));
  await rejectsShape(listOutbox({}, { cursor: cursor("2026-10-11T10:00:00Z", NUL) }, sql));
});

test.skipIf(!DB)("listPendingTimers rejects a cursor whose timestamp position is not an instant", async () => {
  await rejectsShape(listPendingTimers({ cursor: cursor(NOT_AN_INSTANT, "inst_x") }, sql));
  await rejectsShape(listPendingTimers({ cursor: cursor(NO_SUCH_DAY, "inst_x") }, sql));
});

test.skipIf(!DB)("listInstanceAudit rejects a sequence past int64 and a non-integer sequence", async () => {
  const id = "inst_missing" as Instance["instanceId"];
  await rejectsShape(listInstanceAudit(id, { cursor: cursor("9223372036854775808") }, sql));
  await rejectsShape(listInstanceAudit(id, { cursor: cursor("gestern") }, sql));
});

test.skipIf(!DB)("listInstanceAudit accepts the largest int64 as a stale cursor, answering an empty page", async () => {
  const page = await listInstanceAudit("inst_missing" as Instance["instanceId"], { cursor: cursor("9223372036854775807") }, sql);
  expect(page.items).toEqual([]);
});

test.skipIf(!DB)("listGroups rejects a cursor whose text position holds a NUL character", async () => {
  await rejectsShape(listGroups({ cursor: cursor(NUL, "group_x") }, sql));
  await rejectsShape(listGroups({ cursor: cursor("Finance", NUL) }, sql));
});

test.skipIf(!DB)("listUsers rejects a cursor whose text position holds a NUL character", async () => {
  await rejectsShape(listUsers({ cursor: cursor(NUL, "user_x") }, sql));
  await rejectsShape(listUsers({ cursor: cursor("a@example.test", NUL) }, sql));
});
