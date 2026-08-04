/**
 * The validation editor's pure half: which keys a field's declared type
 * offers, which keys a field already carries beyond that, and how a patch to
 * one key folds into the next `validation` object.
 */

import type { BaseFieldType, FieldValidation } from "workflow-engine/schema";
import type { DraftOf } from "../../draft/types";

export type ValidationKey = "min" | "max" | "minLength" | "maxLength" | "pattern" | "rule";

export type DraftFieldValidation = DraftOf<FieldValidation>;

/** Canonical order: `FieldValidation`'s own key order in `definition.ts`. */
const ALL_KEYS: ValidationKey[] = ["min", "max", "minLength", "maxLength", "pattern", "rule"];

const NUMBER_KEYS: ValidationKey[] = ["min", "max", "rule"];
const STRING_KEYS: ValidationKey[] = ["minLength", "maxLength", "pattern", "rule"];
const LIST_KEYS: ValidationKey[] = ["minLength", "maxLength", "rule"];
const RULE_ONLY: ValidationKey[] = ["rule"];
const EVERY_KEY: ValidationKey[] = ALL_KEYS;

/**
 * Mirrors `checkConstraints` (`src/runtime/api.ts:503`), which branches on
 * the submitted value's JavaScript runtime type, not the declared one.
 * `typeMatches` (`src/schema/definition.ts`) treats `file` and a plugin
 * (custom) type as opaque — neither fixes the submitted value's JavaScript
 * shape — so both offer every key rather than `rule` alone.
 */
export function offeredKeys(type: BaseFieldType | object): ValidationKey[] {
  if (typeof type !== "string") return EVERY_KEY; // plugin (custom) type: opaque
  switch (type) {
    case "number":
      return NUMBER_KEYS;
    case "string":
    case "date":
    case "datetime":
    case "select":
    case "reference":
      return STRING_KEYS;
    case "multiselect":
      return LIST_KEYS;
    case "file":
      return EVERY_KEY; // opaque, like a plugin type
    case "boolean":
    case "group":
      return RULE_ONLY;
    default:
      return RULE_ONLY;
  }
}

/** The keys a field's `validation` object already holds, in canonical order. */
export function carriedKeys(validation: DraftFieldValidation | undefined): ValidationKey[] {
  if (!validation) return [];
  return ALL_KEYS.filter((key) => validation[key] !== undefined);
}

/**
 * The next `validation` object after setting `key` to `value` (or clearing it
 * when `value` is `undefined`). Returns `undefined` rather than `{}` once no
 * key remains, since `definitionHash` (the JCS hash of the body) hashes those
 * two shapes differently — a difference an author reading two drafts as
 * identical should never publish as two versions.
 */
export function patchValidation(
  current: DraftFieldValidation | undefined,
  key: ValidationKey,
  value: DraftFieldValidation[ValidationKey],
): DraftFieldValidation | undefined {
  // A plain Record for the write: `key` is a union, and TS cannot verify a
  // union-typed `value` against whichever member `key` picks out on a
  // heterogeneous object type. The cast back to `DraftFieldValidation` is
  // safe because every key this function ever writes is one of `ALL_KEYS`.
  const next: Record<string, unknown> = { ...current };
  if (value === undefined) {
    delete next[key];
  } else {
    next[key] = value;
  }
  const result = next as DraftFieldValidation;
  return ALL_KEYS.some((k) => result[k] !== undefined) ? result : undefined;
}
