import type { CatalogKey } from "../catalog.js";
import type { DiffEntry } from "../screens/versionDiffLogic.js";

export type ChangeGroup = "process" | "fields" | "dataSources" | "steps" | "paths" | "forms" | "contract";
export type ChangeKind = "added" | "removed" | "changed";

/** The seven groups in the order the change list stands them in. */
export const CHANGE_GROUPS: readonly ChangeGroup[] = ["process", "fields", "dataSources", "steps", "paths", "forms", "contract"];

export interface ChangeValue {
  text: string;
  mono: boolean;
}

export interface ChangeProperty {
  name: string;
  /** A key the word table has no word for reads under its own JSON name, in mono. */
  nameMono?: boolean;
  kind: ChangeKind | "order";
  before?: ChangeValue;
  after?: ChangeValue;
}

export interface ChangeRow {
  /** `${group}:${anchor}`. The React key and the open-state key. */
  key: string;
  group: ChangeGroup;
  kind: ChangeKind;
  label: string;
  entityKey?: string;
  /** Paths only: the label of the step the path leaves. */
  context?: string;
  properties: ChangeProperty[];
  /** Full-path entries for the Developer view. */
  raw: DiffEntry[];
}

export const PROPERTY_WORDS: { readonly [key: string]: CatalogKey | undefined } = {};

export const OWNED_LISTS: { readonly [shape: string]: readonly string[] | undefined } = {};

export function describeChanges(_before: unknown, _after: unknown, _locale?: string): ChangeRow[] {
  return [];
}
