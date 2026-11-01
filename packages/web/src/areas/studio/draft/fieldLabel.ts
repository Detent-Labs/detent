import { labelChangePatch } from "../panels/fieldCatalogLogic";
import { draftFields, type DraftField } from "./fields";
import type { Draft } from "./types";
import { writeGroupLabel } from "./view-group-sync";

/**
 * One label write for a catalog field at any depth, run inside a `mutate`
 * callback. A group goes through `writeGroupLabel`, which also rewrites the
 * view entries naming its key. Every other field takes the label plus the key
 * `labelChangePatch` derives while the key lock leaves auto-fill live
 * (`fieldCatalogLogic.ts::isFieldKeyLocked`). The form editor's card input and
 * strip, and the Fields tab's label control, share the two functions, so the
 * key rule cannot drift between them. An id the catalog does not hold writes
 * nothing.
 */
export function writeFieldLabel(
  d: Draft,
  fieldId: string,
  label: DraftField["label"],
  baseLocale: string,
  published: ReadonlySet<string> | undefined,
): void {
  const field = draftFields(d).find((f) => f.id === fieldId);
  if (field === undefined) return;
  if (field.type === "group") {
    writeGroupLabel(d, fieldId, label, baseLocale);
    return;
  }
  Object.assign(field, labelChangePatch(d, field, label, baseLocale, published));
}
