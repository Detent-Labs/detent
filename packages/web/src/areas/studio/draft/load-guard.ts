/**
 * Load-time safety check only — deliberately looser than the contract and
 * never asked to express a business invariant. Its
 * job is to stop a malformed body from crashing the editor with a
 * property-access-on-undefined before it becomes a Draft: a container of the
 * wrong type, `null` included, at any depth. A key may be absent, since a
 * Draft is a deep partial. Real validation is draft/validation.ts, which
 * parses through the actual `authoredProcessBody` Zod schema.
 */
export interface LoadGuardIssue {
  path: string;
  message: string;
}

/**
 * The containers of a body, top level included. An `objects` entry names a
 * key that holds a plain object, and its value describes that object's own
 * keys. An `arrays` entry names a key that holds an array. A `Shape` value
 * says every element is a plain object with those children, and `"strings"`
 * says the guard skips the elements.
 *
 * ponytail: the table stops at containers. It does not descend below a union
 * type, it checks no leaf type, and it skips the elements of a `"strings"`
 * list. An object where a string or a LocalizedText value belongs, such as a
 * `contract.outcomes` element or a `fields[].key`, still passes and unmounts
 * the studio on render. Upgrade by adding a checked-string kind and a
 * union/leaf kind to `Shape`, then add rows to `DRAFT_SHAPE`.
 */
export type Shape = {
  objects?: Record<string, Shape>;
  arrays?: Record<string, Shape | "strings">;
};

const NONE: Shape = {};

const ACTION: Shape = { objects: { config: NONE, output: NONE, retry: NONE } };

const FIELD: Shape = {
  objects: { label: NONE, description: NONE, columnMapping: NONE, validation: { objects: { rule: NONE } } },
  arrays: {
    options: { objects: { label: NONE, attributes: NONE } },
    // A group field holds fields, so the guard checks a nested group at any depth.
    get fields() {
      return FIELD;
    },
  },
};

const STEP: Shape = {
  objects: {
    label: NONE,
    description: NONE,
    subprocess: { objects: { inputMapping: NONE, outputMapping: NONE } },
    view: { arrays: { fields: NONE, tabs: { objects: { label: NONE } } } },
    assignment: { objects: { strategy: { objects: { config: NONE } } } },
    collaboration: NONE,
  },
  arrays: {
    onEntry: ACTION,
    onExit: ACTION,
    onCancel: ACTION,
    timers: { objects: { deadline: NONE, onFire: { arrays: { actions: ACTION } } } },
    paths: { objects: { guard: NONE }, arrays: { onPath: ACTION } },
  },
};

/** The root of every body. A schema-walking test ties it to `processBody`. */
export const DRAFT_SHAPE: Shape = {
  objects: {
    label: NONE,
    description: NONE,
    contract: { arrays: { inputFields: "strings", outputFields: "strings", outcomes: "strings" } },
    collaboration: NONE,
    workflow: { arrays: { steps: STEP } },
  },
  arrays: {
    fields: FIELD,
    dataSources: { objects: { config: NONE } },
    allowedGroups: "strings",
  },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The full top-level key set of AuthoredProcessBody (definition.ts's `processBody`). */
export const KNOWN_KEYS = new Set([
  "key",
  "label",
  "description",
  "baseLocale",
  "contract",
  "fields",
  "dataSources",
  "allowedGroups",
  "collaboration",
  "workflow",
  "cancellable",
]);

/** Visits only a key that exists and is not `undefined`, and descends only after its type check passed. */
function walkShape(value: Record<string, unknown>, shape: Shape, prefix: string, issues: LoadGuardIssue[]): void {
  const at = (key: string) => (prefix ? `${prefix}.${key}` : key);

  for (const [key, child] of Object.entries(shape.objects ?? {})) {
    const found = value[key];
    if (found === undefined) continue;
    const path = at(key);
    if (!isPlainObject(found)) issues.push({ path, message: `'${path}' must be an object if present` });
    else walkShape(found, child, path, issues);
  }

  for (const [key, element] of Object.entries(shape.arrays ?? {})) {
    const found = value[key];
    if (found === undefined) continue;
    const path = at(key);
    if (!Array.isArray(found)) {
      issues.push({ path, message: `'${path}' must be an array if present` });
      continue;
    }
    if (element === "strings") continue;
    found.forEach((item, index) => {
      const itemPath = `${path}[${index}]`;
      if (!isPlainObject(item)) issues.push({ path: itemPath, message: `'${itemPath}' must be an object` });
      else walkShape(item, element, itemPath, issues);
    });
  }
}

export function checkDraftShape(value: unknown): LoadGuardIssue[] {
  const issues: LoadGuardIssue[] = [];

  if (!isPlainObject(value)) {
    issues.push({ path: "", message: "root is not a JSON object" });
    return issues;
  }

  // A file with no recognized process-body key at all (e.g. a published
  // DefinitionVersion wrapper, whose real content sits under `.definition`)
  // is "not shaped like a process body at all" — flag it instead of
  // silently loading an all-undefined Draft.
  for (const key of Object.keys(value)) {
    if (!KNOWN_KEYS.has(key)) issues.push({ path: key, message: `unrecognized top-level field '${key}' — this may not be a process body` });
  }

  if (value.key !== undefined && typeof value.key !== "string") {
    issues.push({ path: "key", message: "'key' must be a string if present" });
  }

  walkShape(value, DRAFT_SHAPE, "", issues);

  return issues;
}
