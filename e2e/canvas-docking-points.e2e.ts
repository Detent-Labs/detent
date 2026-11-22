/**
 * The **canvas docking point** flows (canvas-docking-points): the points a step
 * draws, the connect drag that stores them, the step move that keeps them, and
 * the end handle that hangs a path end on another point. A draft saves itself,
 * so every flow stubs the `PUT`: nothing reaches the server, and publish.e2e.ts
 * and the other flows find both drafts as the seed left them. The stub records
 * each body the page sends, which is how a flow reads what the canvas stored.
 * The stub also answers a later `GET` with the last body saved. The reload
 * flow therefore proves that the page re-reads `layout.dockingPoints` and draws
 * the stored points. It does not prove the server's round trip of the layout
 * blob: test/drafts.test.ts covers that, and this file does not.
 *
 * Flows that expect exact stored points and default positions hold only on the
 * seed's drafts with an empty layout, and `openMap` asserts that precondition,
 * so a file that saves before this one fails here with a clear message.
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
const SPARE_TWO = "step_e2e_spare_two";
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
  expect(stub.served().layout, "the seed's draft has an empty layout").toEqual({});
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

/** A node's canvas position, read off its own translate. */
async function positionOf(page: Page, stepId: string): Promise<Pt> {
  const transform = await page.locator(`.canvas-node[data-step-id="${stepId}"]`).getAttribute("transform");
  const at = /translate\(\s*(-?[\d.]+)[ ,]+\s*(-?[\d.]+)\s*\)/.exec(transform ?? "");
  if (!at) throw new Error(`${stepId} has no translate: ${transform}`);
  return { x: Number(at[1]), y: Number(at[2]) };
}

const dockingSet = (page: Page, stepId: string): Locator => page.locator(`[data-docking-step-id="${stepId}"]`);

const dockingPoint = (page: Page, stepId: string, key: string): Locator =>
  page.locator(`[data-docking-step-id="${stepId}"] [data-docking-point="${key}"]`);

/** The centre of a point's press target, which the press resolves to that point. */
async function pressTarget(page: Page, stepId: string, key: string): Promise<Pt> {
  return centreOf(await boxOf(dockingPoint(page, stepId, key).locator("rect")));
}

/** The stored end of the step's point nearest a screen position, read off the drawn press targets. */
async function pointUnder(page: Page, stepId: string, at: Pt): Promise<End> {
  await expect(dockingSet(page, stepId)).toHaveCount(1);
  const keys = await dockingSet(page, stepId)
    .locator("[data-docking-point]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-docking-point") ?? ""));
  let best: { key: string; distance: number } | undefined;
  for (const key of keys) {
    const centre = await pressTarget(page, stepId, key);
    const distance = Math.hypot(centre.x - at.x, centre.y - at.y);
    if (!best || distance < best.distance) best = { key, distance };
  }
  const [side, position] = (best?.key ?? "").split(":");
  if (!side || position === undefined) throw new Error("the step draws no point");
  return { side, at: Number(position) };
}

/** Rests the pointer on a node's middle and waits for its points to draw. */
async function hoverStep(page: Page, stepId: string): Promise<void> {
  const at = centreOf(await boxOf(nodeRect(page, stepId)));
  await page.mouse.move(at.x, at.y);
  await expect(dockingSet(page, stepId)).toHaveCount(1);
}

/**
 * A spot of empty canvas: the first one down the frame's right side where the
 * canvas's own svg is the topmost element, so no node, route or control covers
 * it. Fails when there is none.
 */
async function emptyCanvas(page: Page): Promise<Pt> {
  const frame = await boxOf(page.locator("[role=application]").locator(".."));
  const height = page.viewportSize()?.height ?? 0;
  const x = frame.x + frame.width - 60;
  const candidates: Pt[] = [];
  for (let y = frame.y + 40; y < Math.min(frame.y + frame.height, height) - 8; y += 40) candidates.push({ x, y });
  const found = await page
    .locator("[role=application]")
    .evaluate((svg, spots) => spots.find((spot) => svg.ownerDocument.elementFromPoint(spot.x, spot.y) === svg) ?? null, candidates);
  if (found === null) throw new Error("no spot of empty canvas: the svg is topmost nowhere along the frame's right side");
  return found;
}

/** Moves the pointer onto empty canvas. */
async function leaveToEmptyCanvas(page: Page): Promise<void> {
  const at = await emptyCanvas(page);
  await page.mouse.move(at.x, at.y, { steps: 6 });
}

/**
 * The screen point at `fraction` along a path's drawn route. The route's own
 * points come from its `d` attribute (the canvas style `step` draws lines
 * only), and the start step's node, whose canvas position and screen box are
 * both known, gives the scale and the offset.
 */
async function pointOnRoute(page: Page, pathId: string, fraction: number): Promise<Pt> {
  const d = await page.locator(`[data-kind="edge"][data-path-id="${pathId}"] path`).last().getAttribute("d");
  if (d === null || /[^MLe\d.,\s-]/.test(d)) throw new Error(`no line route for ${pathId}: ${d}`);
  const points = [...d.matchAll(/(-?[\d.]+(?:e-?\d+)?),(-?[\d.]+(?:e-?\d+)?)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - (points[i] as Pt).x, p.y - (points[i] as Pt).y));
  let left = lengths.reduce((sum, n) => sum + n, 0) * fraction;
  let on = points[0] as Pt;
  for (const [i, length] of lengths.entries()) {
    const from = points[i] as Pt;
    const to = points[i + 1] as Pt;
    if (left <= length || i === lengths.length - 1) {
      const along = length === 0 ? 0 : Math.min(left / length, 1);
      on = { x: from.x + (to.x - from.x) * along, y: from.y + (to.y - from.y) * along };
      break;
    }
    left -= length;
  }
  const transform = await page.locator(`.canvas-node[data-step-id="${SHELF}"]`).getAttribute("transform");
  const origin = /translate\(\s*(-?[\d.]+)[ ,]+\s*(-?[\d.]+)\s*\)/.exec(transform ?? "");
  if (!origin) throw new Error(`the start step has no translate: ${transform}`);
  const box = await boxOf(nodeRect(page, SHELF));
  const scale = box.width / 180;
  return { x: box.x + (on.x - Number(origin[1])) * scale, y: box.y + (on.y - Number(origin[2])) * scale };
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

/** The `attribute` of the topmost element at a screen point, or of its nearest ancestor matching `selector`. */
const topmostAttribute = (page: Page, at: Pt, selector: string, attribute: string): Promise<string | null> =>
  page
    .locator("[role=application]")
    .evaluate((svg, hit) => svg.ownerDocument.elementFromPoint(hit.x, hit.y)?.closest(hit.selector)?.getAttribute(hit.attribute) ?? null, {
      ...at,
      selector,
      attribute,
    });

/** The Panzoom transform, which a pan rewrites. */
const panOf = (page: Page): Promise<string> => page.locator("[role=application]").evaluate((el) => el.style.transform);

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
  // The "Unsaved changes" count is the proof: a change shows it at once, while this length can read 0 before the autosave pause ends.
  expect(stub.saves).toHaveLength(0);
});

test("a connect drag between two chosen points stores both and a reload keeps them", async ({ page }) => {
  const stub = await openMap(page, WRITE_DRAFT);
  const edges = await page.locator("[data-kind=edge]").count();
  // Where every step draws before the drag, on a draft that stores no position.
  const every = [SHELF, ISSUED, SPARE_ONE, SPARE_TWO];
  const placesBefore = await Promise.all(every.map((id) => positionOf(page, id)));
  const boxesBefore = await Promise.all(every.map((id) => boxOf(nodeRect(page, id))));

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
  // The same write stores every step where it drew. A store of the joined steps alone
  // lets the auto-placed Spare Two land on the stored Spare One, and its box moves.
  every.forEach((id, i) => expect(saved.layout[id], id).toEqual(placesBefore[i]));
  for (const [i, id] of every.entries()) {
    expect(await boxOf(nodeRect(page, id)), `${id} stays in place`).toEqual(boxesBefore[i]);
  }

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
  // Pan the graph up, so there is room two rows below the start step.
  const free = await emptyCanvas(page);
  const panned = await panOf(page);
  await drag(page, free, { x: free.x, y: free.y - 150 });
  await expect.poll(() => panOf(page)).not.toBe(panned);

  // Drop the end step below the start step, two rows down and level with it, so
  // the automatic rule would now pick bottom and top. The path must keep right and left.
  const shelf = centreOf(await boxOf(nodeRect(page, SHELF)));
  const issued = await boxOf(nodeRect(page, ISSUED));
  const start = centreOf(issued);
  const rows = 2 * 120 * (issued.width / 180);
  const drop = { x: shelf.x, y: shelf.y + rows };
  expect(drop.y, "two rows below the start step stay on screen").toBeLessThan(page.viewportSize()?.height ?? 0);
  await hoverStep(page, ISSUED);
  await drag(page, start, drop);

  const saved = await nextSave(stub, 0);
  expect(saved.layout.dockingPoints).toEqual({
    [SHELF_PATH]: { source: { side: "right", at: 0 }, target: { side: "left", at: 0 } },
  });
  const moved = saved.layout[ISSUED] as Pt;
  expect(moved.y, "the end step stands below the start step, more than beside it").toBeGreaterThan(Math.abs(moved.x));

  // The moved step is selected, so its points stay drawn. Both ends sit on the stored points, not on the automatic ones.
  await expect(dockingPoint(page, ISSUED, "left:0")).toHaveAttribute("data-docking-held", "true");
  await expect(dockingPoint(page, ISSUED, "top:0")).toHaveAttribute("data-docking-held", "false");
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
  // The "Unsaved changes" count is the proof, as in the first flow; the length alone could read 0 before the pause ends.
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
  // A way out from the menu stores no position either.
  for (const id of [SHELF, ISSUED, SPARE_ONE, SPARE_TWO]) expect(afterAdd.layout, id).not.toHaveProperty(id);

  await selectPath(page, selfPath);
  const source = endHandle(page, selfPath, "source");
  const grab = centreOf(await boxOf(source));
  // Where the target end draws before the drag: the point of the step nearest its handle.
  const targetEnd = await pointUnder(page, SHELF, centreOf(await boxOf(endHandle(page, selfPath, "target"))));
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  const over = centreOf(await boxOf(nodeRect(page, SHELF)));
  await page.mouse.move(over.x, over.y, { steps: 12 });
  await expect(dockingSet(page, SHELF)).toHaveCount(1);
  const onto = await pressTarget(page, SHELF, "top:2");
  await page.mouse.move(onto.x, onto.y, { steps: 6 });
  await page.mouse.up();

  const saved = await nextSave(stub, 1);
  expect(saved.layout.dockingPoints?.[selfPath]).toEqual({ source: { side: "top", at: 2 }, target: targetEnd });
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
  expect(await topmostAttribute(page, press, "[data-docking-point]", "data-docking-point")).toBe(key);

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
  // The "Unsaved changes" count is the proof, as in the first flow; the length alone could read 0 before the pause ends.
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
  await expect.poll(() => panOf(page)).not.toBe(before);
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
  const topmost = await topmostAttribute(page, on, "[data-end-handle]", "data-end-handle");
  expect(topmost, "the pointer rests on the target end handle").toBe("target");
  await expect(dockingSet(page, ISSUED)).toHaveCount(1);

  // Leaving the handle for empty canvas ends the pointing.
  await leaveToEmptyCanvas(page);
  await expect(dockingSet(page, ISSUED)).toHaveCount(0);
});
