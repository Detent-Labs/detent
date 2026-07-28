/**
 * The Versions screen's version-pair selection and JSON diff (process-version-inspection
 * spec), extracted so both are directly testable (studio-app spec's "Studio's testable
 * logic is extracted from its components").
 */
export interface VersionSelection {
  a?: number;
  b?: number;
}

export function selectVersion(selection: VersionSelection, which: "a" | "b", version: number): VersionSelection {
  return { ...selection, [which]: version };
}

/** A pair is diffable once both sides are chosen and distinct — diffing a version against itself is never useful. */
export function canDiff(selection: VersionSelection): selection is { a: number; b: number } {
  return selection.a !== undefined && selection.b !== undefined && selection.a !== selection.b;
}

export type DiffKind = "added" | "removed" | "changed";
export interface DiffEntry {
  path: string;
  kind: DiffKind;
  from?: unknown;
  to?: unknown;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * A flat structural diff over two JSON-shaped values — no library, per the repo's
 * minimal-dependency convention (no JSON-diff tool exists anywhere else in the repo).
 * Objects recurse key-by-key; anything else (including arrays, compared whole) is
 * reported as one "changed" leaf rather than diffed element-by-element — a compiled
 * published body is small enough that array-level noise isn't worth a real array-diff
 * algorithm.
 */
export function diffJson(a: unknown, b: unknown, path = ""): DiffEntry[] {
  if (a === b) return [];
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    const entries: DiffEntry[] = [];
    for (const key of keys) {
      const childPath = path ? `${path}.${key}` : key;
      if (!(key in a)) entries.push({ path: childPath, kind: "added", to: b[key] });
      else if (!(key in b)) entries.push({ path: childPath, kind: "removed", from: a[key] });
      else entries.push(...diffJson(a[key], b[key], childPath));
    }
    return entries;
  }
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  return [{ path: path || "(root)", kind: "changed", from: a, to: b }];
}
