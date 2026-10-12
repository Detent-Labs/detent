/** Walks a Zod 4 schema through its definition API (`_zod.def`) and lists every
 * node that holds an array, an object or a record. Leaves are skipped. */
export type ContainerKind = "array" | "object" | "record";

export interface ContainerNode {
  /** `workflow.steps` for the array, `workflow.steps[]` for its element object. */
  path: string;
  kind: ContainerKind;
  schema: any;
}

/** Marks where a lazy node repeats on its own ancestry, as in `fields[].fields[]`. */
export const RECURSION = " (recursion)";

const WRAPPERS = new Set(["optional", "nullable", "default", "prefault", "readonly", "catch", "nonoptional"]);

/** A union counts as an object only as an array element whose options are all objects. */
function isObjectUnion(schema: any): boolean {
  const def = schema._zod.def;
  return def.type === "union" && def.options.every((option: any) => unwrap(option).schema._zod.def.type === "object");
}

function unwrap(schema: any, lazyAncestry: Set<any> = new Set()): { schema: any; recursion: boolean } {
  let current = schema;
  for (;;) {
    const def = current._zod.def;
    if (WRAPPERS.has(def.type)) current = def.innerType;
    else if (def.type === "pipe") current = def.in;
    else if (def.type === "lazy") {
      // The getter builds a fresh schema on every call, so the lazy node is the key.
      if (lazyAncestry.has(current)) return { schema: current, recursion: true };
      lazyAncestry.add(current);
      current = def.getter();
    } else return { schema: current, recursion: false };
  }
}

export function containerNodes(root: any): ContainerNode[] {
  const nodes: ContainerNode[] = [];

  const walk = (schema: any, path: string, lazyAncestry: Set<any>, isElement: boolean): void => {
    const ancestry = new Set(lazyAncestry);
    const resolved = unwrap(schema, ancestry);
    if (resolved.recursion) {
      nodes.push({ path: path + RECURSION, kind: "object", schema: resolved.schema });
      return;
    }
    const node = resolved.schema;
    const type = node._zod.def.type;
    if (type === "array") {
      nodes.push({ path, kind: "array", schema: node });
      walk(node._zod.def.element, path + "[]", ancestry, true);
    } else if (type === "object") {
      nodes.push({ path, kind: "object", schema: node });
      for (const [key, child] of Object.entries<any>(node._zod.def.shape)) {
        walk(child, path ? `${path}.${key}` : key, ancestry, false);
      }
    } else if (type === "record") {
      nodes.push({ path, kind: "record", schema: node });
    } else if (isElement && isObjectUnion(node)) {
      nodes.push({ path, kind: "object", schema: node });
    }
  };

  walk(root, "", new Set(), false);
  return nodes;
}
