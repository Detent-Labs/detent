import type { StepGroup } from "./groups";

/**
 * Keyboard traversal over the canvas graph. Pure and total: it reads the
 * draft's steps and the layout's groups, and never a DOM node, a React
 * element or a position.
 *
 * These rules live here rather than inside `CanvasView` for the reason
 * `selection.ts` and `groups.ts` already do: the capability requires the
 * canvas's computations to be pure and testable without a DOM.
 *
 * Nothing here rests on the definition contract's fan invariants. Those hold
 * for a published body; a draft mid-edit carries steps with no id, paths with
 * no target, and fans that mix triggers, and every one of those has an
 * outcome below.
 */

/** Structural, not the branded schema `Step` and `Path` — this module reads
 * only these fields, so it stays decoupled from the full Draft shape, the way
 * `LayoutStep` already does. */
export interface TraversalPath {
  id?: string;
  to?: string;
  trigger?: "manual" | "automatic";
  priority?: number;
}

export interface TraversalStep {
  id?: string;
  paths?: TraversalPath[];
}

/** Where keyboard focus sits. A path focus records the end the author arrived
 * through, because that end names the fan Up and Down walk. */
export type Focus =
  | { kind: "step"; stepId: string }
  | { kind: "path"; pathId: string; from: "source" | "target" }
  | { kind: "group"; groupId: string }
  | { kind: "root" };

/** The four keys traversal answers. */
export type ArrowKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

/** A drawn path: one the canvas renders, with both ends resolved. */
interface Edge {
  id: string;
  from: string;
  to: string;
  trigger?: "manual" | "automatic";
  priority?: number;
}

interface Graph {
  stepIds: Set<string>;
  /** The collapsed, box-drawing group a step hides inside, by step id. */
  boxOf: Map<string, StepGroup>;
  /** Every group drawing a box, in `groups` order. */
  drawing: StepGroup[];
  /** Every reachable path, in step order then path order. */
  edges: Edge[];
  /** The Up/Down sequence: every box-drawing group's box, at the place of its
   * first member, followed by every visible step. A collapsed group's box
   * stands in for its members, which hold no place of their own; an expanded
   * group's members keep theirs after the box. */
  order: Focus[];
}

/**
 * A group draws a box only where two of its members resolve, which is
 * `groupBox`'s own rule. Positions are not available here, so "resolves"
 * reads as "`steps` holds a step with that id": `groupBox` measures the
 * members it finds a point for, and the canvas resolves a point for every
 * step the draft holds.
 */
function drawsBox(group: StepGroup, stepIds: Set<string>): boolean {
  return group.stepIds.filter((id) => stepIds.has(id)).length > 1;
}

function graphOf(steps: TraversalStep[], groups: StepGroup[]): Graph {
  const stepIds = new Set<string>();
  for (const step of steps) if (step.id) stepIds.add(step.id);

  const drawing = groups.filter((group) => drawsBox(group, stepIds));
  const boxOf = new Map<string, StepGroup>();
  for (const group of drawing) {
    if (!group.collapsed) continue;
    for (const id of group.stepIds) if (!boxOf.has(id)) boxOf.set(id, group);
  }

  const edges: Edge[] = [];
  for (const step of steps) {
    // An id-less step's whole path set goes undrawn: the edge pass reads the
    // step id before it reads `step.paths`.
    if (!step.id) continue;
    const box = boxOf.get(step.id);
    for (const path of step.paths ?? []) {
      if (!path.id || !path.to || !stepIds.has(path.to)) continue;
      // Two members of one collapsed box have nothing to draw between them.
      if (box && boxOf.get(path.to) === box) continue;
      edges.push({ id: path.id, from: step.id, to: path.to, trigger: path.trigger, priority: path.priority });
    }
  }

  // A box takes its place before its first member whether the group is
  // collapsed or open, because its disclosure carries the roving stop in both
  // states. Only a collapsed group's member loses its own place: the box
  // stands in for it.
  //
  // A repeated step id holds one place, its first. `findIndex` below answers
  // with the first entry naming an id, so a second entry would be a dead end:
  // Down from it would walk on from the first instead.
  const order: Focus[] = [];
  const placed = new Set<string>();
  const seen = new Set<string>();
  for (const step of steps) {
    if (!step.id || seen.has(step.id)) continue;
    seen.add(step.id);
    for (const group of drawing) {
      if (placed.has(group.id) || !group.stepIds.includes(step.id)) continue;
      placed.add(group.id);
      order.push({ kind: "group", groupId: group.id });
    }
    if (!boxOf.has(step.id)) order.push({ kind: "step", stepId: step.id });
  }

  return { stepIds, boxOf, drawing, edges, order };
}

/** A step's own focus, or the box standing in for it while its group is
 * collapsed. */
function focusForStep(stepId: string, graph: Graph): Focus {
  const box = graph.boxOf.get(stepId);
  return box ? { kind: "group", groupId: box.id } : { kind: "step", stepId };
}

/**
 * A step's outgoing fan, in the order Up and Down walk it. The base is the
 * step's own `paths` array. `priority` refines it under one condition: every
 * path in the fan is automatic and carries a priority no sibling repeats,
 * which is the published body's own shape. A fan mixing triggers, missing one
 * priority or repeating one keeps array order, and no comparison reads an
 * absent priority.
 */
function outgoingFan(graph: Graph, stepId: string): Edge[] {
  const fan = graph.edges.filter((edge) => edge.from === stepId);
  if (!fan.every((edge) => edge.trigger === "automatic")) return fan;
  const prioritized = fan.filter((edge): edge is Edge & { priority: number } => edge.priority !== undefined);
  if (prioritized.length !== fan.length) return fan;
  if (new Set(prioritized.map((edge) => edge.priority)).size !== fan.length) return fan;
  return [...prioritized].sort((a, b) => a.priority - b.priority);
}

/** A step's incoming fan, in step order then path order. `priority` orders one
 * step's own siblings, and an incoming fan is drawn from several steps, so
 * nothing refines this one. */
function incomingFan(graph: Graph, stepId: string): Edge[] {
  return graph.edges.filter((edge) => edge.to === stepId);
}

/** The neighbour of `at`, or nothing at either end. Traversal never wraps. */
function neighbour<T>(list: T[], at: number, key: ArrowKey): T | undefined {
  return at < 0 ? undefined : list[at + (key === "ArrowUp" ? -1 : 1)];
}

/**
 * The focus one arrow key away. Every input has an outcome: a focus nothing
 * resolves, a boundary, and a key a focus does not answer all return the
 * focus unchanged, so nothing wraps and nothing throws.
 *
 * A root focus takes the entry point, `initialStep` and all. That parameter
 * reaches nothing else here: every other focus kind moves through the graph,
 * where the workflow's initial step names no boundary and no neighbour.
 */
export function nextFocus(
  focus: Focus,
  key: ArrowKey,
  steps: TraversalStep[],
  groups: StepGroup[],
  initialStep?: string,
): Focus {
  // ponytail: the graph rebuilds on every keypress, O(steps + paths). Memoize
  // it in `CanvasView` if a draft ever grows large enough for that to show.
  const graph = graphOf(steps, groups);

  switch (focus.kind) {
    case "root":
      return entryFocus(steps, groups, initialStep);

    case "group": {
      // A collapsed box stands in for its members, so it stands in for their
      // fan too. Right takes the first path leaving the box, Left the first
      // one entering it. Every edge with one end inside a box has its other
      // end outside, because a pair inside one box draws nothing at all, so
      // the end test alone decides. An expanded box hides no member, and
      // neither key finds a path.
      if (key === "ArrowLeft" || key === "ArrowRight") {
        const hides = (stepId: string) => graph.boxOf.get(stepId)?.id === focus.groupId;
        const crossing = graph.edges.find((edge) => hides(key === "ArrowRight" ? edge.from : edge.to));
        if (!crossing) return focus;
        return { kind: "path", pathId: crossing.id, from: key === "ArrowRight" ? "source" : "target" };
      }
      const at = graph.order.findIndex((f) => f.kind === "group" && f.groupId === focus.groupId);
      return neighbour(graph.order, at, key) ?? focus;
    }

    case "step": {
      if (!graph.stepIds.has(focus.stepId) || graph.boxOf.has(focus.stepId)) return focus;
      if (key === "ArrowRight") {
        const first = outgoingFan(graph, focus.stepId)[0];
        return first ? { kind: "path", pathId: first.id, from: "source" } : focus;
      }
      if (key === "ArrowLeft") {
        const first = incomingFan(graph, focus.stepId)[0];
        return first ? { kind: "path", pathId: first.id, from: "target" } : focus;
      }
      const at = graph.order.findIndex((f) => f.kind === "step" && f.stepId === focus.stepId);
      return neighbour(graph.order, at, key) ?? focus;
    }

    case "path": {
      const edge = graph.edges.find((e) => e.id === focus.pathId);
      if (!edge) return focus;
      if (key === "ArrowRight") return focusForStep(edge.to, graph);
      if (key === "ArrowLeft") return focusForStep(edge.from, graph);
      const fan = focus.from === "source" ? outgoingFan(graph, edge.from) : incomingFan(graph, edge.to);
      const next = neighbour(
        fan,
        fan.findIndex((e) => e.id === edge.id),
        key,
      );
      return next ? { kind: "path", pathId: next.id, from: focus.from } : focus;
    }
  }
}

/**
 * Where focus lands when the canvas takes it. Four fallbacks: the workflow's
 * initial step, else the first reachable step in `steps` order, else the
 * first group box the canvas draws, else the root.
 */
export function entryFocus(steps: TraversalStep[], groups: StepGroup[], initialStep?: string): Focus {
  const graph = graphOf(steps, groups);
  if (initialStep !== undefined && graph.stepIds.has(initialStep)) return focusForStep(initialStep, graph);
  // `graph.stepIds`, not a defined-ness test: the graph decides reachability,
  // and it holds no empty-string id. A focus naming an id the graph rejects
  // answers every key with itself, and no element takes the roving stop.
  const first = steps.find((step) => step.id !== undefined && graph.stepIds.has(step.id) && !graph.boxOf.has(step.id))?.id;
  if (first !== undefined) return { kind: "step", stepId: first };
  // Only a collapsed group reaches here: an expanded box's members are
  // reachable steps themselves, and the fallback above would have taken one.
  const box = graph.drawing[0];
  return box ? { kind: "group", groupId: box.id } : { kind: "root" };
}
