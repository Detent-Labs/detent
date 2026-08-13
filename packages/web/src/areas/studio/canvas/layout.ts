import type { Point } from "./geometry";

/** Structural, not the branded schema `Step` — this module only ever reads
 * `id` and `paths[].to`, so it stays decoupled from the full Draft shape. */
export interface LayoutStep {
  id?: string;
  paths?: Array<{ to?: string }>;
}

// Both are whole multiples of `GRID_STEP`, so an auto-placed step already sits
// on the canvas lattice and does not shift the first time an author drags it.
// The row pitch was 110 until that rule arrived.
export const COLUMN_WIDTH = 240;
export const ROW_HEIGHT = 120;

/**
 * Computes a position for every step id absent from `existingLayout`, via a
 * breadth-first traversal from `initialStepId` (depth -> column, traversal
 * order among same-depth steps -> row). A step unreachable from
 * `initialStepId` (including when `initialStepId` itself doesn't resolve)
 * still gets a position, appended one column past the deepest reached depth.
 *
 * Returns positions for the missing steps only — a step already present in
 * `existingLayout` is left untouched (design.md: this is a rendering
 * default, not persisted until the step is dragged).
 */
export function autoPlaceSteps(
  steps: LayoutStep[],
  initialStepId: string | undefined,
  existingLayout: Record<string, unknown>,
): Record<string, Point> {
  const missing = steps.filter((s) => s.id && existingLayout[s.id] === undefined);
  if (missing.length === 0) return {};

  const byId = new Map(steps.filter((s): s is LayoutStep & { id: string } => !!s.id).map((s) => [s.id, s]));
  const depth = new Map<string, number>();
  const order: string[] = [];

  if (initialStepId && byId.has(initialStepId)) {
    depth.set(initialStepId, 0);
    const queue = [initialStepId];
    while (queue.length > 0) {
      const id = queue.shift() as string;
      order.push(id);
      const d = depth.get(id) ?? 0;
      for (const path of byId.get(id)?.paths ?? []) {
        if (!path.to || depth.has(path.to) || !byId.has(path.to)) continue;
        depth.set(path.to, d + 1);
        queue.push(path.to);
      }
    }
  }

  const maxDepth = order.length > 0 ? Math.max(...order.map((id) => depth.get(id) ?? 0)) : -1;
  for (const s of steps) {
    if (s.id && !depth.has(s.id)) {
      depth.set(s.id, maxDepth + 1);
      order.push(s.id);
    }
  }

  const rowByDepth = new Map<number, number>();
  const positions = new Map<string, Point>();
  for (const id of order) {
    const d = depth.get(id) ?? 0;
    const row = rowByDepth.get(d) ?? 0;
    rowByDepth.set(d, row + 1);
    positions.set(id, { x: d * COLUMN_WIDTH, y: row * ROW_HEIGHT });
  }

  const result: Record<string, Point> = {};
  for (const s of missing) {
    if (s.id) result[s.id] = positions.get(s.id) ?? { x: 0, y: 0 };
  }
  return result;
}
