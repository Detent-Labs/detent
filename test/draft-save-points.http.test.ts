/**
 * The save point routes under `/drafts/:processId/save-points`
 * (src/http/studio-routes.ts): the draft gate, the 200/201/204 answers and the
 * 400/404/409 mappings. DB-backed — skips when DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql } from "../src/engine/store.js";
import { DB, initDb, authedReq } from "./helpers/http-fixture.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { MAX_SAVE_POINTS } from "../src/engine/draft-save-points.js";
import { createServer } from "../src/http/server.js";
import { devHeaderResolver } from "../src/auth/resolve.js";
import { DEVELOPER_ROLE, ADMIN_ROLE, AUTHOR_ROLE, CREATE_ROLE } from "../src/auth/authorize.js";
import { createUser } from "../src/auth/users.js";
import type { Actor } from "../src/cel/eval.js";

const fetch = createServer(createDataSourceRegistry(), createRegistry(), sql, devHeaderResolver);

beforeAll(initDb);
beforeEach(async () => {
  if (DB) await sql`TRUNCATE drafts, draft_save_points, process_access_roles`;
});

const admin: Actor = { id: "user_admin", roles: [ADMIN_ROLE] };
const developer: Actor = { id: "user_dev", roles: [DEVELOPER_ROLE, CREATE_ROLE] };
const author: Actor = { id: "user_author", roles: [AUTHOR_ROLE, CREATE_ROLE] };
const bystander: Actor = { id: "user_bystander", roles: [] };

let n = 0;
const pid = () => `proc_http_sp_${++n}`;

const body = (label: string) => ({
  key: "wf",
  label: { en: label },
  baseLocale: "en",
  fields: [],
  workflow: { initialStep: "step_a", steps: [{ id: "step_a", key: "a", label: { en: "A" }, type: "task" }] },
});

const url = (processId: string, rest = "") => `http://x/drafts/${processId}/save-points${rest}`;
const call = (actor: Actor, method: string, u: string, payload?: unknown) => fetch(authedReq(u, method, actor, payload));

/** Saves a draft as the developer and lists them on the process, so the developer passes the gate. */
async function seedDraft(processId: string, label = "v1"): Promise<number> {
  const res = await call(developer, "PUT", `http://x/drafts/${processId}`, { body: body(label), layout: {}, revision: 0 });
  expect(res.status).toBe(200);
  await sql`INSERT INTO process_access_roles (process_id, kind, principal) VALUES (${processId}, ${"developer"}, ${developer.id}) ON CONFLICT DO NOTHING`;
  return ((await res.json()) as { revision: number }).revision;
}

const errType = async (res: Response) => ((await res.json()) as { error: { type: string } }).error.type;

// ============================================================
// Gate
// ============================================================

test.skipIf(!DB)("every save point route answers 401 with no credential", async () => {
  const processId = pid();
  await seedDraft(processId);
  for (const [method, u] of [
    ["GET", url(processId)],
    ["POST", url(processId)],
    ["POST", url(processId, "/spt_x/restore")],
    ["DELETE", url(processId, "/spt_x")],
  ] as const) {
    expect((await fetch(new Request(u, { method }))).status).toBe(401);
  }
});

test.skipIf(!DB)("every save point route answers 403 to an actor with no authoring role", async () => {
  const processId = pid();
  await seedDraft(processId);
  for (const [method, u, payload] of [
    ["GET", url(processId), undefined],
    ["POST", url(processId), { name: "a", revision: 1 }],
    ["POST", url(processId, "/spt_x/restore"), { revision: 1, keepName: "k" }],
    ["DELETE", url(processId, "/spt_x"), undefined],
  ] as const) {
    expect((await call(bystander, method, u, payload)).status).toBe(403);
  }
});

test.skipIf(!DB)("an author off the Developer list gets 403 on every route", async () => {
  const processId = pid();
  const revision = await seedDraft(processId);
  const created = await call(developer, "POST", url(processId), { name: "mine", revision });
  const { savePointId } = (await created.json()) as { savePointId: string };
  for (const [method, u, payload] of [
    ["GET", url(processId), undefined],
    ["POST", url(processId), { name: "a", revision }],
    ["POST", url(processId, `/${savePointId}/restore`), { revision, keepName: "k" }],
    ["DELETE", url(processId, `/${savePointId}`), undefined],
  ] as const) {
    const res = await call(author, method, u, payload);
    expect(res.status).toBe(403);
    expect(await errType(res)).toBe("authorization");
  }
});

test.skipIf(!DB)("an admin lists a draft's save points with no list entry", async () => {
  const processId = pid();
  await seedDraft(processId);
  const res = await call(admin, "GET", url(processId));
  expect(res.status).toBe(200);
});

test.skipIf(!DB)("a Developer-listed author passes the gate", async () => {
  const processId = pid();
  await seedDraft(processId);
  await sql`INSERT INTO process_access_roles (process_id, kind, principal) VALUES (${processId}, ${"developer"}, ${author.id}) ON CONFLICT DO NOTHING`;
  expect((await call(author, "GET", url(processId))).status).toBe(200);
});

// ============================================================
// List, create, restore, delete
// ============================================================

test.skipIf(!DB)("the list answers items newest first, with the bound and no copy of the draft", async () => {
  const processId = pid();
  const revision = await seedDraft(processId);
  await call(developer, "POST", url(processId), { name: "first", revision });
  await call(developer, "POST", url(processId), { name: "second", revision });

  const res = await call(developer, "GET", url(processId));
  expect(res.status).toBe(200);
  const list = (await res.json()) as { items: Record<string, unknown>[]; limit: number };
  expect(list.limit).toBe(MAX_SAVE_POINTS);
  expect(list.items.map((i) => i.name)).toEqual(["second", "first"]);
  for (const item of list.items) {
    expect(item).not.toHaveProperty("body");
    expect(item).not.toHaveProperty("layout");
    expect(item.processId).toBe(processId);
  }
});

test.skipIf(!DB)("the list names the creating account, and null where no local account exists", async () => {
  const { userId } = await createUser(`sp-${crypto.randomUUID()}@example.test`, "pw", [], "Demo Superuser");
  const named: Actor = { id: userId, roles: [DEVELOPER_ROLE, CREATE_ROLE] };
  const processId = pid();
  const revision = await seedDraft(processId);
  await sql`INSERT INTO process_access_roles (process_id, kind, principal) VALUES (${processId}, ${"developer"}, ${userId}) ON CONFLICT DO NOTHING`;
  await call(named, "POST", url(processId), { name: "by account", revision });
  await call(developer, "POST", url(processId), { name: "by nobody", revision });

  const list = (await (await call(admin, "GET", url(processId))).json()) as { items: { name: string; createdByDisplayName: string | null }[] };
  expect(list.items.find((i) => i.name === "by account")?.createdByDisplayName).toBe("Demo Superuser");
  expect(list.items.find((i) => i.name === "by nobody")?.createdByDisplayName).toBeNull();
});

test.skipIf(!DB)("a create answers 201 with the summary and leaves the draft alone", async () => {
  const processId = pid();
  const revision = await seedDraft(processId);
  const res = await call(developer, "POST", url(processId), { name: "  Before review  ", revision });
  expect(res.status).toBe(201);
  const point = (await res.json()) as Record<string, unknown>;
  expect(point.name).toBe("Before review");
  expect(point.revision).toBe(revision);
  expect(point.createdBy).toBe(developer.id);
  expect(point.savePointId).toMatch(/^spt_/);
  expect(point).not.toHaveProperty("body");

  const draft = (await (await call(developer, "GET", `http://x/drafts/${processId}`)).json()) as { revision: number };
  expect(draft.revision).toBe(revision);
});

test.skipIf(!DB)("a restore answers 200 with the draft at the next revision and keeps both points", async () => {
  const processId = pid();
  const revision = await seedDraft(processId, "v1");
  const created = (await (await call(developer, "POST", url(processId), { name: "v1 point", revision })).json()) as { savePointId: string };
  const saved = await call(developer, "PUT", `http://x/drafts/${processId}`, { body: body("v2"), layout: {}, revision });
  const second = ((await saved.json()) as { revision: number }).revision;

  const res = await call(developer, "POST", url(processId, `/${created.savePointId}/restore`), { revision: second, keepName: "Before restoring v1" });
  expect(res.status).toBe(200);
  const draft = (await res.json()) as { revision: number; body: { label: { en: string } }; processId: string };
  expect(draft.processId).toBe(processId);
  expect(draft.revision).toBe(second + 1);
  expect(draft.body.label.en).toBe("v1");
  expect(draft).not.toHaveProperty("canPublish");

  const list = (await (await call(developer, "GET", url(processId))).json()) as { items: { name: string }[] };
  expect(list.items.map((i) => i.name).sort()).toEqual(["Before restoring v1", "v1 point"]);
});

test.skipIf(!DB)("a delete answers 204 and the point leaves the list", async () => {
  const processId = pid();
  const revision = await seedDraft(processId);
  const { savePointId } = (await (await call(developer, "POST", url(processId), { name: "gone", revision })).json()) as { savePointId: string };

  const res = await call(developer, "DELETE", url(processId, `/${savePointId}`));
  expect(res.status).toBe(204);
  const list = (await (await call(developer, "GET", url(processId))).json()) as { items: unknown[] };
  expect(list.items).toEqual([]);
});

// ============================================================
// 400
// ============================================================

test.skipIf(!DB)("a malformed create or restore answers 400", async () => {
  const processId = pid();
  const revision = await seedDraft(processId);
  const { savePointId } = (await (await call(developer, "POST", url(processId), { name: "p", revision })).json()) as { savePointId: string };

  const create = (payload: unknown) => call(developer, "POST", url(processId), payload);
  const restore = (payload: unknown) => call(developer, "POST", url(processId, `/${savePointId}/restore`), payload);
  for (const res of await Promise.all([
    create({ name: "   ", revision }),
    create({ name: "x".repeat(201), revision }),
    create({ name: 7, revision }),
    create({ revision }),
    create({ name: "ok" }),
    create({ name: "ok", revision: "1" }),
    create({ name: "ok", revision: -1 }),
    create(null),
    restore({ revision, keepName: "" }),
    restore({ revision }),
    restore({ keepName: "k" }),
    restore(null),
  ])) {
    expect(res.status).toBe(400);
    expect(await errType(res)).toBe("request-shape");
  }
  const bad = await fetch(new Request(url(processId), { method: "POST", headers: { "X-Actor-Id": developer.id, "X-Actor-Roles": developer.roles.join(","), "Content-Type": "application/json" }, body: "{" }));
  expect(bad.status).toBe(400);
});

test.skipIf(!DB)("the bound answers 400 on a create and on a restore, and stores nothing", async () => {
  const processId = pid();
  const revision = await seedDraft(processId);
  const { savePointId } = (await (await call(developer, "POST", url(processId), { name: "p0", revision })).json()) as { savePointId: string };
  await sql`
    INSERT INTO draft_save_points (save_point_id, process_id, name, body, layout, revision, created_by)
    SELECT 'spt_fill_' || g, ${processId}, 'fill ' || g, body, layout, revision, 'filler'
    FROM drafts, generate_series(1, ${MAX_SAVE_POINTS - 1}) AS g WHERE process_id = ${processId}`;

  const create = await call(developer, "POST", url(processId), { name: "one too many", revision });
  expect(create.status).toBe(400);
  const restore = await call(developer, "POST", url(processId, `/${savePointId}/restore`), { revision, keepName: "kept" });
  expect(restore.status).toBe(400);

  const list = (await (await call(developer, "GET", url(processId))).json()) as { items: unknown[]; limit: number };
  expect(list.items).toHaveLength(MAX_SAVE_POINTS);
  expect(list.limit).toBe(MAX_SAVE_POINTS);
});

// ============================================================
// 404
// ============================================================

test.skipIf(!DB)("a process with no draft answers 404 on create, restore and delete, and an empty list", async () => {
  const processId = pid();
  expect((await call(developer, "POST", url(processId), { name: "n", revision: 1 })).status).toBe(404);
  expect((await call(developer, "POST", url(processId, "/spt_x/restore"), { revision: 1, keepName: "k" })).status).toBe(404);
  expect((await call(developer, "DELETE", url(processId, "/spt_x"))).status).toBe(404);
  const list = await call(developer, "GET", url(processId));
  expect(list.status).toBe(200);
  expect(((await list.json()) as { items: unknown[] }).items).toEqual([]);
});

test.skipIf(!DB)("an unknown save point answers 404 on restore and delete", async () => {
  const processId = pid();
  const revision = await seedDraft(processId);
  expect((await call(developer, "POST", url(processId, "/spt_missing/restore"), { revision, keepName: "k" })).status).toBe(404);
  expect((await call(developer, "DELETE", url(processId, "/spt_missing"))).status).toBe(404);
});

test.skipIf(!DB)("a save point held by another process reads as absent, and neither draft moves", async () => {
  const mine = pid();
  const other = pid();
  const revMine = await seedDraft(mine, "mine");
  const revOther = await seedDraft(other, "other");
  const { savePointId } = (await (await call(developer, "POST", url(other), { name: "theirs", revision: revOther })).json()) as { savePointId: string };

  expect((await call(developer, "POST", url(mine, `/${savePointId}/restore`), { revision: revMine, keepName: "k" })).status).toBe(404);
  expect((await call(developer, "DELETE", url(mine, `/${savePointId}`))).status).toBe(404);

  const draftMine = (await (await call(developer, "GET", `http://x/drafts/${mine}`)).json()) as { revision: number };
  const draftOther = (await (await call(developer, "GET", `http://x/drafts/${other}`)).json()) as { revision: number };
  expect([draftMine.revision, draftOther.revision]).toEqual([revMine, revOther]);
  const list = (await (await call(developer, "GET", url(other))).json()) as { items: unknown[] };
  expect(list.items).toHaveLength(1);
});

// ============================================================
// 409
// ============================================================

test.skipIf(!DB)("a stale revision answers 409 draft-conflict on create and restore, and changes nothing", async () => {
  const processId = pid();
  const revision = await seedDraft(processId);
  const { savePointId } = (await (await call(developer, "POST", url(processId), { name: "p", revision })).json()) as { savePointId: string };
  await call(developer, "PUT", `http://x/drafts/${processId}`, { body: body("v2"), layout: {}, revision });

  const create = await call(developer, "POST", url(processId), { name: "late", revision });
  expect(create.status).toBe(409);
  expect(await errType(create)).toBe("draft-conflict");
  const restore = await call(developer, "POST", url(processId, `/${savePointId}/restore`), { revision, keepName: "k" });
  expect(restore.status).toBe(409);
  expect(await errType(restore)).toBe("draft-conflict");

  const list = (await (await call(developer, "GET", url(processId))).json()) as { items: unknown[] };
  expect(list.items).toHaveLength(1);
});

// ============================================================
// Order of checks
// ============================================================

test.skipIf(!DB)("a stale revision against a missing save point answers 404, not 409", async () => {
  const processId = pid();
  const revision = await seedDraft(processId);
  await call(developer, "PUT", `http://x/drafts/${processId}`, { body: body("v2"), layout: {}, revision });

  const res = await call(developer, "POST", url(processId, "/spt_missing/restore"), { revision, keepName: "k" });
  expect(res.status).toBe(404);
  expect(await errType(res)).toBe("not-found");
});

test.skipIf(!DB)("a malformed name on a process with no draft answers 400, not 404", async () => {
  const processId = pid();
  const create = await call(developer, "POST", url(processId), { name: "  ", revision: 0 });
  expect(create.status).toBe(400);
  const restore = await call(developer, "POST", url(processId, "/spt_x/restore"), { revision: 0, keepName: "" });
  expect(restore.status).toBe(400);
});
