import type { Draft } from "./types";
import type { DraftField } from "./fields";

/** Depth-first search by id, mirroring the engine's `collectFieldsDeep` — a
 * field id is unique process-wide regardless of nesting depth, so a
 * `["fields", fieldId, ...]` path (used by the authored-content-localization
 * invariant) resolves to the right field whether it's top-level or nested
 * inside a `group`, without needing its positional index. */
function findFieldById(fields: DraftField[] | undefined, id: string): DraftField | undefined {
  for (const f of fields ?? []) {
    if (f.id === id) return f;
    const nested = findFieldById(f.fields, id);
    if (nested) return nested;
  }
  return undefined;
}

// "structural" covers src/schema/compile.ts's CompileValidationError — the six
// harden-publish-validation write-path checks (unknown keys, the reserved
// action prefix, uncompilable/over-long patterns, unresolved
// outputMapping/contract field ids, non-identifier field keys, over-long
// authored strings), all reported in the same {loc, value, message} shape as
// "duration".
export type IssueSource = "zod" | "cel" | "registry" | "duration" | "structural";
export type EntityType = "process" | "field" | "dataSource" | "step" | "path" | "timer" | "action" | "contract";

export interface EditorIssue {
  entityType: EntityType;
  entityId: string;
  message: string;
  source: IssueSource;
}

interface Token {
  key: string;
  idx: number | undefined;
}

function tokenize(loc: string): Token[] {
  return loc
    .split(".")
    .filter((s) => s.length > 0)
    .map((seg) => {
      const m = seg.match(/^([A-Za-z_][A-Za-z0-9_]*)(\[(\d+)\])?$/);
      if (!m) return { key: seg, idx: undefined };
      return { key: m[1], idx: m[3] !== undefined ? Number(m[3]) : undefined };
    });
}

/**
 * All four validators (`authoredProcessBody`'s Zod issues, `validateProcessBody`'s
 * `CelIssue[]`, `checkActionRegistry`'s `RegistryIssue[]`, `validateDurations`'s
 * `DurationIssue[]`) locate an issue with their own ad-hoc `loc`/`path`
 * convention, and the three non-Zod ones don't even agree with each other (e.g.
 * a step-level action is `onEntry.actions[i]` in `check.ts`'s CEL collector but
 * `onEntry[i]` in `registry-check.ts` and `compile.ts`). This walks tokens
 * tolerantly rather than pattern-matching one exact shape, and resolves to the
 * DEEPEST entity actually found — an id, since ids are the sole reference
 * anchor (CLAUDE.md "Identity"), never an array position that array edits can
 * invalidate.
 */
export function resolveLoc(
  body: Draft,
  loc: (string | number)[] | string,
): { entityType: EntityType; entityId: string } {
  const tokens: Token[] = Array.isArray(loc)
    ? loc.reduce<Token[]>((acc, seg) => {
        if (typeof seg === "number") {
          if (acc.length > 0) acc[acc.length - 1].idx = seg;
          return acc;
        }
        acc.push({ key: seg, idx: undefined });
        return acc;
      }, [])
    : tokenize(loc);

  let stepIdx: number | undefined;
  let fieldIdx: number | undefined;
  let fieldIdRef: string | undefined;
  let dataSourceIdx: number | undefined;
  let pathIdx: number | undefined;
  let timerIdx: number | undefined;
  let actionListKey: "onEntry" | "onExit" | "onCancel" | "onPath" | "onFire" | undefined;
  let actionIdx: number | undefined;
  let sawContract = false;
  let prevKey: string | undefined;

  for (const t of tokens) {
    switch (t.key) {
      case "workflow":
        break;
      case "steps":
        stepIdx = t.idx;
        break;
      case "fields":
        if (fieldIdx === undefined && fieldIdRef === undefined) fieldIdx = t.idx;
        break;
      case "dataSources":
        dataSourceIdx = t.idx;
        break;
      case "paths":
        pathIdx = t.idx;
        break;
      case "timers":
        timerIdx = t.idx;
        break;
      case "onEntry":
      case "onExit":
      case "onCancel":
      case "onPath":
        actionListKey = t.key;
        if (t.idx !== undefined) actionIdx = t.idx;
        break;
      case "onFire":
        actionListKey = "onFire";
        break;
      case "actions":
        if (t.idx !== undefined) actionIdx = t.idx;
        break;
      case "contract":
        sawContract = true;
        break;
      default:
        // A field id appearing right after a "fields" token (e.g. the
        // authored-content-localization invariant's `["fields", fieldId,
        // "label"]`), rather than a numeric array index.
        if (prevKey === "fields" && fieldIdRef === undefined) fieldIdRef = t.key;
        break;
    }
    prevKey = t.key;
  }

  const step = stepIdx !== undefined ? body.workflow?.steps?.[stepIdx] : undefined;

  if (step && actionListKey && actionIdx !== undefined) {
    const list =
      actionListKey === "onFire"
        ? timerIdx !== undefined
          ? step.timers?.[timerIdx]?.onFire?.actions
          : undefined
        : actionListKey === "onPath"
          ? pathIdx !== undefined
            ? step.paths?.[pathIdx]?.onPath
            : undefined
          : step[actionListKey];
    const action = list?.[actionIdx];
    if (action?.id) return { entityType: "action", entityId: action.id };
  }

  if (step && timerIdx !== undefined) {
    const timer = step.timers?.[timerIdx];
    if (timer?.id) return { entityType: "timer", entityId: timer.id };
  }

  if (step && pathIdx !== undefined) {
    const path = step.paths?.[pathIdx];
    if (path?.id) return { entityType: "path", entityId: path.id };
  }

  if (step?.id) return { entityType: "step", entityId: step.id };

  const field = fieldIdRef !== undefined ? findFieldById(body.fields, fieldIdRef) : fieldIdx !== undefined ? body.fields?.[fieldIdx] : undefined;
  if (field?.id) return { entityType: "field", entityId: field.id };

  const dataSource = dataSourceIdx !== undefined ? body.dataSources?.[dataSourceIdx] : undefined;
  if (dataSource?.id) return { entityType: "dataSource", entityId: dataSource.id };

  if (sawContract) return { entityType: "contract", entityId: "contract" };

  return { entityType: "process", entityId: "process" };
}
