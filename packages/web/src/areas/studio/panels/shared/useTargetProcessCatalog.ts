import { useEffect, useState } from "react";
import { resolveText } from "form-ui";
import { listVersions, getVersionBody } from "../../api/client.js";

export interface TargetRef {
  id: string;
  key: string;
  label: string;
}

export interface TargetProcessCatalog {
  steps: TargetRef[];
  fields: TargetRef[];
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

export function flattenFields(fields: LooseField[]): LooseField[] {
  return fields.flatMap((f) => [f, ...(f.fields ? flattenFields(f.fields) : [])]);
}

/** `flattenFields` plus label resolution, in one call — the same shape `InstanceQueryForm`'s pickers all take. Used both for a target's own catalog (this file) and for the reading process's own fields (`DataSourcesPanel`). Drops an id-less or key-less field: nothing a picker can reference yet. */
export function fieldsToRefs(fields: LooseField[], baseLocale: string): TargetRef[] {
  return flattenFields(fields)
    .filter((f): f is LooseField & { id: string; key: string } => !!f.id && !!f.key)
    .map((f) => ({ id: f.id, key: f.key, label: f.label ? resolveText(f.label as Record<string, string>, baseLocale, baseLocale) : f.id }));
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
 * `undefined` while loading or when `targetProcessId` is unset; `{steps:
 * [], fields: []}` after a failed fetch — the form then falls back to no
 * pickers and warns about nothing, the same "fail open" shape
 * `useDataLists`/`useRegistry` already take.
 */
export function useTargetProcessCatalog(token: string, targetProcessId: string | undefined): TargetProcessCatalog | undefined {
  const [result, setResult] = useState<TargetProcessCatalog | undefined>(undefined);

  useEffect(() => {
    if (!targetProcessId) {
      setResult(undefined);
      return;
    }
    let live = true;
    setResult(undefined);
    (async () => {
      const versions = await listVersions(targetProcessId, token);
      const bodies = (await Promise.all(versions.map((v) => getVersionBody(targetProcessId, v.version, token)))) as LooseBody[];
      const steps = new Map<string, TargetRef>();
      const fields = new Map<string, TargetRef>();
      for (const body of bodies) {
        const baseLocale = body.baseLocale ?? "en";
        for (const s of body.workflow?.steps ?? []) {
          if (!s.id || !s.key) continue; // a published body always has both; guards the loose read type alone
          steps.set(s.id, { id: s.id, key: s.key, label: s.label ? resolveText(s.label as Record<string, string>, baseLocale, baseLocale) : s.id });
        }
        for (const f of fieldsToRefs(body.fields ?? [], baseLocale)) fields.set(f.id, f);
      }
      if (live) setResult({ steps: [...steps.values()], fields: [...fields.values()] });
    })().catch(() => {
      if (live) setResult({ steps: [], fields: [] });
    });
    return () => {
      live = false;
    };
  }, [token, targetProcessId]);

  return result;
}
