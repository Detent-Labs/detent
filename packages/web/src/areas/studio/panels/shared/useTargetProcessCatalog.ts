import { useEffect, useState } from "react";
import { resolveText } from "form-ui";
import { listVersions, getVersionBody } from "../../api/client.js";

export interface TargetRef {
  id: string;
  key: string;
  label: string;
  /** A field's declared base type. Absent on a step, and on a field whose type is a plugin envelope. */
  type?: string;
}

export interface TargetProcessCatalog {
  steps: TargetRef[];
  fields: TargetRef[];
}

/** `error` is true once the fetch failed; `catalog` then stays `undefined`. Both are falsy while it loads. */
export interface TargetCatalogState {
  catalog: TargetProcessCatalog | undefined;
  error: boolean;
}

/**
 * A field/step's shape, read loosely — the same "opaque JSON" treatment the
 * rest of the studio gives a fetched body. `id`/`key` stay optional: a draft
 * field mid-edit (this module's other caller, the reading process's own
 * catalog) can lack either before an author finishes authoring it.
 */
interface LooseField {
  id?: string;
  key?: string;
  label?: Record<string, string | undefined>;
  type?: unknown;
  fields?: LooseField[];
}
interface LooseStep {
  id?: string;
  key?: string;
  label?: Record<string, string | undefined>;
}
interface LooseBody {
  baseLocale?: string;
  fields?: LooseField[];
  workflow?: { steps?: LooseStep[] };
}

const LOADING: TargetCatalogState = { catalog: undefined, error: false };

export function flattenFields(fields: LooseField[]): LooseField[] {
  return fields.flatMap((f) => [f, ...(f.fields ? flattenFields(f.fields) : [])]);
}

/** `flattenFields` plus label resolution, in one call — the same shape `InstanceQueryForm`'s pickers all take. Used both for a target's own catalog (this file) and for the reading process's own fields (`DataSourcesPanel`). Drops an id-less or key-less field: nothing a picker can reference yet. Copies `type` only when it is a string, so a plugin envelope yields none. */
export function fieldsToRefs(fields: LooseField[], baseLocale: string): TargetRef[] {
  return flattenFields(fields)
    .filter((f): f is LooseField & { id: string; key: string } => !!f.id && !!f.key)
    .map((f) => {
      const ref: TargetRef = { id: f.id, key: f.key, label: f.label ? resolveText(f.label as Record<string, string>, baseLocale, baseLocale) : f.id };
      if (typeof f.type === "string") ref.type = f.type;
      return ref;
    });
}

/**
 * The union of steps and fields across `versions`. It merges in ascending
 * version order, so the newest declaration of an id overwrites older ones,
 * the declared type included.
 */
export function mergeVersionBodies(versions: readonly { version: number; body: unknown }[]): TargetProcessCatalog {
  const steps = new Map<string, TargetRef>();
  const fields = new Map<string, TargetRef>();
  for (const { body: raw } of [...versions].sort((a, b) => a.version - b.version)) {
    const body = raw as LooseBody;
    const baseLocale = body.baseLocale ?? "en";
    for (const s of body.workflow?.steps ?? []) {
      if (!s.id || !s.key) continue; // a published body always has both; guards the loose read type alone
      steps.set(s.id, { id: s.id, key: s.key, label: s.label ? resolveText(s.label as Record<string, string>, baseLocale, baseLocale) : s.id });
    }
    for (const f of fieldsToRefs(body.fields ?? [], baseLocale)) fields.set(f.id, f);
  }
  return { steps: [...steps.values()], fields: [...fields.values()] };
}

/**
 * The union of step ids and field ids across every published version of
 * `targetProcessId` — the data the `"instance.query"` form's pickers offer,
 * and the set a picked reference is checked against for staleness. Reads
 * every version's body through the routes the studio already fetches
 * (`GET /processes/:id/versions`, `GET /processes/:id/versions/:v`), rather
 * than a new endpoint: see design.md's Open Question on this pick, left to
 * the implementation. The publish-time check narrows to versions holding a
 * LIVE instance; this picker offers the wider set of every published
 * version, so an author sees a reference before any instance exists on it.
 *
 * `catalog` stays `undefined` while loading, when `targetProcessId` is
 * unset, and after a failed fetch. A failed fetch also sets `error`, so the
 * form shows one error row and marks no reference stale.
 */
export function useTargetProcessCatalog(token: string, targetProcessId: string | undefined): TargetCatalogState {
  const [result, setResult] = useState<CatalogResult>({ forId: undefined, state: LOADING });

  useEffect(() => {
    if (!targetProcessId) return;
    let live = true;
    (async () => {
      const versions = await listVersions(targetProcessId, token);
      const bodies = await Promise.all(versions.map(async (v) => ({ version: v.version, body: await getVersionBody(targetProcessId, v.version, token) })));
      if (live) setResult({ forId: targetProcessId, state: { catalog: mergeVersionBodies(bodies), error: false } });
    })().catch(() => {
      if (live) setResult({ forId: targetProcessId, state: { catalog: undefined, error: true } });
    });
    return () => {
      live = false;
    };
  }, [token, targetProcessId]);

  return catalogStateFor(result, targetProcessId);
}

/** A fetched state and the process it belongs to. */
export interface CatalogResult {
  forId: string | undefined;
  state: TargetCatalogState;
}

/**
 * The state to draw for `targetProcessId`. A result fetched for another
 * process reads as loading, so a switch never shows the previous process's
 * error row or catalog, not even for the frame before the new fetch starts.
 */
export function catalogStateFor(result: CatalogResult, targetProcessId: string | undefined): TargetCatalogState {
  return targetProcessId && result.forId === targetProcessId ? result.state : LOADING;
}
