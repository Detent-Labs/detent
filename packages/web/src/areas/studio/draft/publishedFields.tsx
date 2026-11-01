import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getVersionBody } from "../api/client.js";

const EMPTY: ReadonlySet<string> = new Set();
const EMPTY_VALUES: ReadonlyMap<string, ReadonlySet<string>> = new Map();

/**
 * The ids of the fields the draft's base version holds, at every depth. The
 * field editor reads them to lock a key that a published version carries
 * (`studio-app`: "A field's key follows its label"). The value is `undefined`
 * while the base version loads and after its fetch failed, and the lock reads
 * `undefined` as locked. A draft with no base version holds an empty set.
 */
export const PublishedFieldIdsContext = createContext<ReadonlySet<string> | undefined>(EMPTY);

/**
 * The base version's choice values per field id, `undefined` while it loads
 * and after its fetch failed. A choice reads `undefined` as locked, the safe
 * side. A draft with no base version holds an empty map.
 */
export const PublishedOptionValuesContext = createContext<ReadonlyMap<string, ReadonlySet<string>> | undefined>(
  EMPTY_VALUES,
);

export type FetchVersionBody = (processId: string, version: number, token: string) => Promise<unknown>;

/** The `id` of every field in a version body's catalog, groups' nested fields included. */
export function collectFieldIds(body: unknown): Set<string> {
  const ids = new Set<string>();
  const walk = (fields: unknown): void => {
    if (!Array.isArray(fields)) return;
    for (const field of fields as { id?: unknown; fields?: unknown }[]) {
      if (typeof field?.id === "string") ids.add(field.id);
      walk(field?.fields);
    }
  };
  walk((body as { fields?: unknown } | null | undefined)?.fields);
  return ids;
}

/**
 * The stored `value` of every choice the version body's fields carry, keyed by
 * field id, groups' nested fields included. A field with no `options` has no
 * entry. The field card locks a choice whose value the base version holds
 * (`studio-app`: "A choice's value follows its name until the first publish").
 */
export function collectOptionValues(body: unknown): Map<string, ReadonlySet<string>> {
  const values = new Map<string, ReadonlySet<string>>();
  const walk = (fields: unknown): void => {
    if (!Array.isArray(fields)) return;
    for (const field of fields as { id?: unknown; options?: unknown; fields?: unknown }[]) {
      if (typeof field?.id === "string" && Array.isArray(field.options)) {
        const held = new Set<string>();
        for (const option of field.options as { value?: unknown }[]) {
          if (typeof option?.value === "string") held.add(option.value);
        }
        values.set(field.id, held);
      }
      walk(field?.fields);
    }
  };
  walk((body as { fields?: unknown } | null | undefined)?.fields);
  return values;
}

/**
 * Fetches one version body and reports its field ids and choice values
 * through `onLoaded`.
 * Answers the cancel function an effect cleanup calls: a response that lands
 * after it reports nothing, the way `PublishChanges.tsx` guards its own fetch.
 * A failed fetch reports nothing, so the caller keeps reading `undefined`.
 */
export function watchPublishedFieldIds(
  fetchBody: FetchVersionBody,
  processId: string,
  version: number,
  token: string,
  onLoaded: (ids: ReadonlySet<string>, optionValues: ReadonlyMap<string, ReadonlySet<string>>) => void,
): () => void {
  let cancelled = false;
  fetchBody(processId, version, token).then(
    (body) => {
      if (!cancelled) onLoaded(collectFieldIds(body), collectOptionValues(body));
    },
    () => {},
  );
  return () => {
    cancelled = true;
  };
}

interface Props {
  processId: string;
  token: string;
  /** The version the draft was cut from, `null` before the first publish. */
  baseVersion: number | null;
  /** The base version's body. A test injects a stub. */
  fetchBody?: FetchVersionBody;
  children: ReactNode;
}

export function PublishedFieldIdsProvider({ processId, token, baseVersion, fetchBody = getVersionBody, children }: Props) {
  // The result carries the process and version it answers, so a render that
  // sees a newer base version reads `undefined` at once, never the older set.
  const [loaded, setLoaded] = useState<{
    processId: string;
    version: number;
    ids: ReadonlySet<string>;
    optionValues: ReadonlyMap<string, ReadonlySet<string>>;
  }>();

  useEffect(() => {
    if (baseVersion === null) return;
    return watchPublishedFieldIds(fetchBody, processId, baseVersion, token, (ids, optionValues) =>
      setLoaded({ processId, version: baseVersion, ids, optionValues }),
    );
  }, [processId, token, baseVersion, fetchBody]);

  const current = baseVersion !== null && loaded?.processId === processId && loaded.version === baseVersion ? loaded : undefined;
  const value = baseVersion === null ? EMPTY : current?.ids;
  const optionValues = baseVersion === null ? EMPTY_VALUES : current?.optionValues;
  return (
    <PublishedFieldIdsContext.Provider value={value}>
      <PublishedOptionValuesContext.Provider value={optionValues}>{children}</PublishedOptionValuesContext.Provider>
    </PublishedFieldIdsContext.Provider>
  );
}

export function usePublishedFieldIds(): ReadonlySet<string> | undefined {
  return useContext(PublishedFieldIdsContext);
}

export function usePublishedOptionValues(): ReadonlyMap<string, ReadonlySet<string>> | undefined {
  return useContext(PublishedOptionValuesContext);
}
