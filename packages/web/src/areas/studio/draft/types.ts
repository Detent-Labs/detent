import type { AuthoredProcessBody } from "workflow-engine/schema";

/**
 * Recursive, generic relaxation: every property of T (and every nested
 * property, through arrays and plain objects) becomes optional. Written once
 * against no entity-specific field list, so it has nothing to keep in sync as
 * `definition.ts` gains fields (design.md decision 3). Branded id types
 * (StepId, FieldId, ...) fall into the primitive branch — they are `string &
 * Brand`, structurally assignable to `string` — so they pass through intact
 * rather than being torn apart by the object branch.
 */
export type DraftOf<T> = T extends Array<infer U>
  ? Array<DraftOf<U>>
  : T extends string | number | boolean | null | undefined
    ? T
    : T extends object
      ? { [K in keyof T]?: DraftOf<T[K]> }
      : T;

/** The editor's mid-edit representation. No independent runtime schema — see draft/validate.ts. */
export type Draft = DraftOf<AuthoredProcessBody>;
