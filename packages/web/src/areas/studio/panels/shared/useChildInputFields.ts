import { useEffect, useState } from "react";
import { getVersionBody } from "../../api/client.js";
import { fieldsToRefs, type TargetRef } from "./useTargetProcessCatalog";

/** One input field of the called process: the id the mapping stores and the label the select prints, read in the child's base locale. */
export type ChildInputRef = TargetRef;

/**
 * `idle` when the step names no readable child yet, `loading` while the read
 * runs, `ready` once the body arrived (`fields` may still be empty), `failed`
 * when the read threw. `fields` is empty in every state but `ready`.
 */
export interface ChildInputFields {
  status: "idle" | "loading" | "ready" | "failed";
  fields: ChildInputRef[];
}

const IDLE: ChildInputFields = { status: "idle", fields: [] };
const LOADING: ChildInputFields = { status: "loading", fields: [] };

/**
 * The refs a child body's `contract.inputFields` names, in the contract's
 * order. The body is read loosely, like every fetched body in the studio. A
 * body with no contract, no `inputFields` or no matching field yields none.
 * A field nested in a group resolves too.
 */
export function childInputRefs(body: unknown): ChildInputRef[] {
  if (typeof body !== "object" || body === null) return [];
  const loose = body as { baseLocale?: string; fields?: unknown; contract?: { inputFields?: unknown } };
  const ids = loose.contract?.inputFields;
  if (!Array.isArray(ids) || !Array.isArray(loose.fields)) return [];
  const byId = new Map(fieldsToRefs(loose.fields, loose.baseLocale ?? "en").map((r) => [r.id, r]));
  return ids.flatMap((id) => {
    const ref = typeof id === "string" ? byId.get(id) : undefined;
    return ref ? [ref] : [];
  });
}

/** A settled read and the `processId@version` it belongs to. */
export interface ChildInputResult {
  forKey: string | undefined;
  status: "ready" | "failed";
  fields: ChildInputRef[];
}

/**
 * The state to draw for `key`. A result fetched for another key reads as
 * loading, so a switch of process never shows the earlier child's fields, not
 * even for the frame before the new fetch starts.
 */
export function childInputsFor(result: ChildInputResult | undefined, key: string | undefined): ChildInputFields {
  if (key === undefined) return IDLE;
  if (!result || result.forKey !== key) return LOADING;
  return { status: result.status, fields: result.fields };
}

/**
 * The input fields of the process a subprocess step calls, read from the body
 * of `version`. One read per process and version. `processId` or `version`
 * undefined (not a subprocess step, no process chosen, no version known) keeps
 * the hook idle. A failed read sets `failed`; the caller keeps its stored keys.
 */
export function useChildInputFields(token: string, processId: string | undefined, version: number | undefined): ChildInputFields {
  const [result, setResult] = useState<ChildInputResult | undefined>(undefined);
  const key = processId !== undefined && processId !== "" && version !== undefined ? `${processId}@${version}` : undefined;

  useEffect(() => {
    if (key === undefined || processId === undefined || version === undefined) return;
    let live = true;
    getVersionBody(processId, version, token)
      .then((body) => {
        if (live) setResult({ forKey: key, status: "ready", fields: childInputRefs(body) });
      })
      .catch(() => {
        if (live) setResult({ forKey: key, status: "failed", fields: [] });
      });
    return () => {
      live = false;
    };
  }, [token, key, processId, version]);

  return childInputsFor(result, key);
}
