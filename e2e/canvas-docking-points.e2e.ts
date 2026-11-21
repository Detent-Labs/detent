/**
 * The **canvas docking point** flows (canvas-docking-points): the points a step
 * draws, the connect drag that stores them, the step move that keeps them, and
 * the end handle that hangs a path end on another point. A draft saves itself,
 * so every flow stubs the `PUT`: nothing reaches the server, and publish.e2e.ts
 * and the other flows find both drafts as the seed left them. The stub records
 * each body the page sends, which is how a flow reads what the canvas stored.
 * The stub also answers a later `GET` with the last body saved, so a reload
 * reads back what the page wrote.
 *
 * Canvas units are not screen pixels, since Panzoom scales the canvas. Every
 * press position comes from an element's own `boundingBox()`.
 */
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./fixtures.js";

/** The seed's read-only draft: Laptop Inventory, a start step and an end step. */
const READ_DRAFT = "E2E draft";
/** The seed's draft for flows that write: the same two steps and two spares. */
const WRITE_DRAFT = "E2E writes";

const SHELF = "step_3b5d7f10-0001-4a1c-8e2f-000000000001";
const ISSUED = "step_3b5d7f10-0002-4a1c-8e2f-000000000002";
const SPARE_ONE = "step_e2e_spare_one";
const SHELF_PATH = "path_9c4e6a20-0001-4a1c-8e2f-000000000001";

interface End {
  side: string;
  at: number;
}

interface Saved {
  body: unknown;
  layout: Record<string, unknown> & { dockingPoints?: Record<string, { source?: End; target?: End }> };
  revision: number;
}

interface DraftStub {
  /** Every `PUT` body the page sent, oldest first. */
  saves: Saved[];
  /** The draft as the server first served it. */
  served: () => { body: unknown; layout: Record<string, unknown> };
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Pt {
  x: number;
  y: number;
}

/**
 * Answers every `PUT` of a draft as the server does when a save lands, and
 * records its body. A `GET` after a save answers with that save, so a reload
 * sees what the page wrote.
 */
async function stubDraft(page: Page): Promise<DraftStub> {
  const saves: Saved[] = [];
  let served: { body: unknown; layout: Record<string, unknown> } | undefined;
  await page.route("**/drafts/*", async (route) => {
    const request = route.request();
    if (request.method() === "PUT") {
      const sent = request.postDataJSON() as Saved;
      saves.push(sent);
      return route.fulfill({ json: { body: sent.body, layout: sent.layout, revision: sent.revision + 1 } });
    }
    if (request.method() !== "GET") return route.fallback();
    const response = await route.fetch();
    const real = (await response.json()) as Record<string, unknown>;
    const last = saves[saves.length - 1];
    if (!last) {
      served ??= { body: real.body, layout: real.layout as Record<string, unknown> };
      return route.fulfill({ response, json: real });
    }
    return route.fulfill({ response, json: { ...real, body: last.body, layout: last.layout, revision: last.revision + 1 } });
  });
  return {
    saves,
    served: () => {
      if (!served) throw new Error("the draft was never served");
      return served;
    },
  };
}

/** Opens a draft on its Map tab, with its save stubbed. */
async function openMap(page: Page, name: string): Promise<DraftStub> {
  const stub = await stubDraft(page);
  await page.goto("/studio");
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Process name" })).toHaveValue(name);
  await page.getByRole("tab", { name: "Map" }).click();
  await expect(page.locator(".canvas-node").first()).toBeVisible();
  return stub;
}

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error("the element has no box");
  return box;
}

const centreOf = (box: Box): Pt => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

/** The node's own rectangle, without its focus ring or its stamps. */
const nodeRect = (page: Page, stepId: string): Locator => page.locator(`.canvas-node[data-step-id="${stepId}"] > rect`).first();

const dockingSet = (page: Page, stepId: string): Locator => page.locator(`[data-docking-step-id="${stepId}"]`);

const dockingPoint = (page: Page, stepId: string, key: string): Locator =>
  page.locator(`[data-docking-step-id="${stepId}"] [data-docking-point="${key}"]`);

/** The centre of a point's press target, which the press resolves to that point. */
async function pressTarget(page: Page, stepId: string, key: string): Promise<Pt> {
  return centreOf(await boxOf(dockingPoint(page, stepId, key).locator("rect")));
}

/** Rests the pointer on a node's middle and waits for its points to draw. */
async function hoverStep(page: Page, stepId: string): Promise<void> {
  const at = centreOf(await boxOf(nodeRect(page, stepId)));
  await page.mouse.move(at.x, at.y);
  await expect(dockingSet(page, stepId)).toHaveCount(1);
}

/** A spot of empty canvas: right of the graph, inside the frame and the viewport. */
async function emptyCanvas(page: Page): Promise<Pt> {
  const frame = await boxOf(page.locator("[role=application]").locator(".."));
  return { x: frame.x + frame.width - 60, y: frame.y + 200 };
}

/** Moves the pointer onto empty canvas. */
async function leaveToEmptyCanvas(page: Page): Promise<void> {
  const at = await emptyCanvas(page);
  await page.mouse.move(at.x, at.y, { steps: 6 });
}

/** The screen point at `fraction` along a path's drawn route. */
async function pointOnRoute(page: Page, pathId: string, fraction: number): Promise<Pt> {
  return page.evaluate(
    ({ id, along }) => {
      const group = document.querySelector(`[data-kind="edge"][data-path-id="${id}"]`);
      const routes = group?.querySelectorAll("path");
      const route = routes?.[routes.length - 1];
      const matrix = route?.getScreenCTM();
      if (!route || !matrix) throw new Error(`no route for ${id}`);
      const on = route.getPointAtLength(route.getTotalLength() * along);
      const screen = new DOMPoint(on.x, on.y).matrixTransform(matrix);
      return { x: screen.x, y: screen.y };
    },
    { id: pathId, along: fraction },
  );
}

const endHandles = (page: Page, pathId: string): Locator => page.locator(`[data-end-handle][data-path-id="${pathId}"]`);

const endHandle = (page: Page, pathId: string, end: "source" | "target"): Locator =>
  page.locator(`[data-end-handle="${end}"][data-path-id="${pathId}"]`);

/** Selects a path with a press on its route, at the first spot no sentence covers. */
async function selectPath(page: Page, pathId: string): Promise<void> {
  for (const fraction of [0.5, 0.3, 0.7, 0.2, 0.8, 0.4, 0.6]) {
    const at = await pointOnRoute(page, pathId, fraction);
    await page.mouse.click(at.x, at.y);
    const drawn = await endHandles(page, pathId)
      .first()
      .waitFor({ state: "attached", timeout: 500 })
      .then(
        () => true,
        () => false,
      );
    if (drawn) return;
  }
  throw new Error(`no press along ${pathId} selected it`);
}

/** Presses, drags in steps and releases, the way a hand does. */
async function drag(page: Page, from: Pt, to: Pt): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

/** The Panzoom transform, which a pan rewrites. */
const panOf = (page: Page): Promise<string> => page.locator("[role=application]").evaluate((el) => (el as SVGElement).style.transform);

/** The state line's words while a change is unsaved. */
const unsaved = (page: Page): Locator => page.locator("header").getByText("Unsaved changes", { exact: true });

/** Waits for one more save than `before` and returns the newest. */
async function nextSave(stub: DraftStub, before: number): Promise<Saved> {
  await expect.poll(() => stub.saves.length).toBeGreaterThan(before);
  return stub.saves[stub.saves.length - 1] as Saved;
}

test("opening a draft with no stored point sends no write and draws no point", async ({ page }) => {
  const stub = await openMap(page, READ_DRAFT);
  expect(stub.served().layout).not.toHaveProperty("dockingPoints");
  // A resting canvas draws no point, and every path draws.
  await expect(page.locator("[data-docking-step-id]")).toHaveCount(0);
  await expect(page.locator("[data-kind=edge]")).toHaveCount(1);

  // Pointing at a step draws its twenty points, and a click on it moves nothing.
  await hoverStep(page, SHELF);
  await expect(dockingSet(page, SHELF).locator("[data-docking-point]")).toHaveCount(20);
  await expect(page.locator("[data-docking-step-id]")).toHaveCount(1);
  await page.mouse.down();
  await page.mouse.up();

  // A change would read Unsaved changes in the same frame, so none follows.
  await expect(unsaved(page)).toHaveCount(0);
  expect(stub.saves).toHaveLength(0);
});

test("a connect drag between two chosen points stores both and a reload keeps them", async ({ page }) => {
  const stub = await openMap(page, WRITE_DRAFT);
  const edges = await page.locator("[data-kind=edge]").count();

  await hoverStep(page, SHELF);
  const from = await pressTarget(page, SHELF, "bottom:0");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // Over the other step, whose points draw under the drag with a ring on the snap.
  const over = centreOf(await boxOf(nodeRect(page, SPARE_ONE)));
  await page.mouse.move(over.x, over.y, { steps: 12 });
  await expect(dockingSet(page, SPARE_ONE)).toHaveCount(1);
  const onto = await pressTarget(page, SPARE_ONE, "left:-1");
  await page.mouse.move(onto.x, onto.y, { steps: 6 });
  await expect(dockingSet(page, SPARE_ONE).locator('circle[r="10"]')).toHaveCount(1);
  await page.mouse.up();

  await expect(page.locator("[data-kind=edge]")).toHaveCount(edges + 1);
  const saved = await nextSave(stub, 0);
  expect(Object.values(saved.layout.dockingPoints ?? {})).toEqual([
    { source: { side: "bottom", at: 0 }, target: { side: "left", at: -1 } },
  ]);

  // The source step keeps no points drawn once the pointer leaves it.
  await leaveToEmptyCanvas(page);
  await expect(page.locator("[data-docking-step-id]")).toHaveCount(0);

  // After a reload the path leaves and arrives at the same two points.
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Process name" })).toHaveValue(WRITE_DRAFT);
  await page.getByRole("tab", { name: "Map" }).click();
  await expect(page.locator("[data-kind=edge]")).toHaveCount(edges + 1);
  await hoverStep(page, SHELF);
  await expect(dockingPoint(page, SHELF, "bottom:0")).toHaveAttribute("data-docking-held", "true");
  await hoverStep(page, SPARE_ONE);
  await expect(dockingPoint(page, SPARE_ONE, "left:-1")).toHaveAttribute("data-docking-held", "true");
});

test("a step move stores the points of its path and the path keeps both sides", async ({ page }) => {
  const stub = await openMap(page, WRITE_DRAFT);
  const start = centreOf(await boxOf(nodeRect(page, ISSUED)));
  await hoverStep(page, ISSUED);
  await drag(page, start, { x: start.x, y: start.y + 110 });

  const saved = await nextSave(stub, 0);
  expect(saved.layout.dockingPoints).toEqual({
    [SHELF_PATH]: { source: { side: "right", at: 0 }, target: { side: "left", at: 0 } },
  });
  expect(saved.layout[ISSUED]).toBeDefined();

  // The moved step is selected, so its points stay drawn. The path still ends on the same two.
  await expect(dockingPoint(page, ISSUED, "left:0")).toHaveAttribute("data-docking-held", "true");
  await hoverStep(page, SHELF);
  await expect(dockingPoint(page, SHELF, "right:0")).toHaveAttribute("data-docking-held", "true");
  await expect(dockingPoint(page, SHELF, "bottom:0")).toHaveAttribute("data-docking-held", "false");
});

test("an end handle drag hangs an end on another point and leaves the Draft model equal", async ({ page }) => {
  const stub = await openMap(page, WRITE_DRAFT);
  await selectPath(page, SHELF_PATH);
  const target = endHandle(page, SHELF_PATH, "target");
  const grab = centreOf(await boxOf(target));

  // A release over empty canvas changes nothing.
  await drag(page, grab, await emptyCanvas(page));
  await expect(unsaved(page)).toHaveCount(0);
  expect(stub.saves).toHaveLength(0);

  // A release on another point of the step stores that end alone.
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  const over = centreOf(await boxOf(nodeRect(page, ISSUED)));
  await page.mouse.move(over.x, over.y, { steps: 12 });
  await expect(dockingSet(page, ISSUED)).toHaveCount(1);
  const onto = await pressTarget(page, ISSUED, "top:0");
  await page.mouse.move(onto.x, onto.y, { steps: 6 });
  await page.mouse.up();

  const saved = await nextSave(stub, 0);
  expect(saved.layout.dockingPoints).toEqual({ [SHELF_PATH]: { target: { side: "top", at: 0 } } });
  expect(saved.body).toEqual(stub.served().body);
  await hoverStep(page, ISSUED);
  await expect(dockingPoint(page, ISSUED, "top:0")).toHaveAttribute("data-docking-held", "true");
});

test("an end handle drag on a self path keeps the other end where it was", async ({ page }) => {
  const stub = await openMap(page, WRITE_DRAFT);
  // The way-out menu offers the step itself, and picking it adds a path from the step to itself.
  await page.locator(`.canvas-node[data-step-id="${SHELF}"]`).focus();
  await page.keyboard.press("c");
  await page.getByRole("menuitem", { name: "On the Shelf", exact: true }).click();
  const added = page.locator("[data-kind=edge]:focus");
  await expect(added).toHaveCount(1);
  const selfPath = (await added.getAttribute("data-path-id")) ?? "";
  const afterAdd = await nextSave(stub, 0);
  expect(afterAdd.layout.dockingPoints ?? {}).not.toHaveProperty(selfPath);

  await selectPath(page, selfPath);
  const source = endHandle(page, selfPath, "source");
  const grab = centreOf(await boxOf(source));
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  const over = centreOf(await boxOf(nodeRect(page, SHELF)));
  await page.mouse.move(over.x, over.y, { steps: 12 });
  await expect(dockingSet(page, SHELF)).toHaveCount(1);
  const onto = await pressTarget(page, SHELF, "top:2");
  await page.mouse.move(onto.x, onto.y, { steps: 6 });
  await page.mouse.up();

  const saved = await nextSave(stub, 1);
  expect(saved.layout.dockingPoints?.[selfPath]).toEqual({ source: { side: "top", at: 2 }, target: { side: "left", at: 0 } });
  expect(saved.body).toEqual(afterAdd.body);
});

test("a press on a point under an end stamp starts a connect drag the end step refuses", async ({ page }) => {
  const stub = await openMap(page, READ_DRAFT);
  const edges = await page.locator("[data-kind=edge]").count();
  await hoverStep(page, ISSUED);
  const stamp = await boxOf(
    page.locator(`.canvas-node[data-step-id="${ISSUED}"] div[aria-hidden="true"]`).filter({ hasText: /^End$/ }),
  );
  let key: string | undefined;
  let press: Pt = { x: 0, y: 0 };
  for (const at of [-3, -2, -1, 0, 1, 2, 3]) {
    const centre = await pressTarget(page, ISSUED, `top:${at}`);
    if (centre.x >= stamp.x && centre.x <= stamp.x + stamp.width && centre.y >= stamp.y && centre.y <= stamp.y + stamp.height) {
      key = `top:${at}`;
      press = centre;
      break;
    }
  }
  expect(key, "a top point lies under the stamp").toBeDefined();
  await expect(dockingPoint(page, ISSUED, key as string)).toHaveAttribute("data-docking-end", "true");
  // The point's press target wins the hit test over the stamp.
  const topmost = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest("[data-docking-point]")?.getAttribute("data-docking-point") ?? null,
    press,
  );
  expect(topmost).toBe(key);

  await page.mouse.move(press.x, press.y);
  await page.mouse.down();
  const over = centreOf(await boxOf(nodeRect(page, SHELF)));
  await page.mouse.move(over.x, over.y, { steps: 12 });
  // A refused drag still draws the hovered step's points, and rings none.
  await expect(dockingSet(page, SHELF)).toHaveCount(1);
  await expect(dockingSet(page, SHELF).locator('circle[r="10"]')).toHaveCount(0);
  await page.mouse.up();

  await expect(page.locator("div").filter({ hasText: /^An end has no way out\.$/ })).toBeVisible();
  await expect(page.locator("[data-kind=edge]")).toHaveCount(edges);
  await expect(unsaved(page)).toHaveCount(0);
  expect(stub.saves).toHaveLength(0);
});

test("a drag on an end handle does not pan the canvas", async ({ page }) => {
  const stub = await openMap(page, WRITE_DRAFT);
  await selectPath(page, SHELF_PATH);
  const before = await panOf(page);
  expect(before).not.toBe("");
  const handle = endHandle(page, SHELF_PATH, "source");
  const grab = centreOf(await boxOf(handle));
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  const over = centreOf(await boxOf(nodeRect(page, SHELF)));
  await page.mouse.move(over.x, over.y, { steps: 12 });
  await expect(dockingSet(page, SHELF)).toHaveCount(1);
  const onto = await pressTarget(page, SHELF, "top:1");
  await page.mouse.move(onto.x, onto.y, { steps: 6 });
  await page.mouse.up();
  // The drag happened: the end stored its point. The pan did not move.
  const saved = await nextSave(stub, 0);
  expect(saved.layout.dockingPoints).toEqual({ [SHELF_PATH]: { source: { side: "top", at: 1 } } });
  expect(await panOf(page)).toBe(before);

  // Control: a drag on empty canvas pans, so the reading above can tell.
  await leaveToEmptyCanvas(page);
  const corner = await emptyCanvas(page);
  await drag(page, corner, { x: corner.x + 40, y: corner.y - 40 });
  expect(await panOf(page)).not.toBe(before);
});

test("a step keeps its points while the pointer moves onto an end handle that sits on it", async ({ page }) => {
  await openMap(page, WRITE_DRAFT);
  await selectPath(page, SHELF_PATH);
  await leaveToEmptyCanvas(page);
  await expect(dockingSet(page, ISSUED)).toHaveCount(0);

  await hoverStep(page, ISSUED);
  const handle = endHandle(page, SHELF_PATH, "target");
  const on = centreOf(await boxOf(handle));
  await page.mouse.move(on.x, on.y, { steps: 8 });
  const topmost = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest("[data-end-handle]")?.getAttribute("data-end-handle") ?? null,
    on,
  );
  expect(topmost, "the pointer rests on the target end handle").toBe("target");
  await expect(dockingSet(page, ISSUED)).toHaveCount(1);

  // Leaving the handle for empty canvas ends the pointing.
  await leaveToEmptyCanvas(page);
  await expect(dockingSet(page, ISSUED)).toHaveCount(0);
});
