import { draftFields } from "./fields";
import { rewriteKeyReaders } from "./key-readers";
import type { Draft } from "./types";
import { writeGroupKey } from "./view-group-sync";

/**
 * One key commit for a catalog field at any depth, run inside a `mutate`
 * callback. A group goes through `writeGroupKey`, which rewrites the view
 * entries naming its key. Every other field takes `next` and moves the
 * expressions that read its old key onto it (`rewriteKeyReaders`), when the
 * old key is non-empty, so the key and its rewrites land in one draft write.
 * The caller checks `next` first (`fieldCatalogLogic.ts::keyCommitProblem`).
 * An id the catalog does not hold, or a key the field already carries,
 * writes nothing.
 */
export function writeFieldKey(d: Draft, fieldId: string, next: string): void {
  const field = draftFields(d).find((f) => f.id === fieldId);
  if (field === undefined) return;
  if (field.type === "group") {
    writeGroupKey(d, fieldId, next);
    return;
  }
  const old = field.key ?? "";
  if (old === next) return;
  field.key = next;
  if (old !== "") rewriteKeyReaders(d, fieldId, old, next);
}
