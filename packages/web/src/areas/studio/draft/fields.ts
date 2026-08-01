import type { DraftOf, Draft } from "./types";
import type { FieldDef } from "workflow-engine/schema";

export type DraftField = DraftOf<FieldDef>;

/**
 * Draft-shaped counterpart of the contract's `collectFieldsDeep`: depth-first
 * flatten of the field catalog, recursing into a `group` field's `fields`.
 * Kept local rather than reusing the contract's version because that one is
 * typed against the fully-required `FieldDef[]`, not a mid-edit Draft's
 * partial catalog.
 */
export function flattenDraftFields(fields: DraftField[] | undefined): DraftField[] {
  const out: DraftField[] = [];
  const walk = (fs: DraftField[]) => {
    for (const f of fs) {
      out.push(f);
      if (f.fields) walk(f.fields);
    }
  };
  if (fields) walk(fields);
  return out;
}

export function draftFields(draft: Draft): DraftField[] {
  return flattenDraftFields(draft.fields);
}
